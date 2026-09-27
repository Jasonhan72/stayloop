'use client'

// The line every agent page carries (节点 5): who the agent is currently
// representing, in which scope, until when — from the account's live
// delegations (own RLS). Nothing to show = nothing rendered.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { isDelegationLive, representingLine, type DelegationRow } from '@/lib/delegations/shared'

export default function RepresentingStrip({ zh }: { zh: boolean }) {
  const auth = useAuth()
  const [rows, setRows] = useState<DelegationRow[]>([])
  useEffect(() => {
    if (auth.loading || !auth.user) return
    let on = true
    supabase.from('delegations').select('id, principal_auth_id, principal_email, principal_name, delegate_auth_id, client_id, scope, allowed_actions, starts_at, expires_at, basis_version, status, confirmed_at, revoked_at, created_at').eq('delegate_auth_id', auth.user.id).eq('status', 'active').order('expires_at', { ascending: true }).limit(20)
      .then(({ data }) => { if (on) setRows(((data ?? []) as DelegationRow[]).filter((d) => isDelegationLive(d))) })
    return () => { on = false }
  }, [auth.loading, auth.user])
  if (!rows.length) return null
  const shown = rows.slice(0, 3)
  return (
    <div className="mb-4 rounded-xl border border-agent/30 bg-agent/[0.06] px-4 py-2.5 text-[12.5px]" data-testid="representing-strip">
      {shown.map((d) => <div key={d.id} className="text-body">{representingLine(d, zh)}</div>)}
      {rows.length > shown.length && <div className="text-body-3">{zh ? `另外 ${rows.length - shown.length} 份委托` : `${rows.length - shown.length} more`}</div>}
      <div className="mt-0.5 text-[11px] text-body-3">{zh ? '代客的每一步都记入客户的审计并标注委托 · ' : 'Every step for a client is written to their audit log under the delegation · '}<Link href="/agent/clients" className="underline">{zh ? '客户表' : 'Client table'}</Link></div>
    </div>
  )
}
