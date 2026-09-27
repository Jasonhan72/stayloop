'use client'

// The agent proposes a delegation to a client from the client table (节点 5).
// Defaults follow the client's role (landlord → leasing + matters, tenant →
// search + matters); the server re-checks registration, ownership, email and
// the TRESA dates, then emails the client a one-time confirmation link.
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ACTION_LABEL, DELEGATION_ACTIONS, DELEGATION_SCOPES, MAX_MONTHS, SCOPE_LABEL, type DelegationAction, type DelegationScope } from '@/lib/delegations/shared'

export default function ProposeDelegation({ client, zh, onDone, onCancel }: { client: { id: string; name: string; email: string | null; client_role: 'tenant' | 'landlord' }; zh: boolean; onDone: () => void | Promise<void>; onCancel: () => void }) {
  const [scope, setScope] = useState<DelegationScope[]>(client.client_role === 'landlord' ? ['listing', 'matter'] : ['search', 'matter'])
  const [actions, setActions] = useState<DelegationAction[]>([...DELEGATION_ACTIONS])
  const [months, setMonths] = useState(6)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])
  async function submit() {
    setBusy(true); setErr(null); setMsg(null)
    const { data } = await supabase.auth.getSession()
    const res = await fetch('/api/delegations', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` }, body: JSON.stringify({ client_id: client.id, scope, allowed_actions: actions, months }) })
    const j = (await res.json().catch(() => ({}))) as { error?: string; emailed?: boolean }
    if (!res.ok) {
      const map: Record<string, { zh: string; en: string }> = {
        registration_not_live: { zh: '你的 RECO 注册未处于有效状态。', en: 'Your RECO registration is not live.' },
        client_email_required: { zh: '先给客户填一个邮箱。', en: 'Add the client’s email first.' },
        paperwork_required: { zh: '先记录代表协议与 Information Guide 的日期。', en: 'Record the representation agreement and Information Guide dates first.' },
        already_delegated: { zh: '这位客户已有待确认或有效的委托。', en: 'This client already has a pending or active delegation.' },
      }
      setErr(j.error && map[j.error] ? (zh ? map[j.error].zh : map[j.error].en) : j.error || `HTTP ${res.status}`)
    } else {
      setMsg(zh ? `确认链接已发到 ${client.email}；客户用该邮箱登录并确认后生效。` : `A confirmation link went to ${client.email}; it takes effect once the client confirms while signed in with that email.`)
      await onDone()
    }
    setBusy(false)
  }
  const box = 'flex items-center gap-1.5 rounded-lg border border-line-divider bg-white px-2.5 py-1.5 text-[12px]'
  return (
    <div className="border-b border-line-divider bg-surface-chip/60 p-4 text-[13px]" data-testid="propose-delegation">
      <div className="font-bold">{zh ? `向 ${client.name} 发起委托` : `Propose a delegation to ${client.name}`} <span className="font-normal text-body-3">{client.email}</span></div>
      <div className="mt-2 flex flex-wrap gap-1.5">{DELEGATION_SCOPES.map((s) => <label key={s} className={box} title={zh ? SCOPE_LABEL[s].hint.zh : SCOPE_LABEL[s].hint.en}><input type="checkbox" checked={scope.includes(s)} onChange={() => setScope((v) => toggle(v, s))} />{zh ? SCOPE_LABEL[s].zh : SCOPE_LABEL[s].en}</label>)}</div>
      <div className="mt-2 flex flex-wrap gap-1.5">{DELEGATION_ACTIONS.map((a) => <label key={a} className={box}><input type="checkbox" checked={actions.includes(a)} onChange={() => setActions((v) => toggle(v, a))} />{zh ? ACTION_LABEL[a].zh : ACTION_LABEL[a].en}</label>)}</div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="text-[12px] text-body-2">{zh ? '有效期' : 'Term'} <select value={months} onChange={(e) => setMonths(Number(e.target.value))} className="rounded-md border border-line-divider bg-white px-2 py-1 text-[12px]">{[1, 3, 6, 12].filter((m) => m <= MAX_MONTHS).map((m) => <option key={m} value={m}>{m} {zh ? '个月' : 'mo'}</option>)}</select></label>
        <button type="button" disabled={busy || !scope.length || !actions.length} onClick={() => void submit()} className="rounded-full bg-brand px-4 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-50">{busy ? '…' : (zh ? '发送确认链接' : 'Send confirmation link')}</button>
        <button type="button" onClick={onCancel} className="text-[12px] text-body-3 underline">{zh ? '取消' : 'Cancel'}</button>
      </div>
      {msg && <p className="mt-2 text-[12.5px] text-success">✓ {msg}</p>}
      {err && <p className="mt-2 text-[12.5px] text-danger">⚠ {err}</p>}
      <p className="mt-2 text-[11px] text-body-3">{zh ? '依据 = 你们已签署的书面代表协议（TRESA）。委托只记录授权范围，不是代表协议本身，不产生佣金；客户随时可撤销。' : 'Basis = your signed written representation agreement (TRESA). The delegation records the scope only; it is not the agreement and carries no commission; the client may revoke at any time.'}</p>
    </div>
  )
}
