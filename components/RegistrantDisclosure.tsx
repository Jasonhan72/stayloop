'use client'

// TRESA s.32 — a RECO registrant who leases in (as a tenant) or leases out
// (as a landlord) in their own interest must first give the other party
// written notice that they are a registrant, and seek a written
// acknowledgement. When an account that carries an agent profile acts in
// its landlord or tenant hat, this modal produces the notice text and
// records that it was made (registrant_disclosures). Stayloop records; the
// registrant delivers. design/multi-role-accounts-2026-09.md §3.
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import type { AgentProfile } from '@/lib/agentProfile'

export type DisclosureContext = 'listing_publish' | 'application' | 'showing_intent' | 'lease'

/** The registrant profile of the signed-in user, or null. Any status counts:
 *  a registered agent whose Stayloop verification is pending is still a
 *  registrant under TRESA. */
export function useRegistrantProfile(): { loading: boolean; profile: AgentProfile | null } {
  const auth = useAuth()
  const [state, setState] = useState<{ loading: boolean; profile: AgentProfile | null }>({ loading: true, profile: null })
  useEffect(() => {
    if (auth.loading) return
    if (!auth.user) { setState({ loading: false, profile: null }); return }
    supabase.from('agent_profiles').select('*').eq('auth_id', auth.user.id).maybeSingle()
      .then(({ data }) => setState({ loading: false, profile: (data as AgentProfile | null) ?? null }))
  }, [auth.loading, auth.user])
  return state
}

export function disclosureText(p: Pick<AgentProfile, 'legal_name' | 'reco_number' | 'brokerage_name'>, ctx: DisclosureContext, zh: boolean): string {
  const side = ctx === 'listing_publish' || ctx === 'lease'
    ? (zh ? '出租' : 'leasing out')
    : (zh ? '租入' : 'leasing')
  return zh
    ? `注册人身份披露（《2002 年房地产服务信任法》第 32 条）\n\n本人 ${p.legal_name}（RECO 注册号 ${p.reco_number}，所属经纪公司 ${p.brokerage_name}）在此告知：本人是安省房地产委员会（RECO）的注册人。本人在本次${side}交易中以自己的利益行事，并非代表任何一方。请以书面方式确认收到本通知。`
    : `Registrant disclosure of interest (Trust in Real Estate Services Act, 2002, s.32)\n\nI, ${p.legal_name} (RECO registration #${p.reco_number}, ${p.brokerage_name}), give notice that I am registered with the Real Estate Council of Ontario. In this ${side} transaction I am acting in my own interest and do not represent any party. Please acknowledge receipt of this notice in writing.`
}

export function RegistrantDisclosureModal({ profile, context, listingId, counterparty, zh, onDone, onCancel }: {
  profile: AgentProfile
  context: DisclosureContext
  listingId?: string | null
  counterparty?: string | null
  zh: boolean
  onDone: () => void
  onCancel: () => void
}) {
  const auth = useAuth()
  const [ack, setAck] = useState(false)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const text = disclosureText(profile, context, zh)

  async function confirm() {
    if (!auth.user) return
    setBusy(true)
    const { error } = await supabase.from('registrant_disclosures').insert({
      auth_id: auth.user.id, context, listing_id: listingId || null, counterparty: counterparty || null,
      legal_name: profile.legal_name, reco_number: profile.reco_number, brokerage_name: profile.brokerage_name, acknowledged: ack,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onDone()
  }
  const [err, setErr] = useState<string | null>(null)

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[95] flex items-center justify-center overflow-y-auto bg-black/50 p-3" onClick={onCancel}>
      <div className="max-h-full w-full max-w-[560px] overflow-y-auto rounded-2xl bg-white p-5" onClick={e => e.stopPropagation()}>
        <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-amber-700">{zh ? '你是 RECO 注册人' : 'You are a RECO registrant'}</div>
        <h3 className="mt-1 text-[18px] font-bold tracking-tight">{zh ? '先向对方披露你的注册人身份' : 'Disclose your registrant status to the other party first'}</h3>
        <p className="mt-2 text-[12.5px] leading-relaxed text-body-2">
          {zh
            ? '安省 TRESA 第 32 条：注册人以自己的利益租入或租出不动产前，须先向其他各方送达书面通知并尽力取得书面确认。下面是为你预填的通知，请复制后发给对方；Stayloop 只记录你已披露，不代替你送达。'
            : 'TRESA s.32 (Ontario): before a registrant leases in or out in their own interest they must first deliver written notice to the other parties and seek a written acknowledgement. The notice below is prefilled for you — copy it and send it; Stayloop only records that you disclosed, it does not deliver it for you.'}
        </p>
        <pre className="mt-3 whitespace-pre-wrap rounded-xl border border-line-divider bg-surface-chip p-3 text-[12.5px] leading-relaxed">{text}</pre>
        <div className="mt-2 flex flex-wrap gap-2">
          <button onClick={async () => { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1600) } catch {} }} className="rounded-full border border-line-strong px-4 py-2 text-[13px] font-semibold">{copied ? (zh ? '已复制 ✓' : 'Copied ✓') : (zh ? '复制通知' : 'Copy notice')}</button>
        </div>
        <label className="mt-4 flex items-start gap-2 text-[13px]"><input type="checkbox" className="mt-[3px]" checked={ack} onChange={e => setAck(e.target.checked)} /><span>{zh ? '我已（或将在签约前）把此通知送达对方，并会保留对方的书面确认。' : 'I have delivered (or will deliver before signing) this notice to the other party and will keep their written acknowledgement.'}</span></label>
        {err && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-800">{zh ? '记录披露失败：' : 'Could not record the disclosure: '}{err}</div>}
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={confirm} disabled={busy || !ack} className="sl-btn-primary !py-[10px] disabled:opacity-50">{busy ? '…' : (zh ? '已披露，继续' : 'Disclosed — continue')}</button>
          <button onClick={onCancel} className="rounded-xl border border-line-divider px-4 py-[10px] text-[13px] text-body-3">{zh ? '取消' : 'Cancel'}</button>
        </div>
      </div>
    </div>
  )
}
