// Partner screening switch (V1.0 stage 1 · 丁 #19, 2026-10-15).
//
// POST /api/v1/screen furnishes a screening report about an applicant to a
// third party — exactly what Ontario's Consumer Reporting Act (R.S.O. 1990,
// c. C.33) s.3 requires registration for. Until Stayloop Inc.'s registration
// is complete the endpoint must stay closed regardless of CRA_MODE, so it has
// its own switch instead of reusing the CRA_MODE gate
// (design/research/v1/open-api-2026-10.md D1-11).
//
//   PARTNER_SCREENING_API=on   — opens the endpoint, AND ONLY IF
//   CRA_MODE is "registered"   — (lib/compliance/craMode.ts).
//
// Anything else (unset, "off", any other value, or CRA_MODE=tool) keeps it
// closed. Server env only; flip it in Cloudflare Pages without a rebuild.
import { craMode } from '@/lib/compliance/craMode'

export const PARTNER_SCREENING_ENV = 'PARTNER_SCREENING_API'

/** True only when the partner screening API is explicitly switched on AND the site runs in registered mode. */
export function partnerScreeningEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const on = (env[PARTNER_SCREENING_ENV] || '').trim().toLowerCase() === 'on'
  return on && craMode(env) === 'registered'
}

/** The 503 body the closed endpoint returns (documented on /stayloop-api/docs). */
export const PARTNER_SCREENING_CLOSED = {
  error: 'partner_screening_closed',
  message: 'Partner screening is closed until Stayloop’s Consumer Reporting Act registration is complete.',
} as const
