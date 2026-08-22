'use client'

// /settings/models — a signed-in user's own AI model picks.
//
// For each user-overridable slot (对话 turn / 筛查 screening) the user chooses
// 「跟随系统默认」 or one of the catalogue models the admins marked
// user-selectable. The list comes from /api/models/catalog (server-filtered:
// enabled + user_selectable + provider key configured); picks are written to
// public.user_model_preferences under RLS and resolved server-side by
// getModelForUser() — a pick that later becomes invalid (model disabled,
// key removed) silently falls back to the system default.
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import WorkspaceShell, { type WorkspaceRole } from '@/components/WorkspaceShell'
import { useAuth } from '@/lib/useAuth'
import { useI18n } from '@/lib/i18n'
import { getSupabaseBrowser } from '@/lib/supabase'
import { ROLE_THEME } from '@/lib/roleTheme'
import type { ModelSlot } from '@/lib/modelConfig'

type CatalogEntry = { id: string; label: string; note: string; provider: 'anthropic' | 'openai-compat'; vision: boolean; costTier: '低' | '中' | '高'; slots: ModelSlot[] }
type CatalogResponse = { slots: ModelSlot[]; defaults: Partial<Record<ModelSlot, string>>; models: CatalogEntry[]; prefs: Partial<Record<ModelSlot, string>> }

const SLOT_COPY: Record<string, { zh: string; en: string; descZh: string; descEn: string }> = {
  turn: { zh: '对话助手', en: 'Assistant conversations', descZh: 'Luna / Logic / Brief 每一轮对话用的模型', descEn: 'The model behind every Luna / Logic / Brief turn' },
  screening: { zh: '租客筛查', en: 'Tenant screening', descZh: '筛查评分与整体一致性审查用的模型（材料分类与取证抽取由系统固定）', descEn: 'Scoring + coherence review (classification and forensics extraction stay system-managed)' },
}
const COST: Record<string, { zh: string; en: string }> = { 低: { zh: '费用低', en: 'low cost' }, 中: { zh: '费用中', en: 'mid cost' }, 高: { zh: '费用高', en: 'high cost' } }

export default function UserModelsPage() {
  const auth = useAuth()
  const { lang } = useI18n()
  const zh = lang === 'zh'
  const shellRole = (auth.role || 'tenant') as WorkspaceRole
  const color = ROLE_THEME[shellRole]?.accent || ROLE_THEME.tenant.accent

  const [data, setData] = useState<CatalogResponse | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<Record<string, number>>({})

  const load = useCallback(async () => {
    setErr(null)
    try {
      const sb = getSupabaseBrowser()
      const { data: sess } = await sb.auth.getSession()
      const token = sess.session?.access_token
      if (!token) return
      const res = await fetch('/api/models/catalog', { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setData((await res.json()) as CatalogResponse)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'failed')
    }
  }, [])

  useEffect(() => { if (auth.user && !auth.user.is_anonymous) load() }, [auth.user, load])

  const choose = async (slot: ModelSlot, modelId: string | null) => {
    if (!auth.user || !data) return
    setSaving(slot)
    setErr(null)
    try {
      const sb = getSupabaseBrowser()
      if (modelId) {
        const { error } = await sb.from('user_model_preferences').upsert(
          { user_id: auth.user.id, slot, model_id: modelId, updated_at: new Date().toISOString() },
          { onConflict: 'user_id,slot' },
        )
        if (error) throw new Error(error.message)
      } else {
        const { error } = await sb.from('user_model_preferences').delete().eq('user_id', auth.user.id).eq('slot', slot)
        if (error) throw new Error(error.message)
      }
      setData({ ...data, prefs: { ...data.prefs, [slot]: modelId || undefined } })
      setSavedAt((s) => ({ ...s, [slot]: Date.now() }))
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'failed')
    } finally {
      setSaving(null)
    }
  }

  const signedOut = !auth.loading && (!auth.user || auth.user.is_anonymous)

  return (
    <WorkspaceShell role={shellRole} hideAside>
      <div className="mx-auto max-w-[780px]">
        <Link href="/settings" className="font-mono text-[11px] font-bold uppercase tracking-eyebrow text-body-3 hover:text-brand">← {zh ? '个人资料' : 'Profile'}</Link>
        <h1 className="mt-2 text-[28px] font-bold tracking-tight">{zh ? 'AI 模型' : 'AI models'}</h1>
        <p className="mt-2 text-[14px] text-body-2">
          {zh
            ? '为你自己的对话与筛查选择模型。默认跟随系统设置；改动最多 30 秒后生效，仅影响你的账号。'
            : 'Pick the models for your own conversations and screenings. Defaults follow the system setting; changes take effect within 30 seconds and only affect your account.'}
        </p>

        {signedOut && (
          <div className="sl-card mt-6 p-6 text-[14px] text-body-2">
            {zh ? '请先登录注册账号后再配置模型。' : 'Sign in with a registered account to configure models.'}
            <div className="mt-3"><Link href="/login?redirect=/settings/models" className="sl-btn-primary">{zh ? '去登录' : 'Sign in'}</Link></div>
          </div>
        )}
        {err && <div className="mt-4 rounded-lg border px-4 py-3 text-[13px] font-semibold" style={{ borderColor: '#DC262644', color: '#DC2626', background: 'rgba(220,38,38,0.05)' }}>{err}</div>}
        {!signedOut && !data && !err && <div className="py-10 text-center text-body-3">{zh ? '加载中…' : 'Loading…'}</div>}

        {data && (
          <div className="mt-6 space-y-6">
            {data.slots.map((slot) => {
              const copy = SLOT_COPY[slot]
              const options = data.models.filter((m) => m.slots.includes(slot))
              const current = data.prefs[slot] || null
              const def = data.models.find((m) => m.id === data.defaults[slot])
              const defLabel = def ? def.label : (data.defaults[slot] || '—')
              const isSaving = saving === slot
              return (
                <section key={slot} className="sl-card p-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <h2 className="text-[17px] font-bold tracking-tight">{zh ? copy?.zh : copy?.en}</h2>
                      <div className="mt-0.5 text-[12.5px] text-body-3">{zh ? copy?.descZh : copy?.descEn}</div>
                    </div>
                    {savedAt[slot] && Date.now() - savedAt[slot] < 4000 && <span className="text-[12px] font-semibold" style={{ color: '#047857' }}>✓ {zh ? '已保存' : 'Saved'}</span>}
                  </div>
                  <div className="mt-4 grid gap-2">
                    <Option selected={!current} disabled={isSaving} color={color} onClick={() => choose(slot, null)}
                      title={zh ? '跟随系统默认' : 'Follow the system default'} sub={zh ? `当前默认：${defLabel}` : `Currently: ${defLabel}`} badge={zh ? '推荐' : 'Recommended'} />
                    {options.map((m) => (
                      <Option key={m.id} selected={current === m.id} disabled={isSaving} color={color} onClick={() => choose(slot, m.id)}
                        title={m.label} sub={`${m.id}${m.note ? ' · ' + m.note : ''}`}
                        badge={`${zh ? COST[m.costTier]?.zh : COST[m.costTier]?.en}${m.provider !== 'anthropic' ? (zh ? ' · 第三方' : ' · third-party') : ''}`} />
                    ))}
                    {options.length === 0 && <div className="text-[13px] text-body-3">{zh ? '管理员尚未开放该槽位的可选模型。' : 'No user-selectable models have been opened for this slot yet.'}</div>}
                  </div>
                  {slot === 'turn' && options.some((m) => m.provider !== 'anthropic') && (
                    <p className="mt-3 text-[11.5px] text-body-3">
                      {zh ? '第三方模型不支持图片：带图片的对话轮次会自动改用系统默认模型。部分厂商服务器在境外/境内，数据处理地点随之不同。' : 'Third-party models cannot see images — turns with attachments automatically use the system default. Data residency follows the provider you pick.'}
                    </p>
                  )}
                </section>
              )
            })}
          </div>
        )}
      </div>
    </WorkspaceShell>
  )
}

function Option({ selected, disabled, color, onClick, title, sub, badge }: { selected: boolean; disabled: boolean; color: string; onClick: () => void; title: string; sub: string; badge?: string }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick}
      className="flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition hover:bg-surface-chip disabled:opacity-60"
      style={{ borderColor: selected ? color : undefined, boxShadow: selected ? `0 0 0 1px ${color}` : undefined }}>
      <span className="mt-1 flex h-[16px] w-[16px] flex-none items-center justify-center rounded-full border" style={{ borderColor: selected ? color : 'rgba(0,0,0,0.25)' }}>
        {selected && <span className="h-[8px] w-[8px] rounded-full" style={{ background: color }} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-[14px] font-semibold">{title}</span>
          {badge && <span className="rounded px-1.5 py-0.5 font-mono text-[9.5px] font-bold text-body-3" style={{ background: 'rgba(0,0,0,0.05)' }}>{badge}</span>}
        </span>
        <span className="mt-0.5 block break-words text-[12px] text-body-3">{sub}</span>
      </span>
    </button>
  )
}
