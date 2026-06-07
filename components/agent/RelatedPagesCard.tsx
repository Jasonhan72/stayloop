'use client'

import Link from 'next/link'
import type { AgentRole } from '@/lib/agent/types'

const LINKS: Record<AgentRole, { href: string; label: string }[]> = {
  tenant: [
    { href: '/tenant/passport', label: 'Passport' },
    { href: '/listings', label: '房源' },
    { href: '/tenant/applications', label: '申请' },
    { href: '/tenant/lease', label: '租约' },
  ],
  landlord: [
    { href: '/landlord/applicants', label: '申请人' },
    { href: '/dashboard', label: '房源' },
    { href: '/landlord/leases', label: '租约' },
    { href: '/landlord/finance', label: '财务' },
  ],
  agent: [
    { href: '/agent/tasks', label: '任务' },
    { href: '/agent/clients', label: '客户' },
    { href: '/agent/calendar', label: '日历' },
    { href: '/agent/earnings', label: '佣金' },
  ],
}

export default function RelatedPagesCard({ role }: { role: AgentRole }) {
  return (
    <div className="rounded-xl border border-line-divider bg-surface-chip p-4">
      <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
        相关页面
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {LINKS[role].map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="rounded-lg border border-line-divider bg-white px-3 py-2 text-[12.5px] font-semibold text-body transition hover:border-brand hover:text-brand"
          >
            {l.label}
          </Link>
        ))}
      </div>
    </div>
  )
}
