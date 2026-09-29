// Which identity the header names — the「我是…」label, its colour, the avatar menu's
//「当前：…」chip and the current row of the identity list (2026-09-29, user:「我是经纪，
// 我是服务商，也是要一样的处理下」and「我是经纪菜单点击了以后要把菜单文字也要切换成我是经纪」).
//
// It is the area you are in: the provider pages (and a neutral page reached from them)
// → 服务商; the agent pages → 经纪, even before the RECO check has passed — picking
//「经纪 · 开通」in the menu lands on /agent/verify, and the label used to stay「我是房东」
// there because a registration only counts as held once verified; anywhere else, the
// active hat. Permissions never read this — they read the hats.
export type DisplayIdentity = 'tenant' | 'landlord' | 'agent' | 'provider'

export function displayIdentity(pathname: string, onProvider: boolean, activeHat: 'tenant' | 'landlord' | 'agent'): DisplayIdentity {
  if (onProvider) return 'provider'
  if (pathname.startsWith('/agent/')) return 'agent'
  return activeHat
}
