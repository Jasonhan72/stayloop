// A link to someone else's website, from text a user typed (a provider's "website" field).
//
// Used as an `href` unchecked, "example.com" resolves against the current page and 404s on
// our own site, and "javascript:…" runs (code review 2026-11-15 S3-32). This returns an
// absolute http(s) URL or null; callers render no link for null and save only what it returns.
//
//   · no scheme ("example.com/about", "//example.com") → https:// is added
//   · anything that is not http: / https: after parsing → null
//   · a host without a dot ("localhost", "javascript", "intranet") → null
//   · credentials in the URL ("https://mailto:a@b.com" parses as user "mailto" at b.com) → null
//   · whitespace or control characters anywhere → null (the URL parser would silently drop tabs and newlines)
export function externalHref(raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim()
  if (!v || v.length > 2000) return null
  if (/[\s\u0000-\u001f\u007f]/.test(v)) return null
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : v.startsWith('//') ? `https:${v}` : `https://${v}`
  let u: URL
  try { u = new URL(candidate) } catch { return null }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  if (u.username || u.password) return null
  const host = u.hostname
  if (!host.includes('.') || host.startsWith('.') || host.endsWith('.')) return null
  return u.href
}

/** The same link as people read it: no scheme, no trailing slash. */
export function externalHrefLabel(href: string): string {
  return href.replace(/^https?:\/\//i, '').replace(/\/$/, '')
}
