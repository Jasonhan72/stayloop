'use client'

// A listing result inside the agent chat, matching Stayloop's listing-card
// format/proportions (image · badge · heart · price · specs · address ·
// amenity pills · tier · note bar). Stayloop listings link internally; external
// Realtor.ca results open in a new tab.
import Link from 'next/link'
import FavHeart from '@/components/FavHeart'
import { useT } from '@/lib/i18n'
import { favKey, useFavorites } from '@/lib/favorites'
import { stampForTier } from '@/lib/passportStamps'
import type { ListingCard } from '@/lib/agent/types'

export default function ListingChatCard({ l }: { l: ListingCard }) {
  const { lang } = useT()
  const zh = lang === 'zh'
  const external = l.source === 'realtor'
  const { isFav, toggle } = useFavorites()
  // Same identity inputs as the /listings browse cards, so a heart tapped
  // here reads as favorited there (and vice versa).
  const fkey = favKey({ source: l.source, id: l.id, url: l.url, address: l.address })
  const fav = isFav(fkey)
  const toggleFav = () =>
    toggle({
      key: fkey,
      source: l.source,
      title: l.title || l.address,
      address: l.address,
      neighborhood: l.neighborhood,
      city: l.city,
      // Commercial: all-in monthly when known; never "Studio" for a warehouse.
      price: l.kind === 'commercial' ? l.monthly_all_in ?? l.price : l.price,
      beds: l.kind === 'commercial' ? (null as unknown as number) : l.beds,
      baths: l.baths ?? null,
      sqft: l.sqft ?? null,
      image: l.image || null,
      href: l.url || '/listings',
    })
  const den = !!l.tags?.includes('den')
  const commercial = l.kind === 'commercial'
  // Commercial cards: type + area instead of beds/baths; specs quoted from
  // the listing (clear height, doors, lease type) take the amenity slot.
  const sqftLabel = commercial
    ? l.sqft_min != null && l.sqft_max != null && l.sqft_min !== l.sqft_max
      ? `${l.sqft_min.toLocaleString()}–${l.sqft_max.toLocaleString()} sqft`
      : l.sqft_min != null && l.sqft_max == null
        ? `${l.sqft_min.toLocaleString()}+ sqft`
        : l.sqft
          ? `${l.sqft.toLocaleString()} sqft`
          : null
    : null
  const specs = commercial
    ? ([(zh ? l.property_type : l.property_type_en || l.property_type) || (zh ? '商业空间' : 'Commercial'), sqftLabel].filter(Boolean) as string[])
    : ([
        `${l.beds}B${den ? ' + den' : ''}`,
        l.baths ? `${l.baths} ${zh ? '浴' : 'bath'}` : null,
        l.sqft ? `${l.sqft} sqft` : null,
      ].filter(Boolean) as string[])
  const amenities = commercial ? ((zh ? l.specs : l.specs_en || l.specs) || []).slice(0, 5) : (l.tags || []).filter((t) => t !== 'den').slice(0, 3)
  const warns = commercial ? (zh ? l.specs_warn : l.specs_warn_en || l.specs_warn) || [] : []
  const noteText = zh ? l.note : l.note_en || l.note

  const inner = (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-line-divider bg-white transition hover:shadow-md">
      {/* image */}
      <div
        className="relative aspect-[1.5/1] w-full bg-surface-chip"
        style={l.image ? { backgroundImage: `url(${l.image})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
      >
        {/* `l.tier` is the stamp the LANDLORD requires of an applicant, not a
            quality grade on the listing — showing it here as a green "TIER 3"
            read as a verification badge, and used the Tier-N wording the
            passport rename retired. The requirement is already stated
            correctly as a "需 银行章 / Bank stamp required" pill below, so this
            slot now carries the same source/verification chip as /listings. */}
        <span
          className="absolute left-3 top-3 rounded-md px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-white"
          style={{ background: external ? '#B45309' : '#00ACE4' }}
        >
          {external ? 'REALTOR.CA' : 'VERIFIED'}
        </span>
        <FavHeart
          fav={fav}
          onToggle={toggleFav}
          zh={zh}
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full border-0 bg-black/45 text-white backdrop-blur transition hover:bg-black/60"
        />
      </div>

      {/* body */}
      <div className="flex flex-1 flex-col p-4">
        {commercial && l.rate_psf ? (
          <div className="text-[20px] font-bold tracking-tight">
            ${l.rate_psf.toLocaleString()}
            <span className="ml-1 text-[12px] font-medium text-body-3">{zh ? '/sqft/年 净租' : '/sqft/yr net'}</span>
            {l.monthly_all_in ? (
              <span className="ml-2 text-[12px] font-medium text-body-3">
                ≈ ${l.monthly_all_in.toLocaleString()}{zh ? '/月 含 TMI' : '/mo all-in'}
              </span>
            ) : l.price > 0 ? (
              <span className="ml-2 text-[12px] font-medium text-body-3">
                ≈ ${l.price.toLocaleString()}{zh ? '/月 净' : '/mo net'}
              </span>
            ) : null}
          </div>
        ) : commercial && l.price_basis === 'unknown' ? (
          <div className="text-[20px] font-bold tracking-tight">{zh ? '价格面议' : 'Price on request'}</div>
        ) : (
          <div className="text-[20px] font-bold tracking-tight">
            ${l.price.toLocaleString()}
            <span className="ml-1 text-[12px] font-medium text-body-3">{zh ? '/月' : '/mo'}</span>
          </div>
        )}
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
        {commercial && (l.mls || l.brokerage) && (
          <div className="mt-1 text-[11px] text-body-3">{[l.mls ? `MLS ${l.mls}` : null, l.brokerage].filter(Boolean).join(' · ')}</div>
        )}
        {(amenities.length > 0 || warns.length > 0 || (!external && l.tier)) && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {warns.map((w) => (
              <span key={w} className="rounded-md px-2 py-1 font-mono text-[10.5px]" style={{ background: 'rgba(220,38,38,0.08)', color: '#B91C1C' }}>
                ✗ {w}
              </span>
            ))}
            {amenities.map((t) => (
              <span key={t} className="rounded-md px-2 py-1 font-mono text-[10.5px] text-success" style={{ background: 'rgba(4,120,87,0.08)' }}>
                {t}
              </span>
            ))}
            {!external && l.tier && (
              <span className="rounded-md px-2 py-1 font-mono text-[10.5px]" style={{ background: 'rgba(180,83,9,0.10)', color: '#B45309' }}>
                {zh ? `需 ${stampForTier(l.tier).zh}` : `${stampForTier(l.tier).en} required`}
              </span>
            )}
          </div>
        )}
      </div>

      {/* note bar */}
      {noteText && (
        <div
          className="border-t border-line-divider px-4 py-2.5 text-[11.5px] leading-snug"
          style={{
            background: external ? 'rgba(180,83,9,0.05)' : 'rgba(0,172,228,0.05)',
            color: external ? '#92400E' : '#5B21B6',
          }}
        >
          {external ? '◧ ' : '◑ '}
          {noteText}
        </div>
      )}
    </div>
  )

  if (external && l.url) {
    return (
      <a href={l.url} target="_blank" rel="noopener noreferrer" className="block h-full">
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

