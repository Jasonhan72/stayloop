// Which identity the header names — the「我是…」label, its colour, the avatar menu's
//「当前：…」chip and the current row of the identity list (2026-09-29, user:「我是经纪，
// 我是服务商，也是要一样的处理下」and「我是经纪菜单点击了以后要把菜单文字也要切换成我是经纪」).
//
// It is the area you are in: the provider pages (and a neutral page reached from them)
// → 服务商; the agent pages → 经纪, even before the RECO check has passed — picking
//「经纪 · 开通」in the menu lands on /agent/verify, and the label used to stay「我是房东」
// there because a registration only counts as held once verified; a hat's own pages
// (/tenant/*, /landlord/*, /dashboard, /screening/app) → the active hat; anywhere else
// (/, /settings, /messages…) the active hat too — unless the account is a PURE service
// provider (a provider row, no landlord hat, no live RECO registration): then 服务商,
// whatever this browser remembers (four-role audit 2026-10-12, P2-4: a provider on a new
// browser said「我是租客」on /settings). Permissions never read this — they read the hats.
import { isRegistrationLive } from '@/lib/agentProfile'
import { roleFromPath } from '@/lib/activeRole'

export type DisplayIdentity = 'tenant' | 'landlord' | 'agent' | 'provider'

/** The hats the decision needs; `null` / `undefined` = unknown (treated as "not provider-only"). */
export type DisplayHats = { landlord?: boolean; agent?: string | null; provider?: string | null } | null | undefined

/** A service-provider row and nothing else that could frame the account: no landlords row, no live RECO registration. */
export function isProviderOnly(hats: DisplayHats): boolean {
  return !!hats?.provider && !hats?.landlord && !(hats?.agent && isRegistrationLive(hats.agent))
}

export function displayIdentity(pathname: string, onProvider: boolean, activeHat: 'tenant' | 'landlord' | 'agent', hats?: DisplayHats): DisplayIdentity {
  if (onProvider) return 'provider'
  if (pathname.startsWith('/agent/')) return 'agent'
  if (roleFromPath(pathname)) return activeHat
  if (isProviderOnly(hats)) return 'provider'
  return activeHat
}
