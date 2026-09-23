// Trades, required credentials and eligibility (services marketplace §5).
// Pure. Which credential a trade needs is Ontario law, not policy:
//   • plumbing — Plumber 306A is a compulsory trade (Skilled Trades Ontario)
//   • electrical — electrical contracting needs an ESA Licensed Electrical
//     Contractor (O. Reg. 570/05); Electrician 309A is compulsory
//   • heating_cooling — Refrigeration & A/C Systems Mechanic 313A is
//     compulsory; gas-fired equipment needs a TSSA gas technician
//   • pest — MECP exterminator licence
//   • appliance / locks_safety / structural / handyman — no provincial
//     licence; business registration + liability insurance
// WSIB clearance applies to construction-class work on a rental (the
// owner-occupied home-renovation exemption does not apply).
export type Trade = 'plumbing' | 'electrical' | 'heating_cooling' | 'appliance' | 'pest' | 'structural' | 'locks_safety' | 'handyman'
export type CredentialKind = 'sto_coq' | 'esa_contractor' | 'tssa_gas' | 'wsib_clearance' | 'liability_insurance' | 'business_registration' | 'mecp_exterminator'

export const TRADES: { key: Trade; zh: string; en: string; required: CredentialKind[]; ticketCategories: string[] }[] = [
  { key: 'plumbing', zh: '水管', en: 'Plumbing', required: ['sto_coq', 'liability_insurance', 'wsib_clearance'], ticketCategories: ['plumbing'] },
  { key: 'electrical', zh: '电气', en: 'Electrical', required: ['esa_contractor', 'liability_insurance', 'wsib_clearance'], ticketCategories: ['electrical'] },
  { key: 'heating_cooling', zh: '供暖 / 空调', en: 'Heating / cooling', required: ['sto_coq', 'tssa_gas', 'liability_insurance', 'wsib_clearance'], ticketCategories: ['heating_cooling'] },
  { key: 'appliance', zh: '电器维修', en: 'Appliance repair', required: ['business_registration', 'liability_insurance'], ticketCategories: ['appliance'] },
  { key: 'pest', zh: '虫害', en: 'Pest control', required: ['mecp_exterminator', 'liability_insurance'], ticketCategories: ['pest'] },
  { key: 'structural', zh: '门窗 / 结构', en: 'Doors, windows / structure', required: ['business_registration', 'liability_insurance', 'wsib_clearance'], ticketCategories: ['structural'] },
  { key: 'locks_safety', zh: '门锁 / 安全', en: 'Locks / safety', required: ['business_registration', 'liability_insurance'], ticketCategories: ['locks_safety'] },
  { key: 'handyman', zh: '杂工 / 清洁', en: 'Handyman / cleaning', required: ['business_registration', 'liability_insurance'], ticketCategories: ['other', 'repair'] },
]

export const CREDENTIAL_LABEL: Record<CredentialKind, { zh: string; en: string; register: string; url: string }> = {
  sto_coq: { zh: 'Skilled Trades Ontario 资格证（C of Q）', en: 'Skilled Trades Ontario Certificate of Qualification', register: 'STO Public Register', url: 'https://www.skilledtradesontario.ca/public-register/' },
  esa_contractor: { zh: 'ESA 持牌电气承包商', en: 'ESA Licensed Electrical Contractor', register: 'ESA contractor lookup', url: 'https://findacontractor.esasafe.com/' },
  tssa_gas: { zh: 'TSSA 燃气技师证', en: 'TSSA gas technician certificate', register: 'TSSA', url: 'https://www.tssa.org/' },
  wsib_clearance: { zh: 'WSIB 清关号', en: 'WSIB clearance number', register: 'WSIB clearances', url: 'https://www.wsib.ca/en/businesses/premiums-and-payment/clearances' },
  liability_insurance: { zh: '商业责任险（CGL）', en: 'Commercial general liability insurance', register: '保险证明 / certificate', url: '' },
  business_registration: { zh: '企业注册（ONBIS / 联邦）', en: 'Business registration (ONBIS / federal)', register: 'Ontario Business Registry', url: 'https://www.ontario.ca/page/ontario-business-registry' },
  mecp_exterminator: { zh: '安省环境部除虫许可', en: 'MECP exterminator licence', register: 'MECP', url: 'https://www.ontario.ca/page/pesticide-licences' },
}

export const CITIES = ['Toronto', 'Scarborough', 'North York', 'Etobicoke', 'Mississauga', 'Brampton', 'Vaughan', 'Markham', 'Richmond Hill', 'Oakville', 'Burlington', 'Hamilton', 'Pickering', 'Ajax', 'Whitby', 'Oshawa', 'Newmarket', 'Aurora'] as const

export function tradeForCategory(category: string | null | undefined): Trade {
  const c = (category || '').toLowerCase()
  return TRADES.find((t) => t.ticketCategories.includes(c))?.key ?? 'handyman'
}

export type CredentialLite = { kind: string; expires_at: string | null; verified_at: string | null }

/** A trade is "covered" when every required credential exists, is verified and not expired. */
export function coverageFor(trade: Trade, creds: CredentialLite[], today = new Date()): { ok: boolean; missing: CredentialKind[]; expired: CredentialKind[]; unverified: CredentialKind[] } {
  const def = TRADES.find((t) => t.key === trade)
  const missing: CredentialKind[] = []; const expired: CredentialKind[] = []; const unverified: CredentialKind[] = []
  const t = today.toISOString().slice(0, 10)
  for (const k of def?.required ?? []) {
    const c = creds.filter((x) => x.kind === k)
    if (!c.length) { missing.push(k); continue }
    const live = c.filter((x) => !x.expires_at || x.expires_at >= t)
    if (!live.length) { expired.push(k); continue }
    if (!live.some((x) => x.verified_at)) unverified.push(k)
  }
  return { ok: !missing.length && !expired.length && !unverified.length, missing, expired, unverified }
}

/** Dispatch eligibility: verified provider + trade listed + trade covered + city served. */
export function providerEligible(p: { status: string; trades: string[]; service_cities: string[] }, creds: CredentialLite[], trade: Trade, city: string | null, today = new Date()): { ok: boolean; reason?: 'not_verified' | 'trade_not_listed' | 'credentials' | 'city' } {
  if (p.status !== 'verified') return { ok: false, reason: 'not_verified' }
  if (!p.trades.includes(trade)) return { ok: false, reason: 'trade_not_listed' }
  if (!coverageFor(trade, creds, today).ok) return { ok: false, reason: 'credentials' }
  if (city && p.service_cities.length && !p.service_cities.some((c) => cityMatch(c, city))) return { ok: false, reason: 'city' }
  return { ok: true }
}

const TORONTO_AREAS = ['toronto', 'scarborough', 'north york', 'etobicoke', 'east york', 'york']
export function cityMatch(served: string, city: string): boolean {
  const a = served.trim().toLowerCase(); const b = city.trim().toLowerCase()
  if (!a || !b) return false
  if (a === b || b.includes(a) || a.includes(b)) return true
  return a === 'toronto' && TORONTO_AREAS.includes(b)
}

/** Days until the earliest required credential expires (null = nothing expiring). */
export function earliestExpiry(creds: CredentialLite[], today = new Date()): { kind: string; days: number } | null {
  let best: { kind: string; days: number } | null = null
  for (const c of creds) {
    if (!c.expires_at) continue
    const d = Math.round((new Date(c.expires_at + 'T00:00:00Z').getTime() - Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())) / 86_400_000)
    if (!best || d < best.days) best = { kind: c.kind, days: d }
  }
  return best
}
