// Consumer Reporting Act mode switch (2026-10-12).
//
// Ontario's Consumer Reporting Act (R.S.O. 1990, c. C.33) s.3 forbids acting
// as a consumer reporting agency without registration. Until Stayloop Inc.
// is registered, the site can run in "landlord-tool" mode: screening only
// analyses what the landlord lawfully received from the applicant (and facts
// about the employer COMPANY), and never goes looking for public records
// about the applicant as a person on the landlord's behalf. The applicant can
// run those checks on themselves and hand the result over.
//
// The switch is the server env var CRA_MODE:
//   registered (default) — current behaviour: court portal, LTB catalogue,
//                          CanLII index and the web party search all run.
//   tool                 — those lookups are skipped; every result row says
//                          so in plain language and is counted as NOT
//                          searched (never as "clear").
// Flip it in the Cloudflare Pages env (server-only, no rebuild needed).
// See design/cra-compliance-without-registration-2026-10.md.
import type { CourtQuery } from '@/lib/screening-types'

export type CraMode = 'registered' | 'tool'

export const CRA_MODE_ENV = 'CRA_MODE'

export function craMode(env: Record<string, string | undefined> = process.env): CraMode {
  return (env[CRA_MODE_ENV] || '').trim().toLowerCase() === 'tool' ? 'tool' : 'registered'
}

/** True when Stayloop may search public records about the applicant on the landlord's behalf. */
export function personalRecordLookupsAllowed(env?: Record<string, string | undefined>): boolean {
  return craMode(env) === 'registered'
}

export const CRA_TOOL_SKIP_NOTE_EN =
  'Not searched: in landlord-tool mode Stayloop does not look up public records about the applicant on the landlord\'s behalf until its Consumer Reporting Act registration is complete. The applicant can run this check on themselves and provide the result.'
export const CRA_TOOL_SKIP_NOTE_ZH =
  '未检索：在完成《消费者报告法》注册之前，房东工具模式下 Stayloop 不替房东查询关于申请人本人的公开记录；可由申请人自查后提供结果。'

/** A court-detail row that records a lookup deliberately not run in tool mode. */
export function craToolSkipQuery(source: string, url?: string): CourtQuery {
  return { source, tier: 'free', status: 'skipped', hits: null, note: CRA_TOOL_SKIP_NOTE_EN, ...(url ? { url } : {}) }
}
