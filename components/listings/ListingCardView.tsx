'use client'
// THE listing card (2026-10-27 · user: 「对话框里的房源卡片和房源页面的要对齐，或者用同一个」).
// One presentational component for every surface that shows a listing as a
// card: the /listings browse grid and the AI chat results (Stayloop rows,
// outside-site results, commercial spaces). Callers compute the words
// (lib/listings/cardFacts) and pass nodes for the parts that differ (the
// corner badge, the source line, extra chips, the note bar); the layout,
// sizes and order live here only:
//   image (corner badge · heart · dots or counter)
//   kicker (type · neighbourhood) → title (address, unit once) → test badge
//   price → size row with icons → concrete facts → source line → amenities · chips
//   note bar
import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'
import FavHeart from '@/components/FavHeart'
import { TEST_LISTING_LABEL } from '@/lib/listingVisibility'

export type CardSize = { key?: 'bed' | 'bath' | 'sqft'; text: string }

export type ListingCardViewProps = {
  zh: boolean
  href: string
  /** Opens in a new tab (an outside site). */
  external?: boolean
  image: string | null
  /** Background when there is no photo (the browse grid's two-colour gradient). */
  fallback?: string
  photoCount?: number | null
  /** Corner badge: the verification chip on /listings, REALTOR.CA / VERIFIED in chat. */
  topLeft?: ReactNode
  fav: boolean
  onToggleFav: () => void
  kicker?: string | null
  title: string
  isTest?: boolean
  /** Replaces the default "$N/月" (commercial pricing). */
  priceNode?: ReactNode
  price?: number | null
  size: CardSize[]
  facts?: string[]
  sourceLine?: ReactNode
  amenities?: string[]
  /** After the amenities: a required-stamp chip, warnings. */
  chips?: ReactNode
  note?: { text: string; tone: 'external' | 'info' } | null
  active?: boolean
  onMouseEnter?: () => void
}

// Small line icons for the size row (bed · bath · area); decorative, the text carries the meaning.
export function SizeIcon({ kind }: { kind: 'bed' | 'bath' | 'sqft' }) {
  const common = { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true, style: { color: '#6B7280', flex: 'none' } }
  if (kind === 'bed') return <svg {...common}><path d="M3 18v-7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v7" /><path d="M3 15h18" /><path d="M6 9V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" /></svg>
  if (kind === 'bath') return <svg {...common}><path d="M4 12h16v3a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-3z" /><path d="M6 12V6a2 2 0 0 1 4 0" /><path d="M7 19l-1 2M17 19l1 2" /></svg>
  return <svg {...common}><path d="M4 4h16v16H4z" /><path d="M4 9h5V4M15 20v-5h5" /></svg>
}

const heartStyle: CSSProperties = { position: 'absolute', top: 10, right: 10, width: 30, height: 30, background: 'rgba(0,0,0,0.50)', border: 'none', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }

export default function ListingCardView(p: ListingCardViewProps) {
  const { zh } = p
  const bg = p.image ? `url(${p.image}) center/cover no-repeat${p.fallback ? `, ${p.fallback}` : ''}` : p.fallback || '#EEF2F5'
  const inner = (
    <>
      <div style={{ aspectRatio: '1.5', background: bg, position: 'relative' }}>
        {p.topLeft}
        <FavHeart fav={p.fav} onToggle={p.onToggleFav} zh={zh} style={heartStyle} />
        {p.photoCount && p.photoCount > 1 && (p.photoCount <= 8 ? (
          <span style={{ position: 'absolute', bottom: 10, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 4 }} aria-label={zh ? `${p.photoCount} 张照片` : `${p.photoCount} photos`} data-testid="card-photo-dots">
            {Array.from({ length: p.photoCount }, (_, i) => <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: i === 0 ? '#fff' : 'rgba(255,255,255,0.55)' }} />)}
          </span>
        ) : (
          <span style={{ position: 'absolute', bottom: 10, right: 10, background: 'rgba(0,0,0,0.65)', color: '#fff', padding: '3px 8px', borderRadius: 4, fontFamily: 'JetBrains Mono, monospace', fontSize: 10.5 }} data-testid="card-photo-count">
            1 / {p.photoCount}
          </span>
        ))}
      </div>
      <div style={{ padding: '14px 16px' }} data-testid="card-body">
        {p.kicker && <div style={{ fontSize: 12, color: '#71717A' }} data-testid="card-kicker">{p.kicker}</div>}
        <div style={{ fontSize: 15, fontWeight: 700, color: '#1B1B3C', marginTop: 2, lineHeight: 1.3 }} data-testid="card-address">{p.title}</div>
        {p.isTest && (
          <div className="mt-1 inline-block rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-800" data-testid="test-listing-badge">
            {zh ? TEST_LISTING_LABEL.zh : TEST_LISTING_LABEL.en}
          </div>
        )}
        {p.priceNode ?? (
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em', marginTop: 6 }} data-testid="card-price">
            ${(p.price ?? 0).toLocaleString()}
            <small style={{ fontSize: 12, fontWeight: 500, color: '#71717A' }}>{zh ? '/月' : '/mo'}</small>
          </div>
        )}
        {p.size.length > 0 && (
          <div style={{ fontSize: 13, color: '#171717', margin: '6px 0 0', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }} data-testid="card-size">
            {p.size.map((f, i) => (
              <span key={`${f.key ?? 'x'}-${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 600 }}>
                {f.key && <SizeIcon kind={f.key} />}
                {f.text}
              </span>
            ))}
          </div>
        )}
        {p.facts && p.facts.length > 0 && <div style={{ fontSize: 12.5, color: '#3F3F46', marginTop: 4 }} data-testid="card-facts">{p.facts.join(' · ')}</div>}
        {p.sourceLine}
        {((p.amenities && p.amenities.length > 0) || p.chips) && (
          <div style={{ display: 'flex', gap: 5, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {p.amenities && p.amenities.length > 0 && <span style={{ fontSize: 12, color: '#71717A' }} data-testid="card-amenities">{p.amenities.join(' · ')}</span>}
            {p.chips}
          </div>
        )}
      </div>
      {p.note && (
        <div style={{ borderTop: '1px solid #E8E2D2', padding: '10px 16px', fontSize: 11.5, lineHeight: 1.4, background: p.note.tone === 'external' ? 'rgba(180,83,9,0.05)' : 'rgba(0,172,228,0.05)', color: p.note.tone === 'external' ? '#92400E' : '#5B21B6' }} data-testid="card-note">
          {p.note.tone === 'external' ? '◧ ' : '◑ '}{p.note.text}
        </div>
      )}
    </>
  )
  const style: CSSProperties = { border: '1px solid #E8E2D2', borderRadius: 12, overflow: 'hidden', boxShadow: p.active ? '0 12px 28px rgba(0,0,0,0.10)' : 'none', transform: p.active ? 'translateY(-1px)' : 'none', display: 'block', height: '100%' }
  if (p.external) {
    return <a href={p.href} target="_blank" rel="noopener noreferrer" onMouseEnter={p.onMouseEnter} className="bg-white transition" style={style} data-testid="listing-card">{inner}</a>
  }
  return <Link href={p.href} onMouseEnter={p.onMouseEnter} className="bg-white transition" style={style} data-testid="listing-card">{inner}</Link>
}
