// Shared listing badges — promo (LUNA/NEW/…) and verification/source chips.
// Variants preserve each call site's exact geometry and copy; the branching
// logic (realtor → pending → verified) lives here once.

type PromoVariant = 'card' | 'hero'

const promoColor = (badge: string) =>
  badge.startsWith('LUNA') ? '#00ACE4' : badge.startsWith('NEW') ? '#DC2626' : '#047857'

export function PromoBadge({ badge, variant }: { badge?: string | null; variant: PromoVariant }) {
  if (!badge) return null
  const background = promoColor(badge)
  if (variant === 'card') {
    return (
      <span
        style={{
          position: 'absolute',
          top: 10,
          left: 10,
          background,
          color: '#fff',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 10,
          fontWeight: 700,
          padding: '4px 8px',
          borderRadius: 4,
          letterSpacing: '0.10em',
        }}
      >
        {badge}
      </span>
    )
  }
  return (
    <span
      className="absolute left-4 top-4 font-mono"
      style={{
        background,
        color: '#fff',
        fontSize: 10,
        fontWeight: 700,
        padding: '5px 10px',
        borderRadius: 4,
        letterSpacing: '0.10em',
      }}
    >
      {badge}
    </span>
  )
}

type ListingTrust = {
  source?: string | null
  verification_status?: string | null
}

type VerificationVariant =
  | 'public-card' // /listings browse card: realtor badge only, absolute bottom-left
  | 'detail' // /listings/[slug] title chips: VERIFIED / pending / realtor
  | 'dashboard-list' // /dashboard list row: exclusive three-way, 9.5px
  | 'dashboard-grid' // /dashboard grid card: exclusive three-way, absolute left-3 top-11
  | 'admin-row' // /admin/verify row: realtor badge only

export function VerificationBadge({
  listing,
  variant,
  zh,
}: {
  listing: ListingTrust
  variant: VerificationVariant
  zh?: boolean
}) {
  const status =
    listing.source === 'realtor'
      ? 'realtor'
      : listing.verification_status !== 'verified'
        ? 'pending'
        : 'verified'

  if (variant === 'public-card') {
    if (status !== 'realtor') return null
    return (
      <span
        style={{
          position: 'absolute',
          bottom: 10,
          left: 10,
          background: 'rgba(180,83,9,0.92)',
          color: '#fff',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 9.5,
          fontWeight: 700,
          padding: '3px 7px',
          borderRadius: 4,
          letterSpacing: '0.08em',
        }}
      >
        REALTOR.CA
      </span>
    )
  }

  if (variant === 'detail') {
    // Not exclusive: a verified realtor listing shows both chips.
    return (
      <>
        {listing.verification_status === 'verified' && <span className="sl-chip fit">VERIFIED</span>}
        {status === 'pending' && (
          <span
            className="rounded-md border px-2.5 py-1 font-mono text-[10.5px] font-bold tracking-eyebrow"
            style={{ borderColor: '#9FBBD0', color: '#71717A' }}
          >
            {zh ? '待 Stayloop 验证' : 'PENDING VERIFICATION'}
          </span>
        )}
        {listing.source === 'realtor' && (
          <span
            className="rounded-md px-2.5 py-1 font-mono text-[10.5px] font-bold tracking-eyebrow text-white"
            style={{ background: '#B45309' }}
          >
            {zh ? 'REALTOR.CA 来源' : 'FROM REALTOR.CA'}
          </span>
        )}
      </>
    )
  }

  if (variant === 'admin-row') {
    if (status !== 'realtor') return null
    return (
      <span className="rounded px-1.5 py-0.5 font-mono text-[9.5px] font-bold text-white" style={{ background: '#B45309' }}>
        REALTOR.CA
      </span>
    )
  }

  const cls =
    variant === 'dashboard-grid'
      ? 'absolute left-3 top-11 rounded-md px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-white'
      : 'rounded px-1.5 py-0.5 font-mono text-[9.5px] font-bold text-white'

  if (status === 'realtor') {
    return <span className={cls} style={{ background: '#B45309' }}>REALTOR.CA</span>
  }
  if (status === 'pending') {
    const label =
      variant === 'dashboard-grid'
        ? zh ? '待验证 · 暂未公开' : 'PENDING · NOT PUBLIC'
        : zh ? '待验证' : 'PENDING'
    return <span className={cls} style={{ background: '#A16207' }}>{label}</span>
  }
  return <span className={cls} style={{ background: '#00ACE4' }}>VERIFIED</span>
}
