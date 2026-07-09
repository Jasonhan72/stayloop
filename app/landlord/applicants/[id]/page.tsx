'use client'

export const runtime = 'edge'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import WorkspaceShell from '@/components/WorkspaceShell'
import { useAIName } from '@/lib/aiName'
import { useAuth } from '@/lib/useAuth'
import { supabase, getSupabaseBrowser } from '@/lib/supabase'
import { useT } from '@/lib/i18n'
import type { ApplicationFile } from '@/types'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Six-dimension display config — weights/colors match the scoring engine
// (app/api/ai-score/route.ts WEIGHTS) and the design volumes.
const DIM_META = [
  { key: 'doc_authenticity', col: 'doc_authenticity_score', name: { zh: '证件真实性', en: 'ID authenticity' }, w: 20, color: '#7C3AED' },
  { key: 'payment_ability', col: 'payment_ability_score', name: { zh: '支付能力', en: 'Ability to pay' }, w: 20, color: '#047857' },
  { key: 'court_records', col: 'court_records_score', name: { zh: '法庭记录', en: 'Court records' }, w: 20, color: '#DC2626' },
  { key: 'stability', col: 'stability_score', name: { zh: '稳定性', en: 'Stability' }, w: 15, color: '#2563EB' },
  { key: 'behavior_signals', col: 'behavior_signals_score', name: { zh: '行为信号', en: 'Behavioral signals' }, w: 13, color: '#D97706' },
  { key: 'info_consistency', col: 'info_consistency_score', name: { zh: '信息一致性', en: 'Information consistency' }, w: 12, color: '#0B0B0E' },
] as const

const FILE_KIND_LABEL: Record<string, string> = {
  id: 'ID',
  paystub: 'PAY',
  bank_statement: 'BANK',
  employment_letter: 'EMP',
  other: 'DOC',
}

function formatSize(bytes: number): string {
  if (!bytes) return '—'
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`
}

function daysAgo(iso: string, zh: boolean): string {
  const d = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000))
  if (d === 0) return zh ? '今天提交' : 'submitted today'
  return zh ? `${d} 天前提交` : `submitted ${d} day${d > 1 ? 's' : ''} ago`
}

type AppDetail = {
  id: string
  first_name: string | null
  last_name: string | null
  ai_extracted_name: string | null
  email: string
  phone: string | null
  monthly_income: number | null
  employer_name: string | null
  job_title: string | null
  ai_score: number | null
  ai_summary: string | null
  ai_dimension_notes: Record<string, unknown> | null
  doc_authenticity_score: number | null
  payment_ability_score: number | null
  court_records_score: number | null
  stability_score: number | null
  behavior_signals_score: number | null
  info_consistency_score: number | null
  ltb_records_found: number | null
  status: string | null
  created_at: string
  files: ApplicationFile[] | null
  listing: { address: string | null; unit: string | null; monthly_rent: number | null } | null
}

function RealApplicantDetail({ id }: { id: string }) {
  const { lang } = useT()
  const zh = lang === 'zh'
  const aiName = useAIName('landlord')
  const { user, loading: authLoading } = useAuth()
  const [app, setApp] = useState<AppDetail | null | 'missing'>(null)
  const [busy, setBusy] = useState(false)
  const [declineOpen, setDeclineOpen] = useState(false)
  const [declineReason, setDeclineReason] = useState('')
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      setApp('missing')
      return
    }
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('applications')
        .select(
          'id, first_name, last_name, ai_extracted_name, email, phone, monthly_income, employer_name, job_title, ai_score, ai_summary, ai_dimension_notes, doc_authenticity_score, payment_ability_score, court_records_score, stability_score, behavior_signals_score, info_consistency_score, ltb_records_found, status, created_at, files, listing:listings(address, unit, monthly_rent)',
        )
        .eq('id', id)
        .maybeSingle()
      if (!cancelled) setApp((data as unknown as AppDetail) ?? 'missing')
    })()
    return () => {
      cancelled = true
    }
  }, [id, user, authLoading])

  const decide = useCallback(
    async (status: 'approved' | 'declined', reason?: string) => {
      if (!app || app === 'missing' || !user) return
      setBusy(true)
      setErr(null)
      const { error } = await supabase.from('applications').update({ status }).eq('id', app.id)
      if (error) {
        setErr(error.message)
        setBusy(false)
        return
      }
      // Decision trail — required by the RTA notice below (insert-self policy).
      await supabase.from('agent_audit_events').insert({
        actor_id: user.id,
        actor_type: 'user',
        action: status === 'approved' ? 'application_approved' : 'application_declined',
        target_type: 'application',
        target_id: app.id,
        metadata: reason ? { reason } : {},
      })
      setApp({ ...app, status })
      setDeclineOpen(false)
      setBusy(false)
    },
    [app, user],
  )

  const openFile = useCallback(async (path: string) => {
    const { data: sess } = await getSupabaseBrowser().auth.getSession()
    const token = sess?.session?.access_token
    if (!token) return
    const res = await fetch('/api/file-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ path }),
    })
    const j = (await res.json()) as { url?: string }
    if (j.url) window.open(j.url, '_blank', 'noopener')
  }, [])

  if (app === null) {
    return (
      <WorkspaceShell role="landlord" hideAside>
        <div className="py-24 text-center font-mono text-[13px] text-body-3">{zh ? '加载中…' : 'Loading…'}</div>
      </WorkspaceShell>
    )
  }

  if (app === 'missing') {
    return (
      <WorkspaceShell role="landlord" hideAside>
        <Link href="/landlord/applicants" className="font-mono text-[12px] text-body-3 hover:text-body">
          {zh ? '← 返回所有申请' : '← Back to all applications'}
        </Link>
        <div className="mt-16 py-16 text-center">
          <div className="text-[18px] font-bold">{zh ? '找不到这份申请' : 'Application not found'}</div>
          <p className="mt-2 text-[13.5px] text-body-2">
            {zh ? '它可能已被撤回，或不属于你的房源。' : 'It may have been withdrawn, or it belongs to another landlord.'}
          </p>
        </div>
      </WorkspaceShell>
    )
  }

  const name = (app.ai_extracted_name || `${app.first_name ?? ''} ${app.last_name ?? ''}`.trim()) || '—'
  const unitLabel = app.listing
    ? [app.listing.unit ? `Unit ${app.listing.unit}` : null, app.listing.address].filter(Boolean).join(' · ')
    : zh ? '房源未关联' : 'No listing linked'
  const scored = app.ai_score != null
  const notes = (app.ai_dimension_notes ?? {}) as Record<string, unknown>
  const recommended = app.status === 'approved' || (scored && (app.ai_score ?? 0) >= 75 && app.status !== 'declined')
  const tier = app.files?.length ? (scored ? 3 : 2) : 1
  const files = app.files ?? []

  return (
    <WorkspaceShell role="landlord" hideAside>
      <Link href="/landlord/applicants" className="font-mono text-[12px] text-body-3 hover:text-body">
        {zh ? '← 返回所有申请' : '← Back to all applications'}
      </Link>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-4">
          <span
            className="flex h-14 w-14 items-center justify-center rounded-full text-[22px] font-bold text-white"
            style={{ background: 'linear-gradient(135deg,#C4B5FD,#7C3AED)' }}
          >
            {(name[0] || '?').toUpperCase()}
          </span>
          <div>
            <h1 className="text-[24px] font-bold tracking-tight sm:text-[28px]">{name}</h1>
            <div className="font-mono text-[11.5px] text-body-3">
              {zh ? `申请 · ${unitLabel} · ${daysAgo(app.created_at, true)}` : `Application · ${unitLabel} · ${daysAgo(app.created_at, false)}`}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`tier-badge t${tier}`}>{zh ? `认证 ${tier} 级` : `Tier ${tier}`}</span>
          {app.status === 'declined' ? (
            <span className="rounded-md bg-danger/10 px-2 py-[4px] font-mono text-[10.5px] font-bold uppercase tracking-wider text-danger">
              {zh ? '已拒绝' : 'Declined'}
            </span>
          ) : app.status === 'approved' ? (
            <span className="rounded-md bg-success/10 px-2 py-[4px] font-mono text-[10.5px] font-bold uppercase tracking-wider text-success">
              {zh ? '已批准看房' : 'Showing approved'}
            </span>
          ) : recommended ? (
            <span className="rounded-md bg-success/10 px-2 py-[4px] font-mono text-[10.5px] font-bold uppercase tracking-wider text-success">
              {zh ? '推荐审批' : 'Recommended'}
            </span>
          ) : (
            <span className="rounded-md bg-warning/10 px-2 py-[4px] font-mono text-[10.5px] font-bold uppercase tracking-wider text-warning">
              {scored ? (zh ? '需面谈' : 'Needs interview') : zh ? '评分中' : 'Scoring'}
            </span>
          )}
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="sl-card p-7">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[18px] font-bold tracking-tight">{zh ? '六维 AI 评分' : 'Six-dimension AI score'}</h2>
            <div className="text-right">
              <div className="font-mono text-[40px] font-extrabold leading-none text-brand">{app.ai_score ?? '—'}</div>
              <div className="font-mono text-[10.5px] uppercase text-body-3">/100</div>
            </div>
          </div>
          {scored ? (
            <div className="mt-6 space-y-4">
              {DIM_META.map((d) => {
                const val = (app[d.col] as number | null) ?? 0
                const note = typeof notes[d.key] === 'string' ? (notes[d.key] as string) : null
                return (
                  <div key={d.key}>
                    <div className="flex items-baseline justify-between">
                      <span className="text-[13.5px] font-semibold">
                        {d.name[lang]} <span className="font-mono text-[10.5px] text-body-3">· {zh ? '权重' : 'Weight'} {d.w}%</span>
                      </span>
                      <span className="font-mono text-[14px] font-bold" style={{ color: d.color }}>
                        {val}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line-divider">
                      <span className="block h-full rounded-full" style={{ width: `${val}%`, background: d.color }} />
                    </div>
                    {note && <div className="mt-1 text-[12px] text-body-2">{note}</div>}
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="mt-6 rounded-lg bg-surface-chip px-4 py-6 text-center text-[13px] text-body-2">
              {zh
                ? 'AI 评分尚未完成 — 材料上传后会自动跑六维尽调，通常几分钟内出分。'
                : 'AI scoring has not completed yet — the six-dimension check runs automatically after documents upload, usually within minutes.'}
            </p>
          )}
        </div>

        <div className="space-y-5">
          <div className="sl-card p-6">
            <h3 className="text-[15px] font-bold tracking-tight">{zh ? `${aiName} 建议` : `${aiName} recommends`}</h3>
            <p className="mt-2 text-[13.5px] leading-relaxed text-body-2">
              {app.ai_summary ||
                (zh
                  ? `${name} 的申请已收到。收入 ${app.monthly_income ? `$${app.monthly_income.toLocaleString()}/mo` : '未填'}${app.employer_name ? ` · ${app.employer_name}` : ''}。评分完成后这里会给出完整建议。`
                  : `${name}'s application is in. Income ${app.monthly_income ? `$${app.monthly_income.toLocaleString()}/mo` : 'not given'}${app.employer_name ? ` · ${app.employer_name}` : ''}. A full recommendation appears here once scoring completes.`)}
            </p>
            {err && <p className="mt-2 text-[12.5px] font-semibold text-danger">{err}</p>}
            <div className="mt-4 flex flex-col gap-2">
              <button
                className="sl-btn-primary !py-[12px] disabled:opacity-50"
                disabled={busy || app.status === 'approved'}
                onClick={() => decide('approved')}
              >
                {app.status === 'approved' ? (zh ? '✓ 已批准看房' : '✓ Showing approved') : zh ? '✓ 批准看房' : '✓ Approve showing'}
              </button>
              <Link href={`/landlord/leases/new?application_id=${app.id}`} className="sl-btn-secondary text-center">
                {zh ? '📄 起草租约' : '📄 Draft lease'}
              </Link>
              <Link
                href={`/landlord/agent?prompt=${encodeURIComponent(zh ? `请 ${name} 补充材料并升级到 认证 3 级。` : `Ask ${name} to submit full evidence and upgrade to Tier 3.`)}`}
                className="sl-btn-secondary text-center"
              >
                {zh ? '★★★ 请 TA 升 认证 3 级' : '★★★ Ask to upgrade to Tier 3'}
              </Link>
              <Link
                href={`/landlord/agent?prompt=${encodeURIComponent(zh ? `帮我联系申请人 ${name}（${app.email}），先聊聊入住时间和材料。` : `Contact applicant ${name} (${app.email}) about move-in timing and documents.`)}`}
                className="sl-btn-secondary text-center"
              >
                {zh ? '💬 先跟 TA 聊一下（经 TA 的 AI Agent 中介）' : '💬 Chat first (via their AI agent)'}
              </Link>
              {declineOpen ? (
                <div className="rounded-lg border border-danger/40 p-3">
                  <input
                    value={declineReason}
                    onChange={(e) => setDeclineReason(e.target.value)}
                    placeholder={zh ? '具体理由（必填，写入 audit log）' : 'Specific reason (required, written to audit log)'}
                    className="w-full rounded-md border border-line-divider px-3 py-2 text-[13px]"
                  />
                  <div className="mt-2 flex gap-2">
                    <button
                      className="flex-1 rounded-lg bg-danger px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
                      disabled={busy || !declineReason.trim()}
                      onClick={() => decide('declined', declineReason.trim())}
                    >
                      {zh ? '确认拒绝' : 'Confirm decline'}
                    </button>
                    <button className="sl-btn-secondary flex-1" onClick={() => setDeclineOpen(false)}>
                      {zh ? '取消' : 'Cancel'}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="rounded-lg border border-danger/40 bg-white px-4 py-[10px] text-[13.5px] font-semibold text-danger disabled:opacity-50"
                  disabled={busy || app.status === 'declined'}
                  onClick={() => setDeclineOpen(true)}
                >
                  {app.status === 'declined' ? (zh ? '✗ 已拒绝' : '✗ Declined') : zh ? '✗ 不合适（需选理由）' : '✗ Not a fit (reason required)'}
                </button>
              )}
            </div>
            <p className="mt-3 rounded-lg bg-danger/[0.06] px-3 py-2.5 text-[11.5px] leading-relaxed text-body-2">
              <b className="text-danger">⚠️ {zh ? 'RTA 提示：' : 'RTA notice: '}</b>
              {zh
                ? `「不合适」理由不能是种族 / 国籍 / 来源国 / 家庭情况 / 性取向。${aiName} 会过滤这些，但你拒绝时仍需具体理由 — 写入 audit log。`
                : `A "not a fit" reason cannot be race / nationality / country of origin / family status / sexual orientation. ${aiName} filters these out, but you still need a specific reason when declining — it is written to the audit log.`}
            </p>
          </div>

          <div className="sl-card p-6">
            <h3 className="text-[15px] font-bold tracking-tight">{zh ? '提交的文件' : 'Submitted documents'}</h3>
            {files.length > 0 ? (
              <div className="mt-3 space-y-2">
                {files.map((f) => (
                  <button
                    key={f.path}
                    onClick={() => openFile(f.path)}
                    className="flex w-full items-center gap-3 rounded-lg bg-surface-chip px-3 py-2 text-left text-[12.5px] transition hover:bg-line-divider/60"
                  >
                    <span className="font-mono text-[10.5px] font-bold uppercase tracking-wider text-brand">
                      {FILE_KIND_LABEL[f.kind ?? f.type ?? 'other'] ?? 'DOC'}
                    </span>
                    <span className="flex-1 font-semibold">{f.name}</span>
                    <span className="font-mono text-body-3">{formatSize(f.size)}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-[12.5px] text-body-2">{zh ? '未上传任何文件。' : 'No documents uploaded.'}</p>
            )}
            <p className="mt-3 text-[11.5px] font-mono text-body-3">
              {zh ? '所有文件加密保存 · 你查看 = 在 audit log 留痕' : 'All files stored encrypted · your view = logged in the audit log'}
            </p>
          </div>
        </div>
      </div>
    </WorkspaceShell>
  )
}

// Design-canon walkthrough fixture (Mia Chen) — reachable only via the
// non-UUID sample ids on the list page's zero-data fallback.
const DIMS = [
  { name: { zh: '证件真实性', en: 'ID authenticity' }, val: 96, w: 20, color: '#7C3AED', note: { zh: '护照 + 自拍均通过 · 与 Persona DB 100% 匹配', en: 'Passport + selfie both passed · 100% match against Persona DB' } },
  { name: { zh: '支付能力', en: 'Ability to pay' },   val: 91, w: 20, color: '#047857', note: { zh: 'Plaid 直连 · DTI 30.8% · 6 个月最低存款 $18,400', en: 'Plaid linked · DTI 30.8% · 6-month low balance $18,400' } },
  { name: { zh: '法庭记录', en: 'Court records' },   val: 100, w: 20, color: '#DC2626', note: { zh: 'CanLII / LTB 无任何相关记录', en: 'No related records on CanLII / LTB' } },
  { name: { zh: '稳定性', en: 'Stability' },     val: 87, w: 15, color: '#2563EB', note: { zh: 'RBC 工作 2.4 年 · 现地址 1.2 年', en: '2.4 yrs at RBC · 1.2 yrs at current address' } },
  { name: { zh: '行为信号', en: 'Behavioral signals' },   val: 88, w: 13, color: '#D97706', note: { zh: '上家房东评价 5/5 · 无违规', en: 'Prior landlord rating 5/5 · no violations' } },
  { name: { zh: '信息一致性', en: 'Information consistency' }, val: 95, w: 12, color: '#0B0B0E', note: { zh: '所有字段在 4 份资料中一致 · 0 异常', en: 'All fields consistent across 4 documents · 0 anomalies' } },
]

const FILES = [
  { name: 'passport.pdf',     type: 'ID',     size: '1.2 MB', date: { zh: '2 天前', en: '2 days ago' } },
  { name: 'paystub-may.pdf',  type: 'PAY',    size: '320 KB', date: { zh: '2 天前', en: '2 days ago' } },
  { name: 'plaid-bank.pdf',   type: 'BANK',   size: '500 KB', date: { zh: '2 天前', en: '2 days ago' } },
  { name: 'rbc-letter.pdf',   type: 'EMP',    size: '180 KB', date: { zh: '2 天前', en: '2 days ago' } },
]

function DemoApplicantDetail({ id }: { id: string }) {
  const { lang } = useT()
  const aiName = useAIName('landlord')
  return (
    <WorkspaceShell role="landlord" hideAside>
      <Link href="/landlord/applicants" className="font-mono text-[12px] text-body-3 hover:text-body">
        {lang === 'zh' ? '← 返回所有申请' : '← Back to all applications'}
      </Link>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-4">
          <span
            className="flex h-14 w-14 items-center justify-center rounded-full text-[22px] font-bold text-white"
            style={{ background: 'linear-gradient(135deg,#C4B5FD,#7C3AED)' }}
          >
            M
          </span>
          <div>
            <h1 className="text-[24px] font-bold tracking-tight sm:text-[28px]">Mia Chen</h1>
            <div className="font-mono text-[11.5px] text-body-3">
              {lang === 'zh'
                ? `申请 #${id} · Unit 1207 · King West · 2 天前提交`
                : `Application #${id} · Unit 1207 · King West · submitted 2 days ago`}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="tier-badge t3">{lang === 'zh' ? '认证 3 级' : 'Tier 3'}</span>
          <span className="rounded-md bg-success/10 px-2 py-[4px] font-mono text-[10.5px] font-bold uppercase tracking-wider text-success">
            {lang === 'zh' ? '推荐审批' : 'Recommended'}
          </span>
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="sl-card p-7">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[18px] font-bold tracking-tight">{lang === 'zh' ? '六维 AI 评分' : 'Six-dimension AI score'}</h2>
            <div className="text-right">
              <div className="font-mono text-[40px] font-extrabold leading-none text-brand">92</div>
              <div className="font-mono text-[10.5px] uppercase text-body-3">/100</div>
            </div>
          </div>
          <div className="mt-6 space-y-4">
            {DIMS.map((d) => (
              <div key={d.name.en}>
                <div className="flex items-baseline justify-between">
                  <span className="text-[13.5px] font-semibold">
                    {d.name[lang]} <span className="font-mono text-[10.5px] text-body-3">· {lang === 'zh' ? '权重' : 'Weight'} {d.w}%</span>
                  </span>
                  <span className="font-mono text-[14px] font-bold" style={{ color: d.color }}>
                    {d.val}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line-divider">
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${d.val}%`, background: d.color }}
                  />
                </div>
                <div className="mt-1 text-[12px] text-body-2">{d.note[lang]}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-5">
          <div className="sl-card p-6">
            <h3 className="text-[15px] font-bold tracking-tight">{lang === 'zh' ? `${aiName} 建议` : `${aiName} recommends`}</h3>
            <p className="mt-2 text-[13.5px] leading-relaxed text-body-2">
              {lang === 'zh'
                ? 'Mia 在六个维度全部超过你的政策门槛, 行为信号无负面记录, 与你过去 12 个月签的 7 位 认证 3 级 租客的 profile 高度相似 (88% 续签 / 0 投诉)。'
                : 'Mia clears your policy threshold on all six dimensions, has no negative behavioral signals, and closely matches the profile of the 7 Tier 3 tenants you signed over the past 12 months (88% renewed / 0 complaints).'}
            </p>
            <p className="mt-2 text-[13px] font-semibold text-brand">
              {lang === 'zh'
                ? '建议: 批看房，看完后请她升 认证 3 级 给你完整收入证据，再决定签约。'
                : 'Suggestion: approve the showing, then ask her to upgrade to Tier 3 for full income evidence before deciding on the lease.'}
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button className="sl-btn-primary !py-[12px]">
                {lang === 'zh' ? '✓ 批准看房 · 派 David' : '✓ Approve showing · assign David'}
              </button>
              <Link href={`/landlord/leases/new?application_id=${id}`} className="sl-btn-secondary text-center">
                {lang === 'zh' ? '📄 起草租约' : '📄 Draft lease'}
              </Link>
              <button className="sl-btn-secondary">{lang === 'zh' ? '★★★ 请她升 认证 3 级' : '★★★ Ask her to upgrade to Tier 3'}</button>
              <button className="sl-btn-secondary">{lang === 'zh' ? '💬 先跟她聊一下（经她的 AI Agent 中介）' : '💬 Chat with her first (via her AI agent)'}</button>
              <button className="rounded-lg border border-danger/40 bg-white px-4 py-[10px] text-[13.5px] font-semibold text-danger">
                {lang === 'zh' ? '✗ 不合适（需选理由）' : '✗ Not a fit (reason required)'}
              </button>
            </div>
            <p className="mt-3 rounded-lg bg-danger/[0.06] px-3 py-2.5 text-[11.5px] leading-relaxed text-body-2">
              <b className="text-danger">⚠️ {lang === 'zh' ? 'RTA 提示：' : 'RTA notice: '}</b>
              {lang === 'zh'
                ? `「不合适」理由不能是种族 / 国籍 / 来源国 / 家庭情况 / 性取向。${aiName} 会过滤这些，但你拒绝时仍需具体理由 — 写入 audit log。`
                : `A "not a fit" reason cannot be race / nationality / country of origin / family status / sexual orientation. ${aiName} filters these out, but you still need a specific reason when declining — it is written to the audit log.`}
            </p>
          </div>

          <div className="sl-card p-6">
            <h3 className="text-[15px] font-bold tracking-tight">{lang === 'zh' ? '提交的文件' : 'Submitted documents'}</h3>
            <div className="mt-3 space-y-2">
              {FILES.map((f) => (
                <div key={f.name} className="flex items-center gap-3 rounded-lg bg-surface-chip px-3 py-2 text-[12.5px]">
                  <span className="font-mono text-[10.5px] font-bold uppercase tracking-wider text-brand">
                    {f.type}
                  </span>
                  <span className="flex-1 font-semibold">{f.name}</span>
                  <span className="font-mono text-body-3">{f.size}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11.5px] font-mono text-body-3">
              {lang === 'zh'
                ? '所有文件加密保存 · 你查看 = 在 audit log 留痕'
                : 'All files stored encrypted · your view = logged in the audit log'}
            </p>
          </div>
        </div>
      </div>
    </WorkspaceShell>
  )
}

export default function ApplicantDetail() {
  const { id } = useParams<{ id: string }>()
  return UUID_RE.test(id) ? <RealApplicantDetail id={id} /> : <DemoApplicantDetail id={id} />
}
