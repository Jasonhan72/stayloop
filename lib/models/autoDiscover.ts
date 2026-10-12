// Weekly model auto-discovery (2026-10-12, user: "自动每星期检查一次新模型，如果有新的就添加进可选的模型列表里").
// Server-side twin of the admin page's「发现新模型 → + 加入」flow:
//   1. every provider with a configured key is asked what it serves (lib/modelDiscovery.discoverProvider);
//   2. new chat-capable ids (recent ones first, at most ADD_PER_PROVIDER each) are written to model_catalog
//      with inferDefaults, then probed through the real llmChat path; a model that answers becomes
//      enabled + user-selectable at once, one that fails stays in the catalogue disabled with the error in its note;
//   3. catalogue models the provider no longer lists are probed too and disabled when they fail;
//   4. the admins get one summary email. Prices stay empty (providers do not publish them) — the usage
//      dashboard flags unpriced calls, the admin fills them in from the row's「编辑」.
import type { SupabaseClient } from '@supabase/supabase-js'
import { PROVIDER_KEYS, PROVIDER_KEY_ENVS, getCatalog, findModel, providerAvailable, __resetModelConfigCaches, type ModelSlot } from '@/lib/modelConfig'
import { discoverProvider, inferDefaults, type ListedModel } from '@/lib/modelDiscovery'
import { llmChat } from '@/lib/llmChat'
import { sendEmail } from '@/lib/email'

export const ADD_PER_PROVIDER = 6
export const FRESH_WINDOW_DAYS = 60

/** Which newly listed ids to add: the ones created within FRESH_WINDOW_DAYS when the provider dates them,
 *  otherwise the first ADD_PER_PROVIDER as listed (newest first by diffProvider's sort); never more than the cap. */
export function pickFreshToAdd(fresh: ListedModel[], now: number = Date.now()): ListedModel[] {
  const cutoff = now / 1000 - FRESH_WINDOW_DAYS * 86_400
  const dated = fresh.filter((m) => typeof m.created === 'number' && m.created > 0)
  const pick = dated.length ? dated.filter((m) => (m.created as number) >= cutoff) : fresh
  return pick.slice(0, ADD_PER_PROVIDER)
}

export type AutoDiscoverResult = {
  checked_at: string
  providers: { env: string; label: string; ok: boolean; error?: string; listed: number }[]
  added: { id: string; env: string; ok: boolean; latency_ms?: number; error?: string }[]
  retired: { id: string; env: string; ok: boolean; disabled: boolean; error?: string }[]
}

async function probe(id: string, userId: string | null): Promise<{ ok: boolean; latency_ms: number; error?: string }> {
  __resetModelConfigCaches()
  const def = findModel(id, await getCatalog())
  if (!def) return { ok: false, latency_ms: 0, error: 'not in catalogue after upsert (security rules rejected the row?)' }
  if (!providerAvailable(def)) return { ok: false, latency_ms: 0, error: `API key not configured (${def.apiKeyEnv})` }
  const t0 = Date.now()
  try {
    await llmChat({
      model: def,
      system: 'You are a connectivity probe. Reply with exactly the word OK and nothing else.',
      messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
      maxTokens: 1200,
      temperature: 0.2,
      signal: AbortSignal.timeout(40_000),
      meta: { userId, slot: 'test', source: 'cron/model-discover' },
    })
    return { ok: true, latency_ms: Date.now() - t0 }
  } catch (e) {
    return { ok: false, latency_ms: Date.now() - t0, error: String(e instanceof Error ? e.message : e).slice(0, 300) }
  }
}

export async function runAutoDiscovery(admin: SupabaseClient, actorId: string | null = null): Promise<AutoDiscoverResult> {
  const out: AutoDiscoverResult = { checked_at: new Date().toISOString(), providers: [], added: [], retired: [] }
  const catalog = await getCatalog()
  const configured = PROVIDER_KEY_ENVS.filter((env) => !!(process.env[env] || '').trim())
  const stamp = out.checked_at.slice(0, 10)
  for (const env of configured) {
    const diff = await discoverProvider(env, (process.env[env] || '').trim(), catalog)
    out.providers.push({ env, label: diff.label, ok: diff.ok, error: diff.error, listed: diff.listed })
    if (!diff.ok) continue
    const info = PROVIDER_KEYS[env]
    for (const m of pickFreshToAdd(diff.fresh)) {
      const d = inferDefaults(env, m.id, info?.label)
      const row = {
        id: m.id, label: m.label || d.label, note: `${d.note} · 自动发现 ${stamp}`, provider: info?.provider || 'openai-compat',
        base_url: info?.provider === 'anthropic' ? null : (info?.defaultBaseUrl || null),
        api_key_env: env, vision: d.vision, cost_tier: d.costTier, allowed_slots: d.allowedSlots as ModelSlot[],
        omit_temperature: d.omitTemperature, max_tokens_param: d.maxTokensParam, pdf_input: d.pdfInput,
        user_selectable: false, enabled: true, sort_order: 500,
        price_input_per_m: null, price_output_per_m: null, price_cache_read_per_m: null, price_cache_write_per_m: null,
        builtin: false, updated_at: new Date().toISOString(), updated_by: actorId,
      }
      const { error } = await admin.from('model_catalog').upsert(row, { onConflict: 'id' })
      if (error) { out.added.push({ id: m.id, env, ok: false, error: error.message }); continue }
      const r = await probe(m.id, actorId)
      // Passed → selectable for users; failed → kept, disabled, with the reason, for the admin to look at.
      await admin.from('model_catalog').update(r.ok
        ? { user_selectable: true, enabled: true }
        : { user_selectable: false, enabled: false, note: `${row.note} · 连通测试失败：${(r.error || 'failed').slice(0, 120)}` }).eq('id', m.id)
      out.added.push({ id: m.id, env, ok: r.ok, latency_ms: r.latency_ms, error: r.error })
    }
    for (const id of diff.retired) {
      const r = await probe(id, actorId)
      if (!r.ok) {
        const cur = catalog.find((c) => c.id === id)
        await admin.from('model_catalog').upsert({ id, user_selectable: false, enabled: false, note: `${cur?.note || ''} · 厂商已不再列出 ${stamp}，测试失败`.trim(), updated_at: new Date().toISOString(), updated_by: actorId }, { onConflict: 'id' })
      }
      out.retired.push({ id, env, ok: r.ok, disabled: !r.ok, error: r.error })
    }
  }
  __resetModelConfigCaches()
  return out
}

/** One email to every admin — only when something changed or failed. */
export async function emailAdminsSummary(admin: SupabaseClient, r: AutoDiscoverResult): Promise<number> {
  const changed = r.added.length || r.retired.some((x) => x.disabled) || r.providers.some((p) => !p.ok)
  if (!changed) return 0
  const { data: admins } = await admin.from('admin_users').select('user_id')
  const emails: string[] = []
  for (const a of (admins || []) as { user_id: string }[]) {
    const { data } = await admin.auth.admin.getUserById(a.user_id)
    if (data?.user?.email) emails.push(data.user.email)
  }
  if (!emails.length) return 0
  const line = (s: string) => `<li style="margin:0 0 4px">${s}</li>`
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#1B1B3C">
<p>模型目录每周自动检查（${r.checked_at.slice(0, 16).replace('T', ' ')} UTC）。</p>
<p><b>新加入 ${r.added.length} 个</b></p><ul>${r.added.map((a) => line(`${a.id} · ${a.env} · ${a.ok ? `✓ 测试通过 ${a.latency_ms} ms，已对用户开放（单价待填）` : `✕ ${a.error || 'failed'}（已保留但停用）`}`)).join('') || line('无')}</ul>
<p><b>厂商已不再列出 ${r.retired.length} 个</b></p><ul>${r.retired.map((x) => line(`${x.id} · ${x.disabled ? '测试失败，已停用' : '测试仍通过，保留'}`)).join('') || line('无')}</ul>
<p><b>厂商</b></p><ul>${r.providers.map((p) => line(`${p.label} · ${p.ok ? `${p.listed} 个在列` : `列表失败：${p.error}`}`)).join('')}</ul>
<p>到 <a href="https://www.stayloop.ai/admin/models">/admin/models</a> 补单价或调整槽位。</p></div>`
  const res = await sendEmail({ to: emails, subject: `Stayloop 模型目录：新加入 ${r.added.length} 个 · 下架 ${r.retired.filter((x) => x.disabled).length} 个`, html, text: JSON.stringify(r, null, 1) })
  return res.ok ? emails.length : 0
}
