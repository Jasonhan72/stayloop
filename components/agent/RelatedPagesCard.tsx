'use client'

import Link from 'next/link'
import { useT } from '@/lib/i18n'
import type { AgentRole } from '@/lib/agent/types'

const LINKS: Record<AgentRole, { href: string; label: { zh: string; en: string } }[]> = {
  tenant: [
    { href: '/tenant/passport', label: { zh: 'Passport', en: 'Passport' } },
    { href: '/listings', label: { zh: '房源', en: 'Listings' } },
    { href: '/tenant/applications', label: { zh: '申请', en: 'Applications' } },
    { href: '/tenant/lease', label: { zh: '租约', en: 'Lease' } },
  ],
  landlord: [
    { href: '/landlord/applicants', label: { zh: '申请人', en: 'Applicants' } },
    { href: '/dashboard', label: { zh: '房源', en: 'Listings' } },
    { href: '/landlord/leases', label: { zh: '租约', en: 'Leases' } },
    { href: '/landlord/finance', label: { zh: '财务', en: 'Finance' } },
  ],
  agent: [
    { href: '/agent/tasks', label: { zh: '任务', en: 'Tasks' } },
    { href: '/agent/clients', label: { zh: '客户', en: 'Clients' } },
    { href: '/agent/calendar', label: { zh: '日历', en: 'Calendar' } },
    { href: '/agent/earnings', label: { zh: '佣金', en: 'Commission' } },
  ],
}

export default function RelatedPagesCard({ role }: { role: AgentRole }) {
  const { lang } = useT()
  return (
    <div className="rounded-xl border border-line-divider bg-surface-chip p-4">
      <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
        {lang === 'zh' ? '相关页面' : 'RELATED PAGES'}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {LINKS[role].map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="rounded-lg border border-line-divider bg-white px-3 py-2 text-[12.5px] font-semibold text-body transition hover:border-brand hover:text-brand"
          >
            {l.label[lang]}
          </Link>
        ))}
      </div>
    </div>
  )
}
