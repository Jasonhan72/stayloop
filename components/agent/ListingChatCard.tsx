'use client'

// A listing result rendered inside the agent chat — Stayloop's own listing or
// an external (Realtor.ca) result the agent surfaced when Stayloop had none.
import Link from 'next/link'
import type { ListingCard } from '@/lib/agent/types'

export default function ListingChatCard({ l }: { l: ListingCard }) {
  const external = l.source === 'realtor'
  const specs = [
    `${l.beds}B${l.tags?.includes('den') ? ' + den' : ''}`,
    l.baths ? `${l.baths} 浴` : null,
    l.sqft ? `${l.sqft} sqft` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const inner = (
    <div className="overflow-hidden rounded-xl border border-line-divider bg-white transition hover:shadow-md">
      <div
        className="relative h-32 w-full bg-surface-chip"
        style={l.image ? { backgroundImage: `url(${l.image})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
      >
        {l.tier ? (
          <span
            className="absolute left-2 top-2 rounded-md px-2 py-1 font-mono text-[9.5px] font-bold uppercase tracking-eyebrow text-white"
            style={{ background: 'rgba(11,11,14,0.55)', backdropFilter: 'blur(4px)' }}
          >
            需 认证 {l.tier} 级
          </span>
        ) : null}
        <span
          className="absolute right-2 top-2 rounded-md px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-eyebrow text-white"
          style={{ background: external ? 'rgba(180,83,9,0.92)' : 'rgba(124,58,237,0.92)' }}
        >
          {external ? 'Realtor.ca' : 'Stayloop'}
        </span>
      </div>
      <div className="p-3">
        <div className="flex items-baseline gap-1">
          <span className="text-[18px] font-extrabold tracking-tight">${l.price.toLocaleString()}</span>
          <span className="text-[11px] text-body-3">/月</span>
        </div>
        <div className="mt-0.5 font-mono text-[11px] text-body-2">{specs}</div>
        <div className="mt-1 text-[12.5px] font-bold leading-snug">{l.address}</div>
        {(l.neighborhood || l.city) && (
          <div className="text-[11.5px] text-body-3">{[l.neighborhood, l.city].filter(Boolean).join(' · ')}</div>
        )}
        {l.tags?.length ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {l.tags
              .filter((t) => t !== 'den')
              .slice(0, 3)
              .map((t) => (
                <span key={t} className="rounded bg-surface-chip px-1.5 py-0.5 font-mono text-[9.5px] text-body-2">
                  {t}
                </span>
              ))}
          </div>
        ) : null}
        {l.note && <div className="mt-2 text-[11px] leading-snug text-body-3">{l.note}</div>}
      </div>
    </div>
  )

  if (external) {
    return (
      <a href={l.url || '#'} target="_blank" rel="noopener noreferrer" className="block">
        {inner}
      </a>
    )
  }
  return (
    <Link href={l.url || '/listings'} className="block">
      {inner}
    </Link>
  )
}
