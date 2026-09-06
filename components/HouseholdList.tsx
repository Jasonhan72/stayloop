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

interface Row {
  id: string; address: string; unit: string | null; city: string | null
  monthly_rent: number | null; status: string; verified: boolean
}

export default function HouseholdList() {
  const { user } = useAuth()
  const { lang } = useT()
  const zh = lang === 'zh'
  const [rows, setRows] = useState<Row[] | null>(null)

  useEffect(() => {
    if (!user) return
    supabase
      .from('households')
      .select('id, address, unit, city, monthly_rent, status, verified')
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => setRows((data as Row[]) ?? []))
  }, [user])

  if (!user) return null

  return (
    <section className="mb-6 rounded-xl border border-line-divider bg-white p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-[15px] font-extrabold tracking-tight">{zh ? '在管租约' : 'Managed tenancies'}</h2>
        <Link
          href="/leases/import"
          className="ml-auto rounded-lg px-4 py-2 text-[12.5px] font-bold text-white"
          style={{ background: '#1B1B3C' }}
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
            <Link
              key={h.id}
              href={`/h/${h.id}`}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-line-divider/70 px-4 py-3 text-[13.5px] transition hover:border-[#1B1B3C]"
            >
              <span className="font-semibold">
                {[h.address, h.unit ? `#${h.unit}` : null, h.city].filter(Boolean).join(', ')}
              </span>
              {h.monthly_rent != null && <span className="text-body-3">${h.monthly_rent.toLocaleString()}/{zh ? '月' : 'mo'}</span>}
              <span className="ml-auto rounded-md px-2 py-0.5 font-mono text-[10px] font-bold"
                style={h.status === 'disputed'
                  ? { color: '#DC2626', background: '#DC262614' }
                  : h.verified
                    ? { color: '#047857', background: '#04785714' }
                    : { color: '#A16207', background: '#A1620714' }}>
                {h.status === 'disputed' ? (zh ? '有争议' : 'DISPUTED') : h.verified ? (zh ? '已确认' : 'CONFIRMED') : (zh ? '待确认' : 'SELF-REPORTED')}
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
