'use client'

// A listing result inside the agent chat — the same card as /listings
// (components/listings/ListingCardView, 2026-10-27): this file only turns a
// search result into the card's words and the few parts that differ. Stayloop
// listings link internally; external Realtor.ca results open in a new tab and
// carry their note bar; commercial spaces show their own price basis and specs.
import { resolveList } from '@/lib/listingLang'
import ListingCardView, { type CardSize } from '@/components/listings/ListingCardView'
import { useT } from '@/lib/i18n'
import { favKey, useFavorites } from '@/lib/favorites'
import { cardAddress, cardFacts, cardKicker, sizeFacts } from '@/lib/listings/cardFacts'
import { stampForTier } from '@/lib/passportStamps'
import type { ListingCard } from '@/lib/agent/types'

export default function ListingChatCard({ l }: { l: ListingCard }) {
  const { lang } = useT()
  const zh = lang === 'zh'
  const L = zh ? 'zh' : 'en'
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
  const den = l.has_den === true || !!l.tags?.includes('den')
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
  const size: CardSize[] = commercial
    ? ([(zh ? l.property_type : l.property_type_en || l.property_type) || (zh ? '商业空间' : 'Commercial'), sqftLabel].filter(Boolean) as string[]).map((text) => ({ text }))
    : sizeFacts({ bedrooms: l.beds, bathrooms: l.baths ?? null, sqft: l.sqft ?? null, has_den: den }, L)
  const kicker = commercial
    ? [l.neighborhood, l.city].filter(Boolean).join(zh ? '，' : ', ')
    : cardKicker({ property_type: l.property_type ?? null, neighborhood: l.neighborhood ?? null, city: l.city ?? null }, L)
  // site test 2026-10-28 (I-D2): the same single-language amenity line as /listings (resolveList), not the raw bilingual tags
  const amenities = commercial ? ((zh ? l.specs : l.specs_en || l.specs) || []).slice(0, 5) : resolveList('amenities', (l.tags || []).filter((t) => t !== 'den'), zh ? 'zh' : 'en').slice(0, 3)
  const warns = commercial ? (zh ? l.specs_warn : l.specs_warn_en || l.specs_warn) || [] : []
  const noteText = zh ? l.note : l.note_en || l.note

  const priceNode = commercial && l.rate_psf ? (
    <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em', marginTop: 6 }} data-testid="card-price">
      ${l.rate_psf.toLocaleString()}
      <span className="ml-1 text-[12px] font-medium text-body-3">{zh ? '/sqft/年 净租' : '/sqft/yr net'}</span>
      {l.monthly_all_in ? (
        <span className="ml-2 text-[12px] font-medium text-body-3">≈ ${l.monthly_all_in.toLocaleString()}{zh ? '/月 含 TMI' : '/mo all-in'}</span>
      ) : l.price > 0 ? (
        <span className="ml-2 text-[12px] font-medium text-body-3">≈ ${l.price.toLocaleString()}{zh ? '/月 净' : '/mo net'}</span>
      ) : null}
    </div>
  ) : commercial && l.price_basis === 'unknown' ? (
    <div style={{ fontSize: 20, fontWeight: 700, marginTop: 6 }} data-testid="card-price">{zh ? '价格面议' : 'Price on request'}</div>
  ) : undefined

  const sourceLine = (
    <div style={{ fontSize: 13, color: '#3F3F46', marginTop: 4 }} data-testid="card-brokerage">
      {external
        ? <>{zh ? '挂牌 · ' : 'Listed by '}<b style={{ fontWeight: 600, color: '#171717' }}>{l.brokerage || 'Realtor.ca'}</b>{commercial && l.mls ? ` · MLS ${l.mls}` : ''}</>
        : <>{zh ? '房东直租 · ' : 'Direct from landlord · '}<b style={{ fontWeight: 600, color: '#171717' }}>Stayloop</b></>}
    </div>
  )
  const chips = (
    <>
      {warns.map((w) => (
        <span key={w} className="rounded-md px-2 py-1 font-mono text-[10.5px]" style={{ background: 'rgba(220,38,38,0.08)', color: '#B91C1C' }}>✗ {w}</span>
      ))}
      {!external && l.tier ? (
        <span className="rounded-md px-2 py-1 font-mono text-[10.5px]" style={{ background: 'rgba(180,83,9,0.10)', color: '#B45309' }}>
          {zh ? `需 ${stampForTier(l.tier).zh}` : `${stampForTier(l.tier).en} required`}
        </span>
      ) : null}
    </>
  )
  // Corner badge: the source. (`l.tier` is what the landlord requires of an applicant, not a grade — it is the chip above.)
  const topLeft = (
    <span className="absolute left-3 top-3 rounded-md px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-white" style={{ background: external ? '#B45309' : '#00ACE4' }}>
      {external ? 'REALTOR.CA' : 'VERIFIED'}
    </span>
  )

  return (
    <ListingCardView
      zh={zh}
      href={l.url || '/listings'}
      external={external}
      image={l.image || null}
      photoCount={external ? null : l.photo_count ?? null}
      topLeft={topLeft}
      fav={fav}
      onToggleFav={toggleFav}
      kicker={kicker}
      title={cardAddress(l.address, l.unit)}
      isTest={!!l.is_test}
      priceNode={priceNode}
      price={l.price}
      size={size}
      facts={commercial ? [] : cardFacts({ available_date: l.available_date ?? null, pet_policy: l.pet_policy ?? null }, L)}
      sourceLine={sourceLine}
      amenities={amenities}
      chips={warns.length || (!external && l.tier) ? chips : null}
      note={noteText ? { text: noteText, tone: external ? 'external' : 'info' } : null}
    />
  )
}
