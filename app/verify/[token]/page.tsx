'use client'

export const runtime = 'edge'

// /verify/[token] — the applicant's page (design/verification-flow-plan.md).
// Public route; the token is the credential. Consent first, then three
// independently skippable steps: identity (Veriff, hosted), bank (Flinks
// Connect, embedded), credit (own-authorised pull, provider pending).
// Everything here talks to /api/verify/<token>/* — never to the table.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { useT } from '@/lib/i18n'
import { CONSENT_TEXT, CONSENT_VERSION } from '@/lib/verify/consent'
import type { VerifyPublicView, VerifyStepKey } from '@/lib/verify/types'

type View = VerifyPublicView

export default function VerifyPage() {
  const params = useParams()
  const token = String(params?.token || '')
  const { lang } = useT()
  const zh = lang === 'zh'
  const C = CONSENT_TEXT[zh ? 'zh' : 'en']

  const [view, setView] = useState<View | null | 'missing'>(null)
  const [agree, setAgree] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [bankFrame, setBankFrame] = useState<string | null>(null)
  const [creditForm, setCreditForm] = useState(false)
  const [cf, setCf] = useState({ first_name: '', last_name: '', date_of_birth: '', line1: '', city: '', province: 'ON', postal_code: '' })
  const bankHandled = useRef(false)

  const api = useCallback(async (path: string, body?: unknown) => {
    const res = await fetch(`/api/verify/${token}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    })
    const data = await res.json().catch(() => ({}))
    return { res, data }
  }, [token])

  const reload = useCallback(async () => {
    const { res, data } = await api('')
    if (res.status === 404) { setView('missing'); return }
    if (data?.ok) setView(data as View)
  }, [api])

  useEffect(() => { if (token) reload() }, [token, reload])

  // Returning from a provider (?returned=1):
  //   · Veriff: the decision arrives by webhook a little later — poll briefly
  //   · Flinks OAuth institutions land here with ?loginId=… — exchange it
  useEffect(() => {
    if (typeof window === 'undefined') return
    const qs = new URLSearchParams(window.location.search)
    if (qs.get('returned') !== '1') return
    const loginId = qs.get('loginId')
    window.history.replaceState(null, '', window.location.pathname)
    if (loginId && /^[0-9a-f-]{20,64}$/i.test(loginId) && !bankHandled.current) {
      bankHandled.current = true
      setBusy('bank')
      api('/bank', { login_id: loginId }).then(({ res, data }) => {
        if (!res.ok) setErr(zh ? `银行数据读取失败：${data?.detail || data?.error || res.status}` : `Bank read failed: ${data?.detail || data?.error || res.status}`)
        if (data?.ok) setView(data as View)
        setBusy(null)
      })
      return
    }
    let n = 0
    const t = setInterval(() => { n++; reload(); if (n >= 10) clearInterval(t) }, 4000)
    return () => clearInterval(t)
  }, [reload, api, zh])

  // Flinks Connect posts its lifecycle events to the parent window; REDIRECT
  // carries the loginId we exchange server-side.
  useEffect(() => {
    if (!bankFrame) return
    bankHandled.current = false
    const onMsg = async (e: MessageEvent) => {
      const d = e.data as { step?: string; loginId?: string; institution?: string } | undefined
      if (!d || typeof d !== 'object') return
      if (d.step === 'REDIRECT' && d.loginId && !bankHandled.current) {
        bankHandled.current = true
        setBusy('bank')
        setBankFrame(null)
        const { res, data } = await api('/bank', { login_id: d.loginId })
        if (!res.ok) setErr(zh ? `银行数据读取失败：${data?.detail || data?.error || res.status}` : `Bank read failed: ${data?.detail || data?.error || res.status}`)
        if (data?.ok) setView(data as View)
        setBusy(null)
      }
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [bankFrame, api, zh])

  async function consent() {
    setBusy('consent'); setErr(null)
    const { res, data } = await api('/consent', { accepted: agree, typed_name: typed, version: CONSENT_VERSION })
    if (!res.ok) setErr(zh ? '请勾选同意并输入全名。' : 'Please tick the box and type your full name.')
    else setView(data as View)
    setBusy(null)
  }

  async function start(step: VerifyStepKey) {
    setBusy(step); setErr(null)
    const { res, data } = await api('/start', { step, lang: zh ? 'en' : 'en' })
    if (!res.ok) {
      setErr(data?.error === 'not_configured'
        ? (zh ? '这一项尚未开通。' : 'This step is not available yet.')
        : (zh ? `无法启动：${data?.detail || data?.error || res.status}` : `Could not start: ${data?.detail || data?.error || res.status}`))
      setBusy(null); return
    }
    if (step === 'id' && data.url) { window.location.href = data.url; return }
    if (step === 'bank' && data.iframe_url) { setBankFrame(data.iframe_url) }
    if (step === 'credit' && data.form === 'credit') {
      const [first, ...rest] = (view && view !== 'missing' && view.tenant_name ? view.tenant_name : '').split(/\s+/).filter(Boolean)
      setCf((c) => ({ ...c, first_name: c.first_name || first || '', last_name: c.last_name || rest.join(' ') }))
      setCreditForm(true)
    }
    setBusy(null)
  }

  async function submitCredit() {
    setBusy('credit'); setErr(null)
    const { res, data } = await api('/credit', {
      first_name: cf.first_name, last_name: cf.last_name, date_of_birth: cf.date_of_birth,
      address: { line1: cf.line1, city: cf.city, province: cf.province, postal_code: cf.postal_code },
    })
    if (!res.ok) {
      setErr(data?.error === 'fields_required'
        ? (zh ? '请填写全部字段（出生日期格式 YYYY-MM-DD）。' : 'Please fill in every field (date of birth as YYYY-MM-DD).')
        : (zh ? `征信拉取失败：${data?.detail || data?.error || res.status}` : `Credit pull failed: ${data?.detail || data?.error || res.status}`))
    } else { setCreditForm(false) }
    if (data?.ok) setView(data as View)
    setBusy(null)
  }

  const L = {
    title: zh ? '租房申请核验' : 'Rental application verification',
    from: (n: string | null) => zh ? `邀请来自房东 ${n || ''}` : `Invitation from landlord ${n || ''}`,
    hi: (n: string | null) => n ? (zh ? `${n}，你好` : `Hello ${n}`) : (zh ? '你好' : 'Hello'),
    expired: zh ? '这条链接已过期。请联系房东重新发送。' : 'This link has expired. Ask the landlord to send a new one.',
    missing: zh ? '链接无效。' : 'This link is not valid.',
    steps: {
      id: { t: zh ? '身份核验' : 'Identity', d: zh ? '证件 + 自拍活体，由 Veriff 完成，约 2 分钟。' : 'Document + selfie liveness with Veriff, about 2 minutes.' },
      bank: { t: zh ? '银行流水' : 'Bank statements', d: zh ? '通过 Flinks 安全连接你的银行，只读近 90 天；我们不保存你的网银密码。' : 'Connect your bank securely through Flinks — read-only, last 90 days; we never store your banking password.' },
      credit: { t: zh ? '征信报告' : 'Credit report', d: zh ? '由你本人授权拉取自己的信用报告摘要。' : 'A summary of your own credit report, pulled only with your authorisation.' },
    },
    status: {
      not_configured: zh ? '未开通' : 'Not available yet',
      pending: zh ? '未开始' : 'Not started',
      started: zh ? '进行中' : 'In progress',
      submitted: zh ? '已提交，等待结果' : 'Submitted, awaiting result',
      verified: zh ? '已核验' : 'Verified',
      failed: zh ? '未通过 / 未完成' : 'Not verified',
      skipped: zh ? '已跳过' : 'Skipped',
    },
    start: zh ? '开始' : 'Start',
    redo: zh ? '重新进行' : 'Try again',
    sandbox: zh ? '沙箱数据' : 'Sandbox data',
    done: zh ? '全部完成。你可以关闭此页面；房东会在筛查报告里看到核验结果。' : 'All done. You can close this page; the landlord will see the results in the screening report.',
  }

  return (
    <div className="min-h-screen bg-surface">
      <Header />
      <main className="mx-auto max-w-[640px] px-5 pb-20 pt-8 sm:px-6">
        <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-body-3">Stayloop · {L.title}</div>

        {view === null && <div className="mt-6 h-[120px] animate-pulse rounded-xl border border-line-divider bg-surface-muted" />}
        {view === 'missing' && <div className="mt-6 rounded-xl border border-line-divider bg-white p-5 text-[14px]">{L.missing}</div>}

        {view && view !== 'missing' && (
          <>
            <h1 className="mt-2 text-[26px] font-extrabold tracking-tight">{L.hi(view.tenant_name)}</h1>
            <p className="mt-1 text-[13.5px] text-body-3">{L.from(view.landlord_name)}</p>

            {view.status === 'expired' ? (
              <div className="mt-6 rounded-xl border border-line-divider bg-white p-5 text-[14px]">{L.expired}</div>
            ) : !view.consented ? (
              <section className="mt-6 rounded-2xl border border-line-divider bg-white p-5 sm:p-6">
                <h2 className="text-[17px] font-bold">{C.title}</h2>
                <p className="mt-2 text-[13.5px] leading-relaxed text-body-2">{C.intro}</p>
                <dl className="mt-4 space-y-3">
                  {C.items.map((it) => (
                    <div key={it.h}>
                      <dt className="text-[13px] font-bold">{it.h}</dt>
                      <dd className="mt-0.5 text-[13px] leading-relaxed text-body-2">{it.p}</dd>
                    </div>
                  ))}
                </dl>
                <label className="mt-5 flex items-start gap-2.5 text-[13.5px]">
                  <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-[3px]" />
                  <span>{C.ack}</span>
                </label>
                <label className="mt-3 block text-[12.5px] font-semibold text-body-2">
                  {C.typedNameLabel}
                  <input value={typed} onChange={(e) => setTyped(e.target.value)} className="sl-input mt-1 w-full" placeholder={view.tenant_name || ''} />
                </label>
                <button onClick={consent} disabled={!agree || typed.trim().length < 2 || busy === 'consent'} className="sl-btn-primary mt-4 w-full !py-3 disabled:opacity-50">
                  {busy === 'consent' ? '…' : C.button}
                </button>
                <div className="mt-2 text-center font-mono text-[10.5px] text-body-4">{CONSENT_VERSION}</div>
              </section>
            ) : (
              <section className="mt-6 space-y-3">
                {(['id', 'bank', 'credit'] as VerifyStepKey[]).map((k) => {
                  const st = view.steps[k]
                  const terminal = st.status === 'verified'
                  const canStart = st.status !== 'not_configured' && !terminal && st.status !== 'submitted'
                  return (
                    <div key={k} className="rounded-2xl border border-line-divider bg-white p-4 sm:p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-[15px] font-bold">{L.steps[k].t}</div>
                            <StatusPill status={st.status} label={L.status[st.status]} />
                            {st.sandbox && st.status !== 'not_configured' && <span className="rounded-md bg-amber-50 px-1.5 py-[1px] font-mono text-[10px] font-bold text-amber-700">{L.sandbox}</span>}
                          </div>
                          <div className="mt-1 text-[12.5px] leading-relaxed text-body-3">{L.steps[k].d}</div>
                          {st.summary && <div className="mt-1.5 font-mono text-[11.5px] text-body-2">{st.summary}</div>}
                        </div>
                        {canStart && (
                          <button onClick={() => start(k)} disabled={busy !== null} className="sl-btn-primary !px-4 !py-[9px] !text-[13px] disabled:opacity-50">
                            {busy === k ? '…' : st.status === 'failed' ? L.redo : L.start}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
                {view.status === 'complete' && (
                  <div className="rounded-xl px-4 py-3 text-[13px] font-semibold" style={{ background: '#E4EEE3', color: '#065F46' }}>{L.done}</div>
                )}
              </section>
            )}

            {err && <div className="mt-3 text-[12.5px] font-semibold" style={{ color: '#DC2626' }}>⚠ {err}</div>}
          </>
        )}

        {creditForm && (
          <div role="dialog" aria-modal="true" className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-3" onClick={() => setCreditForm(false)}>
            <div className="w-full max-w-[440px] rounded-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
              <div className="text-[16px] font-bold">{zh ? '拉取你自己的信用报告' : 'Pull your own credit report'}</div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-body-3">
                {zh ? 'Equifax 按姓名、出生日期和现住址匹配你的档案；我们不收集社会保险号。这是一次本人授权的查询，不会作为贷款申请出现在你的报告上。' : 'Equifax matches your file by name, date of birth and current address; we do not collect your SIN. This is a consumer-authorised enquiry and does not appear as a credit application.'}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <input className="sl-input" placeholder={zh ? '名' : 'First name'} value={cf.first_name} onChange={(e) => setCf({ ...cf, first_name: e.target.value })} />
                <input className="sl-input" placeholder={zh ? '姓' : 'Last name'} value={cf.last_name} onChange={(e) => setCf({ ...cf, last_name: e.target.value })} />
                <input className="sl-input col-span-2" type="date" placeholder="YYYY-MM-DD" value={cf.date_of_birth} onChange={(e) => setCf({ ...cf, date_of_birth: e.target.value })} />
                <input className="sl-input col-span-2" placeholder={zh ? '街道地址' : 'Street address'} value={cf.line1} onChange={(e) => setCf({ ...cf, line1: e.target.value })} />
                <input className="sl-input" placeholder={zh ? '城市' : 'City'} value={cf.city} onChange={(e) => setCf({ ...cf, city: e.target.value })} />
                <input className="sl-input" placeholder={zh ? '省（如 ON）' : 'Province (e.g. ON)'} value={cf.province} maxLength={2} onChange={(e) => setCf({ ...cf, province: e.target.value.toUpperCase() })} />
                <input className="sl-input col-span-2" placeholder={zh ? '邮编' : 'Postal code'} value={cf.postal_code} onChange={(e) => setCf({ ...cf, postal_code: e.target.value.toUpperCase() })} />
              </div>
              <div className="mt-4 flex gap-2">
                <button onClick={submitCredit} disabled={busy === 'credit'} className="sl-btn-primary flex-1 !py-[10px] disabled:opacity-50">{busy === 'credit' ? '…' : (zh ? '授权并拉取' : 'Authorise and pull')}</button>
                <button onClick={() => setCreditForm(false)} className="rounded-xl border border-line-divider px-4 text-[13px] text-body-3">{zh ? '取消' : 'Cancel'}</button>
              </div>
            </div>
          </div>
        )}

        {bankFrame && (
          <div role="dialog" aria-modal="true" className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-3">
            <div className="flex h-[min(720px,92vh)] w-full max-w-[420px] flex-col overflow-hidden rounded-2xl bg-white">
              <div className="flex items-center justify-between border-b border-line-divider px-3 py-2 text-[12.5px] font-semibold">
                <span>{zh ? '连接你的银行' : 'Connect your bank'}</span>
                <button onClick={() => setBankFrame(null)} className="text-body-3">{zh ? '关闭' : 'Close'}</button>
              </div>
              <iframe title="Flinks Connect" src={bankFrame} className="h-full w-full flex-1" allow="clipboard-write" />
            </div>
          </div>
        )}
      </main>
      <Footer />
    </div>
  )
}

function StatusPill({ status, label }: { status: string; label: string }) {
  const style =
    status === 'verified' ? { background: '#E4EEE3', color: '#065F46' }
    : status === 'failed' ? { background: '#FEF2F2', color: '#B91C1C' }
    : status === 'submitted' || status === 'started' ? { background: '#FEF3E2', color: '#B45309' }
    : { background: '#F3F8FC', color: '#71717A' }
  return <span className="rounded-full px-2 py-[2px] text-[11px] font-bold" style={style}>{label}</span>
}
