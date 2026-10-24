// Open API tier 1 · core functions (stage 5 · 2026-10-16,
// design/open-api-contract-2026-10.md「核心函数」).
//
// Pure functions (or read-only DB for the rent benchmark) over Stayloop's own
// rule tables: lib/ontario/rules.ts for Ontario, lib/provinces/rules.ts for the
// twelve other provinces and territories, lib/market/rentBenchmark.ts for the
// openly licensed CMHC / Statistics Canada figures. The REST routes
// (app/api/v1/**) and the MCP tools (app/api/mcp) call ONLY these — same
// validation, same shapes, same error codes whichever door the request comes
// through. No personal information goes in; nothing is stored.
import {
  ONTARIO_RULES, checkListingCompliance, checkLeaseTerms, guidelineFor, n1DeadlineFor, n4EarliestTermination, persistentLatePayment,
  RENT_GUIDELINE_CAP, N1_NOTICE_DAYS, N4_TERMINATION_DAYS, N4_MAIL_DEEMED_SERVICE_DAYS,
  PERSISTENT_LATE_GRACE_DAYS, PERSISTENT_LATE_COUNT, PERSISTENT_LATE_WINDOW_MONTHS,
  type Finding, type RuleSeverity, type RuleArea, type ListingInput, type LeaseTermsInput,
} from '@/lib/ontario/rules'
import { PROVINCE_RULES, checkListingComplianceFor, type ProvinceRules, type Bi } from '@/lib/provinces/rules'
import { normalizeProvince, provinceName, type ProvinceCode } from '@/lib/provinces/detect'
import {
  bedBucket, benchmarkCandidates, benchmarkAttribution, benchmarkLabel, readRentBenchmark,
  type BenchmarkKind, type RentBenchmark,
} from '@/lib/market/rentBenchmark'
import { ApiError, RULES_AS_OF, PERIODS_MAX, vArray, vDate, vDateTime, vEnum, vNumber, vString } from '@/lib/api/v1Http'

export const SITE = 'https://www.stayloop.ai'

// ── Province ────────────────────────────────────────────────────────────────

/** `province` → code. Absent = Ontario; any value normalizeProvince does not know → unsupported_province. */
export function provinceParam(v: unknown): ProvinceCode {
  if (v == null || v === '') return 'ON'
  if (typeof v !== 'string' || v.length > 40) throw new ApiError('unsupported_province', 'province: must be a two-letter Canadian province or territory code (ON, QC, BC, AB, MB, SK, NS, NB, PE, NL, YT, NT, NU).')
  const code = normalizeProvince(v)
  if (!code) throw new ApiError('unsupported_province', `province: "${v}" is not a supported province or territory code (ON, QC, BC, AB, MB, SK, NS, NB, PE, NL, YT, NT, NU).`)
  return code
}

// ── Rules ───────────────────────────────────────────────────────────────────

export type RuleOutOntario = { id: string; area: RuleArea; statute: string; title: Bi; summary: Bi; severity: RuleSeverity; since: string }
export type RuleOutProvince = { id: string; topic: ProvinceTopic; statute: string; source_url: string; title: Bi; summary: Bi }
export type RuleOut = RuleOutOntario | RuleOutProvince

/** The ProvinceRules fields that become one RuleOut each (kebab-case = the `topic`, id = `<CODE>-<topic>`). */
export const PROVINCE_TOPICS = [
  'statute', 'tribunal', 'lease-form', 'deposit', 'pet-deposit', 'key-or-other-deposits', 'advance-rent', 'application-fee',
  'pet-ban-allowed', 'rent-increase', 'human-rights', 'privacy-law', 'lease-end', 'adverse-decision',
] as const
export type ProvinceTopic = (typeof PROVINCE_TOPICS)[number]

const TOPIC_TITLE: Record<ProvinceTopic, Bi> = {
  'statute': { zh: '适用法律', en: 'Governing statute' },
  'tribunal': { zh: '审裁机构', en: 'Tribunal' },
  'lease-form': { zh: '租约格式', en: 'Lease form' },
  'deposit': { zh: '押金', en: 'Security deposit' },
  'pet-deposit': { zh: '宠物押金', en: 'Pet deposit' },
  'key-or-other-deposits': { zh: '钥匙押金与其他押金', en: 'Key and other deposits' },
  'advance-rent': { zh: '预收租金', en: 'Rent in advance' },
  'application-fee': { zh: '申请费', en: 'Application fee' },
  'pet-ban-allowed': { zh: '禁宠条款', en: 'Pet bans' },
  'rent-increase': { zh: '涨租', en: 'Rent increases' },
  'human-rights': { zh: '人权法', en: 'Human rights' },
  'privacy-law': { zh: '隐私法', en: 'Privacy law' },
  'lease-end': { zh: '租期结束', en: 'End of the lease' },
  'adverse-decision': { zh: '拒绝申请的告知', en: 'Adverse decision notice' },
}

function provinceRuleOuts(r: ProvinceRules): RuleOutProvince[] {
  const code = r.code
  const out: RuleOutProvince[] = []
  const push = (topic: ProvinceTopic, statute: string, url: string, summary: Bi, title: Bi = TOPIC_TITLE[topic]) => {
    out.push({ id: `${code}-${topic}`, topic, statute, source_url: url, title, summary })
  }
  push('statute', r.statute.cite, r.statute.url, { zh: r.statute.zh, en: r.statute.en })
  push('tribunal', r.tribunal.cite, r.tribunal.url, { zh: r.tribunal.zh, en: r.tribunal.en })
  push('lease-form', r.leaseForm.cite, r.leaseForm.url, { zh: r.leaseForm.lines.map((l) => l.zh).join(' '), en: r.leaseForm.lines.map((l) => l.en).join(' ') }, r.leaseForm.name)
  push('deposit', r.deposit.cite, r.deposit.url, { zh: r.deposit.zh, en: r.deposit.en })
  push('pet-deposit', r.petDeposit.cite, r.petDeposit.url, { zh: r.petDeposit.zh, en: r.petDeposit.en })
  push('key-or-other-deposits', r.keyOrOtherDeposits.cite, r.keyOrOtherDeposits.url, { zh: r.keyOrOtherDeposits.zh, en: r.keyOrOtherDeposits.en })
  push('advance-rent', r.advanceRent.cite, r.advanceRent.url, { zh: r.advanceRent.zh, en: r.advanceRent.en })
  if (r.applicationFee) push('application-fee', r.applicationFee.cite, r.applicationFee.url, { zh: r.applicationFee.zh, en: r.applicationFee.en })
  if (r.petBanAllowed) push('pet-ban-allowed', r.petBanAllowed.cite, r.petBanAllowed.url, { zh: r.petBanAllowed.zh, en: r.petBanAllowed.en })
  push('rent-increase', r.rentIncrease.cite, r.rentIncrease.url, { zh: r.rentIncrease.zh, en: r.rentIncrease.en })
  const h = r.humanRights
  push('human-rights', h.cite, h.url, { zh: `${h.law.zh}（${h.body.zh}）：${h.examples.zh}`, en: `${h.law.en} (${h.body.en}): ${h.examples.en}` })
  push('privacy-law', r.privacyLaw.cite, r.privacyLaw.url, { zh: `${r.privacyLaw.zh}。${r.privacyLaw.access.zh}`, en: `${r.privacyLaw.en}. ${r.privacyLaw.access.en}` })
  push('lease-end', r.leaseEnd.cite, r.leaseEnd.url, { zh: r.leaseEnd.zh, en: r.leaseEnd.en })
  if (r.adverseDecision) push('adverse-decision', r.adverseDecision.cite, r.adverseDecision.url, { zh: r.adverseDecision.zh, en: r.adverseDecision.en })
  return out
}

export type RulesOut = { province: ProvinceCode; province_name: Bi; as_of: string; rules: RuleOut[] }

export function coreRules(input: { province?: unknown }): RulesOut {
  const province = provinceParam(input.province)
  const name = { zh: provinceName(province, 'zh'), en: provinceName(province, 'en') }
  if (province === 'ON') {
    const rules: RuleOutOntario[] = ONTARIO_RULES.map((r) => ({ id: r.id, area: r.area, statute: r.statute, title: r.title, summary: r.summary, severity: r.severity, since: r.since }))
    return { province, province_name: name, as_of: RULES_AS_OF, rules }
  }
  return { province, province_name: name, as_of: RULES_AS_OF, rules: provinceRuleOuts(PROVINCE_RULES[province]) }
}

// ── Compliance (listing + lease terms) ──────────────────────────────────────

export type FindingOut = {
  rule_id: string
  /** Same value as rule_id — the pre-stage-5 field name, kept for callers of the original compliance endpoint. */
  rule: string
  severity: RuleSeverity
  statute: string
  message: Bi
  source_url?: string
  /** Same value as source_url (pre-stage-5 field name). */
  url?: string
}

export type ComplianceOut = {
  province: ProvinceCode
  passed: boolean
  findings: FindingOut[]
  /** Rule ids this check can raise for the province (what「passed」covers). */
  checked: string[]
  /** Scope note for provinces outside Ontario (the check there covers deposits / fees only). */
  notes?: Bi
}

const ON_LISTING_CHECKED = ['RTA-106-deposit-cap', 'OREG516-17-key-deposit', 'RTA-14-no-pet-clause', 'RTA-134-no-fees']
const ON_LEASE_CHECKED = ['RTA-106-deposit-cap', 'OREG9-18-standard-lease', 'RTA-14-no-pet-clause', 'RTA-36-1-tenant-ac', 'RTA-134-no-fees']

/** Official source for a province finding: the Src url of the fact the rule id was derived from. */
function provinceSourceUrl(r: ProvinceRules, ruleId: string): string {
  const id = ruleId.toLowerCase()
  if (id.includes('key-deposit') || id.includes('cleaning-deposit')) return r.keyOrOtherDeposits.url
  if (id.includes('pet-deposit') || id.includes('pet-fee')) return r.petDeposit.url
  if (id.includes('advance-rent') || id.includes('last-month')) return r.advanceRent.url
  if (id.includes('application-fee')) return r.applicationFee?.url || r.statute.url
  if (id.includes('lease-form') || id.includes('lease-dates')) return r.leaseForm.url
  if (id.includes('deposit')) return r.deposit.url
  return r.statute.url
}

function toFindingOut(province: ProvinceCode, f: Finding): FindingOut {
  const url = province === 'ON' ? `${SITE}/rules#${f.rule}` : provinceSourceUrl(PROVINCE_RULES[province], f.rule)
  return { rule_id: f.rule, rule: f.rule, severity: f.severity, statute: f.statute, message: f.message, source_url: url, url }
}

/** Which province-level listing rule ids checkListingComplianceFor can raise there. */
function provinceListingChecked(r: ProvinceRules): string[] {
  const c = r.code
  const qc = c === 'QC'
  const ids: string[] = []
  if (!r.deposit.allowed) ids.push(qc ? 'QC-CCQ-1904-no-deposit' : `${c}-no-deposit`)
  else {
    ids.push(`${c}-deposit-cap`)
    if (r.keyOrOtherDeposits.key === 'prohibited') ids.push(`${c}-no-key-deposit`)
    if (!r.petDeposit.allowed) ids.push(`${c}-no-pet-deposit`)
    if (!(r.keyOrOtherDeposits.allowed && r.keyOrOtherDeposits.key === 'counts_toward_deposit')) ids.push(`${c}-no-cleaning-deposit`)
  }
  if (r.petFee && !r.petFee.allowed) ids.push(qc ? 'QC-CCQ-1904-no-pet-fee' : `${c}-no-pet-fee`)
  if (r.advanceRent.lastMonth === 'prohibited') ids.push(qc ? 'QC-CCQ-1904-advance-rent' : `${c}-no-last-month-rent`)
  if (r.applicationFee && (r.applicationFee.allowed === false || qc)) ids.push(qc ? 'QC-application-fee' : `${c}-no-application-fee`)
  return ids
}

const PROVINCE_SCOPE_NOTE = (name: Bi): Bi => ({
  zh: `${name.zh}只核押金类与费用类（押金上限 / 钥匙押金 / 宠物押金 / 清洁押金 / 宠物费 / 预收租金 / 申请费），依据该省已核实的官方条文；其他条款不在本检查范围内。`,
  en: `For ${name.en} this check covers deposits and fees only (deposit cap / key deposit / pet deposit / cleaning deposit / pet fee / rent in advance / application fee), from the province's verified official sources; other terms are out of scope.`,
})

const PETS_ALLOWED = ['yes', 'no', 'restricted'] as const

export type ListingComplianceArgs = { province?: unknown } & Record<string, unknown>

export function coreListingCompliance(input: ListingComplianceArgs): ComplianceOut {
  const province = provinceParam(input.province)
  const money = { min: 0, max: 1_000_000 }
  const li: ListingInput = {
    monthly_rent: vNumber(input, 'monthly_rent', money),
    deposit: vNumber(input, 'deposit', money),
    key_deposit: vNumber(input, 'key_deposit', money),
    application_fee: vNumber(input, 'application_fee', money),
    pets_allowed: vEnum(input, 'pets_allowed', PETS_ALLOWED),
    title: vString(input, 'title'),
    description: vString(input, 'description'),
    schedule_b: vString(input, 'schedule_b'),
  }
  if (province === 'ON') {
    const { passed, findings } = checkListingCompliance(li)
    return { province, passed, findings: findings.map((f) => toFindingOut(province, f)), checked: ON_LISTING_CHECKED }
  }
  const r = PROVINCE_RULES[province]
  const { passed, findings } = checkListingComplianceFor(province, li)
  const name = { zh: provinceName(province, 'zh'), en: provinceName(province, 'en') }
  return { province, passed, findings: findings.map((f) => toFindingOut(province, f)), checked: provinceListingChecked(r), notes: PROVINCE_SCOPE_NOTE(name) }
}

// Lease-terms text patterns for provinces outside Ontario (the Ontario check keeps its own).
const KEY_DEPOSIT_RE = /\b(key|fob|access[- ]card)\s+(deposit|fee)s?\b|钥匙(押金|费)|门禁卡(押金|费)/i
const LAST_MONTH_RE = /\blast\s+month[’']?s?\s+rent\b|\bfirst\s+(and|&)\s+last\b|最后一个月租金|首尾(两个)?月/i
const NO_LAST_MONTH_RE = /\bno\s+(first\s+(and|&)\s+)?last\s+month|不(需要?|用|收)(预付)?最后一个月/i
const usd = (n: number) => `$${Math.round(n).toLocaleString()}`

function provinceLeaseTerms(r: ProvinceRules, input: LeaseTermsInput): { passed: boolean; findings: Finding[]; checked: string[] } {
  const c = r.code
  const qc = c === 'QC'
  const name = { zh: provinceName(c, 'zh'), en: provinceName(c, 'en') }
  const f: Finding[] = []
  const checked: string[] = []
  const rent = Number(input.rent_amount) || 0
  const dep = input.deposit_amount == null ? null : Number(input.deposit_amount)
  const sb = input.schedule_b || ''

  // 1 · deposit cap (or no deposit at all)
  if (!r.deposit.allowed) {
    const id = qc ? 'QC-CCQ-1904-no-deposit' : `${c}-no-deposit`
    checked.push(id)
    if (dep != null && dep > 0) f.push({ rule: id, statute: r.deposit.cite, severity: 'block', message: { zh: `${name.zh}不允许收取任何押金；租约里的押金 ${usd(dep)} 条款无效。`, en: `${name.en} does not allow any deposit; the ${usd(dep)} deposit term is of no effect.` } })
  } else {
    checked.push(`${c}-deposit-cap`)
    const cap = r.deposit.maxMonths * rent
    if (rent > 0 && dep != null && dep > cap + 0.5) {
      const months = r.deposit.maxMonths === 0.5 ? { zh: '半个月', en: 'half a month’s' } : r.deposit.maxMonths === 0.75 ? { zh: '四分之三个月', en: 'three quarters of a month’s' } : { zh: '一个月', en: 'one month’s' }
      f.push({ rule: `${c}-deposit-cap`, statute: r.deposit.cite, severity: 'block', message: { zh: `押金 ${usd(dep)} 超过${name.zh}允许的上限：${months.zh}租金（${usd(cap)}）。`, en: `The deposit of ${usd(dep)} exceeds ${name.en}’s cap of ${months.en} rent (${usd(cap)}).` } })
    }
  }
  // 2 · key deposit (read out of Schedule B — the lease-terms input has no key_deposit field)
  const k = r.keyOrOtherDeposits
  if (!r.deposit.allowed || k.key === 'prohibited') {
    const id = `${c}-no-key-deposit`
    checked.push(id)
    if (KEY_DEPOSIT_RE.test(sb)) f.push({ rule: id, statute: k.cite, severity: 'block', message: { zh: `${name.zh}不允许另收钥匙押金，附表 B 的相关条款无效。`, en: `${name.en} does not allow a separate key deposit; the Schedule B term is of no effect.` } })
  } else if (k.key === 'counts_toward_deposit') {
    const id = `${c}-key-deposit-counts`
    checked.push(id)
    if (KEY_DEPOSIT_RE.test(sb)) f.push({ rule: id, statute: k.cite, severity: 'warn', message: { zh: `${name.zh}把钥匙押金算作押金的一部分：附表 B 的钥匙押金与押金合计不得超过上限。`, en: `${name.en} counts a key deposit toward the capped deposit: the Schedule B key deposit plus the deposit must stay within the cap.` } })
  }
  // 3 · rent in advance
  if (r.advanceRent.lastMonth === 'prohibited') {
    const id = qc ? 'QC-CCQ-1904-advance-rent' : `${c}-no-last-month-rent`
    checked.push(id)
    if (LAST_MONTH_RE.test(sb) && !NO_LAST_MONTH_RE.test(sb)) {
      f.push({ rule: id, statute: r.advanceRent.cite, severity: 'block', message: qc
        ? { zh: '魁北克只能预收第一个月租金，附表 B 要求预付最后一个月租金的条款无效。', en: 'In Quebec only the first month’s rent may be collected in advance; the Schedule B term requiring last month’s rent is of no effect.' }
        : { zh: `${name.zh}不允许预收最后一个月租金，附表 B 的相关条款无效。`, en: `${name.en} does not allow prepaid last month’s rent; the Schedule B term is of no effect.` } })
    }
  }
  // 4 · the province's own lease form (a warn when the input says the Ontario / TRREB form was used)
  if (r.leaseForm.mandatory) {
    const id = `${c}-lease-form`
    checked.push(id)
    if (input.form_type === 'ontario_standard' || input.form_type === 'trreb') {
      f.push({ rule: id, statute: r.leaseForm.cite, severity: 'warn', message: { zh: `${name.zh}的住宅租约须使用该省规定的格式（${r.leaseForm.name.zh}），安省标准租约 / TRREB 表格不适用。`, en: `A residential lease in ${name.en} must use the province's prescribed form (${r.leaseForm.name.en}); the Ontario standard lease / TRREB form does not apply.` } })
    }
  }
  // 5 · dates
  checked.push(`${c}-lease-dates`)
  if (input.start_date && input.end_date && input.end_date < input.start_date) {
    f.push({ rule: `${c}-lease-dates`, statute: r.leaseForm.cite, severity: 'block', message: { zh: '结束日期早于开始日期。', en: 'End date is before the start date.' } })
  }
  return { passed: !f.some((x) => x.severity === 'block'), findings: f, checked }
}

export type LeaseTermsArgs = { province?: unknown } & Record<string, unknown>

export function coreLeaseTermsCheck(input: LeaseTermsArgs): ComplianceOut {
  const province = provinceParam(input.province)
  const money = { min: 0, max: 1_000_000 }
  const lt: LeaseTermsInput = {
    rent_amount: vNumber(input, 'rent_amount', money),
    deposit_amount: vNumber(input, 'deposit_amount', money),
    form_type: vString(input, 'form_type', { max: 40 }),
    schedule_b: vString(input, 'schedule_b'),
    start_date: vDate(input, 'start_date'),
    end_date: vDate(input, 'end_date'),
  }
  if (province === 'ON') {
    const { passed, findings } = checkLeaseTerms(lt)
    return { province, passed, findings: findings.map((f) => toFindingOut(province, f)), checked: ON_LEASE_CHECKED }
  }
  const r = PROVINCE_RULES[province]
  const { passed, findings, checked } = provinceLeaseTerms(r, lt)
  const name = { zh: provinceName(province, 'zh'), en: provinceName(province, 'en') }
  return {
    province, passed, findings: findings.map((f) => toFindingOut(province, f)), checked,
    notes: {
      zh: `${name.zh}只核三类：押金上限 / 钥匙押金 / 预收租金（另核租约格式与日期），依据该省已核实的官方条文；其他条款不在本检查范围内。`,
      en: `For ${name.en} this check covers three things — the deposit cap, key deposits and rent in advance (plus the lease form and dates) — from the province's verified official sources; other terms are out of scope.`,
    },
  }
}

// ── Ontario date arithmetic ─────────────────────────────────────────────────

export type GuidelineOut = { province: 'ON'; effective: string; year: number; pct: number; published: boolean; cap: number; n1_deadline: string; notice_days: number }

export function coreGuideline(input: Record<string, unknown>): GuidelineOut {
  const effective = vDate(input, 'effective', { required: true })!
  const g = guidelineFor(effective)
  return { province: 'ON', effective, year: g.year, pct: g.pct, published: g.published, cap: RENT_GUIDELINE_CAP, n1_deadline: n1DeadlineFor(effective), notice_days: N1_NOTICE_DAYS }
}

const N4_METHODS = ['hand', 'mail', 'email'] as const
export type N4Method = (typeof N4_METHODS)[number]
export type N4Out = { province: 'ON'; served: string; method: N4Method; deemed_served: string; earliest_termination: string; termination_days: number; mail_days: number }

export function coreN4EarliestTermination(input: Record<string, unknown>): N4Out {
  const served = vDate(input, 'served', { required: true })!
  const method = vEnum(input, 'method', N4_METHODS, { fallback: 'hand' })!
  const deemed = new Date(`${served}T00:00:00Z`)
  if (method === 'mail') deemed.setUTCDate(deemed.getUTCDate() + N4_MAIL_DEEMED_SERVICE_DAYS)
  return {
    province: 'ON', served, method, deemed_served: deemed.toISOString().slice(0, 10),
    earliest_termination: n4EarliestTermination(served, method), termination_days: N4_TERMINATION_DAYS, mail_days: N4_MAIL_DEEMED_SERVICE_DAYS,
  }
}

export type LatePaymentOut = {
  province: 'ON'
  as_of_date: string
  late: string[]
  persistent: boolean
  window: [string, string] | null
  definition: { grace_days: number; count: number; window_months: number }
}

/** Re-throw an ApiError with the field path prefixed (`periods[3].due_date: …`). */
function prefixed<T>(prefix: string, fn: () => T): T {
  try {
    return fn()
  } catch (e) {
    if (e instanceof ApiError && e.code === 'invalid_input') throw new ApiError(e.code, `${prefix}${e.message}`, e.status)
    throw e
  }
}

export function corePersistentLatePayment(input: Record<string, unknown>): LatePaymentOut {
  const raw = vArray(input, 'periods', { max: PERIODS_MAX, min: 1, required: true })
  const periods = raw.map((p, i) => {
    if (!p || typeof p !== 'object' || Array.isArray(p)) throw new ApiError('invalid_input', `periods[${i}]: must be an object { due_date, paid_at }`)
    const o = p as Record<string, unknown>
    return prefixed(`periods[${i}].`, () => ({ due_date: vDate(o, 'due_date', { required: true })!, paid_at: vDateTime(o, 'paid_at') }))
  })
  const asOf = vDate(input, 'as_of') ?? new Date().toISOString().slice(0, 10)
  const r = persistentLatePayment(periods, `${asOf}T23:59:59Z`)
  return {
    province: 'ON', as_of_date: asOf, late: r.late, persistent: r.persistent, window: r.window ?? null,
    definition: { grace_days: PERSISTENT_LATE_GRACE_DAYS, count: PERSISTENT_LATE_COUNT, window_months: PERSISTENT_LATE_WINDOW_MONTHS },
  }
}

// ── Rent benchmark (read-only DB) ───────────────────────────────────────────

const BENCH_TYPES = ['apartment', 'condo', 'townhouse', 'house'] as const
export type BenchType = (typeof BENCH_TYPES)[number]

export type BenchmarkFigure = { source: 'cmhc' | 'statcan'; kind: BenchmarkKind; area: string; period: string; avg: number; prev_avg: number | null; quality: string | null; label: Bi }
export type RentBenchmarkOut = {
  province: 'ON'
  area: string | null
  bedrooms: number
  type: BenchType
  benchmark: BenchmarkFigure
  alt?: { kind: BenchmarkKind; area: string; period: string; avg: number; quality: string | null }
  asking?: { period: string; avg: number; prev_avg: number | null }
  history?: { period: string; avg: number }[]
  attribution: Bi
}

/** The slice of a supabase-js client the benchmark reader needs (service role or anon — the table is public-read). */
export type BenchmarkClient = { from: (table: string) => any }

type Row = { source: string; kind: string; period: string; area: string; bedrooms: number; avg_rent: number | string; prev_avg: number | string | null; quality: string | null }

async function rowsVia(sb: BenchmarkClient, q: { source: string; kind: string; bedrooms: number; areas?: string[] }): Promise<Row[]> {
  try {
    let query = sb.from('rent_benchmarks').select('source,kind,period,area,bedrooms,avg_rent,prev_avg,quality').eq('source', q.source).eq('kind', q.kind).eq('bedrooms', q.bedrooms)
    if (q.areas) query = query.in('area_key', q.areas.map((a) => a.toLowerCase()))
    const { data, error } = await query.order('period', { ascending: false }).limit(12)
    if (error || !Array.isArray(data)) return []
    return data as Row[]
  } catch {
    return []
  }
}

/** readRentBenchmark's selection, run through a supabase client instead of the anon REST fetch. */
async function readViaClient(sb: BenchmarkClient, bed: number, areaTerms: string[], type: BenchType): Promise<RentBenchmark | null> {
  const candidates = benchmarkCandidates(areaTerms, type)
  const [askingRows, ...cmhcSets] = await Promise.all([
    rowsVia(sb, { source: 'statcan', kind: 'asking', bedrooms: bed }),
    ...candidates.map((c) => rowsVia(sb, { source: 'cmhc', kind: c.kind, bedrooms: bed, areas: c.areas })),
  ])
  const asking = askingRows[0] ? { period: askingRows[0].period, avg: Number(askingRows[0].avg_rent), prev_avg: askingRows[0].prev_avg != null ? Number(askingRows[0].prev_avg) : null } : undefined
  const history = askingRows.length ? askingRows.slice(0, 8).map((r) => ({ period: r.period, avg: Number(r.avg_rent) })).reverse() : undefined
  const pick = (i: number): RentBenchmark | null => {
    const rows = cmhcSets[i]
    if (!rows.length) return null
    const latest = rows.map((r) => r.period).sort().at(-1)!
    for (const area of candidates[i].areas) {
      const row = rows.find((r) => r.period === latest && r.area.toLowerCase() === area.toLowerCase())
      if (row) return { source: 'cmhc', kind: candidates[i].kind, period: row.period, area: row.area, avg: Number(row.avg_rent), prev_avg: row.prev_avg != null ? Number(row.prev_avg) : null, quality: row.quality }
    }
    return null
  }
  const found = candidates.map((_, i) => pick(i))
  const primary = found.find((b): b is RentBenchmark => !!b)
  if (primary) {
    const alt = found.find((b) => b && b !== primary) || undefined
    return { ...primary, history, asking, alt: alt ? { kind: alt.kind, area: alt.area, period: alt.period, avg: alt.avg, quality: alt.quality } : undefined }
  }
  if (asking) return { source: 'statcan', kind: 'asking', period: asking.period, area: 'Toronto CMA', avg: asking.avg, prev_avg: asking.prev_avg, history, asking }
  return null
}

/**
 * `sb` = a supabase-js client (service role on the server; any role can read
 * the table). Pass null to fall back to the anon REST reader in
 * lib/market/rentBenchmark.ts. Only Ontario has figures: other codes →
 * not_available; nothing in the table for the bedroom bucket → not_available.
 */
export async function coreRentBenchmark(sb: BenchmarkClient | null | undefined, input: Record<string, unknown>): Promise<RentBenchmarkOut> {
  const province = provinceParam(input.province)
  if (province !== 'ON') throw new ApiError('not_available', `Rent benchmarks are only available for Ontario (province=ON) at this time; ${province} has no figures.`, 404)
  const area = vString(input, 'area', { max: 200 })
  const bedrooms = vNumber(input, 'bedrooms', { min: 0, max: 10, integer: true })
  const type = vEnum(input, 'type', BENCH_TYPES, { fallback: 'apartment' })!
  const bed = bedBucket(bedrooms)!
  const terms = area ? [area] : []
  const b = sb ? await readViaClient(sb, bed, terms, type) : await readRentBenchmark(bedrooms, terms, type)
  if (!b) throw new ApiError('not_available', 'No benchmark row for this area / bedroom count — the benchmark table may be empty or unreachable.', 404)
  return {
    province: 'ON', area, bedrooms: bed, type,
    benchmark: { source: b.source, kind: b.kind, area: b.area, period: b.period, avg: b.avg, prev_avg: b.prev_avg ?? null, quality: b.quality ?? null, label: { zh: benchmarkLabel(b, 'zh'), en: benchmarkLabel(b, 'en') } },
    ...(b.alt ? { alt: { kind: b.alt.kind, area: b.alt.area, period: b.alt.period, avg: b.alt.avg, quality: b.alt.quality ?? null } } : {}),
    ...(b.asking ? { asking: { period: b.asking.period, avg: b.asking.avg, prev_avg: b.asking.prev_avg ?? null } } : {}),
    ...(b.history ? { history: b.history } : {}),
    attribution: { zh: benchmarkAttribution(b, 'zh'), en: benchmarkAttribution(b, 'en') },
  }
}

/** Every rule id the public rules page / compliance checks know, for the OpenAPI enum and the docs page. */
export function allRuleIds(): string[] {
  const ids = ONTARIO_RULES.map((r) => r.id)
  for (const r of Object.values(PROVINCE_RULES)) ids.push(...provinceRuleOuts(r).map((x) => x.id))
  return ids
}

