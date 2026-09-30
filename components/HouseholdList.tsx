'use client'

// My managed tenancies — the workspace entry into /h/[id].
//
// Renders NOTHING while the user has no households and no session, so
// dropping it into an existing page changes nothing for existing users; the
// import CTA renders once signed in.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { useT } from '@/lib/i18n'
import MessageButton from '@/components/messages/MessageButton'
import { roleLabel } from '@/lib/threads/shared'

interface Row {
  id: string; address: string; unit: string | null; city: string | null
  monthly_rent: number | null; status: string; verified: boolean
}
// Who else is in each tenancy — roles only (one batched read for the whole list,
// never a call per row); names are shown on the hub page itself.
type Others = Record<string, string[]>
const normRole = (r: string) => (r === 'property_manager' ? 'landlord' : r)

export default function HouseholdList() {
  const { user } = useAuth()
  const { lang } = useT()
  const zh = lang === 'zh'
  const [rows, setRows] = useState<Row[] | null>(null)
  const [others, setOthers] = useState<Others>({})
  const [othersLoaded, setOthersLoaded] = useState(false)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('households')
        .select('id, address, unit, city, monthly_rent, status, verified')
        .order('created_at', { ascending: false })
        .limit(20)
      const list = (data as Row[]) ?? []
      if (cancelled) return
      setRows(list)
      const ids = list.map((h) => h.id)
      if (!ids.length) return
      const [{ data: mem }, { data: inv }] = await Promise.all([
        supabase.from('household_members').select('household_id, user_id, role').in('household_id', ids).eq('status', 'active'),
        supabase.from('household_invites').select('household_id, invited_role, accepted_at, declined_at, revoked_at, expires_at').in('household_id', ids),
      ])
      const map: Others = {}
      for (const m of (mem ?? []) as { household_id: string; user_id: string; role: string }[]) {
        if (m.user_id === user.id) continue
        ;(map[m.household_id] ||= []).push(normRole(m.role))
      }
      for (const i of (inv ?? []) as { household_id: string; invited_role: string; accepted_at: string | null; declined_at: string | null; revoked_at: string | null; expires_at: string }[]) {
        if (i.accepted_at || i.declined_at || i.revoked_at || new Date(i.expires_at).getTime() <= Date.now()) continue
        ;(map[i.household_id] ||= []).push(normRole(i.invited_role))
      }
      if (!cancelled) { setOthers(map); setOthersLoaded(true) }
    })()
    return () => { cancelled = true }
  }, [user])

  // Honest label: name the role only when exactly one other person is in the thread.
  const messageLabel = (hid: string) => {
    const o = others[hid] ?? []
    if (o.length === 1) return zh ? `发消息给${roleLabel(o[0], true)}` : `Message the ${roleLabel(o[0], false).toLowerCase()}`
    return zh ? '在租约对话里发消息' : 'Message in the tenancy thread'
  }

  if (!user) return null

  return (
    <section className="mb-6 rounded-xl border border-line-divider bg-white p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-[15px] font-extrabold tracking-tight">{zh ? '在管租约' : 'Managed tenancies'}</h2>
        <Link
          href="/leases/import"
          className="ml-auto rounded-lg px-4 py-2 text-[12.5px] font-bold text-white"
          style={{ background: '#00ACE4' }}
        >
          + {zh ? '导入已有租约' : 'Import a lease'}
        </Link>
      </div>
      {rows === null ? null : rows.length === 0 ? (
        <p className="mt-3 text-[12.5px] leading-relaxed text-body-3">
          {zh
            ? '把已经签好的租约上传进来,对话、报修、租金记录就都在一个地方了。'
            : 'Upload an already-signed lease and messaging, maintenance and rent records all live in one place.'}
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          {rows.map((h) => (
            <div
              key={h.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-line-divider/70 px-4 py-3 text-[13.5px]"
            >
              {/* The row links to the hub; the message button sits beside it (never a button inside a link). */}
              <Link href={`/h/${h.id}`} className="flex min-w-0 flex-1 basis-[200px] flex-wrap items-center gap-x-3 gap-y-1 hover:text-brand">
                <span className="break-words font-semibold">
                  {[h.address, h.unit ? `#${h.unit}` : null, h.city].filter(Boolean).join(', ')}
                </span>
                {h.monthly_rent != null && <span className="text-body-3">${h.monthly_rent.toLocaleString()}/{zh ? '月' : 'mo'}</span>}
              </Link>
              <span className="rounded-md px-2 py-0.5 font-mono text-[10px] font-bold"
                style={h.status === 'disputed'
                  ? { color: '#DC2626', background: '#DC262614' }
                  : h.verified
                    ? { color: '#047857', background: '#04785714' }
                    : { color: '#A16207', background: '#A1620714' }}>
                {h.status === 'disputed' ? (zh ? '有争议' : 'DISPUTED') : h.verified ? (zh ? '已确认' : 'CONFIRMED') : (zh ? '待确认' : 'SELF-REPORTED')}
              </span>
              <MessageButton target={{ kind: 'tenancy', ref: h.id }} zh={zh} label={messageLabel(h.id)} testId="household-row-message"
                disabledReason={othersLoaded && (others[h.id] ?? []).length === 0 ? (zh ? '对方还没加入' : 'No one else has joined yet') : null} />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
