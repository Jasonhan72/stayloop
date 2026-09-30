'use client'

export const runtime = 'edge'

import { summaryFor } from '@/lib/screening/summaryText'
import FilePreviewModal from '@/components/landlord/FilePreviewModal'
import ThreadPanel from '@/components/threads/ThreadPanel'
import MessageButton from '@/components/messages/MessageButton'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import WorkspaceShell from '@/components/WorkspaceShell'
import { SampleBanner } from '@/components/SampleNotice'
import ApplicantReport, { type ReportDim } from '@/components/landlord/ApplicantReport'
import { StampRow } from '@/components/StampBadge'
import { useAIName } from '@/lib/aiName'
import { useAuth } from '@/lib/useAuth'
import { supabase, getSupabaseBrowser } from '@/lib/supabase'
import { useT } from '@/lib/i18n'
import type { ApplicationFile } from '@/types'
import ApprovalActionCard from '@/components/agent/ApprovalActionCard'
import { decidePendingAction } from '@/lib/agent/approval-engine'
import type { PendingAction } from '@/lib/agent/types'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

type LinkedScreening = {
  id: string
  status: string | null
  ai_score: number | null
  ai_summary: string | null
  v3_tier: string | null
  hard_gates_triggered: string[] | null
  verification: unknown
}

type AppDetail = {
  id: string
  first_name: string | null
  last_name: string | null
  ai_extracted_name: string | null
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
  archived_at?: string | null
  files: ApplicationFile[] | null
  listing: { address: string | null; unit: string | null; monthly_rent: number | null } | null
}

function RealApplicantDetail({ id }: { id: string }) {
  const { lang } = useT()
  const zh = lang === 'zh'
  const aiName = useAIName()
  const { user, loading: authLoading } = useAuth()
  const [app, setApp] = useState<AppDetail | null | 'missing'>(null)
  const [busy, setBusy] = useState(false)
  const [declineOpen, setDeclineOpen] = useState(false)
  const [declineReason, setDeclineReason] = useState('')
  const [err, setErr] = useState<string | null>(null)
  // Lifecycle plan 2026-09-22 §2.1: one-click screening from the application,
  // and the decision notice as an assistant card the landlord previews and
  // approves (send_decision executor).
  const [screenBusy, setScreenBusy] = useState(false)
  const [screeningId, setScreeningId] = useState<string | null>(null)
  // The screening this application was screened through (screenings.application_id).
  // The real pipeline writes its result on the screening row, not on
  // applications.ai_score (legacy column) — read it from here (e2e 2026-09-23).
  const [linked, setLinked] = useState<LinkedScreening | null>(null)
  const [noticeCard, setNoticeCard] = useState<PendingAction | null>(null)
  const [noticeDone, setNoticeDone] = useState<string | null>(null)
  const [needsMoreOpen, setNeedsMoreOpen] = useState(false)
  const [needsMoreText, setNeedsMoreText] = useState('')

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
          'id, first_name, last_name, ai_extracted_name, monthly_income, employer_name, job_title, ai_score, ai_summary, ai_dimension_notes, doc_authenticity_score, payment_ability_score, court_records_score, stability_score, behavior_signals_score, info_consistency_score, ltb_records_found, status, created_at, archived_at, files, viewed_at, listing:listings(address, unit, monthly_rent)',
        )
        .eq('id', id)
        .maybeSingle()
      if (!cancelled) setApp((data as unknown as AppDetail) ?? 'missing')
      // Applicant tracker (P1 2026-09-23): first open by the landlord stamps
      // viewed_at so the tenant sees "房东已查看". Idempotent; RLS-scoped.
      if (data && !(data as { viewed_at?: string | null }).viewed_at) {
        void supabase.from('applications').update({ viewed_at: new Date().toISOString() }).eq('id', id).is('viewed_at', null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id, user, authLoading])

  async function startScreening() {
    if (!app || app === 'missing' || !user || screenBusy) return
    setScreenBusy(true); setErr(null)
    try {
      const { data: sess } = await supabase.auth.getSession()
      const res = await fetch('/api/screening/from-application', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sess.session?.access_token ?? ''}` }, body: JSON.stringify({ application_id: app.id }) })
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; screening_id?: string; existing?: boolean; status?: string; error?: string }
      if (!res.ok || !j.screening_id) { setErr(j.error || `HTTP ${res.status}`); return }
      setScreeningId(j.screening_id)
      window.location.href = `/screening/app?screening=${j.screening_id}${j.existing && j.status === 'scored' ? '' : '&run=1'}`
    } finally { setScreenBusy(false) }
  }

  // Load an existing screening link + any pending decision card for this application.
  useEffect(() => {
    if (!app || app === 'missing' || !user) return
    let cancelled = false
    ;(async () => {
      const [{ data: sc }, { data: pa }] = await Promise.all([
        supabase.from('screenings').select('id, status, ai_score, ai_summary, ai_summary_zh, v3_tier, hard_gates_triggered, verification').eq('application_id', app.id).order('created_at', { ascending: false }).limit(1),
        supabase.from('agent_pending_actions').select('*').eq('action_type', 'send_decision').eq('status', 'pending').contains('metadata', { application_id: app.id }).order('created_at', { ascending: false }).limit(1),
      ])
      if (cancelled) return
      if (sc && sc.length) { setScreeningId(sc[0].id as string); setLinked(sc[0] as unknown as LinkedScreening) }
      if (pa && pa.length) setNoticeCard(pa[0] as PendingAction)
    })()
    return () => { cancelled = true }
  }, [app, user])

  async function proposeNotice(decision: 'approved' | 'declined' | 'needs_more', reason?: string) {
    if (!app || app === 'missing' || !user) return
    const listingAddr = app.listing ? `${(app.listing as { address?: string }).address ?? ''}` : ''
    const title = decision === 'approved' ? `录取通知：${name} · ${listingAddr}` : decision === 'declined' ? `婉拒通知：${name} · ${listingAddr}` : `补材料通知：${name} · ${listingAddr}`
    // Relay principle (找得到人 2026-09-30): the card names the applicant, never
    // shows their email — the executor reads the address from the application row.
    const summary = decision === 'approved'
      ? `批准后我会给${applicantWhoSp}发录取通知（发到 TA 申请时填写的邮箱），并说明租约随后送达。信里固定带《消费者报告法》s.10(7) 与 OHRC 声明。`
      : decision === 'declined'
        ? `批准后我会给${applicantWhoSp}发婉拒通知（发到 TA 申请时填写的邮箱）${reason ? `，理由：「${reason}」` : ''}。信里固定带 s.10(7) 索取权与 OHRC 声明；理由已写入审计。`
        : `批准后我会给${applicantWhoSp}发补材料通知（发到 TA 申请时填写的邮箱）：${reason || '（未填）'}`
    const { data: row, error } = await supabase.from('agent_pending_actions').insert({
      user_id: user.id, role: 'landlord', action_type: 'send_decision', title, summary,
      recipient_label: hasName ? name : null, data_scope: ['申请结果', decision === 'declined' && reason ? '房东填写的理由' : '申请对话（对方回邮件即进对话）'], excluded_data: ['筛查报告', '评分', '其他申请人信息'],
      risk_level: decision === 'declined' ? 'medium' : 'low', status: 'pending', requires_approval: true,
      metadata: { application_id: app.id, decision, reason: reason || null, source: 'applicant_page' },
    }).select('*').single()
    if (error || !row) { setErr(error?.message || 'could not create card'); return }
    setNoticeCard(row as PendingAction)
    setNoticeDone(null)
  }

  async function decideNotice(id: string, d: 'approved' | 'rejected') {
    if (!user) return
    await decidePendingAction(getSupabaseBrowser(), id, d)
    if (d === 'rejected') { setNoticeCard(null); return }
    const { data: sess } = await supabase.auth.getSession()
    const res = await fetch('/api/agent/execute', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sess.session?.access_token ?? ''}` }, body: JSON.stringify({ action_id: id }) })
    const j = (await res.json().catch(() => ({}))) as { executed?: boolean; reason?: string; result?: { sent_to?: string; decision?: string } }
    setNoticeCard(null)
    if (j.executed) {
      setNoticeDone(zh ? `通知已通过邮件发给${applicantWho}，副本留在下方的申请对话里` : `Notice emailed to ${applicantWhoEn}; a copy is in the application conversation below`)
      if (app && app !== 'missing' && j.result?.decision) setApp({ ...app, status: j.result.decision === 'needs_more' ? 'reviewing' : j.result.decision })
    } else setErr(j.reason || 'send failed')
  }

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
      // The decision is recorded; the notice goes out only after the landlord
      // previews and approves the card below.
      void proposeNotice(status, reason)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [app, user],
  )

  const [preview, setPreview] = useState<{ path: string; name: string } | null>(null)

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
  const hasName = name !== '—'
  const applicantWho = hasName ? `申请人 ${name}` : '申请人'
  const applicantWhoEn = hasName ? name : 'the applicant'
  const applicantWhoSp = hasName ? `${applicantWho} ` : applicantWho
  const unitLabel = app.listing
    ? [app.listing.unit ? `Unit ${app.listing.unit}` : null, app.listing.address].filter(Boolean).join(' · ')
    : zh ? '房源未关联' : 'No listing linked'
  const linkedScored = !!linked && linked.status === 'scored' && typeof linked.ai_score === 'number'
  const scored = app.ai_score != null || linkedScored
  const overall = app.ai_score ?? (linkedScored ? linked!.ai_score : null)
  const recommended = app.status === 'approved' || (overall != null && overall >= 75 && app.status !== 'declined')
  // Stamps mean applicant-authorised third-party verification (Veriff /
  // Flinks / Equifax on the linked screening) — never "files were uploaded".
  const vsteps = (() => {
    const v = (linked?.verification ?? null) as { steps?: Record<string, { status?: string; sandbox?: boolean }> } | Record<string, { status?: string; sandbox?: boolean }> | null
    const st = (v && 'steps' in v && v.steps ? v.steps : v) as Record<string, { status?: string; sandbox?: boolean }> | null
    const ok = (k: string) => !!st && st[k]?.status === 'verified' && !st[k]?.sandbox
    return { id: ok('id'), bank: ok('bank'), credit: ok('credit') }
  })()
  const tier = vsteps.id ? (vsteps.bank ? (vsteps.credit ? 4 : 3) : 1) : 0
  const tierLabel = (t: string | null | undefined) =>
    t === 'proceed' ? (zh ? '建议通过' : 'Proceed') : t === 'review' ? (zh ? '建议复核' : 'Review') : t === 'conditional' ? (zh ? '附条件' : 'Conditional') : t === 'decline' ? (zh ? '建议拒绝' : 'Decline') : zh ? '需面谈' : 'Needs interview'
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
            style={{ background: 'linear-gradient(135deg,#C4B5FD,#00ACE4)' }}
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
          {/* Application conversations are two-party (landlord · applicant), so the label names the person. */}
          <MessageButton
            target={{ kind: 'application', ref: app.id }}
            label={zh ? (hasName ? `发消息给 ${name}` : '发消息给申请人') : hasName ? `Message ${name}` : 'Message the applicant'}
            zh={zh}
            variant="primary"
            testId="applicant-message"
          />
          <StampRow tier={tier} lang={lang} />
          {app.status === 'declined' ? (
            <span className="rounded-md bg-danger/10 px-2 py-[4px] font-mono text-[10.5px] font-bold uppercase tracking-wider text-danger">
              {zh ? '已拒绝' : 'Declined'}
            </span>
          ) : app.status === 'approved' ? (
            <span className="rounded-md bg-success/10 px-2 py-[4px] font-mono text-[10.5px] font-bold uppercase tracking-wider text-success">
              {zh ? '已录取' : 'Approved'}
            </span>
          ) : recommended ? (
            <span className="rounded-md bg-success/10 px-2 py-[4px] font-mono text-[10.5px] font-bold uppercase tracking-wider text-success">
              {zh ? '推荐审批' : 'Recommended'}
            </span>
          ) : (
            <span className="rounded-md bg-warning/10 px-2 py-[4px] font-mono text-[10.5px] font-bold uppercase tracking-wider text-warning">
              {scored ? tierLabel(linked?.v3_tier) : zh ? '评分中' : 'Scoring'}
            </span>
          )}
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        {linkedScored && linked ? (
          <div className="sl-card self-start p-7">
            <div className="flex items-baseline justify-between">
              <h2 className="text-[18px] font-bold tracking-tight">{zh ? '筛查评分' : 'Screening score'}</h2>
              <div className="text-right">
                <div className="font-mono text-[40px] font-extrabold leading-none text-brand">{linked.ai_score}</div>
                <div className="font-mono text-[10.5px] uppercase text-body-3">/100 · {tierLabel(linked.v3_tier)}</div>
              </div>
            </div>
            {summaryFor(linked, zh) && <p className="mt-4 text-[13.5px] leading-relaxed text-body-2">{summaryFor(linked, zh)}</p>}
            {Array.isArray(linked.hard_gates_triggered) && linked.hard_gates_triggered.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {linked.hard_gates_triggered.map((g) => (
                  <span key={g} className="max-w-full break-words rounded-full bg-danger/10 px-2 py-0.5 font-mono text-[11px] font-bold text-danger">{g}</span>
                ))}
              </div>
            )}
            <p className="mt-4 text-[11.5px] text-body-3">{zh ? '评分与档位仅供参考 · 非拒绝依据（OHRC 租房政策）。完整报告含五个维度、取证、法庭与 LTB 检索。' : 'Score and tier are information only — never grounds to decline (OHRC). The full report has the five dimensions, forensics, court and LTB checks.'}</p>
            <Link href={`/screening/${linked.id}/report`} className="sl-btn-primary mt-4 inline-block !py-[10px] text-center">{zh ? '打开完整报告 →' : 'Open the full report →'}</Link>
          </div>
        ) : (
          <div className="sl-card p-7">
            <div className="flex items-baseline justify-between">
              <h2 className="text-[18px] font-bold tracking-tight">{zh ? '筛查评分' : 'Screening score'}</h2>
              <div className="text-right">
                <div className="font-mono text-[40px] font-extrabold leading-none text-brand">—</div>
                <div className="font-mono text-[10.5px] uppercase text-body-3">/100</div>
              </div>
            </div>
            <p className="mt-6 rounded-lg bg-surface-chip px-4 py-6 text-center text-[13px] text-body-2">
              {linked
                ? (zh ? '筛查已经发起，还没有出分。点「查看筛查报告」看进度。' : 'A screening has started but has no score yet — open the screening report to see its progress.')
                : zh
                  ? '还没有筛查。点「一键筛查」，按付款能力、信用、租务与司法历史、核验四项打分，通常几分钟出报告。'
                  : 'Not screened yet. Use “Screen with the submitted documents”: it scores ability to pay, credit, rental and legal history, and verification, usually within minutes.'}
            </p>
          </div>
        )}

        <div className="space-y-5">
          <div className="sl-card p-6">
            <h3 className="text-[15px] font-bold tracking-tight">{zh ? `${aiName} 建议` : `${aiName} recommends`}</h3>
            <p className="mt-2 text-[13.5px] leading-relaxed text-body-2">
              {summaryFor(linked, zh) || app.ai_summary ||
                (zh
                  ? `${name} 的申请已收到。收入 ${app.monthly_income ? `$${app.monthly_income.toLocaleString()}/mo` : '未填'}${app.employer_name ? ` · ${app.employer_name}` : ''}。评分完成后这里会给出完整建议。`
                  : `${name}'s application is in. Income ${app.monthly_income ? `$${app.monthly_income.toLocaleString()}/mo` : 'not given'}${app.employer_name ? ` · ${app.employer_name}` : ''}. A full recommendation appears here once scoring completes.`)}
            </p>
            {err && <p className="mt-2 text-[12.5px] font-semibold text-danger">{err}</p>}
            {noticeDone && <p className="mt-2 rounded-lg bg-success/10 px-3 py-2 text-[12.5px] font-semibold text-success">✓ {noticeDone}</p>}
            {noticeCard && (
              <div className="mt-4">
                <ApprovalActionCard action={noticeCard} compact onDecide={(id, d) => decideNotice(id, d)} />
              </div>
            )}
            <div className="mt-4 flex flex-col gap-2">
              <button
                className="sl-btn-primary !py-[12px] disabled:opacity-50"
                disabled={screenBusy}
                onClick={startScreening}
              >
                {screenBusy ? (zh ? '准备筛查…' : 'Preparing…') : screeningId ? (zh ? '🔍 查看筛查报告' : '🔍 Open screening report') : (zh ? '🔍 一键筛查（复用申请材料）' : '🔍 Screen with the submitted documents')}
              </button>
              <button
                className="rounded-lg border border-success/50 bg-white px-4 py-[10px] text-[13.5px] font-semibold text-success disabled:opacity-50"
                disabled={busy || app.status === 'approved'}
                onClick={() => decide('approved')}
              >
                {app.status === 'approved' ? (zh ? '✓ 已录取' : '✓ Approved') : zh ? '✓ 录取 · 起草通知' : '✓ Approve · draft the notice'}
              </button>
              {needsMoreOpen ? (
                <div className="rounded-lg border border-line-divider p-3">
                  <input value={needsMoreText} onChange={(e) => setNeedsMoreText(e.target.value)} placeholder={zh ? '需要补充什么（如：最近两张工资单）' : 'What is missing (e.g. two recent pay stubs)'} className="w-full rounded-md border border-line-divider px-3 py-2 text-[13px]" />
                  <div className="mt-2 flex gap-2">
                    <button className="sl-btn-primary flex-1 !py-2 !text-[13px]" disabled={!needsMoreText.trim()} onClick={() => { void proposeNotice('needs_more', needsMoreText.trim()); setNeedsMoreOpen(false) }}>{zh ? '起草补材料通知' : 'Draft the request'}</button>
                    <button className="sl-btn-secondary flex-1" onClick={() => setNeedsMoreOpen(false)}>{zh ? '取消' : 'Cancel'}</button>
                  </div>
                </div>
              ) : (
                <button className="sl-btn-secondary" onClick={() => setNeedsMoreOpen(true)}>{zh ? '✉ 请 TA 补充材料' : '✉ Ask for more documents'}</button>
              )}
              <Link href={`/landlord/leases/new?application_id=${app.id}`} className="sl-btn-secondary text-center">
                {zh ? '📄 起草租约' : '📄 Draft lease'}
              </Link>
              {screeningId && (
                <Link href={`/screening/app?screening=${screeningId}`} className="sl-btn-secondary text-center">
                  {zh ? '🪪 请 TA 本人核验（身份 / 银行 / 征信）' : '🪪 Ask them to verify (identity / bank / credit)'}
                </Link>
              )}
              {/* 找得到人 (2026-09-30): ask in the application conversation (relayed; replies land there) — the
                  old "have the AI draft an email" link lost its recipient once the email left the prompt. */}
              <MessageButton
                target={{ kind: 'application', ref: app.id, draft: zh ? '想跟你确认一下入住时间，另外还缺这些材料：' : 'Quick check on your move-in date, and the documents still missing: ' }}
                label={zh ? '💬 在申请对话里问入住时间和缺的材料' : '💬 Ask about move-in and missing documents'}
                zh={zh} variant="chip" className="sl-btn-secondary justify-center !rounded-full !py-2.5" testId="applicant-ask-thread"
              />
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
                    onClick={() => setPreview({ path: f.path, name: f.name })}
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
            <button type="button" data-testid="archive-toggle" onClick={async () => {
              const at = app.archived_at ? null : new Date().toISOString()
              const { error } = await getSupabaseBrowser().from('applications').update({ archived_at: at }).eq('id', app.id)
              if (!error) setApp({ ...app, archived_at: at })
            }} className="mt-3 w-full rounded-lg border border-line-divider py-2 text-[12.5px] font-semibold text-body-2">
              {app.archived_at ? (zh ? '取消归档' : 'Unarchive') : (zh ? '归档这份申请' : 'Archive this application')}
            </button>
            {preview && <FilePreviewModal path={preview.path} name={preview.name} zh={zh} onClose={() => setPreview(null)} />}
          </div>

          <div className="sl-card p-6" data-testid="application-thread">
            <h3 className="text-[15px] font-bold tracking-tight">{zh ? '与申请人的对话' : 'Thread with the applicant'}</h3>
            <p className="mt-1 text-[12px] text-body-3">{zh ? '申请人会收到新消息提醒邮件；TA 可以登录 Stayloop 在这里回复，也可以直接回复那封提醒邮件——都会进这段对话。对话经 Stayloop 中转，这里不会显示任何一方的邮箱。决定通知的副本也留在这里；记录只追加、带服务器时间。' : 'The applicant gets a new-message email; they can reply here after signing in to Stayloop, or simply reply to that email — either way it lands in this conversation. Messages are relayed by Stayloop; this conversation never shows either side’s email address. Copies of decision notices land here too; append-only, server-timed.'}</p>
            <div className="mt-3"><ThreadPanel kind="application" refId={app.id} viewer="landlord" zh={zh} title={zh ? '申请对话' : 'Application thread'} /></div>
          </div>
        </div>
      </div>
    </WorkspaceShell>
  )
}

// Design-canon walkthrough fixture (Mia Chen) — reachable only via the
// non-UUID sample ids on the list page's zero-data fallback.
// The four scored items of the real report (lib/screening/rubric.ts RUBRIC_WEIGHTS 42 / 26 / 20 / 12);
// weighted, these values give the 92 shown. Until 2026-09-28 this sample had six V4 dimensions and
// named identity and bank vendors the product does not use.
const DIMS = [
  { key: 'ability_to_pay', name: { zh: '付款能力', en: 'Ability to pay' }, val: 91, w: 42, color: '#047857', note: { zh: '工资单与在职信互证 · 流水里有稳定工资入账', en: 'Pay stubs and employment letter agree · steady payroll deposits on the statements' } },
  { key: 'credit_health', name: { zh: '信用', en: 'Credit' }, val: 88, w: 26, color: '#00ACE4', note: { zh: '征信 742 · 无逾期 · 12 个月内 1 次硬查询', en: 'Credit 742 · no delinquencies · 1 hard inquiry in 12 months' } },
  { key: 'rental_history', name: { zh: '租务与司法历史', en: 'Rental & legal history' }, val: 100, w: 20, color: '#DC2626', note: { zh: '安省法院门户与 LTB 判令目录均未查到 · 上任房东可致电', en: 'Nothing found on the Ontario courts portal or LTB order catalogue · previous landlord reachable' } },
  { key: 'verification', name: { zh: '核验', en: 'Verification' }, val: 95, w: 12, color: '#2563EB', note: { zh: '证件由 Veriff 核实 · 4 份材料信息一致', en: 'ID checked by Veriff · 4 documents consistent' } },
]

const FILES = [
  { name: 'passport.pdf',     type: 'ID',     size: '1.2 MB', date: { zh: '2 天前', en: '2 days ago' } },
  { name: 'paystub-may.pdf',  type: 'PAY',    size: '320 KB', date: { zh: '2 天前', en: '2 days ago' } },
  { name: 'bank-statement.pdf', type: 'BANK',   size: '500 KB', date: { zh: '2 天前', en: '2 days ago' } },
  { name: 'rbc-letter.pdf',   type: 'EMP',    size: '180 KB', date: { zh: '2 天前', en: '2 days ago' } },
]

function DemoApplicantDetail({ id }: { id: string }) {
  const { lang } = useT()
  const aiName = useAIName()
  return (
    <WorkspaceShell role="landlord" hideAside>
      <SampleBanner
        zh={lang === 'zh'}
        note={{ zh: '这是设计样例申请人 Mia Chen；收到真实申请后，列表与详情会自动换成真实数据。', en: 'This is the design-canon sample applicant, Mia Chen; once a real application arrives the list and detail switch to live data.' }}
      />
      <Link href="/landlord/applicants" className="font-mono text-[12px] text-body-3 hover:text-body">
        {lang === 'zh' ? '← 返回所有申请' : '← Back to all applications'}
      </Link>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-4">
          <span
            className="flex h-14 w-14 items-center justify-center rounded-full text-[22px] font-bold text-white"
            style={{ background: 'linear-gradient(135deg,#C4B5FD,#00ACE4)' }}
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
          <StampRow tier={3} lang={lang} />
          <span className="rounded-md bg-success/10 px-2 py-[4px] font-mono text-[10.5px] font-bold uppercase tracking-wider text-success">
            {lang === 'zh' ? '推荐审批' : 'Recommended'}
          </span>
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="self-start">
          <ApplicantReport
            lang={lang}
            score={92}
            dims={DIMS.map((d): ReportDim => ({ ...d, note: d.note[lang] }))}
            aiLine={
              lang === 'zh'
                ? 'Mia 的四项评分都在参考区间内，没有负面租务记录；收入约为租金的 4.0 倍（仅供参考，非拒绝依据）。'
                : 'Mia’s four scores all sit in the reference range and there is no negative rental history; income is about 4.0× the rent (information only, never grounds to decline).'
            }
            ltbCount={0}
            incomeRatio={4.0}
          />
        </div>

        <div className="space-y-5">
          <div className="sl-card p-6">
            <h3 className="text-[15px] font-bold tracking-tight">{lang === 'zh' ? `${aiName} 建议` : `${aiName} recommends`}</h3>
            <p className="mt-2 text-[13.5px] leading-relaxed text-body-2">
              {lang === 'zh'
                ? 'Mia 材料齐全，四项评分都在参考区间内，没有负面租务记录。录取与否由你决定。'
                : 'Mia’s file is complete; all four scores sit in the reference range, with no negative rental history. The decision is yours.'}
            </p>
            <p className="mt-2 text-[13px] font-semibold text-brand">
              {lang === 'zh'
                ? '建议：先批看房；决定前可以请她完成本人核验（银行一步约 5 分钟），补齐收入证据。'
                : 'Suggestion: approve the showing first; before you decide, you can ask her to complete the applicant verification (the bank step takes about 5 minutes).'}
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <Link
                href={`/landlord/agent?prompt=${encodeURIComponent(lang === 'zh' ? '批准【申请人】的看房请求，安排【时间】' : 'Approve 【applicant】’s showing request for 【time】')}`}
                className="sl-btn-primary !py-[12px] text-center"
              >
                {lang === 'zh' ? '✓ 批准看房' : '✓ Approve showing'}
              </Link>
              <Link href={`/landlord/leases/new?application_id=${id}`} className="sl-btn-secondary text-center">
                {lang === 'zh' ? '📄 起草租约' : '📄 Draft lease'}
              </Link>
              <Link
                href={`/landlord/agent?prompt=${encodeURIComponent(lang === 'zh' ? '请【申请人】补充【材料，如银行流水 / 在职信】' : 'Ask 【applicant】 to provide 【documents — bank statements / employment letter】')}`}
                className="sl-btn-secondary text-center"
              >{lang === 'zh' ? '请她完成本人核验' : 'Ask her to verify'}</Link>
              <Link
                href={`/landlord/agent?prompt=${encodeURIComponent(lang === 'zh' ? '帮我给【申请人】写一封邮件，问【入住时间 / 材料】' : 'Draft an email to 【applicant】 about 【move-in timing / documents】')}`}
                className="sl-btn-secondary text-center"
              >{lang === 'zh' ? '💬 先跟她聊一下（经她的 AI 助理中介）' : '💬 Chat with her first (via her AI Agent)'}</Link>
              <Link
                href={`/landlord/agent?prompt=${encodeURIComponent(lang === 'zh' ? '我想婉拒【申请人】的申请，理由是【具体、与租住能力相关的理由】，帮我走合规流程' : 'I want to decline 【applicant】’s application because 【specific, tenancy-related reason】 — walk me through the compliant process (specific, non-discriminatory reason, logged to audit)')}`}
                className="rounded-lg border border-danger/40 bg-white px-4 py-[10px] text-center text-[13.5px] font-semibold text-danger"
              >
                {lang === 'zh' ? '✗ 不合适（需选理由）' : '✗ Not a fit (reason required)'}
              </Link>
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
