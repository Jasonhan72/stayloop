'use client'

// Settings → 委托 (节点 5): the delegations this account gave (as a landlord or
// tenant principal) and received (as an agent). Rows come through the
// account's own RLS (the confirm token column is not readable); revoking
// goes through the server so both sides are told and the audit row carries
// the delegation id.
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { ACTION_LABEL, isDelegationLive, SCOPE_LABEL, STATUS_LABEL, type DelegationRow } from '@/lib/delegations/shared'
import MessageButton from '@/components/messages/MessageButton'

const COLS = 'id, principal_auth_id, principal_email, principal_name, delegate_auth_id, client_id, scope, allowed_actions, starts_at, expires_at, basis_version, status, confirmed_at, revoked_at, created_at'

export default function MyDelegations({ zh }: { zh: boolean }) {
  const auth = useAuth()
  const [rows, setRows] = useState<DelegationRow[] | null>(null)
  const [names, setNames] = useState<Record<string, string>>({})
  // Registered name alone, for the 「发消息给 …」 label (the row line keeps 「姓名 · 经纪公司」).
  const [agentNames, setAgentNames] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const load = useCallback(async () => {
    if (!auth.user) return
    const { data } = await supabase.from('delegations').select(COLS).order('created_at', { ascending: false }).limit(50)
    const list = (data ?? []) as DelegationRow[]
    setRows(list)
    const agentIds = Array.from(new Set(list.map((d) => d.delegate_auth_id)))
    if (agentIds.length) {
      const { data: dir } = await supabase.from('agent_directory').select('auth_id, legal_name, brokerage_name').in('auth_id', agentIds)
      const m: Record<string, string> = {}
      const n: Record<string, string> = {}
      for (const a of (dir ?? []) as { auth_id: string; legal_name: string; brokerage_name: string }[]) { m[a.auth_id] = `${a.legal_name} · ${a.brokerage_name}`; n[a.auth_id] = a.legal_name }
      setNames(m)
      setAgentNames(n)
    }
  }, [auth.user])
  useEffect(() => { if (!auth.loading) void load() }, [auth.loading, load])
  async function revoke(d: DelegationRow) {
    if (!window.confirm(zh ? '撤销这份委托？立即生效，对方会收到通知。' : 'Revoke this delegation? Effective immediately; the other side is told.')) return
    setBusy(d.id); setErr(null)
    const { data } = await supabase.auth.getSession()
    const res = await fetch(`/api/delegations/${d.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` }, body: JSON.stringify({ action: 'revoke' }) })
    if (!res.ok) setErr(((await res.json().catch(() => ({}))) as { error?: string }).error || `HTTP ${res.status}`)
    await load(); setBusy(null)
  }
  if (!auth.user || rows === null) return null
  const me = auth.user.id; const email = (auth.user.email || '').toLowerCase()
  const received = rows.filter((d) => d.principal_auth_id === me || d.principal_email.toLowerCase() === email)
  const given = rows.filter((d) => d.delegate_auth_id === me)
  if (!received.length && !given.length) return null
  const pill = (d: DelegationRow) => { const st = STATUS_LABEL[d.status]; const live = isDelegationLive(d); return <span className={'rounded-full px-2 py-[2px] font-mono text-[10.5px] font-bold ' + (live ? 'bg-success/10 text-success' : st.tone === 'warn' ? 'bg-amber-50 text-amber-800' : st.tone === 'danger' ? 'bg-danger/10 text-danger' : 'bg-surface-chip text-body-3')}>{live ? (zh ? '有效' : 'Active') : d.status === 'active' ? (zh ? '已到期' : 'Expired') : (zh ? st.zh : st.en)}</span> }
  const scopeText = (d: DelegationRow) => d.scope.map((s) => (zh ? SCOPE_LABEL[s].zh : SCOPE_LABEL[s].en)).join(zh ? '、' : ', ')
  const actText = (d: DelegationRow) => d.allowed_actions.map((a) => (zh ? ACTION_LABEL[a].zh : ACTION_LABEL[a].en)).join(zh ? '、' : ', ')
  // 找得到人 2026-09-30: the agent ↔ client conversation is two-party, so the label names the other side when known.
  const newestPerClient = new Set<string>()
  {
    const seen = new Set<string>()
    for (const d of [...received, ...given].sort((x, y) => (y.created_at || '').localeCompare(x.created_at || ''))) {
      if (!d.client_id || seen.has(d.client_id)) continue
      seen.add(d.client_id); newestPerClient.add(d.id)
    }
  }
  const Row = ({ d, who, messageLabel }: { d: DelegationRow; who: string; messageLabel: string }) => (
    <div className="flex flex-wrap items-start gap-2 py-2.5 text-[13px]">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{who}</span>{pill(d)}<span className="text-[11.5px] text-body-3">{zh ? '至' : 'until'} {d.expires_at.slice(0, 10)}</span></div>
        <div className="text-[12px] text-body-2">{scopeText(d)} · {actText(d)}</div>
        <div className="font-mono text-[10.5px] text-body-3">{d.basis_version}{d.confirmed_at ? ` · ${zh ? '确认于' : 'confirmed'} ${d.confirmed_at.slice(0, 10)}` : ''}{d.revoked_at ? ` · ${zh ? '撤销于' : 'revoked'} ${d.revoked_at.slice(0, 10)}` : ''}</div>
      </div>
      {/* Only on a live or pending engagement, and only on the newest row per client (revoked rows can dead-end). */}
      {d.client_id && (isDelegationLive(d) || d.status === 'pending') && newestPerClient.has(d.id) && <MessageButton target={{ kind: 'agent_client', ref: d.client_id }} zh={zh} label={messageLabel} testId="delegation-message" />}
      {['pending', 'active'].includes(d.status) && <button type="button" disabled={busy === d.id} onClick={() => void revoke(d)} className="rounded-lg border border-danger/40 bg-white px-3 py-1.5 text-[12px] font-semibold text-danger disabled:opacity-50">{d.delegate_auth_id === me ? (zh ? '撤回' : 'Withdraw') : (zh ? '撤销' : 'Revoke')}</button>}
    </div>
  )
  return (
    <div className="sl-card p-5" data-testid="my-delegations">
      <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">{zh ? '委托' : 'DELEGATIONS'}</div>
      {received.length > 0 && (
        <div className="mt-2">
          <div className="text-[13px] font-bold">{zh ? '我委托的经纪' : 'Agents acting for me'}</div>
          <div className="divide-y divide-line-divider">{received.map((d) => <Row key={d.id} d={d} who={names[d.delegate_auth_id] || (zh ? '经纪' : 'Agent')} messageLabel={agentNames[d.delegate_auth_id] ? (zh ? `发消息给 ${agentNames[d.delegate_auth_id]}` : `Message ${agentNames[d.delegate_auth_id]}`) : (zh ? '发消息给经纪' : 'Message the agent')} />)}</div>
          {received.some((d) => d.status === 'pending') && <p className="text-[11.5px] text-body-3">{zh ? '待确认的委托请通过邮件里的链接确认。' : 'Confirm pending delegations through the link in the email.'}</p>}
        </div>
      )}
      {given.length > 0 && (
        <div className="mt-3">
          <div className="text-[13px] font-bold">{zh ? '客户对我的委托' : 'Delegations from my clients'}</div>
          <div className="divide-y divide-line-divider">{given.map((d) => <Row key={d.id} d={d} who={d.principal_name || (zh ? '客户' : 'Client')} messageLabel={d.principal_name ? (zh ? `发消息给 ${d.principal_name}` : `Message ${d.principal_name}`) : (zh ? '发消息给客户' : 'Message the client')} />)}</div>
          <p className="text-[11.5px] text-body-3"><Link href="/agent/clients" className="underline">{zh ? '在客户表里发起新的委托 →' : 'Propose from the client table →'}</Link></p>
        </div>
      )}
      {err && <p className="mt-2 text-[12px] text-danger">{err}</p>}
      <p className="mt-2 text-[11px] text-body-3">{zh ? '撤销立即生效：经纪不再能代你操作，也看不到撤销后的新内容；已发生的操作保留在审计里并标注该委托。' : 'Revocation is immediate: the agent can no longer act for you or see anything new; past actions stay in the audit log under this delegation.'}</p>
    </div>
  )
}
