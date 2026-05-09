'use client'

import Link from 'next/link'
import type { SampleListing } from '@/lib/sampleListings'
import { useI18n } from '@/lib/i18n'

const BADGE_LABELS: Record<NonNullable<SampleListing['badges']>[number], { zh: string; en: string; bg: string }> = {
  luna: { zh: 'LUNA 推荐', en: 'LUNA PICK', bg: '#7C3AED' },
  new: { zh: '新上架', en: 'NEW', bg: '#DC2626' },
  'price-drop': { zh: '降价', en: 'PRICE DROP', bg: '#D97706' },
  verified: { zh: 'VERIFIED', en: 'VERIFIED', bg: '#047857' },
}

export default function ListingCard({ l }: { l: SampleListing }) {
  const { t, lang } = useI18n()
  const [a, b] = l.thumb.split('|')

  return (
    <Link
      href={`/listings/${l.slug}`}
      className="sl-card block overflow-hidden transition lift-hover"
    >
      <div
        className="relative aspect-[1.5/1] w-full"
        style={{ background: `linear-gradient(135deg, ${a}, ${b})` }}
      >
        {/* Top-left badges */}
        <div className="absolute left-3 top-3 flex flex-col gap-1.5">
          {l.badges.map((b) => {
            const meta = BADGE_LABELS[b]
            return (
              <span
                key={b}
                className="inline-flex items-center rounded-md px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-white"
                style={{ background: meta.bg }}
              >
                {lang === 'en' ? meta.en : meta.zh}
              </span>
            )
          })}
        </div>
        {/* Top-right heart */}
        <button
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur transition hover:bg-black/65"
          onClick={(e) => {
            e.preventDefault()
          }}
          aria-label="save"
        >
          <HeartIcon />
        </button>
        {/* Match score */}
        <div className="absolute bottom-3 left-3">
          <span className="inline-flex items-center gap-1 rounded-full bg-white/95 px-3 py-1 font-mono text-[11px] font-bold text-brand">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" />
            {l.match}% {t('listings.matchScore')}
          </span>
        </div>
        {/* Photo count */}
        <div className="absolute bottom-3 right-3 rounded-md bg-black/65 px-2 py-1 font-mono text-[11px] text-white">
          1 / 24
        </div>
      </div>
      <div className="p-4">
        <div className="flex items-baseline justify-between gap-3">
          <div className="text-[20px] font-bold tracking-tight">
            ${l.monthly_rent.toLocaleString()}
            <span className="ml-1 text-[12px] font-medium text-body-3">/mo</span>
          </div>
          <span className={`tier-badge t${l.trustTier}`}>T{l.trustTier}</span>
        </div>
        <div className="mt-1 flex items-center gap-2 text-[13px] text-body-2">
          <b className="text-body">{l.bedrooms === 0 ? 'Studio' : `${l.bedrooms} ${t('common.bd')}`}</b>
          <span className="h-[3px] w-[3px] rounded-full bg-line-strong" />
          <b className="text-body">{l.bathrooms} {t('common.ba')}</b>
          {l.sqft && (
            <>
              <span className="h-[3px] w-[3px] rounded-full bg-line-strong" />
              <span>{l.sqft} ft²</span>
            </>
          )}
          {l.parking && (
            <>
              <span className="h-[3px] w-[3px] rounded-full bg-line-strong" />
              <span>parking</span>
            </>
          )}
        </div>
        <div className="mt-2 text-[13px] font-semibold">{l.address}{l.unit ? `, ${l.unit}` : ''}</div>
        <div className="text-[12px] text-body-3">{l.neighborhood} · {l.city}</div>
      </div>
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
