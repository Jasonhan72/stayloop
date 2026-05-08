// -----------------------------------------------------------------------------
// listing-images — shared photo URL filtering for listing-card thumbnails
// -----------------------------------------------------------------------------
// Picks the first usable hero photo URL from a listing's images array.
// Filters out junk that sneaks past the AI extractor: placeholder domains,
// tracking pixels, social CDN avatars, ad-network beacons.
//
// The Haiku extraction prompt already rejects most of these at extraction
// time, but listings imported under older code paths (or via direct DB
// edits) can still carry junk URLs — this is the last-line frontend filter.
// -----------------------------------------------------------------------------

const JUNK_URL_PATTERNS = [
  // Placeholder / fake domains (older fixtures + manual seeds)
  'example.com',
  'placeholder',
  'via.placeholder',
  // Avatars / profile pictures (gravatar, social)
  'gravatar.com',
  'fbcdn.net',
  'pbs.twimg.com',
  // Ad networks / tracking pixels
  'doubleclick.net',
  'doubleclick.com',
  'openx.net',
  'rubiconproject.com',
  'pubmatic.com',
  'facebook.com/tr',
  'pinterest.com/v',
  // Realtor.ca branding / icons (not listing photos)
  'static.realtor.ca/images/common',
  '/images/en-ca/',
]

/**
 * Pick the first usable photo URL from a listing's images array. Returns
 * null when nothing usable exists (so callers can fall back to a
 * placeholder gradient).
 */
export function pickHeroImage(images: unknown): string | null {
  if (!Array.isArray(images)) return null
  for (const url of images) {
    if (typeof url !== 'string') continue
    if (!/^https:\/\//i.test(url)) continue
    if (url.length > 1200) continue // suspiciously long — likely tracking
    const lower = url.toLowerCase()
    let bad = false
    for (const pattern of JUNK_URL_PATTERNS) {
      if (lower.includes(pattern)) { bad = true; break }
    }
    if (bad) continue
    // SVGs are typically icons / logos, not listing photos
    if (/\.svg(\?|$)/i.test(url)) continue
    return url
  }
  return null
}
