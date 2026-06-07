'use client'

import Link from 'next/link'
import type { Recommendation } from '@/lib/agent/types'

export default function RecommendationDeck({
  items,
}: {
  items: Recommendation[]
}) {
  if (!items?.length) return null
  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <span className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
          建议的下一步
        </span>
        <span className="h-px flex-1 bg-line-divider" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {items.map((r) => {
          const Inner = (
            <div className="sl-card flex h-full flex-col p-4 transition lift-hover">
              {r.badge && (
                <span className="mb-2 inline-flex w-fit rounded-md bg-brand/10 px-2 py-[3px] font-mono text-[9.5px] font-bold uppercase tracking-wider text-brand">
                  {r.badge}
                </span>
              )}
              <div className="text-[14px] font-bold leading-snug">{r.title}</div>
              <div className="mt-1 text-[12px] leading-relaxed text-body-3">{r.description}</div>
            </div>
          )
          return r.href ? (
            <Link key={r.id} href={r.href}>
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
