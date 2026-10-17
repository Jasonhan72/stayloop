'use client'

// /my-file/<token> — the whole applicant flow after the email link:
//   invalid_token → "link invalid or expired · send again"
//   pending_verification → VerifyForm → POST …/verify
//   needs_review → a person at Stayloop answers by email within 2 business days
//   matched / fulfilled → the disclosure pack (iframe + print + JSON), item-by-item
//     disputes, the identity alert card, and the list of disputes with status
//   closed → the request was closed (note shown if any)
// Everything talks to /api/consumer/request/<token>/* (contract 2026-10-17);
// the token is the only credential, there is no sign-in. No window.confirm/alert.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useT } from '@/lib/i18n'
import VerifyForm from './VerifyForm'
import PackView, { type DisputeDraft } from './PackView'
import DisputeList from './DisputeList'
import AlertCard from './AlertCard'
import { type DisclosurePack, type RequestView, type VerifyInput, TOKEN_RE, fmtDate } from './types'

type Phase = 'loading' | 'invalid' | 'ready' | 'error'

const base = (token: string) => `/api/consumer/request/${encodeURIComponent(token)}`

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try { return (await res.json()) as Record<string, unknown> } catch { return {} }
}

export default function MyFileToken({ token }: { token: string }) {
  const { lang } = useT()
  const zh = lang === 'zh'
  const formatOk = TOKEN_RE.test(token)

  const [phase, setPhase] = useState<Phase>(formatOk ? 'loading' : 'invalid')
  const [view, setView] = useState<RequestView | null>(null)
  const [verifyBusy, setVerifyBusy] = useState(false)
  const [verifyErr, setVerifyErr] = useState<string | null>(null)
  const [html, setHtml] = useState<string | null>(null)
  const [pack, setPack] = useState<DisclosurePack | null>(null)
  const [packLoading, setPackLoading] = useState(false)
  const [disputeBusy, setDisputeBusy] = useState(false)
  const [disputeErr, setDisputeErr] = useState<string | null>(null)
  const [alertBusy, setAlertBusy] = useState(false)
  const [alertErr, setAlertErr] = useState<string | null>(null)

  const packReady = view != null && (view.status === 'matched' || view.status === 'fulfilled')

  // 1. Load the request (the first GET marks the email verified server-side).
  useEffect(() => {
    if (!formatOk) return
    let alive = true
    ;(async () => {
      try {
        const res = await fetch(base(token), { cache: 'no-store' })
        if (!alive) return
        if (res.status === 404) { setPhase('invalid'); return }
        if (!res.ok) { setPhase('error'); return }
        const j = (await res.json()) as RequestView
        if (!alive) return
        setView(j)
        setPhase('ready')
      } catch {
        if (alive) setPhase('error')
      }
    })()
    return () => { alive = false }
  }, [token, formatOk])

  // 2. Once matched / fulfilled, fetch the pack in both forms.
  useEffect(() => {
    if (!packReady) return
    let alive = true
    setPackLoading(true)
    ;(async () => {
      const [h, j] = await Promise.all([
        fetch(`${base(token)}/pack?format=html`, { cache: 'no-store' }).then((r) => (r.ok ? r.text() : null)).catch(() => null),
        fetch(`${base(token)}/pack?format=json`, { cache: 'no-store' }).then((r) => (r.ok ? (r.json() as Promise<DisclosurePack>) : null)).catch(() => null),
      ])
      if (!alive) return
      setHtml(h)
      setPack(j && Array.isArray(j.screenings) ? j : null)
      setPackLoading(false)
    })()
    return () => { alive = false }
  }, [packReady, token])

  const verify = useCallback(async (input: VerifyInput) => {
    setVerifyBusy(true)
    setVerifyErr(null)
    try {
      const res = await fetch(`${base(token)}/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })
      const j = await readJson(res)
      if (res.status === 404) { setPhase('invalid'); return }
      if (!res.ok) { setVerifyErr(zh ? `没能提交（${String(j.error || res.status)}），请稍后再试。` : `Could not submit (${String(j.error || res.status)}); please try again.`); return }
      setView(j as unknown as RequestView)
    } catch {
      setVerifyErr(zh ? '网络出了点问题，请再试一次。' : 'Network problem; please try again.')
    } finally {
      setVerifyBusy(false)
    }
  }, [token, zh])

  const dispute = useCallback(async (draft: DisputeDraft): Promise<boolean> => {
    setDisputeBusy(true)
    setDisputeErr(null)
    try {
      const res = await fetch(`${base(token)}/dispute`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) })
      const j = await readJson(res)
      if (!res.ok) {
        setDisputeErr(res.status === 429
          ? (zh ? '提交得太快了，一小时内最多 10 条，请稍后再试。' : 'Too many in a short time (10 per hour); please try again later.')
          : (zh ? `没能提交（${String(j.error || res.status)}）。` : `Could not submit (${String(j.error || res.status)}).`))
        return false
      }
      const id = String(j.id || `local-${Date.now()}`)
      setView((v) => v ? { ...v, disputes: [{ id, screening_id: draft.screening_id, item_kind: draft.item_kind, item_ref: draft.item_ref, item_label: draft.item_label, statement: draft.statement, status: 'open', created_at: new Date().toISOString() }, ...v.disputes] } : v)
      return true
    } catch {
      setDisputeErr(zh ? '网络出了点问题，请再试一次。' : 'Network problem; please try again.')
      return false
    } finally {
      setDisputeBusy(false)
    }
  }, [token, zh])

  const setAlert = useCallback(async (statement: string) => {
    setAlertBusy(true)
    setAlertErr(null)
    try {
      const res = await fetch(`${base(token)}/alert`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ statement }) })
      const j = await readJson(res)
      if (!res.ok) { setAlertErr(zh ? `没能保存（${String(j.error || res.status)}）。` : `Could not save (${String(j.error || res.status)}).`); return }
      const a = (j.alert as RequestView['alert']) || { statement, created_at: new Date().toISOString(), expires_at: null }
      setView((v) => v ? { ...v, alert: a } : v)
    } catch {
      setAlertErr(zh ? '网络出了点问题，请再试一次。' : 'Network problem; please try again.')
    } finally {
      setAlertBusy(false)
    }
  }, [token, zh])

  const revokeAlert = useCallback(async () => {
    setAlertBusy(true)
    setAlertErr(null)
    try {
      const res = await fetch(`${base(token)}/alert`, { method: 'DELETE' })
      if (!res.ok && res.status !== 404) { const j = await readJson(res); setAlertErr(zh ? `没能撤销（${String(j.error || res.status)}）。` : `Could not withdraw (${String(j.error || res.status)}).`); return }
      setView((v) => v ? { ...v, alert: null } : v)
    } catch {
      setAlertErr(zh ? '网络出了点问题，请再试一次。' : 'Network problem; please try again.')
    } finally {
      setAlertBusy(false)
    }
  }, [token, zh])

  // ---- render ----
  if (phase === 'invalid') {
    return (
      <Card testId="my-file-invalid">
        <div className="text-[18px] font-bold">{zh ? '链接无效或已过期' : 'This link is invalid or has expired'}</div>
        <p className="mt-2 text-[13.5px] leading-relaxed text-body-2">{zh ? '确认链接只在 24 小时内有效，而且只能用一次。重新发送一封就行。' : 'A confirmation link works for 24 hours and for one request. Just send a new one.'}</p>
        <Link href="/my-file" className="sl-btn-primary mt-4 inline-flex">{zh ? '重新发送' : 'Send again'}</Link>
      </Card>
    )
  }
  if (phase === 'error') {
    return (
      <Card testId="my-file-error">
        <div className="text-[18px] font-bold">{zh ? '暂时打不开' : 'Temporarily unavailable'}</div>
        <p className="mt-2 text-[13.5px] leading-relaxed text-body-2">{zh ? '服务器没有回应，请过几分钟刷新；仍不行的话写信到 privacy@stayloop.ai。' : 'The server did not respond; refresh in a few minutes, or write to privacy@stayloop.ai.'}</p>
      </Card>
    )
  }
  if (phase === 'loading' || !view) {
    return <Card testId="my-file-loading"><p className="text-[13.5px] text-body-3" aria-busy="true">{zh ? '正在确认链接…' : 'Checking the link…'}</p></Card>
  }

  if (view.status === 'pending_verification') {
    return <VerifyForm zh={zh} emailMasked={view.email_masked} busy={verifyBusy} error={verifyErr} onSubmit={(i) => { void verify(i) }} />
  }

  if (view.status === 'needs_review') {
    return (
      <Card testId="my-file-needs-review">
        <div className="text-[18px] font-bold">{zh ? '已交给 Stayloop 专人' : 'Passed to a person at Stayloop'}</div>
        <p className="mt-2 text-[13.5px] leading-relaxed text-body-2">
          {zh
            ? `我们没能自动把你填的信息和档案对上。已交给 Stayloop 专人复核，2 个工作日内（到 ${fmtDate(view.due_at, zh, true)}）通过 ${view.email_masked} 回复你。`
            : `We could not match what you entered to a file automatically. A person at Stayloop is reviewing it and will reply to ${view.email_masked} within 2 business days (by ${fmtDate(view.due_at, zh, true)}).`}
        </p>
        <p className="mt-3 text-[12.5px] text-body-3">{zh ? '等不及的话也可以写信到 privacy@stayloop.ai，注明申请时用的邮箱。' : 'You can also write to privacy@stayloop.ai quoting the email you applied with.'}</p>
      </Card>
    )
  }

  if (view.status === 'closed') {
    return (
      <Card testId="my-file-closed">
        <div className="text-[18px] font-bold">{zh ? '这个请求已经办结' : 'This request is closed'}</div>
        <p className="mt-2 text-[13.5px] leading-relaxed text-body-2">{zh ? '需要再看一次档案的话，重新发送一封确认邮件即可。' : 'To see your file again, send a new confirmation email.'}</p>
        <Link href="/my-file" className="sl-btn-primary mt-4 inline-flex">{zh ? '重新发送' : 'Send again'}</Link>
      </Card>
    )
  }

  // matched / fulfilled
  const disputedRefs = new Set(view.disputes.map((d) => `${d.screening_id}:${d.item_ref}`))
  const queued = view.status === 'matched' && (view.delivery === 'mail' || view.delivery === 'phone')
  return (
    <div className="space-y-6">
      <Card testId="my-file-matched">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full px-2.5 py-1 font-mono text-[11px] font-bold" style={{ background: '#E4EEE3', color: '#065F46' }}>{zh ? '身份已确认' : 'Identity confirmed'}</span>
          <span className="text-[13px] text-body-3">{view.email_masked}{view.name ? ` · ${view.name}` : ''}</span>
        </div>
        <p className="mt-3 text-[13.5px] leading-relaxed text-body-2">
          {zh
            ? `找到 ${view.matched.length} 次与你有关的筛查。下面是档案的全部内容，免费；每条旁边都能提出争议，页面底部可以设置身份警示。`
            : `${view.matched.length} screening(s) about you were found. The full file is below, free of charge; every item can be disputed, and you can set an identity alert at the bottom.`}
        </p>
        {queued && (
          <p className="mt-3 rounded-lg px-3 py-2 text-[13px]" style={{ background: '#FEF3E2', color: '#92400E' }} data-testid="my-file-queued">
            {view.delivery === 'mail'
              ? (zh ? `已排队：2 个工作日内（到 ${fmtDate(view.due_at, zh)}）寄出纸质档案。` : `Queued: the paper copy goes out within 2 business days (by ${fmtDate(view.due_at, zh)}).`)
              : (zh ? `已排队：2 个工作日内（到 ${fmtDate(view.due_at, zh)}）来电说明。` : `Queued: we call you within 2 business days (by ${fmtDate(view.due_at, zh)}).`)}
            {' '}{zh ? '在此之前也可以直接在这里看。' : 'You can read it here in the meantime.'}
          </p>
        )}
        {view.alert && (
          <p className="mt-3 rounded-lg px-3 py-2 text-[13px]" style={{ background: '#FEF2F2', color: '#991B1B' }}>
            <span className="font-semibold">{zh ? '档案上有身份警示：' : 'Identity alert on file: '}</span>{view.alert.statement}
          </p>
        )}
      </Card>

      <PackView zh={zh} html={html} pack={pack} loading={packLoading} disputedRefs={disputedRefs} onDispute={dispute} disputeBusy={disputeBusy} disputeError={disputeErr} />

      <DisputeList disputes={view.disputes} zh={zh} />

      <AlertCard key={view.alert ? `${view.alert.created_at}:${view.alert.statement}` : 'none'} alert={view.alert} zh={zh} busy={alertBusy} error={alertErr} onSet={(s) => { void setAlert(s) }} onRevoke={() => { void revokeAlert() }} />

      <p className="text-[12.5px] leading-relaxed text-body-3">
        {zh ? '这些权利来自安省《消费者报告法》s.12 / s.12.1 / s.13。' : 'These rights come from the Consumer Reporting Act (Ontario) s.12 / s.12.1 / s.13.'}{' '}
        <Link href="/consumer-rights" className="font-semibold text-brand hover:underline">{zh ? '浅白说明 →' : 'Plain-language guide →'}</Link>
      </p>
    </div>
  )
}

function Card({ children, testId }: { children: React.ReactNode; testId: string }) {
  return <div data-testid={testId} className="rounded-2xl border border-line-divider bg-white p-5 sm:p-6">{children}</div>
}
