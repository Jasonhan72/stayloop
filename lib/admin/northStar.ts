// The four numbers the back office watches, over REAL accounts only (V0.9, 2026-11-22).
//
// Read through the admin_north_star() RPC (supabase/migrations/20261122_admin_north_star.sql):
// "real" leaves out admins, test / Muse / reviewer accounts, our own domains and anonymous
// sessions. /admin's older 「平台实况」 strip counts all of those in — on 2026-11-22 it showed 243
// screenings while real accounts had run 5 of them.
//
// Pure: the page asks the RPC, this turns the payload into what is drawn.

export type NorthStar = {
  realAccounts: number
  realAccounts30d: number
  screeningsReal: number
  screeningsReal30d: number
  screenersReal: number
  screeningsAnon: number
  screeningsTotal: number
  householdsActiveReal: number
  householdsActiveTotal: number
  rentRecordedReal: number
  rentConfirmedReal: number
  landlordsViaAgent: number
  /** oldest first; `week` is the Monday (UTC), YYYY-MM-DD */
  signupsByWeek: { week: string; n: number }[]
}

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : 0
}

/** null = the RPC refused (not an admin) or returned something that is not the payload. */
export function normalizeNorthStar(raw: unknown): NorthStar | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  if (r.error || !('screenings_real' in r)) return null
  const weeks = Array.isArray(r.signups_by_week) ? r.signups_by_week : []
  return {
    realAccounts: num(r.real_accounts),
    realAccounts30d: num(r.real_accounts_30d),
    screeningsReal: num(r.screenings_real),
    screeningsReal30d: num(r.screenings_real_30d),
    screenersReal: num(r.screeners_real),
    screeningsAnon: num(r.screenings_anon),
    screeningsTotal: num(r.screenings_total),
    householdsActiveReal: num(r.households_active_real),
    householdsActiveTotal: num(r.households_active_total),
    rentRecordedReal: num(r.rent_recorded_real),
    rentConfirmedReal: num(r.rent_confirmed_real),
    landlordsViaAgent: num(r.landlords_via_agent),
    signupsByWeek: weeks
      .map((w) => (w && typeof w === 'object' ? { week: String((w as { week?: unknown }).week ?? ''), n: num((w as { n?: unknown }).n) } : null))
      .filter((w): w is { week: string; n: number } => !!w && /^\d{4}-\d{2}-\d{2}$/.test(w.week)),
  }
}

/** Screenings that were not run by a real account and not in an anonymous trial: admins, test accounts, rows with no owner left. */
export function screeningsInternal(s: NorthStar): number {
  return Math.max(0, s.screeningsTotal - s.screeningsReal - s.screeningsAnon)
}

export type NorthStarTile = { key: 'screenings' | 'tenancies' | 'rent' | 'viaAgent'; label: string; value: number; sub: string }

export function northStarTiles(s: NorthStar, zh: boolean): NorthStarTile[] {
  return [
    {
      key: 'screenings',
      label: zh ? '真实账号跑的筛查' : 'Screenings by real accounts',
      value: s.screeningsReal,
      sub: zh ? `近 30 天 ${s.screeningsReal30d} 份 · ${s.screenersReal} 个账号` : `${s.screeningsReal30d} in 30 days · ${s.screenersReal} account${s.screenersReal === 1 ? '' : 's'}`,
    },
    {
      key: 'tenancies',
      label: zh ? '在账的活跃租约' : 'Active tenancies on the ledger',
      value: s.householdsActiveReal,
      sub: zh ? `全站 ${s.householdsActiveTotal} 户，其余是测试` : `${s.householdsActiveTotal} site-wide; the rest are test data`,
    },
    {
      key: 'rent',
      label: zh ? '记下来的交租' : 'Rent payments recorded',
      value: s.rentRecordedReal,
      sub: zh ? `其中 ${s.rentConfirmedReal} 条对方已确认` : `${s.rentConfirmedReal} confirmed by the other side`,
    },
    {
      key: 'viaAgent',
      label: zh ? '经纪带来的房东' : 'Landlords brought by agents',
      value: s.landlordsViaAgent,
      sub: zh ? '确认过经纪委托的房东客户' : 'Landlord clients who confirmed an agent’s delegation',
    },
  ]
}

/** One line that says where the site-wide screening count comes from. */
export function screeningBreakdown(s: NorthStar, zh: boolean): string {
  const internal = screeningsInternal(s)
  return zh
    ? `全站 ${s.screeningsTotal} 份筛查：真实账号 ${s.screeningsReal} 份，匿名试用 ${s.screeningsAnon} 份，管理员、测试号与无主记录 ${internal} 份。`
    : `${s.screeningsTotal} screenings site-wide: ${s.screeningsReal} by real accounts, ${s.screeningsAnon} in anonymous trials, ${internal} by admins, test accounts or with no owner left.`
}
