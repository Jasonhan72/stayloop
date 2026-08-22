'use client'

// Stayloop back-office · AI models.
//
// Two panels:
//   1. 槽位默认 — which catalogue model each AI slot uses by default
//      (public.app_config key='models').
//   2. 模型目录 — the system-wide catalogue (public.model_catalog): add /
//      edit / enable / disable models, choose which are user-selectable, and
//      probe connectivity through the real llmChat path. Builtins come from
//      lib/modelConfig.ts and can be overridden (a row with the same id) but
//      not deleted (deleting the row restores the code definition).
//
// Writes go through the browser Supabase client — RLS (is_stayloop_admin())
// is the enforcement layer; this page validates with the SAME pure helpers
// the server uses (rowToModel / baseUrlAllowedFor), so a row the server
// would reject cannot be saved by accident. Edge isolates pick changes up
// within the 60s modelConfig cache TTL.
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { useAdmin } from '@/lib/useAdmin'
import { useT } from '@/lib/i18n'
import {
  DEFAULT_MODELS,
  MODEL_SLOTS,
  VISION_SLOTS,
  PROVIDER_KEYS,
  PROVIDER_KEY_ENVS,
  MODEL_ID_RE,
  mergeCatalog,
  rowToModel,
  baseUrlAllowedFor,
  type CatalogModel,
  type CatalogRow,
  type ModelSlot,
} from '@/lib/modelConfig'

const SLOT_META: Record<ModelSlot, { zh: string; en: string; descZh: string; descEn: string }> = {
  turn: { zh: '对话推理', en: 'Agent reasoning', descZh: 'Luna / Logic / Brief 的每轮 Agent 对话（/api/agent/turn）', descEn: 'Every Luna / Logic / Brief agent turn (/api/agent/turn)' },
  screening: { zh: '筛查评分', en: 'Screening score', descZh: '六维评分 + 整体一致性审查（/api/screen-score）', descEn: 'Six-dimension scoring + coherence review (/api/screen-score)' },
  classify: { zh: '材料分类', en: 'File classification', descZh: '上传材料分类与租金抽取（/api/classify-files）', descEn: 'Upload classification + rent extraction (/api/classify-files)' },
  forensics: { zh: '取证抽取', en: 'Forensics extraction', descZh: '工资单数学核验 / 图片 OCR / 信用报告真伪判别（lib/forensics）', descEn: 'Paystub math, image OCR, credit-report judge (lib/forensics)' },
}
const SLOT_SHORT: Record<ModelSlot, { zh: string; en: string }> = {
  turn: { zh: '对话', en: 'turn' }, screening: { zh: '筛查', en: 'screening' }, classify: { zh: '分类', en: 'classify' }, forensics: { zh: '取证', en: 'forensics' },
}
const COST_LABEL: Record<CatalogModel['costTier'], { zh: string; en: string }> = {
  低: { zh: '费用低', en: 'low cost' }, 中: { zh: '费用中', en: 'mid cost' }, 高: { zh: '费用高', en: 'high cost' },
}

type FormState = {
  id: string; label: string; note: string; api_key_env: string; base_url: string; vision: boolean; cost_tier: '低' | '中' | '高'
  allowed_slots: ModelSlot[]; omit_temperature: boolean; max_tokens_param: 'max_tokens' | 'max_completion_tokens'; pdf_input: 'text' | 'file' | 'image_url'
  user_selectable: boolean; enabled: boolean; sort_order: number
}
const EMPTY_FORM: FormState = {
  id: '', label: '', note: '', api_key_env: 'OPENAI_API_KEY', base_url: PROVIDER_KEYS.OPENAI_API_KEY.defaultBaseUrl || '', vision: false, cost_tier: '中',
  allowed_slots: ['turn'], omit_temperature: false, max_tokens_param: 'max_tokens', pdf_input: 'text', user_selectable: true, enabled: true, sort_order: 1000,
}
function modelToForm(m: CatalogModel): FormState {
  return {
    id: m.id, label: m.label, note: m.note, api_key_env: m.apiKeyEnv, base_url: m.baseUrl || '', vision: m.vision, cost_tier: m.costTier,
    allowed_slots: [...m.allowedSlots], omit_temperature: !!m.omitTemperature, max_tokens_param: m.maxTokensParam || 'max_tokens', pdf_input: m.pdfInput || 'text',
    user_selectable: m.userSelectable, enabled: m.enabled, sort_order: m.sortOrder,
  }
}
function formToRow(f: FormState, userId: string | null, builtin: boolean): CatalogRow & { pdf_input: string; builtin: boolean; updated_at: string; updated_by: string | null } {
  const provider = PROVIDER_KEYS[f.api_key_env]?.provider || 'openai-compat'
  return {
    id: f.id.trim(), label: f.label.trim() || f.id.trim(), note: f.note.trim(), provider,
    base_url: provider === 'anthropic' ? null : (f.base_url.trim().replace(/\/+$/, '') || null),
    api_key_env: f.api_key_env, vision: f.vision, cost_tier: f.cost_tier,
    allowed_slots: f.vision ? f.allowed_slots : f.allowed_slots.filter((s) => !VISION_SLOTS.includes(s)), omit_temperature: f.omit_temperature, max_tokens_param: f.max_tokens_param, pdf_input: provider === 'anthropic' ? 'text' : f.pdf_input,
    user_selectable: f.user_selectable, enabled: f.enabled, sort_order: Number.isFinite(f.sort_order) ? Math.round(f.sort_order) : 1000,
    builtin, updated_at: new Date().toISOString(), updated_by: userId,
  }
}

export default function AdminModelsPage() {
  const { lang } = useT()
  const zh = lang === 'zh'
  const auth = useAuth()
  const { loading, role } = useAdmin()

  // ── slots
  const [values, setValues] = useState<Record<ModelSlot, string>>({ ...DEFAULT_MODELS })
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [rowLoading, setRowLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  // apiKeyEnv → key configured?（只有布尔，key 值绝不下发）。null = 未取到。
  const [availability, setAvailability] = useState<Record<string, boolean> | null>(null)

  // ── catalogue
  const [catalog, setCatalog] = useState<CatalogModel[]>(() => mergeCatalog(null))
  const [catMsg, setCatMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [form, setForm] = useState<FormState | null>(null)
  const [formBuiltin, setFormBuiltin] = useState(false)
  const [formBusy, setFormBusy] = useState(false)
  const [testing, setTesting] = useState<Record<string, { busy: boolean; ok?: boolean; text?: string }>>({})

  const keyOk = useCallback((env: string) => (availability ? availability[env] === true : PROVIDER_KEYS[env]?.provider === 'anthropic'), [availability])

  const token = useCallback(async () => {
    const { data: sess } = await supabase.auth.getSession()
    return sess.session?.access_token || null
  }, [])

  const loadCatalog = useCallback(async () => {
    const { data, error } = await supabase.from('model_catalog').select('*')
    if (error) {
      setCatMsg({ ok: false, text: (zh ? '读取模型目录失败：' : 'Failed to load catalogue: ') + error.message })
      setCatalog(mergeCatalog(null))
      return mergeCatalog(null)
    }
    const merged = mergeCatalog(data)
    setCatalog(merged)
    return merged
  }, [zh])

  const load = useCallback(async () => {
    setRowLoading(true)
    const merged = await loadCatalog()
    const { data } = await supabase.from('app_config').select('value, updated_at').eq('key', 'models').maybeSingle()
    const next = { ...DEFAULT_MODELS }
    const raw = (data?.value ?? {}) as Record<string, unknown>
    for (const slot of MODEL_SLOTS) {
      const v = raw[slot]
      const def = merged.find((m) => m.id === v)
      if (typeof v === 'string' && def && def.allowedSlots.includes(slot)) next[slot] = v
    }
    setValues(next)
    setUpdatedAt(data?.updated_at ?? null)
    setDirty(false)
    setRowLoading(false)
  }, [loadCatalog])

  const loadAvailability = useCallback(async () => {
    try {
      const t = await token()
      if (!t) return
      const res = await fetch('/api/admin/model-providers', { headers: { Authorization: `Bearer ${t}` } })
      if (!res.ok) return
      const json = (await res.json()) as { providers?: Record<string, boolean> }
      if (json.providers) setAvailability(json.providers)
    } catch { /* 保守失败：availability 保持 null → 仅 Anthropic 可选。 */ }
  }, [token])

  useEffect(() => { if (role) { load(); loadAvailability() } }, [role, load, loadAvailability])

  const saveSlots = async () => {
    for (const slot of MODEL_SLOTS) {
      const def = catalog.find((m) => m.id === values[slot])
      if (!def || !def.enabled || !def.allowedSlots.includes(slot)) {
        setMsg({ ok: false, text: zh ? `无效的模型：${values[slot]}` : `Invalid model: ${values[slot]}` })
        return
      }
    }
    setBusy(true); setMsg(null)
    const { error } = await supabase.from('app_config').upsert(
      { key: 'models', value: values, updated_at: new Date().toISOString(), updated_by: auth.user?.id ?? null },
      { onConflict: 'key' },
    )
    if (error) setMsg({ ok: false, text: error.message || (zh ? '保存失败' : 'Save failed') })
    else { setMsg({ ok: true, text: zh ? '已保存,边缘节点最多 60 秒后生效。' : 'Saved — edge nodes pick it up within 60 seconds.' }); await load() }
    setBusy(false)
  }

  // ── catalogue writes
  const upsertRow = async (row: ReturnType<typeof formToRow>) => {
    const { error } = await supabase.from('model_catalog').upsert(row, { onConflict: 'id' })
    if (error) throw new Error(error.message)
  }
  const quickToggle = async (m: CatalogModel, patch: Partial<Pick<FormState, 'enabled' | 'user_selectable'>>) => {
    setCatMsg(null)
    try {
      await upsertRow(formToRow({ ...modelToForm(m), ...patch }, auth.user?.id ?? null, m.builtin))
      await loadCatalog()
      setCatMsg({ ok: true, text: zh ? '已更新,边缘节点最多 60 秒后生效。' : 'Updated — live within 60 seconds.' })
    } catch (e) { setCatMsg({ ok: false, text: e instanceof Error ? e.message : 'failed' }) }
  }
  const removeRow = async (m: CatalogModel) => {
    if (!confirm(zh ? `删除模型 ${m.id}？已选它的槽位/用户会回退系统默认。` : `Delete ${m.id}? Slots/users pointing at it fall back to the default.`)) return
    const { error } = await supabase.from('model_catalog').delete().eq('id', m.id)
    if (error) setCatMsg({ ok: false, text: error.message })
    else { await loadCatalog(); setCatMsg({ ok: true, text: zh ? '已删除。' : 'Deleted.' }) }
  }
  const saveForm = async () => {
    if (!form) return
    const row = formToRow(form, auth.user?.id ?? null, formBuiltin)
    // Same validator the server applies on read — a row it would drop must not be saved.
    if (!MODEL_ID_RE.test(row.id)) return setCatMsg({ ok: false, text: zh ? '模型 id 格式不合法（字母数字 . _ : / -，2–96 位）' : 'Invalid model id (letters, digits, . _ : / -; 2–96 chars)' })
    if (!baseUrlAllowedFor(row.api_key_env, row.base_url || undefined)) {
      const info = PROVIDER_KEYS[row.api_key_env]
      return setCatMsg({ ok: false, text: zh
        ? `Base URL 不允许搭配 ${row.api_key_env}：必须是 https，且主机在该 key 的白名单内（${info?.hosts === '*' ? '任意' : (info?.hosts || []).join(' / ')}）`
        : `Base URL not allowed for ${row.api_key_env}: https only, host must be on that key's allow-list (${info?.hosts === '*' ? 'any' : (info?.hosts || []).join(' / ')})` })
    }
    if (!rowToModel(row)) return setCatMsg({ ok: false, text: zh ? '该配置会被服务端拒绝（检查 key / URL / 槽位）' : 'The server would reject this row (check key / URL / slots)' })
    setFormBusy(true); setCatMsg(null)
    try {
      await upsertRow(row)
      await loadCatalog()
      setForm(null)
      setCatMsg({ ok: true, text: zh ? '已保存到模型目录,边缘节点最多 60 秒后生效。建议点「测试」验证连通。' : 'Saved to the catalogue — live within 60 seconds. Use "Test" to verify connectivity.' })
    } catch (e) { setCatMsg({ ok: false, text: e instanceof Error ? e.message : 'failed' }) }
    setFormBusy(false)
  }
  const testModel = async (id: string) => {
    setTesting((t) => ({ ...t, [id]: { busy: true } }))
    try {
      const tk = await token()
      const res = await fetch('/api/admin/model-test', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tk}` }, body: JSON.stringify({ model_id: id }) })
      const json = (await res.json()) as { ok?: boolean; latency_ms?: number; text?: string; error?: string }
      setTesting((t) => ({ ...t, [id]: { busy: false, ok: !!json.ok, text: json.ok ? `${json.latency_ms} ms · “${json.text}”` : (json.error || 'failed') } }))
    } catch (e) {
      setTesting((t) => ({ ...t, [id]: { busy: false, ok: false, text: e instanceof Error ? e.message : 'failed' } }))
    }
  }

  const providerGroups = useMemo(() => {
    const anth = catalog.filter((m) => m.provider === 'anthropic')
    const other = catalog.filter((m) => m.provider !== 'anthropic')
    return { anthropic: anth, 'openai-compat': other }
  }, [catalog])

  if (auth.loading || loading) {
    return <Shell><div className="flex min-h-[50vh] items-center justify-center text-body-3">{zh ? '加载中…' : 'Loading…'}</div></Shell>
  }
  if (!auth.user || !role) {
    return (
      <Shell>
        <div className="mx-auto max-w-[520px] py-24 text-center">
          <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-body-3">STAYLOOP ADMIN</div>
          <h1 className="mt-3 text-[26px] font-extrabold tracking-tight">{zh ? '无访问权限' : 'No access'}</h1>
          <p className="mt-3 text-[14px] text-body-2">
            {!auth.user ? (zh ? '请先登录,并使用属于 Stayloop 管理组的账号。' : 'Sign in with a Stayloop admin-group account first.') : (zh ? '这个账号不在 Stayloop 后台管理组里。' : 'This account is not in the Stayloop admin group.')}
          </p>
          <Link href={auth.user ? '/' : '/login?redirect=/admin/models'} className="sl-btn-primary mt-6">{auth.user ? (zh ? '返回首页' : 'Back home') : (zh ? '去登录' : 'Sign in')}</Link>
        </div>
      </Shell>
    )
  }

  const formProvider = form ? (PROVIDER_KEYS[form.api_key_env]?.provider || 'openai-compat') : 'openai-compat'

  return (
    <Shell>
      <div className="mx-auto max-w-[1040px] px-5 py-10 sm:px-7">
        <Link href="/admin" className="font-mono text-[11px] font-bold uppercase tracking-eyebrow text-body-3 hover:text-brand">← STAYLOOP ADMIN</Link>
        <h1 className="mt-2 text-[30px] font-extrabold tracking-tight">{zh ? 'AI 模型' : 'AI models'}</h1>
        <p className="mt-2 text-[13.5px] text-body-2">
          {zh
            ? '上半部分为四个能力槽位的系统默认模型；下半部分是全站模型目录——加进目录并启用的模型，管理员可设为槽位默认，用户可在「设置 → AI 模型」里自选（仅对话与筛查两个槽位）。'
            : 'Top: the system-default model per AI slot. Bottom: the system-wide catalogue — any enabled model can be set as a slot default by admins and, if user-selectable, picked by users in Settings → AI models (turn + screening slots only).'}
        </p>

        {/* ── Panel 1: slot defaults ─────────────────────────────────────── */}
        <h2 className="mt-8 text-[18px] font-extrabold tracking-tight">{zh ? '槽位默认' : 'Slot defaults'}</h2>
        {updatedAt && <p className="mt-1 font-mono text-[11px] text-body-3">{zh ? '上次更新:' : 'Last updated:'} {new Date(updatedAt).toLocaleString()}</p>}
        {msg && <Banner ok={msg.ok} text={msg.text} />}
        <div className="mt-4 space-y-2.5">
          {rowLoading ? <div className="py-10 text-center text-body-3">{zh ? '加载中…' : 'Loading…'}</div> : MODEL_SLOTS.map((slot) => {
            const meta = SLOT_META[slot]
            const current = catalog.find((m) => m.id === values[slot])
            const eligible = catalog.filter((m) => m.allowedSlots.includes(slot))
            const groups = (['anthropic', 'openai-compat'] as const).map((p) => ({ provider: p, models: eligible.filter((m) => m.provider === p) })).filter((g) => g.models.length > 0)
            return (
              <div key={slot} className="sl-card flex flex-wrap items-center gap-4 p-5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[14.5px] font-bold">{zh ? meta.zh : meta.en}</span>
                    <span className="rounded px-1.5 py-0.5 font-mono text-[9.5px] font-bold text-body-3" style={{ background: 'rgba(0,0,0,0.05)' }}>{slot}</span>
                    {values[slot] !== DEFAULT_MODELS[slot] && <span className="rounded-md px-1.5 py-0.5 font-mono text-[9.5px] font-bold" style={{ background: 'rgba(124,58,237,0.10)', color: '#7C3AED' }}>{zh ? '非默认' : 'CUSTOM'}</span>}
                  </div>
                  <div className="mt-1 text-[12.5px] text-body-3">{zh ? meta.descZh : meta.descEn}</div>
                  {current && <div className="mt-1 text-[12px] text-body-2">{current.note}</div>}
                  {VISION_SLOTS.includes(slot) ? (
                    <div className="mt-1.5 text-[11.5px] font-semibold" style={{ color: '#B45309' }}>
                      {zh ? '处理证件/流水/工资单的图片与 PDF：仅视觉模型可选；非 Anthropic 厂商的 PDF 能力见目录说明（原生 / 仅文本提取），且材料会送往该厂商（数据出境）' : 'Feeds IDs / statements / pay stubs as images and PDFs: vision models only; see the catalogue note for each third-party model\'s PDF support (native vs text-only), and note the data leaves to that provider'}
                    </div>
                  ) : (
                    <div className="mt-1.5 text-[11.5px] text-body-3">
                      {zh ? '低价模型建议观察对话质量与 JSON 稳定性；国产模型数据出境，注意隐私口径' : 'Budget models: watch conversation quality and JSON stability. Domestic (China-hosted) providers mean data leaves the region — mind the privacy posture.'}
                    </div>
                  )}
                </div>
                <select className="sl-input w-full sm:w-auto sm:min-w-[320px]" aria-label={zh ? `${meta.zh}模型` : `${meta.en} model`} value={values[slot]}
                  onChange={(e) => { setValues((prev) => ({ ...prev, [slot]: e.target.value })); setDirty(true); setMsg(null) }}>
                  {groups.map((g) => (
                    <optgroup key={g.provider} label={g.provider === 'anthropic' ? 'Anthropic (Claude)' : (zh ? 'OpenAI 兼容（OpenAI / Gemini / 国产）' : 'OpenAI-compatible (OpenAI / Gemini / domestic)')}>
                      {g.models.map((m) => {
                        const usable = m.enabled && keyOk(m.apiKeyEnv)
                        return (
                          <option key={m.id} value={m.id} disabled={!usable}>
                            {m.label} · {m.id} · {zh ? COST_LABEL[m.costTier].zh : COST_LABEL[m.costTier].en}
                            {!m.enabled ? (zh ? '（已停用）' : ' (disabled)') : !keyOk(m.apiKeyEnv) ? (zh ? `（未配置 API Key：${m.apiKeyEnv}）` : ` (API key not configured: ${m.apiKeyEnv})`) : ''}
                          </option>
                        )
                      })}
                    </optgroup>
                  ))}
                </select>
              </div>
            )
          })}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button className="sl-btn-primary disabled:opacity-50" disabled={busy || rowLoading || !dirty} onClick={saveSlots}>{busy ? '…' : (zh ? '保存槽位' : 'Save slots')}</button>
          {dirty && !busy && <span className="text-[12.5px] text-body-3">{zh ? '有未保存的修改' : 'Unsaved changes'}</span>}
        </div>

        {/* ── Panel 2: catalogue ─────────────────────────────────────────── */}
        <div className="mt-12 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[18px] font-extrabold tracking-tight">{zh ? '模型目录' : 'Model catalogue'}</h2>
            <p className="mt-1 text-[12.5px] text-body-3">
              {zh
                ? `${catalog.length} 个模型 · ${catalog.filter((m) => m.enabled).length} 个启用 · 内置模型可覆盖/停用但不可删除。API key 只能来自已登记的环境变量（值永不下发），Base URL 主机须在该 key 的白名单内。`
                : `${catalog.length} models · ${catalog.filter((m) => m.enabled).length} enabled · builtins can be overridden/disabled, not deleted. API keys come only from registered env vars (values never leave the server); base URL hosts must be on that key's allow-list.`}
            </p>
          </div>
          <button className="sl-btn-primary" onClick={() => { setForm({ ...EMPTY_FORM }); setFormBuiltin(false); setCatMsg(null) }}>{zh ? '＋ 添加模型' : '+ Add model'}</button>
        </div>
        {catMsg && <Banner ok={catMsg.ok} text={catMsg.text} />}

        {form && (
          <div className="sl-card mt-4 p-5">
            <div className="flex items-center justify-between">
              <div className="text-[15px] font-bold">{formBuiltin ? (zh ? `覆盖内置模型：${form.id}` : `Override builtin: ${form.id}`) : (zh ? '添加模型' : 'Add model')}</div>
              <button className="text-[12.5px] text-body-3 hover:text-body" onClick={() => setForm(null)}>{zh ? '取消' : 'Cancel'}</button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label={zh ? '模型 id（调用厂商 API 用的名字）' : 'Model id (as sent to the provider API)'}>
                <input className="sl-input w-full font-mono" value={form.id} disabled={formBuiltin} placeholder="gpt-5.4-mini / qwen3-max / openai/gpt-5.4" onChange={(e) => setForm({ ...form, id: e.target.value })} />
              </Field>
              <Field label={zh ? '显示名' : 'Label'}>
                <input className="sl-input w-full" value={form.label} placeholder="GPT-5.4 mini" onChange={(e) => setForm({ ...form, label: e.target.value })} />
              </Field>
              <Field label={zh ? '厂商 / API Key 环境变量' : 'Provider / API key env var'}>
                <select className="sl-input w-full" value={form.api_key_env} onChange={(e) => {
                  const env = e.target.value; const info = PROVIDER_KEYS[env]
                  setForm({ ...form, api_key_env: env, base_url: info?.provider === 'anthropic' ? '' : (info?.defaultBaseUrl || form.base_url), vision: info?.provider === 'anthropic' ? true : form.vision })
                }}>
                  {PROVIDER_KEY_ENVS.map((env) => (
                    <option key={env} value={env}>{PROVIDER_KEYS[env].label} · {env} {keyOk(env) ? '✓' : (zh ? '（未配置）' : '(not configured)')}</option>
                  ))}
                </select>
              </Field>
              <Field label={zh ? 'Base URL（OpenAI 兼容端点，不含 /chat/completions）' : 'Base URL (OpenAI-compatible, without /chat/completions)'}>
                <input className="sl-input w-full font-mono" value={form.base_url} disabled={formProvider === 'anthropic'} placeholder={formProvider === 'anthropic' ? (zh ? 'Anthropic 不需要' : 'not used for Anthropic') : 'https://…'} onChange={(e) => setForm({ ...form, base_url: e.target.value })} />
                {formProvider !== 'anthropic' && (
                  <div className="mt-1 text-[11px] text-body-3">
                    {zh ? '允许主机：' : 'Allowed hosts: '}{PROVIDER_KEYS[form.api_key_env]?.hosts === '*' ? (zh ? '任意 https 主机（自定义网关专用 key）' : 'any https host (dedicated custom-gateway key)') : (PROVIDER_KEYS[form.api_key_env]?.hosts as string[] | undefined)?.join(' / ')}
                  </div>
                )}
              </Field>
              <Field label={zh ? '说明（后台/用户页展示）' : 'Note (shown in admin + user pickers)'}>
                <input className="sl-input w-full" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
              </Field>
              <Field label={zh ? '费用档 / 排序' : 'Cost tier / sort order'}>
                <div className="flex gap-2">
                  <select className="sl-input" value={form.cost_tier} onChange={(e) => setForm({ ...form, cost_tier: e.target.value as FormState['cost_tier'] })}>
                    <option value="低">{zh ? '费用低' : 'low'}</option><option value="中">{zh ? '费用中' : 'mid'}</option><option value="高">{zh ? '费用高' : 'high'}</option>
                  </select>
                  <input className="sl-input w-[110px]" type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} />
                </div>
              </Field>
              <Field label={zh ? '可用槽位' : 'Allowed slots'}>
                <div className="flex flex-wrap gap-3 pt-1.5">
                  {MODEL_SLOTS.map((s) => {
                    const locked = !form.vision && VISION_SLOTS.includes(s)
                    return (
                      <label key={s} className={'flex items-center gap-1.5 text-[13px] ' + (locked ? 'opacity-40' : '')}>
                        <input type="checkbox" disabled={locked} checked={form.allowed_slots.includes(s)} onChange={(e) => setForm({ ...form, allowed_slots: e.target.checked ? [...form.allowed_slots, s] : form.allowed_slots.filter((x) => x !== s) })} />
                        {zh ? SLOT_SHORT[s].zh : SLOT_SHORT[s].en}{locked && <span className="text-[10px]">{zh ? '(需支持图片)' : '(needs vision)'}</span>}
                      </label>
                    )
                  })}
                </div>
              </Field>
              <Field label={zh ? '请求参数' : 'Request parameters'}>
                <div className="flex flex-wrap gap-3 pt-1.5 text-[13px]">
                  <label className="flex items-center gap-1.5"><input type="checkbox" checked={form.vision} onChange={(e) => setForm({ ...form, vision: e.target.checked, allowed_slots: e.target.checked ? form.allowed_slots : form.allowed_slots.filter((s) => !VISION_SLOTS.includes(s)) })} />{zh ? '支持图片（筛查/分类/取证槽位必需）' : 'vision (required for screening/classify/forensics)'}</label>
                  {formProvider !== 'anthropic' && (
                    <>
                      <label className="flex items-center gap-1.5">{zh ? 'PDF 输入' : 'PDF input'}
                        <select className="sl-input !py-1 !text-[12px]" value={form.pdf_input} onChange={(e) => setForm({ ...form, pdf_input: e.target.value as FormState['pdf_input'] })}>
                          <option value="text">{zh ? '仅文本提取（通用）' : 'text extraction (generic)'}</option>
                          <option value="file">{zh ? '原生 file 块（OpenAI / Qwen 3.8）' : 'native file part (OpenAI / Qwen 3.8)'}</option>
                          <option value="image_url">{zh ? 'image_url 携带 PDF（Gemini）' : 'image_url with PDF (Gemini)'}</option>
                        </select>
                      </label>
                      <label className="flex items-center gap-1.5"><input type="checkbox" checked={form.omit_temperature} onChange={(e) => setForm({ ...form, omit_temperature: e.target.checked })} />{zh ? '不发送 temperature' : 'omit temperature'}</label>
                      <label className="flex items-center gap-1.5"><input type="checkbox" checked={form.max_tokens_param === 'max_completion_tokens'} onChange={(e) => setForm({ ...form, max_tokens_param: e.target.checked ? 'max_completion_tokens' : 'max_tokens' })} />max_completion_tokens{zh ? '（GPT-5 系列）' : ' (GPT-5 family)'}</label>
                    </>
                  )}
                </div>
              </Field>
              <Field label={zh ? '开关' : 'Switches'}>
                <div className="flex flex-wrap gap-3 pt-1.5 text-[13px]">
                  <label className="flex items-center gap-1.5"><input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />{zh ? '启用' : 'enabled'}</label>
                  <label className="flex items-center gap-1.5"><input type="checkbox" checked={form.user_selectable} onChange={(e) => setForm({ ...form, user_selectable: e.target.checked })} />{zh ? '用户可自选' : 'user-selectable'}</label>
                </div>
              </Field>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <button className="sl-btn-primary disabled:opacity-50" disabled={formBusy || !form.id.trim()} onClick={saveForm}>{formBusy ? '…' : (zh ? '保存到目录' : 'Save to catalogue')}</button>
              {!keyOk(form.api_key_env) && <span className="text-[12px]" style={{ color: '#B45309' }}>{zh ? `${form.api_key_env} 尚未在 Cloudflare 环境变量里配置——可以先保存，配置后即可用。` : `${form.api_key_env} is not configured in Cloudflare yet — you can save now; it becomes usable once set.`}</span>}
            </div>
          </div>
        )}

        <div className="mt-4 overflow-x-auto rounded-xl border border-line-divider bg-white">
          <table className="w-full min-w-[860px] text-[12.5px]">
            <thead>
              <tr className="border-b border-line-divider text-left font-mono text-[10.5px] uppercase tracking-eyebrow text-body-3">
                <th className="px-4 py-2.5">{zh ? '模型' : 'Model'}</th>
                <th className="px-3 py-2.5">{zh ? '厂商 · Key' : 'Provider · key'}</th>
                <th className="px-3 py-2.5">{zh ? '槽位' : 'Slots'}</th>
                <th className="px-3 py-2.5">{zh ? '费用' : 'Cost'}</th>
                <th className="px-3 py-2.5">{zh ? '用户可选' : 'User-pick'}</th>
                <th className="px-3 py-2.5">{zh ? '启用' : 'Enabled'}</th>
                <th className="px-3 py-2.5">{zh ? '操作' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody>
              {(['anthropic', 'openai-compat'] as const).map((p) => providerGroups[p].map((m) => {
                const t = testing[m.id]
                return (
                  <tr key={m.id} className={'border-b border-line-divider last:border-0 ' + (m.enabled ? '' : 'opacity-55')}>
                    <td className="px-4 py-2.5">
                      <div className="font-semibold">{m.label}{m.builtin && <span className="ml-1.5 rounded px-1 py-px font-mono text-[9px] text-body-3" style={{ background: 'rgba(0,0,0,0.05)' }}>builtin</span>}</div>
                      <div className="font-mono text-[11px] text-body-3">{m.id}</div>
                      {m.note && <div className="mt-0.5 max-w-[320px] text-[11px] text-body-3">{m.note}</div>}
                      {t && !t.busy && <div className="mt-1 text-[11px] font-semibold" style={{ color: t.ok ? '#047857' : '#DC2626' }}>{t.ok ? '✓ ' : '✕ '}{t.text}</div>}
                    </td>
                    <td className="px-3 py-2.5">
                      <div>{PROVIDER_KEYS[m.apiKeyEnv]?.label || m.provider}</div>
                      <div className="font-mono text-[10.5px]" style={{ color: keyOk(m.apiKeyEnv) ? '#047857' : '#B45309' }}>{keyOk(m.apiKeyEnv) ? '● ' : '○ '}{m.apiKeyEnv}</div>
                      {m.baseUrl && <div className="max-w-[220px] truncate font-mono text-[10px] text-body-3" title={m.baseUrl}>{m.baseUrl.replace(/^https:\/\//, '')}</div>}
                    </td>
                    <td className="px-3 py-2.5">{m.allowedSlots.map((s) => (zh ? SLOT_SHORT[s].zh : SLOT_SHORT[s].en)).join(' · ')}{m.vision && <span className="ml-1 text-[10px] text-body-3" title={zh ? '支持图片' : 'vision'}>👁</span>}{m.provider !== 'anthropic' && m.vision && <div className="font-mono text-[10px] text-body-3">PDF: {m.pdfInput === 'file' ? (zh ? '原生' : 'native') : m.pdfInput === 'image_url' ? (zh ? '原生(image_url)' : 'native (image_url)') : (zh ? '仅文本' : 'text only')}</div>}</td>
                    <td className="px-3 py-2.5">{zh ? COST_LABEL[m.costTier].zh : COST_LABEL[m.costTier].en}</td>
                    <td className="px-3 py-2.5"><Toggle on={m.userSelectable} onChange={(v) => quickToggle(m, { user_selectable: v })} /></td>
                    <td className="px-3 py-2.5"><Toggle on={m.enabled} onChange={(v) => quickToggle(m, { enabled: v })} /></td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-2 text-[12px]">
                        <button className="font-semibold text-brand hover:underline disabled:opacity-40" disabled={t?.busy || !keyOk(m.apiKeyEnv)} onClick={() => testModel(m.id)}>{t?.busy ? '…' : (zh ? '测试' : 'Test')}</button>
                        <button className="text-body-2 hover:underline" onClick={() => { setForm(modelToForm(m)); setFormBuiltin(m.builtin); setCatMsg(null); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>{zh ? '编辑' : 'Edit'}</button>
                        {!m.builtin && <button className="hover:underline" style={{ color: '#DC2626' }} onClick={() => removeRow(m)}>{zh ? '删除' : 'Delete'}</button>}
                      </div>
                    </td>
                  </tr>
                )
              }))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11.5px] text-body-3">
          {zh
            ? '新厂商接入：先在 Cloudflare Pages 环境变量里配置对应 key（OPENROUTER_API_KEY，或自定义网关用 CUSTOM_LLM_API_KEY_1/2），再在这里添加模型。已登记的 key 名见下拉列表；未登记的环境变量名服务端一律拒绝。'
            : 'New provider: set its key in Cloudflare Pages env vars first (OPENROUTER_API_KEY, or CUSTOM_LLM_API_KEY_1/2 for custom gateways), then add models here. Only registered env names are accepted by the server.'}
        </p>
      </div>
    </Shell>
  )
}

function Banner({ ok, text }: { ok: boolean; text: string }) {
  return (
    <div className="mt-4 rounded-lg border px-4 py-3 text-[13px] font-semibold" style={ok ? { borderColor: '#04785744', color: '#047857', background: 'rgba(4,120,87,0.06)' } : { borderColor: '#DC262644', color: '#DC2626', background: 'rgba(220,38,38,0.05)' }}>
      {text}
    </div>
  )
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-[11.5px] font-semibold text-body-3">{label}</div>
      {children}
    </label>
  )
}
function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="relative h-[20px] w-[36px] rounded-full transition" style={{ background: on ? '#7C3AED' : 'rgba(0,0,0,0.18)' }}>
      <span className="absolute top-[2px] h-[16px] w-[16px] rounded-full bg-white shadow transition" style={{ left: on ? 18 : 2 }} />
    </button>
  )
}
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface-nav text-body">
      <Header />
      {children}
    </div>
  )
}
