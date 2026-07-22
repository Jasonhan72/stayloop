'use client'

// Presentational favorite-heart button shared by every listing card surface.
// State lives in lib/favorites.ts (localStorage) — callers pass `fav` +
// `onToggle`. Sits inside <Link>/<a> cards, so clicks are stopped from
// navigating.
export default function FavHeart({
  fav,
  onToggle,
  zh,
  className,
  style,
  size = 14,
}: {
  fav: boolean
  onToggle: () => void
  zh: boolean
  className?: string
  style?: React.CSSProperties
  size?: number
}) {
  const label = fav
    ? zh ? '取消收藏' : 'Remove from favorites'
    : zh ? '收藏' : 'Save to favorites'
  return (
    <button
      type="button"
      aria-pressed={fav}
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onToggle()
      }}
      className={className}
      style={{ cursor: 'pointer', ...style }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={fav ? '#FB7185' : 'none'}
        stroke={fav ? '#FB7185' : 'currentColor'}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={fav ? { animation: 'sl-fav-pop 0.3s ease' } : undefined}
      >
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
    </button>
  )
}
