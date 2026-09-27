'use client'

export const runtime = 'edge'

// /delegate/[token] — the client confirms an agent's delegation (节点 5,
// 2026-09-27). Public page: it shows what is being asked (who, scope,
// actions, term, basis) to anyone holding the link, but confirming requires
// being signed in with the email the proposal was sent to. The token is
// consumed on confirmation; revocation lives in Settings → 委托.
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { useT } from '@/lib/i18n'
import { ACTION_LABEL, SCOPE_LABEL, STATUS_LABEL, type DelegationAction, type DelegationScope, type DelegationStatus } from '@/lib/delegations/shared'

type Peek = { id: string; status: DelegationStatus; scope: DelegationScope[]; allowed_actions: DelegationAction[]; expires_at: string; basis_version: string; created_at: string; principal_email_masked: string; principal_name: string | null; agent: { legal_name: string; reco_number: string; brokerage_name: string; category: string } | null }

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen flex-col bg-white"><Header variant="transparent" /><div className="mx-auto w-full max-w-[640px] flex-1 px-5 py-10">{children}</div><Footer /></div>
}

export default function DelegateConfirmPage() {
  const params = useParams()
  const token = String(params?.token || '')
  const { lang } = useT()
  const zh = lang === 'zh'
  const auth = useAuth()
  const [peek, setPeek] = useState<Peek | null | 'loading' | 'missing'>('loading')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const load = useCallback(async () => {
    const res = await fetch(`/api/delegations/confirm?token=${encodeURIComponent(token)}`, { cache: 'no-store' })
    if (!res.ok) { setPeek('missing'); return }
    setPeek((await res.json()) as Peek)
  }, [token])
  useEffect(() => { if (token) void load() }, [token, load])

  async function confirm() {
    setBusy(true); setErr(null)
    const { data } = await supabase.auth.getSession()
    const jwt = data.session?.access_token
    if (!jwt) { setErr(zh ? '请先登录。' : 'Sign in first.'); setBusy(false); return }
    const res = await fetch('/api/delegations/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` }, body: JSON.stringify({ token }) })
    const j = (await res.json().catch(() => ({}))) as { error?: string; principal_email_masked?: string }
    if (!res.ok) setErr(j.error === 'email_mismatch' ? (zh ? `这份委托发给了 ${j.principal_email_masked}，请用那个邮箱登录。` : `This delegation was sent to ${j.principal_email_masked}; sign in with that email.`) : j.error || `HTTP ${res.status}`)
    else { setDone(true); await load() }
    setBusy(false)
  }

  if (peek === 'loading') return <Shell><div className="py-20 text-center"><div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-brand border-t-transparent" /></div></Shell>
  if (peek === 'missing' || !peek) return <Shell><div className="py-16 text-center"><h1 className="text-[20px] font-extrabold">{zh ? '链接无效或已使用' : 'This link is invalid or already used'}</h1><p className="mt-2 text-[13px] text-body-3">{zh ? '委托确认链接只能用一次；请让经纪重新发起。' : 'A confirmation link works once; ask your agent to propose again.'}</p></div></Shell>
  const st = STATUS_LABEL[peek.status]
  const myEmail = (auth.user?.email || '').toLowerCase()
  const maskedMatches = (() => { const [u, d] = myEmail.split('@'); return !!u && `${u.slice(0, 1)}***@${d}` === peek.principal_email_masked })()
  return (
    <Shell>
      <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">{zh ? '委托确认 · TRESA 代表' : 'DELEGATION · TRESA REPRESENTATION'}</div>
      <h1 className="mt-1 text-[22px] font-extrabold tracking-tight">{zh ? '经纪请求你确认一份委托' : 'Your agent asks you to confirm a delegation'}</h1>
      <div className="mt-4 rounded-2xl border border-line-divider bg-white p-5 text-[13.5px]" data-testid="delegation-peek">
        <div className="flex flex-wrap items-center gap-2"><span className={'rounded-full px-2.5 py-[3px] font-mono text-[10.5px] font-bold ' + (st.tone === 'ok' ? 'bg-success/10 text-success' : st.tone === 'warn' ? 'bg-amber-50 text-amber-800' : st.tone === 'danger' ? 'bg-danger/10 text-danger' : 'bg-surface-chip text-body-3')}>{zh ? st.zh : st.en}</span><span className="text-body-3">{zh ? '发给' : 'sent to'} {peek.principal_email_masked}{peek.principal_name ? ` · ${peek.principal_name}` : ''}</span></div>
        {peek.agent && (
          <div className="mt-3">
            <div className="font-bold">{peek.agent.legal_name}</div>
            <div className="text-[12.5px] text-body-2">RECO #{peek.agent.reco_number} · {peek.agent.brokerage_name}</div>
            <a className="text-[11.5px] text-body-3 underline" href="https://registrantsearch.reco.on.ca/" target="_blank" rel="noopener noreferrer">{zh ? '在 RECO 公开注册库核对 ↗' : 'Check on the RECO public register ↗'}</a>
          </div>
        )}
        <dl className="mt-3 grid gap-2 sm:grid-cols-2">
          <div><dt className="font-mono text-[10.5px] font-bold uppercase text-body-3">{zh ? '范围' : 'Scope'}</dt><dd>{peek.scope.map((s) => (zh ? SCOPE_LABEL[s].zh : SCOPE_LABEL[s].en)).join(zh ? '、' : ', ')}</dd></div>
          <div><dt className="font-mono text-[10.5px] font-bold uppercase text-body-3">{zh ? '允许的动作' : 'Allowed actions'}</dt><dd>{peek.allowed_actions.map((a) => (zh ? ACTION_LABEL[a].zh : ACTION_LABEL[a].en)).join(zh ? '、' : ', ')}</dd></div>
          <div><dt className="font-mono text-[10.5px] font-bold uppercase text-body-3">{zh ? '有效期至' : 'Until'}</dt><dd>{peek.expires_at.slice(0, 10)}</dd></div>
          <div><dt className="font-mono text-[10.5px] font-bold uppercase text-body-3">{zh ? '依据版本' : 'Basis'}</dt><dd className="font-mono text-[12px]">{peek.basis_version}</dd></div>
        </dl>
        <p className="mt-3 text-[12px] leading-relaxed text-body-3">{zh ? '确认表示：你已与该经纪签署书面代表协议，并允许 TA 在上述范围与期限内在 Stayloop 上代你操作；每一次代你做的事都会记在你的审计里并标注该委托。这不是代表协议本身，也不产生任何佣金；你随时可在「设置 → 委托」撤销，撤销立即生效。' : 'Confirming means you have a signed written representation agreement with this agent and allow them to act for you on Stayloop within this scope and term; everything done for you is written to your audit log under this delegation. This is not the representation agreement itself and carries no commission; revoke any time under Settings → Delegations, effective immediately.'}</p>
      </div>

      <div className="mt-4">
        {done || peek.status === 'active' ? (
          <div className="rounded-xl border border-success/30 bg-success/5 p-4 text-[13.5px]" data-testid="delegation-confirmed">✓ {zh ? '已确认。' : 'Confirmed.'} <Link href="/settings" className="font-semibold text-brand underline">{zh ? '在设置里管理委托 →' : 'Manage in Settings →'}</Link></div>
        ) : peek.status !== 'pending' ? (
          <p className="text-[13px] text-body-3">{zh ? '这份委托已不可确认。' : 'This delegation can no longer be confirmed.'}</p>
        ) : auth.loading ? null : !auth.user ? (
          <Link href={`/login?next=${encodeURIComponent(`/delegate/${token}`)}`} className="sl-btn-primary inline-block">{zh ? `用 ${peek.principal_email_masked} 登录后确认` : `Sign in as ${peek.principal_email_masked} to confirm`}</Link>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => void confirm()} disabled={busy} className="sl-btn-primary disabled:opacity-50" data-testid="delegation-confirm">{busy ? '…' : (zh ? '✓ 确认委托' : '✓ Confirm delegation')}</button>
            {!maskedMatches && <span className="text-[12.5px] text-amber-800">{zh ? `当前登录 ${auth.user.email}；委托发给了 ${peek.principal_email_masked}。` : `Signed in as ${auth.user.email}; the delegation was sent to ${peek.principal_email_masked}.`}</span>}
          </div>
        )}
        {err && <p className="mt-2 text-[12.5px] text-danger">{err}</p>}
      </div>
    </Shell>
  )
}
