'use client'

// A listing result inside the agent chat, matching Stayloop's listing-card
// format/proportions (image · badge · heart · price · specs · address ·
// amenity pills · tier · note bar). Stayloop listings link internally; external
// Realtor.ca results open in a new tab.
import Link from 'next/link'
import type { ListingCard } from '@/lib/agent/types'

export default function ListingChatCard({ l }: { l: ListingCard }) {
  const external = l.source === 'realtor'
  const den = !!l.tags?.includes('den')
  const specs = [
    `${l.beds}B${den ? ' + den' : ''}`,
    l.baths ? `${l.baths} 浴` : null,
    l.sqft ? `${l.sqft} sqft` : null,
  ].filter(Boolean) as string[]
  const amenities = (l.tags || []).filter((t) => t !== 'den').slice(0, 3)

  const inner = (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-line-divider bg-white transition hover:shadow-md">
      {/* image */}
      <div
        className="relative aspect-[1.5/1] w-full bg-surface-chip"
        style={l.image ? { backgroundImage: `url(${l.image})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
      >
        <span
          className="absolute left-3 top-3 rounded-md px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-white"
          style={{ background: external ? '#B45309' : '#047857' }}
        >
          {external ? 'REALTOR.CA' : `TIER ${l.tier ?? 1}`}
        </span>
        <span className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur">
          <HeartIcon />
        </span>
      </div>

      {/* body */}
      <div className="flex flex-1 flex-col p-4">
        <div className="text-[20px] font-bold tracking-tight">
          ${l.price.toLocaleString()}
          <span className="ml-1 text-[12px] font-medium text-body-3">/月</span>
        </div>
        <div className="mt-1 flex items-center gap-2 text-[13px] font-bold text-body">
          {specs.map((s, i) => (
            <span key={s} className="flex items-center gap-2">
              {i > 0 && <span className="h-[3px] w-[3px] rounded-full bg-line-strong" />}
              {s}
            </span>
          ))}
        </div>
        <div className="mt-2 text-[14px] font-bold leading-snug">{l.address}</div>
        {(l.neighborhood || l.city) && (
          <div className="text-[12.5px] text-body-3">{[l.neighborhood, l.city].filter(Boolean).join(' · ')}</div>
        )}
        {(amenities.length > 0 || (!external && l.tier)) && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {amenities.map((t) => (
              <span key={t} className="rounded-md px-2 py-1 font-mono text-[10.5px] text-success" style={{ background: 'rgba(4,120,87,0.08)' }}>
                {t}
              </span>
            ))}
            {!external && l.tier && (
              <span className="rounded-md px-2 py-1 font-mono text-[10.5px]" style={{ background: 'rgba(180,83,9,0.10)', color: '#B45309' }}>
                需 认证 {l.tier} 级
              </span>
            )}
          </div>
        )}
      </div>

      {/* note bar */}
      {l.note && (
        <div
          className="border-t border-line-divider px-4 py-2.5 text-[11.5px] leading-snug"
          style={{
            background: external ? 'rgba(180,83,9,0.05)' : 'rgba(124,58,237,0.05)',
            color: external ? '#92400E' : '#5B21B6',
          }}
        >
          {external ? '◧ ' : '◑ '}
          {l.note}
        </div>
      )}
    </div>
  )

  if (external) {
    return (
      <a href={l.url || '#'} target="_blank" rel="noopener noreferrer" className="block h-full">
        {inner}
      </a>
    )
  }
  return (
    <Link href={l.url || '/listings'} className="block h-full">
      {inner}
    </Link>
  )
}

function HeartIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  )
}
