// Offer / lease-points checklist for agents (V1.0 stage 2 · 丙 #14).
//
// An agent pastes the key points of an offer they wrote elsewhere (rent, dates,
// deposit, the extra clauses) and this module marks — deterministically, with
// regexes and amount parsing, never a model — what the Residential Tenancies
// Act would not allow and what the Ontario standard lease will still need.
//
// Boundaries (design/v1-scope-and-roadmap-2026-10.md 丙 #14; legal-check §2.4, §4):
//   · it CHECKS. It does not draft, rewrite or produce any OREA form — the
//     negotiation of terms is the registrant's own work (Law Society Act s.1(6) 4);
//   · outside Ontario it says only "confirm that province's rules" and applies
//     no Ontario section (user 2026-10-02: 外省不套安省条款);
//   · the pasted text is never stored by the caller (the page keeps it in state).
//
// The detection regexes for pet bans, A/C bans, fees and extra deposits live in
// lib/ontario/rules.ts (read-only here): the text is folded into a
// LeaseTermsInput and checkLeaseTerms() runs first; this module only adds the
// offer-specific parsing (deposit months, rent increase %, post-dated cheques,
// early-termination penalties, the standard-lease items the offer left out).

import { checkLeaseTerms, guidelineFor, mentionsFee, ruleById, type RuleSeverity } from '@/lib/ontario/rules'
import { normalizeProvince, provinceName } from '@/lib/provinces/detect'

export type OfferFindingSeverity = RuleSeverity

export type OfferFinding = {
  /** Stable id for tests and rendering (one per check; `missing-<item>` for omissions). */
  id: string
  severity: OfferFindingSeverity
  zh: string
  en: string
  /** The `lib/ontario/rules.ts` rule id when one exists. */
  rule?: string
  /** Statute cited when there is no numbered rule (e.g. RTA s.108). */
  statute?: string
  /** Where to read more: `/rules#<rule id>` when a rule exists, `/rules` otherwise. */
  href: string
}

export type ParsedOffer = {
  rent: number | null
  deposit: number | null
  /** Deposit expressed in months of rent when the text says so ("两个月" / "two months"). */
  depositMonths: number | null
  keyDeposit: number | null
  startDate: string | null
  endDate: string | null
  /** The % figure next to an increase word, when any. */
  increasePct: number | null
}

export type OfferCheckOptions = { province?: string | null }

export type OfferCheckResult = { findings: OfferFinding[]; parsed: ParsedOffer; province: string }

/** Every check this module can emit, for the page legend and the guard. */
export const OFFER_CHECK_IDS = [
  'deposit-over-one-month', 'deposit-purpose', 'fee-to-tenant', 'key-deposit', 'pet-ban', 'ac-ban',
  'increase-above-guideline', 'increase-automatic', 'post-dated-cheques', 'early-termination-penalty',
  'dates-order', 'missing-term', 'missing-rent', 'missing-payment-day', 'missing-services', 'missing-deposit',
  'missing-address', 'missing-signature-date', 'province-outside-ontario', 'entry-without-notice',
] as const

const href = (rule?: string) => (rule && ruleById(rule) ? `/rules#${rule}` : '/rules')

// ── amount / date parsing ───────────────────────────────────────────────────

const MONEY = String.raw`\$?\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?`

function toNumber(whole: string, cents?: string): number {
  const n = Number(whole.replace(/,/g, ''))
  return cents ? n + Number(cents) / (cents.length === 1 ? 10 : 100) : n
}

function firstMoney(text: string, patterns: RegExp[]): number | null {
  for (const re of patterns) {
    const m = re.exec(text)
    if (m) {
      const n = toNumber(m[1], m[2])
      if (Number.isFinite(n) && n > 0) return n
    }
  }
  return null
}

const RENT_RES = [
  new RegExp(String.raw`(?:月租|租金|rent)(?:al)?\s*(?:amount|of|is|为|:|：|=|每月|per\s+month|monthly)?\s*(?:is|为|:|：|=)?\s*${MONEY}`, 'i'),
  new RegExp(String.raw`${MONEY}\s*(?:/|per|每|a)\s*(?:month|mo\b|月)`, 'i'),
  new RegExp(String.raw`每月\s*${MONEY}`, 'i'),
]
// The gap between the word and the amount stops at punctuation (「押金两个月。租期 2026 年」must not
// read the year as the amount) and a figure followed by 年 is a year, not money.
const DEPOSIT_RES = [
  new RegExp(String.raw`(?:押金|deposit|LMR|last\s+month'?s?\s+rent)(?:\s*(?:of|amount|is|为|:|：|=|\(|（))?[^\d$\n。；;，,]{0,20}${MONEY}(?!\s*年)`, 'i'),
]
const KEY_DEPOSIT_RES = [
  new RegExp(String.raw`(?:钥匙押金|key\s+deposit|key\s+fee)[^\d$\n]{0,20}${MONEY}`, 'i'),
]

const CN_NUM: Record<string, number> = { 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 }
const EN_NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 }

function depositMonths(text: string): number | null {
  const cn = /(?:押金|定金)[^\n。；;]{0,16}?([一两二三四五六\d])\s*(?:个)?月/i.exec(text)
  if (cn) return CN_NUM[cn[1]] ?? Number(cn[1])
  const cn2 = /([一两二三四五六\d])\s*(?:个)?月(?:的)?(?:租金)?(?:作为|做|当)?押金/i.exec(text)
  if (cn2) return CN_NUM[cn2[1]] ?? Number(cn2[1])
  const en = /deposit[^.\n;]{0,30}?\b(one|two|three|four|five|six|\d)\s+months?'?(?:\s+(?:of\s+)?rent)?/i.exec(text)
  if (en) return EN_NUM[en[1].toLowerCase()] ?? Number(en[1])
  const en2 = /\b(one|two|three|four|five|six|\d)\s+months?'?\s+(?:of\s+)?(?:rent\s+)?(?:as\s+(?:a\s+)?|security\s+)?deposit/i.exec(text)
  if (en2) return EN_NUM[en2[1].toLowerCase()] ?? Number(en2[1])
  return null
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 }

function iso(y: number, m: number, d: number): string | null {
  if (!(y >= 1990 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

type DateHit = { iso: string; index: number }

/** Every date the text prints (ISO, slash, English and Chinese forms), in text order with its position. */
function dateHits(text: string): DateHit[] {
  const out: DateHit[] = []
  const push = (d: string | null, i: number | undefined) => { if (d) out.push({ iso: d, index: i ?? 0 }) }
  for (const m of text.matchAll(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/g)) push(iso(+m[1], +m[2], +m[3]), m.index)
  for (const m of text.matchAll(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/g)) push(iso(+m[1], +m[2], +m[3]), m.index)
  for (const m of text.matchAll(/\b(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/gi)) push(iso(+m[3], MONTHS[m[1].toLowerCase()], +m[2]), m.index)
  for (const m of text.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?,?\s+(\d{4})\b/gi)) push(iso(+m[3], MONTHS[m[2].toLowerCase()], +m[1]), m.index)
  return out.sort((a, b) => a.index - b.index)
}

/** Every date the text prints, as unique ISO strings in the order they appear. */
export function datesIn(text: string): string[] {
  return Array.from(new Set(dateHits(text).map((h) => h.iso)))
}

// Dates that belong to signing / irrevocability are not the term: drop any date whose preceding
// 30 characters say so. The first remaining date in TEXT order is the start and the last the end —
// text order, not sorted, so "commencing 2027-11-01 and ending 2026-11-30" is caught as reversed.
const SIGN_CONTEXT = /签|sign|dated?\b|accept|irrevocab|execut|offer\s+(?:date|open)|valid\s+until|expires?\s+(?:at|on)/i
function termDates(text: string): { start: string | null; end: string | null } {
  const hits = dateHits(text)
  const term = hits.filter((h) => !SIGN_CONTEXT.test(text.slice(Math.max(0, h.index - 30), h.index)))
  const list = Array.from(new Set((term.length ? term : hits).map((h) => h.iso)))
  return { start: list[0] ?? null, end: list.length >= 2 ? list[list.length - 1] : null }
}

const INCREASE_WORDS = /涨租|涨幅|上调|调涨|调升|递增|上涨|每年(?:自动)?(?:增加|加租|涨)|加租|rent\s+(?:will\s+|shall\s+|to\s+|may\s+)?(?:increase|escalat|rise|go\s+up|be\s+increased)|(?:increase|escalat\w*|adjust\w*)\s+(?:of|by|to)\b|annual\s+(?:rent\s+)?(?:increase|escalation|adjustment)|escalation\s+clause/i
const AUTO_INCREASE = /每年(?:自动)?(?:增加|加租|涨|上调|递增|调涨)|自动(?:涨|上调|增加|递增)|annual(?:ly)?\s+(?:rent\s+)?(?:increase|escalat|adjust)|automatic(?:ally)?\s+(?:increase|escalat|adjust)|(?:increase|escalat\w*)\s+(?:each|every)\s+year|year\s+(?:two|2|three|3)\s+rent|\bCPI\b|市场价(?:格)?(?:调整|上调)|market\s+(?:rate|rent)\s+(?:adjust|increase)/i

function increasePct(text: string): number | null {
  let best: number | null = null
  for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s*%/g)) {
    const i = m.index ?? 0
    const window = text.slice(Math.max(0, i - 60), i + m[0].length + 40)
    if (!INCREASE_WORDS.test(window)) continue
    const pct = Number(m[1])
    if (Number.isFinite(pct) && (best == null || pct > best)) best = pct
  }
  return best
}

export function parseOffer(text: string): ParsedOffer {
  const t = text || ''
  const rent = firstMoney(t, RENT_RES)
  const months = depositMonths(t)
  const depositAmount = firstMoney(t, DEPOSIT_RES)
  // "两个月 / two months" is the deposit the offer means; an amount wins only when no months are stated.
  const deposit = months != null && rent != null ? months * rent : depositAmount
  const term = termDates(t)
  return {
    rent,
    deposit,
    depositMonths: months,
    keyDeposit: firstMoney(t, KEY_DEPOSIT_RES),
    startDate: term.start,
    endDate: term.end,
    increasePct: increasePct(t),
  }
}

// ── the offer-specific patterns ─────────────────────────────────────────────

const DEPOSIT_PURPOSE_RE = /\bpet\s+(?:deposit|fee)\b|宠物(?:押金|费)|clean(?:ing)?\s+(?:deposit|fee)|清洁(?:押金|费)|damage\s+deposit|损坏押金|security\s+deposit|保证金|(?:押金|deposit)[^\n。;]{0,30}?(?:用于|用作|抵扣?|cover|covers|applied\s+to|for)\s*(?:损坏|维修|清洁|damage|repair|cleaning|any\s+damage)/i
// lib/ontario/rules.ts catches "no air conditioners" / "not permitted"; offers also write it as a duty.
const AC_BAN_EXTRA_RE = /\b(?:shall|may|must|will|can)\s+not\s+(?:install|use|have|operate|place)\s+(?:any\s+|an?\s+)?(?:window\s+|portable\s+)?(?:air[\s-]?conditioner|a\/?c\b|ac\s+unit)|(?:不得|不能|不可|禁止|不允许|不准)(?:自行)?(?:安装|装|使用)(?:任何)?(?:空调|冷气)/i
const POST_DATED_RE = /post[-\s]?dated\s+cheques?|预开(?:的)?支票|远期支票|pre[-\s]?authori[sz]ed\s+(?:debit|payment)s?|automatic\s+(?:debit|withdrawal|payment|bank\s+payment)s?|auto[-\s]?(?:debit|pay)|自动(?:扣款|转账|付款|扣除)|\bPAD\b/i
const REQUIRED_RE = /\b(?:required|must|mandatory|shall\s+provide|as\s+a\s+condition|condition\s+of|agrees?\s+to\s+provide|will\s+provide|to\s+provide)\b|须|必须|需要?提供|要求|作为(?:签约|租赁)?(?:的)?条件|应提供|提供/i
const ENTRY_ANYTIME_RE = /(?:enter|entry|access|inspect)\w*[^.\n]{0,60}?(?:at any time|any time|anytime|without (?:prior |advance |any )?notice|无需通知|不经通知|随时(?:进入|入内|检查))|(?:随时|无需通知|不经通知)[^。\n]{0,20}(?:进入|入内|检查|看房)/i
const EARLY_TERM_RE = /提前(?:解约|退租|终止|搬离|离开)[^\n。;]{0,40}?(?:罚|违约金|扣除?|赔偿|没收|支付|付)|(?:违约金|罚金|罚款)[^\n。;]{0,30}?(?:提前|解约|退租)|(?:early\s+terminat\w*|break(?:ing|s)?\s+(?:the\s+|this\s+)?lease|terminat\w*\s+(?:the\s+lease\s+)?early|vacat\w*\s+(?:before|prior\s+to)\s+(?:the\s+)?(?:end|expiry))[^.\n;]{0,60}?(?:penalt\w*|fee|forfeit\w*|charge|liquidated|pay|owe|liable|lose\w*)|(?:penalt\w*|fee|forfeit\w*|liquidated\s+damages?)[^.\n;]{0,50}?(?:early\s+terminat\w*|break(?:ing|s)?\s+(?:the\s+|this\s+)?lease|terminat\w*\s+early)/i

// What the Ontario standard lease (2229E) must carry; an offer that omits one is not wrong,
// but the item has to be settled before the lease is signed.
const PRESENT = {
  term: /租期|起租|起始|开始日|到期|结束日|终止日|固定期|月租制|按月|\b(?:term|commenc\w*|start(?:ing|s)?\s+(?:date|on)|lease\s+(?:start|end)|end(?:ing|s)?\s+(?:date|on)|expir\w*|month[-\s]to[-\s]month|fixed[-\s]term|\d+[-\s]?(?:year|month)s?\s+(?:term|lease))\b/i,
  rent: /月租|租金|\brent(?:al)?\b/i,
  paymentDay: /每月\s*\d{1,2}\s*[日号]|每月(?:的)?(?:第)?[一二三]?[日号]?(?:一|1)\s*[日号]|付款日|付租日|支付日|交租日|月初|\b(?:due|payable|paid)\s+(?:on|by)\b|(?:first|1st|last|\d{1,2}(?:st|nd|rd|th))\s+(?:day\s+)?of\s+(?:each|every|the)\s+month|payment\s+(?:date|day)|rent\s+day/i,
  services: /水电|水费|电费|煤气|燃气|暖气|供暖|网络|宽带|停车|车位|包含|包括|含(?:水|电|暖|网)|\b(?:utilit\w*|hydro|electricity|water|heat(?:ing)?|gas|internet|wifi|parking|included|includes|inclusive|extra|tenant\s+pays|landlord\s+pays)\b/i,
  deposit: /押金|定金|\b(?:deposit|LMR|last\s+month)\b/i,
  address: /\b\d{1,6}[A-Za-z]?\s+[A-Za-z][A-Za-z.'-]*(?:\s+[A-Za-z][A-Za-z.'-]*){0,4}\s+(?:st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|cres|crescent|crt|court|ct|lane|ln|way|pl|place|terr|terrace|trail|circle|cir|pkwy|parkway|sq|square|hwy|highway)\b|地址|门牌|\b(?:unit|suite|apt|apartment)\s*#?\s*\w+|[一-龥]+(?:路|街|道|大道|巷)\s*\d+\s*号?|[0-9]{1,6}\s*号/i,
  signatureDate: /签(?:署|字|约)?(?:的)?日期|签于|于\s*\d{4}\s*年[^\n]{0,12}签|\b(?:signed|signature|execution|executed|accepted)\s+(?:on|date|dated|at)\b|\bdated?\s+(?:this|the)\b|date\s+of\s+(?:signature|signing|acceptance|execution)|irrevocab\w*/i,
}

// ── main ────────────────────────────────────────────────────────────────────

const fmt = (n: number) => `$${n.toLocaleString('en-CA', { maximumFractionDigits: 2 })}`

/**
 * Deterministic checklist for pasted offer / lease points. Returns findings in
 * severity order (block → warn → info). Empty text returns no findings.
 */
export function checkOfferText(text: string, opts: OfferCheckOptions = {}): OfferCheckResult {
  const province = normalizeProvince(opts.province ?? 'ON') ?? 'ON'
  const t = (text || '').trim()
  const parsed = parseOffer(t)
  const findings: OfferFinding[] = []
  if (!t) return { findings, parsed, province }

  // Outside Ontario: one line, no Ontario sections (lib/provinces holds that province's facts;
  // the agent confirms the offer against them — this checklist is Ontario-only).
  if (province !== 'ON') {
    const name = { zh: provinceName(province, 'zh'), en: provinceName(province, 'en') }
    findings.push({
      id: 'province-outside-ontario', severity: 'info', href: '/rules',
      zh: `这套房在${name.zh}：安省的押金、费用、条款规则不适用。请按该省的住宅租赁法规逐项核对（押金上限、允许的费用、租约格式、涨租规则），或找熟悉该省规则的人确认。`,
      en: `This home is in ${name.en}: Ontario's deposit, fee and clause rules do not apply. Check each point against that province's residential tenancy rules (deposit limit, permitted charges, lease form, rent increases) or confirm with someone who knows them.`,
    })
    return { findings, parsed, province }
  }

  // 1 · the shared RTA detectors (deposit cap, pet ban, A/C ban, fees / extra deposits, date order).
  const base = checkLeaseTerms({
    rent_amount: parsed.rent,
    deposit_amount: parsed.deposit,
    schedule_b: t,
    start_date: parsed.startDate,
    end_date: parsed.endDate,
  })
  const has = (rule: string, statuteIncludes?: string) => base.findings.some((f) => f.rule === rule && (!statuteIncludes || f.statute.includes(statuteIncludes)))

  // Deposit over one month — from the amount, or from "两个月 / two months".
  const depositOver = has('RTA-106-deposit-cap') || (parsed.depositMonths != null && parsed.depositMonths > 1)
  if (depositOver) {
    const what = parsed.depositMonths != null && parsed.depositMonths > 1
      ? { zh: `押金写成 ${parsed.depositMonths} 个月租金`, en: `the deposit is ${parsed.depositMonths} months' rent` }
      : { zh: `押金 ${fmt(parsed.deposit!)} 超过一个月租金 ${fmt(parsed.rent!)}`, en: `the deposit ${fmt(parsed.deposit!)} exceeds one month's rent ${fmt(parsed.rent!)}` }
    findings.push({
      id: 'deposit-over-one-month', severity: 'block', rule: 'RTA-106-deposit-cap', href: href('RTA-106-deposit-cap'),
      zh: `${what.zh}。租金押金最多一个月（或一个租期）租金，且只能抵最后一个月租金（RTA s.106(2)）。「首月 + 末月」是首月租金加一个月押金，不是两个月押金。`,
      en: `${what.en}. A rent deposit may be at most one month (or one rental period) of rent and applies only to the last month (RTA s.106(2)). "First and last" means first month's rent plus a one-month deposit, not a two-month deposit.`,
    })
  }

  // Deposit named as damage / cleaning / pet / security, or applied to anything but the last month.
  if (DEPOSIT_PURPOSE_RE.test(t)) {
    findings.push({
      id: 'deposit-purpose', severity: 'block', rule: 'RTA-134-no-fees', href: href('RTA-134-no-fees'),
      zh: '押金写成了损坏 / 清洁 / 宠物 / 保证金，或说要抵维修清洁。安省只允许租金押金（只抵最后一个月租金，s.105–106）和合理的钥匙押金；其他押金一律禁止（s.134(2)）。',
      en: 'The deposit is described as a damage / cleaning / pet / security deposit, or as covering repairs or cleaning. Ontario allows only a rent deposit (applied to the last month, s.105–106) and a reasonable key deposit; any other deposit is prohibited (s.134(2)).',
    })
  }

  // Any charge to the tenant: application / screening / credit-check / processing / admin fees.
  if (mentionsFee(t)) {
    findings.push({
      id: 'fee-to-tenant', severity: 'block', rule: 'RTA-134-no-fees', href: href('RTA-134-no-fees'),
      zh: '出现向租客收费的条款（申请费 / 筛查费 / 信用检查费 / 手续费 / 行政费）。房东或替房东行事的任何人都不得向租客或申请人收取这类费用（RTA s.134(1)–(2)）。',
      en: 'The text charges the tenant a fee (application / screening / credit-check / processing / admin). Neither the landlord nor anyone acting for the landlord may charge tenants or applicants such a fee (RTA s.134(1)–(2)).',
    })
  }

  // Key deposit above a reasonable replacement cost (same threshold as the listing check).
  if (parsed.keyDeposit != null && parsed.keyDeposit > 250) {
    findings.push({
      id: 'key-deposit', severity: 'warn', rule: 'OREG516-17-key-deposit', href: href('OREG516-17-key-deposit'),
      zh: `钥匙押金 ${fmt(parsed.keyDeposit)} 看起来高于合理更换成本。钥匙押金只能是更换钥匙 / 门卡的实际成本，退还钥匙时须退还（O. Reg. 516/06 s.17(1)）。`,
      en: `The key deposit ${fmt(parsed.keyDeposit)} looks above a reasonable replacement cost. It may only be the actual cost of replacing keys / fobs and must be refunded when keys are returned (O. Reg. 516/06 s.17(1)).`,
    })
  }

  if (has('RTA-14-no-pet-clause')) {
    findings.push({
      id: 'pet-ban', severity: 'block', rule: 'RTA-14-no-pet-clause', href: href('RTA-14-no-pet-clause'),
      zh: '出现「禁止养宠物」条款。安省租约中禁宠条款无效（RTA s.14）；房东只能在宠物造成实质干扰、损坏或过敏时向 LTB 申请。要约里写了也不生效，标准租约里不能再写。',
      en: 'There is a "no pets" clause. Pet bans are void in Ontario leases (RTA s.14); a landlord can only go to the LTB over actual interference, damage or allergies. It has no effect in the offer and cannot go into the standard lease.',
    })
  }

  if (has('RTA-36-1-tenant-ac') || AC_BAN_EXTRA_RE.test(t)) {
    findings.push({
      id: 'ac-ban', severity: 'block', rule: 'RTA-36-1-tenant-ac', href: href('RTA-36-1-tenant-ac'),
      zh: '出现禁止租客安装空调的条款。2026-07-01 起租客可自行安装空调（RTA s.36.1），这类条款无效；房东可对合理的安装方式与电费分摊作约定。',
      en: 'There is a clause banning the tenant from installing an air conditioner. Since 2026-07-01 tenants may install one (RTA s.36.1) and such a clause is void; the landlord may agree reasonable installation terms and a hydro contribution.',
    })
  }

  // Rent increase written into the offer: above the guideline blocks; any pre-set annual step warns.
  if (parsed.increasePct != null) {
    const effective = parsed.endDate ? addDays(parsed.endDate, 1) : parsed.startDate ? addYears(parsed.startDate, 1) : null
    const g = guidelineFor(effective)
    if (parsed.increasePct > g.pct + 1e-9) {
      findings.push({
        id: 'increase-above-guideline', severity: 'block', rule: 'RTA-120-guideline', href: href('RTA-120-guideline'),
        zh: `写明涨租 ${parsed.increasePct}%，高于 ${g.year} 年指导比例 ${g.pct}%${g.published ? '' : '（该年尚未公布，按最新已公布值）'}。超过指导比例须先向 LTB 申请（s.126）；2018-11-15 后首次入住的单位才不受此限（s.6.1）。要约里不能预先约定超指导线的涨幅。`,
        en: `A ${parsed.increasePct}% rent increase is written in, above the ${g.year} guideline of ${g.pct}%${g.published ? '' : ' (not yet published for that year; latest published figure used)'}. Above-guideline increases need LTB approval first (s.126); only units first occupied after 2018-11-15 are exempt (s.6.1). An offer cannot pre-agree an above-guideline step.`,
      })
    } else {
      findings.push({
        id: 'increase-automatic', severity: 'warn', rule: 'RTA-116-n1-90-days', href: href('RTA-116-n1-90-days'),
        zh: `写明涨租 ${parsed.increasePct}%（${g.year} 年指导比例 ${g.pct}%）。即使在指导线内，涨租也只能在上次涨租 / 起租 12 个月后、提前 90 天用 N1 通知生效（s.116, s.119），不能靠要约条款自动生效；指导比例每年由省里公布，提前写死的数字可能与届时不符。`,
        en: `A ${parsed.increasePct}% rent increase is written in (the ${g.year} guideline is ${g.pct}%). Even within the guideline an increase only takes effect 12 months after the last one / the start, with 90 days' notice on Form N1 (s.116, s.119) — never automatically through an offer clause; the guideline is set yearly, so a pre-written figure may not match.`,
      })
    }
  } else if (AUTO_INCREASE.test(t)) {
    findings.push({
      id: 'increase-automatic', severity: 'warn', rule: 'RTA-116-n1-90-days', href: href('RTA-116-n1-90-days'),
      zh: '出现每年 / 自动 / 按 CPI 或市场价涨租的说法。安省涨租只能在 12 个月后、提前 90 天用 N1 通知生效（s.116, s.119），且不超过当年指导比例（s.120）；要约里的自动涨租条款不生效。',
      en: 'The text sets an annual / automatic / CPI- or market-based rent increase. In Ontario an increase only takes effect 12 months on, with 90 days\' notice on Form N1 (s.116, s.119), and within that year\'s guideline (s.120); an automatic-increase clause in an offer has no effect.',
    })
  }

  // Post-dated cheques / automatic debit as a condition (RTA s.108).
  if (POST_DATED_RE.test(t)) {
    const required = REQUIRED_RE.test(t)
    findings.push({
      id: 'post-dated-cheques', severity: required ? 'block' : 'warn', rule: 'RTA-108-post-dated-cheques', statute: 'RTA s.108', href: href('RTA-108-post-dated-cheques'),
      zh: required
        ? '要求租客提供预开支票或自动扣款。房东或替房东行事的人不得把预开支票 / 自动扣款作为签约或续租的条件（RTA s.108）；可以请租客自愿选择，不能要求。'
        : '提到预开支票或自动扣款。它只能是租客自愿选择的付款方式，不能作为签约或续租的条件（RTA s.108）——请确认要约里没有「须 / 必须提供」的措辞。',
      en: required
        ? 'The tenant is required to provide post-dated cheques or automatic debit. Neither the landlord nor anyone acting for the landlord may make them a condition of the tenancy (RTA s.108); the tenant may offer them, but cannot be required to.'
        : 'Post-dated cheques or automatic debit are mentioned. They can only be a payment method the tenant chooses, never a condition of the tenancy (RTA s.108) — make sure the offer does not say "must provide".',
    })
  }

  // Landlord entry "at any time / without notice" (prod check 2026-10-16): RTA s.27 requires
  // 24 hours' written notice, 8:00–20:00, except the s.26 cases.
  if (ENTRY_ANYTIME_RE.test(t)) {
    findings.push({
      id: 'entry-without-notice', severity: 'block', rule: 'RTA-27-entry-notice', href: href('RTA-27-entry-notice'),
      zh: '出现房东可「随时 / 不经通知」进入单位的条款。安省要求提前 24 小时书面通知并在 8:00–20:00 进入（RTA s.27），紧急情况与租客当场同意除外（s.26）；这类条款无效，标准租约里不能再写。',
      en: 'There is a clause letting the landlord enter "at any time" or without notice. Ontario requires 24 hours\' written notice and entry between 8:00 and 20:00 (RTA s.27), except emergencies and consent at the door (s.26); the clause is void and cannot go into the standard lease.',
    })
  }

  // Early-termination penalty.
  if (EARLY_TERM_RE.test(t)) {
    findings.push({
      id: 'early-termination-penalty', severity: 'warn', statute: 'RTA s.4 · s.95 · s.47', href: '/rules',
      zh: '出现提前解约罚金 / 违约金条款。与 RTA 冲突或剥夺租客权利的条款无效（s.4）：固定租期内租客可申请转让（s.95，房东无理拒绝时租客可 30 天退租），房东只能追讨实际损失而不是约定的罚金；到期后租客提前 60 天用 N9 退租（s.47）。',
      en: 'There is an early-termination penalty / liquidated-damages clause. Terms that conflict with the RTA or take away a tenant right are void (s.4): during a fixed term the tenant may ask to assign (s.95; an unreasonable refusal lets them leave on 30 days), and the landlord can claim only actual losses, not a pre-set penalty; at term end the tenant leaves on 60 days\' notice (N9, s.47).',
    })
  }

  if (has('OREG9-18-standard-lease', 'O. Reg. 9/18') && base.findings.some((f) => f.message.en.includes('End date is before'))) {
    findings.push({
      id: 'dates-order', severity: 'block', rule: 'OREG9-18-standard-lease', href: href('OREG9-18-standard-lease'),
      zh: `结束日期 ${parsed.endDate} 早于开始日期 ${parsed.startDate}，请核对日期。`,
      en: `The end date ${parsed.endDate} is before the start date ${parsed.startDate} — check the dates.`,
    })
  }

  // 2 · what the standard lease will still need (info — the offer is not wrong, the lease must carry it).
  const missing: { id: string; zh: string; en: string }[] = []
  if (!PRESENT.term.test(t)) missing.push({ id: 'missing-term', zh: '租期（起租日、固定期限到期日或按月）— 标准租约第 4 节', en: 'the term (start date, fixed-term end date or month-to-month) — standard lease §4' })
  if (!PRESENT.rent.test(t) || parsed.rent == null) missing.push({ id: 'missing-rent', zh: '月租金额 — 标准租约第 5 节', en: 'the monthly rent amount — standard lease §5' })
  if (!PRESENT.paymentDay.test(t)) missing.push({ id: 'missing-payment-day', zh: '每月付租日与付款方式 — 标准租约第 5 节', en: 'the day rent is due each month and how it is paid — standard lease §5' })
  if (!PRESENT.services.test(t)) missing.push({ id: 'missing-services', zh: '租金包含哪些服务与水电（电 / 暖 / 水 / 网 / 车位谁付）— 标准租约第 6–7 节', en: 'which services and utilities the rent includes (hydro / heat / water / internet / parking) — standard lease §6–7' })
  if (!PRESENT.deposit.test(t)) missing.push({ id: 'missing-deposit', zh: '租金押金（最多一个月，只抵最后一月）— 标准租约第 8 节', en: 'the rent deposit (at most one month, applied to the last month) — standard lease §8' })
  if (!PRESENT.address.test(t)) missing.push({ id: 'missing-address', zh: '出租单位地址（含单元号）— 标准租约第 2 节', en: 'the rental unit address (with unit number) — standard lease §2' })
  if (!PRESENT.signatureDate.test(t)) missing.push({ id: 'missing-signature-date', zh: '双方签署日期（以及要约的不可撤回期限）— 标准租约第 17 节', en: 'the date each party signs (and the offer\'s irrevocable date) — standard lease §17' })
  for (const m of missing) {
    findings.push({
      id: m.id, severity: 'info', rule: 'OREG9-18-standard-lease', href: href('OREG9-18-standard-lease'),
      zh: `要约里没写${m.zh}。签安省标准租约时要补上（O. Reg. 9/18）。`,
      en: `The offer does not state ${m.en}. It has to be filled in when the Ontario standard lease is signed (O. Reg. 9/18).`,
    })
  }

  const order: Record<OfferFindingSeverity, number> = { block: 0, warn: 1, info: 2 }
  findings.sort((a, b) => order[a.severity] - order[b.severity])
  return { findings, parsed, province }
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
function addYears(isoDate: string, years: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCFullYear(d.getUTCFullYear() + years)
  return d.toISOString().slice(0, 10)
}

/** Block / warn / info counts, for the page summary line. */
export function summarize(findings: OfferFinding[]): { block: number; warn: number; info: number } {
  return findings.reduce((acc, f) => { acc[f.severity] += 1; return acc }, { block: 0, warn: 0, info: 0 })
}
