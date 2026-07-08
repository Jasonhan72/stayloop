'use client'

import Link from 'next/link'
import { useT } from '@/lib/i18n'
import type { Recommendation } from '@/lib/agent/types'

export default function RecommendationDeck({
  items,
}: {
  items: Recommendation[]
}) {
  const { lang } = useT()
  if (!items?.length) return null
  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <span className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
          {lang === 'zh' ? '建议的下一步' : 'SUGGESTED NEXT STEPS'}
        </span>
        <span className="h-px flex-1 bg-line-divider" />
      </div>
      {/* Compact vertical rows — the rail is ~380px, a 3-col grid squeezes. */}
      <div className="space-y-2">
        {items.map((r) => {
          const Inner = (
            <div className="sl-card group flex items-center gap-3 p-3.5 transition hover:border-brand hover:shadow-sm">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[13.5px] font-bold leading-snug group-hover:text-brand">{r.title}</span>
                  {r.badge && (
                    <span className="flex-none rounded bg-brand/10 px-1.5 py-[2px] font-mono text-[9px] font-bold uppercase tracking-wider text-brand">
                      {r.badge}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 truncate text-[12px] text-body-3">{r.description}</div>
              </div>
              <span className="flex-none text-[14px] text-body-4 transition group-hover:translate-x-0.5 group-hover:text-brand">→</span>
            </div>
          )
          return r.href ? (
            <Link key={r.id} href={r.href} className="block">
              {Inner}
            </Link>
          ) : (
            <div key={r.id}>{Inner}</div>
          )
        })}
      </div>
    </div>
  )
}
