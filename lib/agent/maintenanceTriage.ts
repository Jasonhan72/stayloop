// Maintenance triage (proposal 2026-09-23 §3.4 · ResidentAI mapping). The
// model fills structured fields on a `maintenance_request` proposal; this
// module is the deterministic side: which keys survive, which values are
// legal, and what counts as an emergency (RTA s.20 — the landlord must keep
// the unit fit for habitation; loss of heat / water / a gas smell / flooding
// / a lock that will not secure the unit are the cases that cannot wait).
export const META_KEYS = ['title', 'description', 'priority', 'location', 'subject', 'body', 'category', 'entry_permission', 'pets'] as const
export type MetaKey = (typeof META_KEYS)[number]

export const MAINTENANCE_CATEGORIES = ['plumbing', 'electrical', 'heating_cooling', 'appliance', 'pest', 'structural', 'locks_safety', 'other'] as const
export const ENTRY_PERMISSIONS = ['anytime', 'call_first', 'tenant_present'] as const

export const CATEGORY_LABEL: Record<(typeof MAINTENANCE_CATEGORIES)[number], { zh: string; en: string }> = {
  plumbing: { zh: '水管 / 漏水', en: 'Plumbing / leak' },
  electrical: { zh: '电路', en: 'Electrical' },
  heating_cooling: { zh: '供暖 / 空调', en: 'Heating / cooling' },
  appliance: { zh: '电器', en: 'Appliance' },
  pest: { zh: '虫害', en: 'Pests' },
  structural: { zh: '门窗 / 结构', en: 'Doors, windows / structure' },
  locks_safety: { zh: '门锁 / 安全', en: 'Locks / safety' },
  other: { zh: '其他', en: 'Other' },
}
export const ENTRY_LABEL: Record<(typeof ENTRY_PERMISSIONS)[number], { zh: string; en: string }> = {
  anytime: { zh: '可随时进入（按 RTA s.27 提前 24 小时书面通知）', en: 'Enter anytime (24h written notice per RTA s.27)' },
  call_first: { zh: '进入前先电话联系', en: 'Call before entering' },
  tenant_present: { zh: '须租客在场', en: 'Tenant must be present' },
}

const EMERGENCY_RE = /(gas|燃气|煤气|no heat|没有暖气|暖气(停|坏|不)|没暖|no water|停水|没水|flood|淹|漏水严重|水漫|sewage|污水|lock(ed)? out|锁坏|门锁(坏|失效)|无法锁|carbon monoxide|一氧化碳|smoke|冒烟|火|fire|electrical spark|漏电|no power|停电)/i

export function sanitizeActionMetadata(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (!raw || typeof raw !== 'object') return out
  for (const k of META_KEYS) {
    const v = (raw as Record<string, unknown>)[k]
    if (typeof v === 'string' && v.trim()) out[k] = v.trim().slice(0, k === 'body' || k === 'description' ? 2000 : 200)
  }
  if (out.priority && !['low', 'medium', 'high'].includes(out.priority)) delete out.priority
  if (out.category && !(MAINTENANCE_CATEGORIES as readonly string[]).includes(out.category)) delete out.category
  if (out.entry_permission && !(ENTRY_PERMISSIONS as readonly string[]).includes(out.entry_permission)) delete out.entry_permission
  return out
}

/** Emergency = habitability-critical: forces priority high and a "call now" line. */
export function isEmergencyMaintenance(meta: Record<string, unknown>): boolean {
  const text = `${meta.title ?? ''} ${meta.description ?? ''}`
  if (EMERGENCY_RE.test(text)) return true
  return meta.category === 'heating_cooling' && /冬|winter|-?\d+\s*°|degrees|零下|below/i.test(text)
}

export function triageLines(meta: Record<string, unknown>, zh: boolean): string[] {
  const out: string[] = []
  const cat = typeof meta.category === 'string' && (MAINTENANCE_CATEGORIES as readonly string[]).includes(meta.category) ? (meta.category as (typeof MAINTENANCE_CATEGORIES)[number]) : null
  const entry = typeof meta.entry_permission === 'string' && (ENTRY_PERMISSIONS as readonly string[]).includes(meta.entry_permission) ? (meta.entry_permission as (typeof ENTRY_PERMISSIONS)[number]) : null
  if (cat) out.push(`${zh ? '类别' : 'Category'}：${zh ? CATEGORY_LABEL[cat].zh : CATEGORY_LABEL[cat].en}`)
  if (typeof meta.location === 'string' && meta.location) out.push(`${zh ? '位置' : 'Location'}：${meta.location}`)
  if (entry) out.push(`${zh ? '进入许可' : 'Entry'}：${zh ? ENTRY_LABEL[entry].zh : ENTRY_LABEL[entry].en}`)
  if (typeof meta.pets === 'string' && meta.pets) out.push(`${zh ? '家中宠物' : 'Pets at home'}：${meta.pets}`)
  return out
}
