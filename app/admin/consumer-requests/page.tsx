'use client'

// /admin/consumer-requests — one queue for the Consumer Reporting Act flows (V0.8 · 2026-10-17):
//   · 索取档案的请求 (s.12): electronic requests fulfil themselves; mail / phone and anything the
//     matcher could not settle (needs_review) wait here with a 2-business-day countdown.
//   · 争议 (s.13): each disputed item is resolved as corrected / supplemented / deleted / maintained
//     with a mandatory note; the API appends screening_corrections and notifies recipients.
// Every action is an inline two-step confirm (no window.confirm — four-role audit G, 2026-10-12).
// Reads and writes go through GET / POST /api/admin/consumer (admin JWT); the page holds no rules.
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import { supabase } from '@/lib/supabase'
import { useAdmin } from '@/lib/useAdmin'
import { useT } from '@/lib/i18n'

type ScreeningSummary = { id: string; created_at?: string | null; landlord_name?: string | null; property?: string | null; tenant_name?: string | null }
type RequestRow = {
  id: string
  email: string
  name: string | null
  delivery: 'electronic' | 'mail' | 'phone'
  mail_address?: string | null
  phone?: string | null
  status: 'pending_verification' | 'matched' | 'needs_review' | 'fulfilled' | 'closed'
  matched_screening_ids: string[]
  candidate_screening_ids: string[]
  due_at: string | null
  fulfilled_at?: string | null
  closed_at?: string | null
  admin_note?: string | null
  created_at: string
  // Screening summaries — the API may attach them as `screenings` (one list keyed by id) or as
  // separate `candidates` / `matched` lists; both shapes are read.
  screenings?: ScreeningSummary[]
  candidates?: ScreeningSummary[]
  matched?: ScreeningSummary[]
}
type DisputeRow = {
  id: string
  request_id: string
  screening_id: string
  email?: string | null
  item_kind: string
  item_ref: string | null
  item_label: string | null
  statement: string | null
  status: 'open' | 'corrected' | 'supplemented' | 'deleted' | 'maintained'
  resolution_note?: string | null
  notified_to?: unknown[] | null
  created_at: string
  screening?: ScreeningSummary | null
}
type Resolution = 'corrected' | 'supplemented' | 'deleted' | 'maintained'
type Pending =
  | { kind: 'confirm_match'; id: string }
  | { kind: 'close'; id: string }
  | { kind: 'mark_delivered'; id: string }
  | { kind: 'resolve_dispute'; id: string }

const RESOLUTIONS: { key: Resolution; zh: string; en: string }[] = [
  { key: 'corrected', zh: '更正', en: 'Corrected' },
  { key: 'supplemented', zh: '补充', en: 'Supplemented' },
  { key: 'deleted', zh: '删除', en: 'Deleted' },
  { key: 'maintained', zh: '维持（写明理由）', en: 'Maintained (state why)' },
]
const ITEM_KIND: Record<string, { zh: string; en: string }> = {
  fact: { zh: '抽取事实', en: 'Extracted fact' },
  public_record: { zh: '公开记录', en: 'Public record' },
  forensic_flag: { zh: '取证标记', en: 'Forensic flag' },
  credit: { zh: '信用', en: 'Credit' },
  verification: { zh: '核验', en: 'Verification' },
  other: { zh: '其他', en: 'Other' },
}

/** Show only the first two characters and the domain: `jo***@example.com`. */
function maskEmail(email: string | null | undefined): string {
  const e = String(email || '').trim()
  const at = e.indexOf('@')
  if (at <= 0) return e ? e.slice(0, 2) + '***' : '—'
  return e.slice(0, Math.min(2, at)) + '***@' + e.slice(at + 1)
}

/** Countdown to due_at: overdue (red) / within 8 hours (amber) / fine. */
function dueState(dueAt: string | null | undefined, now: number): { tone: 'overdue' | 'soon' | 'ok' | 'none'; hours: number } {
  if (!dueAt) return { tone: 'none', hours: 0 }
  const ms = new Date(dueAt).getTime() - now
  if (!Number.isFinite(ms)) return { tone: 'none', hours: 0 }
  const hours = ms / 3_600_000
  if (hours < 0) return { tone: 'overdue', hours }
  if (hours <= 8) return { tone: 'soon', hours }
  return { tone: 'ok', hours }
}
function dueLabel(dueAt: string | null | undefined, now: number, zh: boolean): string {
  const d = dueState(dueAt, now)
  if (d.tone === 'none') return zh ? '无时限' : 'no deadline'
  const abs = Math.abs(d.hours)
  const span = abs >= 48 ? (zh ? `${Math.floor(abs / 24)} 天` : `${Math.floor(abs / 24)} d`) : (zh ? `${Math.ceil(abs)} 小时` : `${Math.ceil(abs)} h`)
  if (d.tone === 'overdue') return zh ? `已逾期 ${span}` : `overdue by ${span}`
  return zh ? `还剩 ${span}` : `${span} left`
}
const TONE_STYLE: Record<'overdue' | 'soon' | 'ok' | 'none', React.CSSProperties> = {
  overdue: { background: '#FEF2F2', color: '#B91C1C', borderColor: '#FECACA' },
  soon: { background: '#FFFBEB', color: '#B45309', borderColor: '#FDE68A' },
  ok: { background: '#F0FDF4', color: '#166534', borderColor: '#BBF7D0' },
  none: { background: '#F3F8FC', color: '#6E6E8A', borderColor: '#D3E3EF' },
}

function summariesOf(r: RequestRow): Record<string, ScreeningSummary> {
  const out: Record<string, ScreeningSummary> = {}
  for (const list of [r.screenings, r.candidates, r.matched]) for (const s of list ?? []) if (s?.id) out[s.id] = s
  return out
}
function screeningLine(s: ScreeningSummary | undefined, id: string, zh: boolean): string {
  if (!s) return id.slice(0, 8) + '…'
  const parts = [s.created_at ? s.created_at.slice(0, 10) : null, s.landlord_name || (zh ? '房东未知' : 'landlord unknown'), s.property || null, s.tenant_name || null].filter(Boolean)
  return parts.join(' · ')
}

const STATUS_LABEL: Record<RequestRow['status'], { zh: string; en: string }> = {
  pending_verification: { zh: '等邮箱验证', en: 'Awaiting email verification' },
  matched: { zh: '已匹配', en: 'Matched' },
  needs_review: { zh: '需人工复核', en: 'Needs review' },
  fulfilled: { zh: '已交付', en: 'Fulfilled' },
  closed: { zh: '已关闭', en: 'Closed' },
}
const DELIVERY_LABEL: Record<RequestRow['delivery'], { zh: string; en: string }> = {
  electronic: { zh: '电子', en: 'Electronic' },
  mail: { zh: '邮寄', en: 'Mail' },
  phone: { zh: '电话', en: 'Phone' },
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-surface"><Header /><main className="mx-auto max-w-[1320px] px-6 py-8 sm:px-8 lg:px-12">{children}</main></div>
}

export default function AdminConsumerRequestsPage() {
  const { lang } = useT()
  const zh = lang === 'zh'
  const { loading, role } = useAdmin()
  const [requests, setRequests] = useState<RequestRow[]>([])
  const [disputes, setDisputes] = useState<DisputeRow[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [picked, setPicked] = useState<Record<string, string[]>>({})
  const [resolution, setResolution] = useState<Record<string, Resolution>>({})
  const [resolved, setResolved] = useState<Record<string, number | null>>({})
  // After a resolution the dispute leaves the open list; say what happened where the admin is looking.
  const [flash, setFlash] = useState<string | null>(null)
  const [showDone, setShowDone] = useState(false)
  // One clock per load; the countdown is a label, not a ticking timer.
  const [now, setNow] = useState(() => Date.now())

  const call = useCallback(async (method: 'GET' | 'POST', body?: unknown) => {
    const { data: sess } = await supabase.auth.getSession()
    const res = await fetch('/api/admin/consumer', { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sess.session?.access_token ?? ''}` }, body: body ? JSON.stringify(body) : undefined })
    const j = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) throw new Error(String(j.error || `HTTP ${res.status}`))
    return j
  }, [])
  const load = useCallback(async () => {
    try {
      const j = (await call('GET')) as { requests?: RequestRow[]; disputes?: DisputeRow[] }
      setRequests(Array.isArray(j.requests) ? j.requests : [])
      setDisputes(Array.isArray(j.disputes) ? j.disputes : [])
      setNow(Date.now())
      setErr(null)
    } catch (e) { setErr((e as Error).message) }
  }, [call])
  useEffect(() => { if (!loading && role) void load() }, [loading, role, load])

  async function act(body: Record<string, unknown>, id: string): Promise<Record<string, unknown> | null> {
    setBusy(id); setErr(null); setPending(null)
    try { const j = await call('POST', body); await load(); return j } catch (e) { setErr((e as Error).message); return null } finally { setBusy(null) }
  }

  const openRequests = useMemo(() => requests.filter((r) => r.status !== 'fulfilled' && r.status !== 'closed'), [requests])
  const doneRequests = useMemo(() => requests.filter((r) => r.status === 'fulfilled' || r.status === 'closed'), [requests])
  const openDisputes = useMemo(() => disputes.filter((d) => d.status === 'open'), [disputes])
  const doneDisputes = useMemo(() => disputes.filter((d) => d.status !== 'open'), [disputes])

  if (loading) return <Shell><div className="text-body-3">…</div></Shell>
  if (!role) return <Shell><div className="rounded-xl border border-line-divider bg-white p-6 text-[14px]">{zh ? '仅限后台管理员。' : 'Admins only.'} <Link href="/admin" className="underline">{zh ? '返回后台' : 'Back'}</Link></div></Shell>

  const t2 = (a: string, b: string) => (zh ? a : b)

  function renderRequest(r: RequestRow) {
    const sums = summariesOf(r)
    const d = dueState(r.due_at, now)
    const isOpen = r.status !== 'fulfilled' && r.status !== 'closed'
    const chosen = picked[r.id] ?? r.matched_screening_ids ?? []
    const note = (notes[r.id] ?? '').trim()
    const p = pending && pending.id === r.id ? pending : null
    const canDeliver = r.status === 'matched' && (r.delivery === 'mail' || r.delivery === 'phone')
    return (
      <div key={r.id} className="rounded-2xl border border-line-divider bg-white p-4 text-[13px]" data-testid="consumer-request" data-status={r.status}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[15px] font-bold" data-testid="request-email">{maskEmail(r.email)}{r.name ? <span className="ml-2 text-[13px] font-normal text-body-2">{r.name}</span> : null}</div>
            <div className="mt-0.5 text-[12.5px] text-body-2">
              {t2('交付方式', 'Delivery')}: {zh ? DELIVERY_LABEL[r.delivery]?.zh : DELIVERY_LABEL[r.delivery]?.en}
              {r.delivery === 'mail' && r.mail_address ? ` · ${r.mail_address}` : ''}
              {r.delivery === 'phone' && r.phone ? ` · ${r.phone}` : ''}
              {' · '}{t2('提交于', 'filed')} {r.created_at.slice(0, 16).replace('T', ' ')}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border px-2 py-[2px] text-[11px] font-bold" style={TONE_STYLE[isOpen ? d.tone : 'none']} data-testid="request-due" data-tone={isOpen ? d.tone : 'none'}>
              {isOpen ? dueLabel(r.due_at, now, zh) : (r.fulfilled_at ? `${t2('交付于', 'fulfilled')} ${r.fulfilled_at.slice(0, 10)}` : r.closed_at ? `${t2('关闭于', 'closed')} ${r.closed_at.slice(0, 10)}` : '—')}
            </span>
            <span className="rounded-full px-2 py-[2px] text-[11px] font-bold" style={r.status === 'needs_review' ? { background: '#FEF3E2', color: '#B45309' } : r.status === 'matched' ? { background: '#E0F2FE', color: '#075985' } : { background: '#F3F8FC', color: '#6E6E8A' }}>
              {zh ? STATUS_LABEL[r.status]?.zh : STATUS_LABEL[r.status]?.en}
            </span>
          </div>
        </div>

        {/* Screenings: matched (ticked, read-only once matched) or candidates to pick from. */}
        <div className="mt-3 rounded-xl border border-line-divider">
          <div className="border-b border-line-divider px-3 py-1.5 font-mono text-[10.5px] font-bold uppercase tracking-wider text-body-3">
            {r.status === 'needs_review' ? t2('候选筛查 · 勾选确认属于本人', 'Candidate screenings · tick the ones that are theirs') : t2('已匹配的筛查', 'Matched screenings')}
          </div>
          {(r.status === 'needs_review' ? r.candidate_screening_ids : r.matched_screening_ids).length === 0 && (
            <div className="px-3 py-2 text-[12px] text-body-3">{r.status === 'needs_review' ? t2('邮箱链上没有任何筛查 —— 如实关闭并说明。', 'Nothing on the email chain — close with a note saying so.') : t2('没有记录。', 'None.')}</div>
          )}
          {(r.status === 'needs_review' ? r.candidate_screening_ids : r.matched_screening_ids).map((sid) => (
            <label key={sid} className="flex items-center gap-2 px-3 py-2 text-[12.5px]">
              {r.status === 'needs_review' ? (
                <input type="checkbox" data-testid="candidate-pick" checked={chosen.includes(sid)} disabled={!!busy} onChange={(e) => setPicked({ ...picked, [r.id]: e.target.checked ? [...chosen, sid] : chosen.filter((x) => x !== sid) })} />
              ) : <span className="text-success">✓</span>}
              <span>{screeningLine(sums[sid], sid, zh)}</span>
              <span className="ml-auto font-mono text-[11px] text-body-3">{sid.slice(0, 8)}</span>
            </label>
          ))}
        </div>

        {isOpen && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input value={notes[r.id] ?? ''} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} placeholder={r.status === 'needs_review' ? t2('关闭理由 / 备注', 'Reason for closing / note') : t2('备注（寄出日期、通话要点）', 'Note (mailing date, what was explained)')} className="min-w-[240px] flex-1 rounded-lg border border-line-divider px-3 py-2 text-[13px]" aria-label={t2('备注', 'Note')} />
            {r.status === 'needs_review' && (
              p?.kind === 'confirm_match' ? (
                <span className="flex flex-wrap items-center gap-2" data-testid="confirm-match-confirm">
                  <span className="text-[12.5px]">{zh ? `把这 ${chosen.length} 条筛查记为本人的档案？之后申请人即可查看。` : `Record these ${chosen.length} screening(s) as theirs? The applicant can then view them.`}</span>
                  <button type="button" disabled={busy === r.id} onClick={() => void act({ action: 'confirm_match', request_id: r.id, screening_ids: chosen }, r.id)} className="rounded-lg px-3 py-2 text-[12.5px] font-bold text-white" style={{ background: '#047857' }}>{t2('确认匹配', 'Confirm match')}</button>
                  <button type="button" onClick={() => setPending(null)} className="rounded-lg border border-line-divider bg-white px-3 py-2 text-[12.5px]">{t2('取消', 'Cancel')}</button>
                </span>
              ) : p?.kind === 'close' ? (
                <span className="flex flex-wrap items-center gap-2" data-testid="close-confirm">
                  <span className="text-[12.5px]">{t2('关闭这条请求？申请人会看到你写的理由。', 'Close this request? The applicant sees your reason.')}</span>
                  <button type="button" disabled={busy === r.id} onClick={() => void act({ action: 'close', request_id: r.id, note }, r.id)} className="rounded-lg border border-red-200 bg-white px-3 py-2 text-[12.5px] font-bold text-red-700">{t2('确认关闭', 'Confirm close')}</button>
                  <button type="button" onClick={() => setPending(null)} className="rounded-lg border border-line-divider bg-white px-3 py-2 text-[12.5px]">{t2('取消', 'Cancel')}</button>
                </span>
              ) : (
                <>
                  <button type="button" data-testid="confirm-match" disabled={busy === r.id || chosen.length === 0} onClick={() => setPending({ kind: 'confirm_match', id: r.id })} className="rounded-lg px-3 py-2 text-[12.5px] font-bold text-white disabled:opacity-50" style={{ background: '#047857' }}>{t2('确认匹配', 'Confirm match')}</button>
                  <button type="button" data-testid="close-request" disabled={busy === r.id || !note} onClick={() => setPending({ kind: 'close', id: r.id })} className="rounded-lg border border-red-200 bg-white px-3 py-2 text-[12.5px] font-bold text-red-700 disabled:opacity-50">{t2('关闭（写理由）', 'Close (with reason)')}</button>
                </>
              )
            )}
            {canDeliver && (
              p?.kind === 'mark_delivered' ? (
                <span className="flex flex-wrap items-center gap-2" data-testid="mark-delivered-confirm">
                  <span className="text-[12.5px]">{r.delivery === 'mail' ? t2('确认披露包已寄出？请求会记为已交付。', 'Confirm the pack was mailed? The request is recorded as fulfilled.') : t2('确认已电话说明？请求会记为已交付。', 'Confirm it was explained by phone? The request is recorded as fulfilled.')}</span>
                  <button type="button" disabled={busy === r.id} onClick={() => void act({ action: 'mark_delivered', request_id: r.id, note }, r.id)} className="rounded-lg px-3 py-2 text-[12.5px] font-bold text-white" style={{ background: '#047857' }}>{t2('确认', 'Confirm')}</button>
                  <button type="button" onClick={() => setPending(null)} className="rounded-lg border border-line-divider bg-white px-3 py-2 text-[12.5px]">{t2('取消', 'Cancel')}</button>
                </span>
              ) : (
                <button type="button" data-testid="mark-delivered" disabled={busy === r.id} onClick={() => setPending({ kind: 'mark_delivered', id: r.id })} className="rounded-lg px-3 py-2 text-[12.5px] font-bold text-white disabled:opacity-50" style={{ background: '#047857' }}>{r.delivery === 'mail' ? t2('已寄出', 'Mailed') : t2('已电话说明', 'Explained by phone')}</button>
              )
            )}
            {r.status === 'matched' && r.delivery === 'electronic' && <span className="text-[12px] text-body-3">{t2('电子方式：申请人在线查看，无需操作。', 'Electronic: the applicant views it online; nothing to do.')}</span>}
            {r.status === 'pending_verification' && <span className="text-[12px] text-body-3">{t2('申请人还没点验证链接。', 'The applicant has not opened the verification link yet.')}</span>}
          </div>
        )}
        {!isOpen && r.admin_note && <div className="mt-2 text-[12px] text-body-3">{t2('备注', 'Note')}: {r.admin_note}</div>}
      </div>
    )
  }

  function renderDispute(d: DisputeRow) {
    const isOpen = d.status === 'open'
    const note = (notes[d.id] ?? '').trim()
    const res = resolution[d.id]
    const p = pending && pending.id === d.id && pending.kind === 'resolve_dispute' ? pending : null
    const done = resolved[d.id]
    const resLabel = (k: Resolution | string | undefined) => { const r = RESOLUTIONS.find((x) => x.key === k); return r ? (zh ? r.zh : r.en) : String(k ?? '') }
    return (
      <div key={d.id} className="rounded-2xl border border-line-divider bg-white p-4 text-[13px]" data-testid="consumer-dispute" data-status={d.status}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[14px] font-bold">
              <span className="mr-2 rounded-md bg-surface-chip px-1.5 py-[1px] font-mono text-[10.5px] uppercase text-body-3">{zh ? ITEM_KIND[d.item_kind]?.zh ?? d.item_kind : ITEM_KIND[d.item_kind]?.en ?? d.item_kind}</span>
              {d.item_label || d.item_ref || '—'}
            </div>
            <div className="mt-0.5 text-[12.5px] text-body-2">{t2('所属筛查', 'Screening')}: {screeningLine(d.screening ?? undefined, d.screening_id, zh)} · {d.email ? maskEmail(d.email) : d.request_id.slice(0, 8)} · {d.created_at.slice(0, 16).replace('T', ' ')}</div>
          </div>
          <span className="rounded-full px-2 py-[2px] text-[11px] font-bold" style={isOpen ? { background: '#FEF3E2', color: '#B45309' } : { background: '#E4EEE3', color: '#065F46' }}>{isOpen ? t2('待处理', 'Open') : resLabel(d.status)}</span>
        </div>
        <blockquote className="mt-2 rounded-xl bg-surface-nav px-3 py-2 text-[12.5px] leading-relaxed text-body" data-testid="dispute-statement">{d.statement || '—'}</blockquote>
        {isOpen ? (
          <div className="mt-3 space-y-2">
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t2('处理结果', 'Resolution')}>
              {RESOLUTIONS.map((o) => (
                <button key={o.key} type="button" role="radio" aria-checked={res === o.key} data-testid={`resolution-${o.key}`} disabled={!!busy} onClick={() => { setResolution({ ...resolution, [d.id]: o.key }); setPending(null) }} className="rounded-full border px-3 py-1.5 text-[12.5px] font-bold" style={res === o.key ? { background: '#1B1B3C', color: '#fff', borderColor: '#1B1B3C' } : { background: '#fff', borderColor: '#D3E3EF' }}>{zh ? o.zh : o.en}</button>
              ))}
            </div>
            <textarea value={notes[d.id] ?? ''} onChange={(e) => setNotes({ ...notes, [d.id]: e.target.value })} rows={2} maxLength={2000} placeholder={t2('核实了什么、改了什么（必填，申请人与 60 天内的收件人都会看到）', 'What was verified and what changed (required; the applicant and recipients within 60 days see it)')} className="w-full rounded-lg border border-line-divider px-3 py-2 text-[13px]" aria-label={t2('处理说明', 'Resolution note')} />
            {p ? (
              <div className="flex flex-wrap items-center gap-2" data-testid="resolve-confirm">
                <span className="text-[12.5px]">{zh ? `按「${resLabel(res)}」处理这条争议？更正记录只追加不覆盖，收件人会收到通知邮件。` : `Resolve as “${resLabel(res)}”? Corrections are append-only and recipients are emailed.`}</span>
                <button type="button" disabled={busy === d.id} onClick={async () => { const j = await act({ action: 'resolve_dispute', dispute_id: d.id, resolution: res, note }, d.id); if (j) { const n = typeof j.notified === 'number' ? j.notified : Array.isArray(j.notified_to) ? j.notified_to.length : null; setResolved((m) => ({ ...m, [d.id]: n })); setFlash(n == null ? t2('已处理。', 'Resolved.') : (zh ? `已处理 · 已通知 ${n} 位收件人` : `Resolved · ${n} recipient(s) notified`)) } }} className="rounded-lg px-3 py-2 text-[12.5px] font-bold text-white" style={{ background: '#047857' }}>{zh ? `确认：${resLabel(res)}` : `Confirm: ${resLabel(res)}`}</button>
                <button type="button" onClick={() => setPending(null)} className="rounded-lg border border-line-divider bg-white px-3 py-2 text-[12.5px]">{t2('取消', 'Cancel')}</button>
              </div>
            ) : (
              <button type="button" data-testid="resolve-dispute" disabled={busy === d.id || !res || !note} onClick={() => setPending({ kind: 'resolve_dispute', id: d.id })} className="rounded-lg px-3 py-2 text-[12.5px] font-bold text-white disabled:opacity-50" style={{ background: '#1B1B3C' }}>{t2('提交处理结果', 'Submit resolution')}</button>
            )}
          </div>
        ) : (
          <div className="mt-2 text-[12px] text-body-3">
            {d.resolution_note ? `${t2('说明', 'Note')}: ${d.resolution_note}` : null}
            {done != null ? <span className="ml-2 font-semibold text-success" data-testid="resolve-notified">{zh ? `已通知 ${done} 位收件人` : `${done} recipient(s) notified`}</span> : Array.isArray(d.notified_to) && d.notified_to.length > 0 ? <span className="ml-2 text-success">{zh ? `已通知 ${d.notified_to.length} 位收件人` : `${d.notified_to.length} recipient(s) notified`}</span> : null}
          </div>
        )}
      </div>
    )
  }

  return (
    <Shell>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/admin" className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-body-3 hover:text-brand">← Stayloop admin</Link>
          <h1 className="mt-1 text-[24px] font-extrabold tracking-tight">{t2('消费者档案请求', 'Consumer file requests')}</h1>
          <p className="mt-1 text-[13px] text-body-2" data-testid="consumer-facts">
            {zh
              ? '《消费者报告法》s.12：电子方式即时、邮寄 / 电话 2 个工作日；s.13：争议须在合理时间内核实并通知 60 天内收件人。免费，不得收费。'
              : 'Consumer Reporting Act s.12: electronic delivery is immediate, mail / phone within 2 business days; s.13: disputes are verified within a reasonable time and recipients of the last 60 days are notified. Free of charge.'}
          </p>
        </div>
        <div className="flex items-center gap-2 text-[12.5px]">
          <span className="rounded-full border border-line-divider bg-white px-3 py-1.5 font-bold" data-testid="queue-counts">{zh ? `待办 ${openRequests.length + openDisputes.length}` : `${openRequests.length + openDisputes.length} open`}</span>
          <button type="button" onClick={() => void load()} className="rounded-full border border-line-divider bg-white px-3 py-1.5">{t2('刷新', 'Refresh')}</button>
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />{t2('显示已完成', 'Show done')}</label>
        </div>
      </div>
      {err && <div className="mt-4 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-[13px] text-danger" data-testid="queue-error">{err}</div>}

      <section className="mt-6" data-testid="requests-section">
        <h2 className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-body-3">{zh ? `索取档案的请求 · ${openRequests.length}` : `File access requests · ${openRequests.length}`}</h2>
        <div className="mt-3 space-y-3">
          {openRequests.length === 0 && <div className="rounded-xl border border-line-divider bg-white p-6 text-[13px] text-body-3">{t2('没有待处理的请求。', 'No open requests.')}</div>}
          {openRequests.map(renderRequest)}
          {showDone && doneRequests.map(renderRequest)}
        </div>
      </section>

      <section className="mt-8" data-testid="disputes-section">
        <h2 className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-body-3">{zh ? `争议 · ${openDisputes.length}` : `Disputes · ${openDisputes.length}`}</h2>
        {flash && <div className="mt-3 rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-[13px] text-success" data-testid="resolve-flash">{flash}</div>}
        <div className="mt-3 space-y-3">
          {openDisputes.length === 0 && <div className="rounded-xl border border-line-divider bg-white p-6 text-[13px] text-body-3">{t2('没有待处理的争议。', 'No open disputes.')}</div>}
          {openDisputes.map(renderDispute)}
          {showDone && doneDisputes.map(renderDispute)}
        </div>
      </section>
    </Shell>
  )
}
