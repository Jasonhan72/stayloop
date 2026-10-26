// Pure: what a Jina read of a Realtor.ca page actually was (2026-10-27: moved out of
// lib/agent/listingSearch so the freshness cron helper — and through it an admin
// client component — no longer imports the module that reads the listings table
// with the service role).
/**
 * What a Jina render of a Realtor.ca page actually is. Realtor.ca's bot
 * protection answers some reads with a "Just a moment / Security Check" page
 * (Jina still says HTTP 200), and an unknown slug gets the generic map page —
 * neither is "the area has no listings".
 */
export function classifyRealtorPage(text: string): 'ok' | 'empty' | 'nopage' | 'blocked' {
  const head = text.slice(0, 1500)
  if (/Just a moment|Security Check|Contrôle de sécurité|Performing security verification|requiring CAPTCHA|Target URL returned error 403/i.test(head)) return 'blocked'
  const rows = (text.match(/\$[\d,]+\s*\/\s*Month/gi) || []).length
  if (rows > 0) return 'ok'
  const title = head.match(/^Title:\s*(.*)$/m)?.[1] ?? ''
  if (/MLS® & Real Estate Map|^REALTOR\.ca$/i.test(title.trim())) return 'nopage'
  return 'empty'
}

