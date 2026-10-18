// Outbound fetches to URLs a caller supplied (partner files, partner webhooks) must reach the
// public internet only (site test 2026-10-17, T6-D8: /api/v1/screen fetched files[].url with
// redirect: 'follow' and accepted any https:// webhook). Same host rules as the turn route's
// fetchUrlContent, https only, and every redirect hop is re-checked instead of followed blindly.

/** True when the URL is https and its host is not loopback / private / link-local / CGNAT /
 *  an IP literal in an unusual spelling / an internal name. Pure — tested. */
export function isPublicHttpsUrl(raw: string): boolean {
  let u: URL
  try { u = new URL(raw) } catch { return false }
  if (u.protocol !== 'https:') return false
  if (u.username || u.password) return false
  const host = u.hostname.toLowerCase().replace(/\.$/, '')
  if (!host) return false
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.lan') || host.endsWith('.home.arpa')) return false
  // IPv6 literals (::1, fc00::/7, fe80::/10, ::ffff:10.0.0.1 …), bare decimal and hex IPv4: no partner
  // file host or webhook is a raw literal in these forms — refuse them all.
  if (host.startsWith('[') || host.includes(':') || /^\d+$/.test(host) || /^0x/i.test(host)) return false
  const segs = host.split('.')
  if (segs.every((s) => /^(?:0x[0-9a-f]+|\d+)$/i.test(s))) {
    if (segs.length !== 4 || segs.some((s) => !/^\d+$/.test(s) || (s.length > 1 && s.startsWith('0')))) return false
    const n = segs.map(Number)
    if (n.some((x) => x > 255)) return false
    if (
      n[0] === 0 || n[0] === 10 || n[0] === 127 ||
      (n[0] === 100 && n[1] >= 64 && n[1] <= 127) ||
      (n[0] === 169 && n[1] === 254) ||
      (n[0] === 172 && n[1] >= 16 && n[1] <= 31) ||
      (n[0] === 192 && n[1] === 168) ||
      (n[0] === 192 && n[1] === 0 && n[2] === 0) ||
      (n[0] === 198 && (n[1] === 18 || n[1] === 19)) ||
      n[0] >= 224
    ) return false
  }
  return true
}

/** fetch() that follows at most `maxHops` redirects by hand, re-checking each Location with
 *  isPublicHttpsUrl. Throws on a refused URL or too many hops. */
export async function fetchPublicHttps(url: string, init: RequestInit = {}, maxHops = 3, fetcher: typeof fetch = fetch): Promise<Response> {
  let current = url
  for (let hop = 0; hop <= maxHops; hop++) {
    if (!isPublicHttpsUrl(current)) throw new Error('blocked_url')
    const res = await fetcher(current, { ...init, redirect: 'manual' })
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location')
      if (!loc) return res
      current = new URL(loc, current).toString()
      continue
    }
    return res
  }
  throw new Error('too_many_redirects')
}
