'use client'

// The control point. Shows exactly what would be shared (data_scope) and what
// would NOT (excluded_data), the recipient, and risk — then approve / reject.
// Nothing executes until the user clicks Approve.
import { useState } from 'react'
import Link from 'next/link'
import { useT } from '@/lib/i18n'
import type { PendingAction } from '@/lib/agent/types'
import { cardSitePath, executionReasonText, isAcknowledgeOnly, rentAmount, tenantCardRecipient } from '@/lib/agent/chatCopy'
import { isExecutableAction, notifyPendingExpired, type DecidedAction } from '@/lib/agent/approval-engine'
import { supabase } from '@/lib/supabase'
import WorkOrderInline from '@/components/agent/WorkOrderInline'
import { maskEmails } from '@/lib/relay'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Relay principle (找得到人 2026-09-30): a card never shows another person's
// email address. Older cards and some previews still carry one as the
// recipient — show the recipient's name when the card has it, else the role.
const noEmail = (v: string | null | undefined): string | null => {
  const t = (v || '').trim()
  return t && !t.includes('@') ? t : null
}
function recipientRole(action: PendingAction, zh: boolean): string {
  if (action.role === 'tenant') return zh ? '房东' : 'your landlord'
  switch (action.action_type) {
    case 'approve_quote':
    case 'accept_completion': return zh ? '租客' : 'the tenant'
    case 'send_decision': return zh ? '申请人' : 'the applicant'
    case 'send_lease':
    case 'send_renewal_letter':
    case 'rent_reminder': return zh ? '租客' : 'the tenant'
    case 'showing_request':
    case 'listing_inquiry': return zh ? '咨询的租客' : 'the enquirer'
    default: return zh ? '对方' : 'the other party'
  }
}

const RISK: Record<PendingAction['risk_level'], { label: { zh: string; en: string }; cls: string }> = {
  low: { label: { zh: '低风险', en: 'LOW RISK' }, cls: 'text-success bg-success/10' },
  medium: { label: { zh: '中风险', en: 'MEDIUM RISK' }, cls: 'text-warning bg-warning/10' },
  high: { label: { zh: '高风险', en: 'HIGH RISK' }, cls: 'text-danger bg-danger/10' },
}

export default function ApprovalActionCard({
  action,
  onDecide,
  compact = false,
}: {
  action: PendingAction
  onDecide: (id: string, decision: 'approved' | 'rejected', option?: 'A' | 'B') => void | Promise<unknown>
  /** Inside the phone conversation (Muse benchmark item B): tighter padding, smaller title. */
  compact?: boolean
}) {
  const { lang } = useT()
  const zh = lang === 'zh'
  const [busy, setBusy] = useState<null | string>(null)
  const risk = RISK[action.risk_level]
  // Execution preview (lifecycle plan §2.5): the executor renders the exact
  // subject/body it would send, without claiming or sending.
  const [preview, setPreview] = useState<null | { subject: string; body: string; to: string | null } | 'none'>(null)
  const [previewBusy, setPreviewBusy] = useState(false)
  // A preview that failed says why — that failure is exactly what approving would hit (sweep 2026-10-01).
  // `blocking`: a precondition the executor checked (4xx) — approving now cannot succeed; `expired`: the card is retired.
  const [previewErr, setPreviewErr] = useState<null | { reason: string; blocking: boolean; expired: boolean }>(null)
  // The option last previewed: 「重新检查」 asks the executor the same question again.
  const [previewOpt, setPreviewOpt] = useState<'A' | 'B' | undefined>(undefined)
  // A refusal that names one option (blocks_option: past the N1 deadline only option B is refused):
  // that option is locked, the rest of the card stays approvable. Kept apart from previewErr so a
  // later successful preview of option A does not unlock B.
  const [optionBlock, setOptionBlock] = useState<null | { option: 'B'; reason: string; n1Deadline: string | null }>(null)
  const loadPreview = async (option?: 'A' | 'B') => {
    setPreviewOpt(option)
    setPreviewBusy(true)
    try {
      const { data: sess } = await supabase.auth.getSession()
      const token = sess.session?.access_token
      if (!token) { setPreviewErr({ reason: 'no_session', blocking: false, expired: false }); return }
      const res = await fetch('/api/agent/execute', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ action_id: action.id, preview: true, option }) })
      const j = (await res.json().catch(() => ({}))) as { preview?: { subject: string; body: string; to: string | null } | null; reason?: string; error?: string; expired?: boolean; blocks_option?: string; n1_deadline?: string }
      if (res.ok && j.preview) { setPreviewErr(null); setPreview(j.preview); return }
      // Only "no executor" means there is genuinely nothing to show (and nothing that would run).
      if (res.ok && j.reason === 'no_executor_for_type') { setPreviewErr(null); setPreview('none'); return }
      const reason = j.reason || j.error || `http ${res.status}`
      if (!res.ok && !j.expired && j.blocks_option === 'B') {
        setPreviewErr(null)
        setOptionBlock({ option: 'B', reason, n1Deadline: typeof j.n1_deadline === 'string' ? j.n1_deadline : null })
        return
      }
      setPreviewErr({ reason, expired: !!j.expired, blocking: !!j.expired || (res.status >= 400 && res.status < 500 && res.status !== 429 && res.status !== 401) })
    } catch {
      setPreviewErr({ reason: 'network', blocking: false, expired: false })
    } finally { setPreviewBusy(false) }
  }
  // Demo / film cards (non-UUID ids) have no row to preview or execute; they only illustrate the flow.
  const realRow = UUID_RE.test(action.id)
  // Legacy cards of a type nothing can execute (the server no longer lets a turn propose them).
  const executable = !realRow || (isExecutableAction(action.action_type) && preview !== 'none')
  const ackOnly = isAcknowledgeOnly(action.action_type)
  const approveBlocked = !executable || !!previewErr?.blocking

  // Renewal letters carry a rent choice — the landlord must pick explicitly
  // (no silent default to a rent increase). Other actions have one approve.
  const isRenewal = action.action_type === 'send_renewal_letter'
  const m = (action.metadata || {}) as { current_rent?: number; guideline_rent?: number; guideline_pct?: number }
  // The guideline differs by year (2026: 2.1%, 2027: 1.9%; lib/ontario/rules.ts) — read it
  // from the card, never hard-code it (the preview button once showed the statutory cap, not the year's guideline).
  const pctLabel = m.guideline_pct != null ? `+${m.guideline_pct}%` : '按指导上限'
  const pctLabelEn = m.guideline_pct != null ? `+${m.guideline_pct}%` : 'guideline'
  const bBlocked = isRenewal && optionBlock?.option === 'B'

  // Re-list prompts link to the listing they are about (metadata.href, a /dashboard path);
  // anything that is not a same-origin path is ignored.
  const relistPath = action.action_type === 'relist_prompt' ? cardSitePath((action.metadata as { href?: unknown } | null)?.href) : null

  // A tenant's chat card goes to their current landlord whatever the model wrote as recipient.
  const fixedTo = tenantCardRecipient(action.role, action.action_type, action.metadata as Record<string, unknown> | null, zh)
  const recipientShown = fixedTo ?? (action.recipient_label ? (noEmail(action.recipient_label) ?? recipientRole(action, zh)) : null)
  const previewTo = (to: string | null) => fixedTo ?? (to ? (noEmail(to) ?? noEmail(action.recipient_label) ?? recipientRole(action, zh)) : action.role === 'tenant' ? recipientRole(action, zh) : null)
  // Showing requests and listing questions already have a conversation (the
  // listing-inquiry thread) — reply there without approving anything.
  const replyThreadId = (action.action_type === 'showing_request' || action.action_type === 'listing_inquiry')
    && typeof (action.metadata as { thread_id?: unknown } | null)?.thread_id === 'string'
    && UUID_RE.test(String((action.metadata as { thread_id?: string }).thread_id))
    && ((action.metadata as { source?: unknown; intent_id?: unknown }).source === 'listing_page' || typeof (action.metadata as { intent_id?: unknown }).intent_id === 'string')
    ? String((action.metadata as { thread_id?: string }).thread_id)
    : null
  const rawWho = noEmail(action.recipient_label)
  // /api/showing-intent falls back to the Chinese word 租客 when the prospect has no name.
  const replyWho = rawWho && !(rawWho === '租客' && !zh) ? rawWho : (zh ? '对方' : 'them')
  const mask = (t: string) => maskEmails(t, recipientRole(action, zh))

  const decide = async (d: 'approved' | 'rejected', option?: 'A' | 'B') => {
    setBusy(option ? `approved:${option}` : d)
    try {
      await onDecide(action.id, d, option)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div data-approval-card data-card-id={action.id} tabIndex={-1} className={`rounded-2xl border border-brand bg-white outline-none focus-visible:ring-2 focus-visible:ring-brand shadow-[0_0_0_1px_rgba(4,120,87,0.22),0_6px_18px_rgba(4,120,87,0.06)] ${compact ? 'p-4' : 'p-6'}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="font-mono text-[10px] font-bold uppercase tracking-eyebrowLg text-brand">
          {zh ? 'PENDING APPROVAL · 等你确认' : 'PENDING APPROVAL · AWAITING YOU'}
        </div>
        <span className={'rounded-md px-2 py-[3px] font-mono text-[10px] font-bold ' + risk.cls}>
          {risk.label[lang]}
        </span>
      </div>

      <h3 className={`mt-2 font-bold tracking-tight ${compact ? 'text-[15.5px] leading-snug' : 'text-[18px]'}`}>{mask(action.title)}</h3>
      {action.summary && (
        <p className="mt-2 text-[13.5px] leading-relaxed text-body-2">{mask(action.summary)}</p>
      )}

      {/* 节点 5: work-order cards carry the live work order + its thread — act here, no hub detour. */}
      {action.role === 'landlord' && typeof (action.metadata as { work_order_id?: unknown } | null)?.work_order_id === 'string' && /^[0-9a-f-]{36}$/i.test(String((action.metadata as { work_order_id?: string }).work_order_id)) && (
        <WorkOrderInline workOrderId={String((action.metadata as { work_order_id?: string }).work_order_id)} zh={zh} />
      )}

      {recipientShown && (
        <div className="mt-4 flex items-baseline gap-2 text-[12.5px]">
          <span className="font-mono text-[10px] font-bold uppercase tracking-eyebrow text-body-3">
            {zh ? '接收方' : 'RECIPIENT'}
          </span>
          <span className="font-semibold text-body">{recipientShown}</span>
        </div>
      )}

      {replyThreadId && (
        <Link
          href={`/messages?t=${replyThreadId}&compose=1`}
          data-testid="card-reply-thread"
          className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand underline-offset-2 hover:underline"
        >
          <span aria-hidden="true">✉</span>{zh ? `回复 ${replyWho} →` : `Reply to ${replyWho} →`}
        </Link>
      )}

      {relistPath && (
        <Link href={relistPath} data-testid="card-relist-link" className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand underline-offset-2 hover:underline">
          {relistPath.startsWith('/dashboard/listings/')
            ? (zh ? '打开这套房源 →' : 'Open the listing →')
            : (zh ? '去房源管理 →' : 'Go to your listings →')}
        </Link>
      )}

      <div className="mt-4 grid gap-3">
        <ScopeList tone="share" title={zh ? '将分享' : 'WILL SHARE'} items={action.data_scope} />
        <ScopeList tone="hold" title={zh ? '不会分享' : 'WILL NOT SHARE'} items={action.excluded_data} />
      </div>

      {preview && preview !== 'none' && (
        <div className="mt-4 rounded-xl border border-line-divider bg-white p-3 text-[12.5px]">
          <div className="font-mono text-[10px] font-bold uppercase tracking-eyebrow text-body-3">{zh ? '将要发送的正文' : 'EXACT MESSAGE'}{previewTo(preview.to) ? ` · → ${previewTo(preview.to)}` : ''}</div>
          {preview.subject ? <div className="mt-1 font-semibold text-body">{mask(preview.subject)}</div> : null}
          <pre className="mt-1 max-h-64 overflow-y-auto whitespace-pre-wrap font-sans leading-relaxed text-body-2">{mask(preview.body)}</pre>
        </div>
      )}
      {!executable && (
        <p className="mt-3 rounded-lg bg-surface-chip px-3 py-2 text-[12px] text-body-2" data-testid="card-no-executor">
          {zh ? '这张卡片的动作没有可执行的步骤：批准不会发送或改变任何东西。可以直接拒绝它。' : 'Nothing can carry this card out: approving it would send or change nothing. You can reject it.'}
        </p>
      )}
      {previewErr && (
        <div className={`mt-3 rounded-lg px-3 py-2 text-[12px] ${previewErr.blocking ? 'bg-danger/10 text-danger' : 'bg-warning/10 text-body-2'}`} data-testid="card-preview-error">
          {previewErr.expired
            ? (zh ? `这张卡片已失效：${executionReasonText(previewErr.reason, true)}。什么也不会发出。` : `This card is no longer valid: ${executionReasonText(previewErr.reason, false)}. Nothing will be sent.`)
            : previewErr.blocking
              ? (zh ? `预览没有通过：${executionReasonText(previewErr.reason, true)}。现在批准也会失败——先处理这个问题，或拒绝这张卡片。` : `The preview failed: ${executionReasonText(previewErr.reason, false)}. Approving now would fail too — fix that first, or reject the card.`)
              : (zh ? `预览没有成功：${executionReasonText(previewErr.reason, true)}。可以稍后再试。` : `The preview didn't load: ${executionReasonText(previewErr.reason, false)}. Try again shortly.`)}
          {previewErr.expired && (
            <button type="button" onClick={() => notifyPendingExpired(action.id)} className="ml-2 font-semibold underline underline-offset-2">
              {zh ? '从列表移除' : 'Remove from the list'}
            </button>
          )}
          {/* A blocking precondition can be fixed elsewhere (accept the landlord's invite, link the tenancy):
              let the person ask again instead of leaving approve locked until a reload. */}
          {previewErr.blocking && !previewErr.expired && realRow && executable && (
            <button type="button" disabled={previewBusy} onClick={() => loadPreview(previewOpt)} data-recheck className="ml-2 font-semibold underline underline-offset-2 disabled:opacity-60">
              {previewBusy ? '…' : zh ? '重新检查' : 'Check again'}
            </button>
          )}
        </div>
      )}
      {bBlocked && optionBlock && (
        <div className="mt-3 rounded-lg bg-warning/10 px-3 py-2 text-[12px] text-body-2" data-testid="card-option-blocked" data-option-blocked="B">
          {zh
            ? `方案 B（${pctLabel}）不能再发：${executionReasonText(optionBlock.reason, true)}。`
            : `Option B (${pctLabelEn}) can no longer be sent: ${executionReasonText(optionBlock.reason, false)}.`}
          {optionBlock.n1Deadline && (
            <span className="ml-1" data-testid="card-n1-deadline">
              {zh ? `这份租约的 N1 截止日是 ${optionBlock.n1Deadline}。` : `This lease's N1 deadline was ${optionBlock.n1Deadline}.`}
            </span>
          )}
          <span className="ml-1">{zh ? '方案 A（不涨续约）仍可以批准。' : 'Option A (renew with no increase) can still be approved.'}</span>
        </div>
      )}
      <div className="mt-5 flex flex-wrap gap-2">
        {!preview && realRow && executable && !previewErr?.blocking && (isRenewal ? (
          <>
            <button type="button" disabled={previewBusy} onClick={() => loadPreview('A')} className="rounded-lg border border-line-divider bg-white px-3 py-[9px] text-[12.5px] font-semibold text-body-2 disabled:opacity-60">{previewBusy ? '…' : (zh ? '预览正文（不涨）' : 'Preview (no increase)')}</button>
            {!bBlocked && <button type="button" disabled={previewBusy} onClick={() => loadPreview('B')} className="rounded-lg border border-line-divider bg-white px-3 py-[9px] text-[12.5px] font-semibold text-body-2 disabled:opacity-60">{previewBusy ? '…' : (zh ? `预览正文（${pctLabel}）` : `Preview (${pctLabelEn})`)}</button>}
          </>
        ) : (
          <button type="button" disabled={previewBusy} onClick={() => loadPreview()} className="rounded-lg border border-line-divider bg-white px-3 py-[9px] text-[12.5px] font-semibold text-body-2 disabled:opacity-60">{previewBusy ? '…' : (zh ? '预览正文' : 'Preview message')}</button>
        ))}
        {!executable || previewErr?.expired ? null : isRenewal ? (
          <>
            <button
              type="button"
              disabled={busy !== null || approveBlocked}
              onClick={() => decide('approved', 'A')}
              data-decide="approved"
              data-option="A"
              className="rounded-lg border border-brand bg-white px-4 py-[9px] text-[13.5px] font-semibold text-brand transition hover:bg-brand/5 disabled:opacity-60"
            >
              {busy === 'approved:A'
                ? (zh ? '发送中…' : 'Sending…')
                : zh
                  ? `✓ 不涨续约${m.current_rent ? ` · $${rentAmount(m.current_rent)}` : ''}`
                  : `✓ Renew, no increase${m.current_rent ? ` · $${rentAmount(m.current_rent)}` : ''}`}
            </button>
            <button
              type="button"
              disabled={busy !== null || approveBlocked || bBlocked}
              title={bBlocked ? (zh ? '已过 N1 截止日，方案 B 不能再发' : 'Past the N1 deadline — option B can no longer be sent') : undefined}
              onClick={() => decide('approved', 'B')}
              data-decide="approved"
              data-option="B"
              className="sl-btn-primary !px-4 !py-[10px] !text-[13.5px] disabled:opacity-60"
            >
              {busy === 'approved:B'
                ? (zh ? '发送中…' : 'Sending…')
                : zh
                  ? `✓ ${pctLabel} 续约${m.guideline_rent ? ` · $${rentAmount(m.guideline_rent)}` : ''}`
                  : `✓ ${pctLabelEn} renewal${m.guideline_rent ? ` · $${rentAmount(m.guideline_rent)}` : ''}`}
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={busy !== null || approveBlocked}
            onClick={() => decide('approved')}
            data-decide="approved"
            className="sl-btn-primary !px-4 !py-[10px] !text-[13.5px] text-center [text-wrap:balance] disabled:opacity-60"
          >
            {busy === 'approved' ? (zh ? '提交中…' : 'Submitting…') : ackOnly ? (zh ? '✓ 知悉' : '✓ Acknowledge') : zh ? '✓ 确认 · 替我执行' : '✓ Approve · Execute for me'}
          </button>
        )}
        {!previewErr?.expired && (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => decide('rejected')}
            data-decide="rejected"
            className="rounded-lg border border-line-strong bg-white px-4 py-[9px] text-[13.5px] font-semibold text-body transition hover:border-danger hover:text-danger disabled:opacity-60"
          >
            {busy === 'rejected' ? (zh ? '处理中…' : 'Working…') : zh ? '拒绝' : 'Reject'}
          </button>
        )}
      </div>
      <p className="mt-3 font-mono text-[10.5px] text-body-3">
        {zh ? '批准与拒绝都会写入审计 · 你随时可追溯' : 'Approve & reject are both written to the audit log · always traceable'}
      </p>
    </div>
  )
}

function ScopeList({
  tone,
  title,
  items,
}: {
  tone: 'share' | 'hold'
  title: string
  items: string[]
}) {
  if (!items?.length) return null
  const share = tone === 'share'
  return (
    <div className="rounded-xl border border-line-divider bg-surface-chip p-3">
      <div
        className={
          'font-mono text-[10px] font-bold uppercase tracking-eyebrow ' +
          (share ? 'text-brand' : 'text-body-3')
        }
      >
        {title}
      </div>
      <ul className="mt-2 space-y-1">
        {items.map((it) => (
          <li key={it} className="flex items-start gap-1.5 text-[12px] leading-snug text-body-2">
            <span className={share ? 'text-brand' : 'text-body-4'}>{share ? '✓' : '✕'}</span>
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** An approved card that has not run (the tab closed during the undo window, or the run failed).
 *  It stays on screen with why and two ways out — never vanishes (sweep 2026-10-01). The buttons go
 *  through the same onDecide: approved = 现在执行, rejected = 放弃 (useAgentSession routes them). */
export function StalledActionRow({
  action,
  onDecide,
  compact = false,
}: {
  action: PendingAction
  onDecide: (id: string, decision: 'approved' | 'rejected', option?: 'A' | 'B') => void | Promise<unknown>
  compact?: boolean
}) {
  const { lang } = useT()
  const zh = lang === 'zh'
  const [busy, setBusy] = useState<null | string>(null)
  const row = action as DecidedAction
  const reason = row.execution_result?.reason ?? (typeof row.execution_result?.error === 'string' ? row.execution_result.error : null) ?? 'interrupted'
  const m = (action.metadata || {}) as { guideline_pct?: number }
  // A renewal letter is sent only with the rent option the person picks; without a recorded choice, ask again.
  const needsOption = action.action_type === 'send_renewal_letter' && !row.approved_option
  // Option B refused past the N1 deadline (RTA s.116): the same card still sends option A — never re-run B.
  const onlyA = action.action_type === 'send_renewal_letter' && reason === 'past_n1_deadline'
  const run = async (d: 'approved' | 'rejected', option?: 'A' | 'B') => {
    setBusy(option ? `approved:${option}` : d)
    try { await onDecide(action.id, d, option) } finally { setBusy(null) }
  }
  const btn = 'rounded-lg px-3.5 py-[8px] text-[13px] font-semibold disabled:opacity-60'
  return (
    <div data-stalled-card data-card-id={action.id} tabIndex={-1} className={`rounded-2xl border border-warning/50 bg-warning/5 outline-none focus-visible:ring-2 focus-visible:ring-brand ${compact ? 'p-3.5' : 'p-5'}`}>
      <div className="font-mono text-[10px] font-bold uppercase tracking-eyebrowLg text-warning">
        {zh ? '已批准，尚未执行' : 'APPROVED · NOT RUN YET'}
      </div>
      <h3 className={`mt-1.5 font-bold tracking-tight ${compact ? 'text-[14.5px] leading-snug' : 'text-[16px]'}`}>{maskEmails(action.title, zh ? '对方' : 'the other party')}</h3>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-body-2">
        {zh ? `没有执行的原因：${executionReasonText(reason, true)}。` : `Why it hasn't run: ${executionReasonText(reason, false)}.`}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {onlyA ? (
          <button type="button" disabled={busy !== null} onClick={() => run('approved', 'A')} data-run-now="A" className={`${btn} bg-brand text-white`}>
            {busy === 'approved:A' ? '…' : zh ? '改为不涨续约 · 现在执行' : 'Renew with no increase · run now'}
          </button>
        ) : needsOption ? (
          <>
            <button type="button" disabled={busy !== null} onClick={() => run('approved', 'A')} data-run-now="A" className={`${btn} border border-brand bg-white text-brand`}>
              {busy === 'approved:A' ? '…' : zh ? '现在执行 · 不涨' : 'Run now · no increase'}
            </button>
            <button type="button" disabled={busy !== null} onClick={() => run('approved', 'B')} data-run-now="B" className={`${btn} bg-brand text-white`}>
              {busy === 'approved:B' ? '…' : zh ? `现在执行 · ${m.guideline_pct != null ? `+${m.guideline_pct}%` : '指导上限'}` : `Run now · ${m.guideline_pct != null ? `+${m.guideline_pct}%` : 'guideline'}`}
            </button>
          </>
        ) : (
          <button type="button" disabled={busy !== null} onClick={() => run('approved')} data-run-now="1" className={`${btn} bg-brand text-white`}>
            {busy === 'approved' ? (zh ? '执行中…' : 'Running…') : zh ? '现在执行' : 'Run now'}
          </button>
        )}
        <button type="button" disabled={busy !== null} onClick={() => run('rejected')} data-abandon className={`${btn} border border-line-strong bg-white text-body hover:border-danger hover:text-danger`}>
          {busy === 'rejected' ? '…' : zh ? '放弃' : 'Drop'}
        </button>
      </div>
    </div>
  )
}
