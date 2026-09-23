// Ontario rental rules — single source (2026-09-22, lifecycle plan §1).
//
// Every statutory line Stayloop enforces or explains lives here once, with
// its citation, so guardrail / listing publish checks / lease drafting /
// notice letters / the public /rules page / the compliance API all cite the
// same text and a change in law is a one-file edit. Rules are deterministic
// checks over plain inputs — no model involvement.
//
// Citations are to the Residential Tenancies Act, 2006 (RTA), O. Reg. 516/06,
// O. Reg. 9/18 (standard lease), the Ontario Human Rights Code and OHRC Policy
// on human rights and rental housing, the Consumer Reporting Act (CRA), and
// TRESA 2002 / O. Reg. 567/05. Effective dates are the ones this codebase
// relies on, not a legal history.

export type RuleSeverity = 'block' | 'warn' | 'info'
export type RuleArea = 'listing' | 'lease' | 'screening' | 'notice' | 'agent' | 'renewal' | 'tenancy'

// ── Rent increase guideline (RTA s.120) ─────────────────────────────────────
// Published each year by the province (ontario.ca/page/residential-rent-increases),
// capped at 2.5% by statute. Keyed by the calendar year the increase TAKES
// EFFECT — an increase effective 2027-01-01 uses the 2027 figure even when
// the N1 is served in 2026. Add the next year here when the province
// announces it (usually late June) and nothing else needs to change.
export const RENT_GUIDELINE: Record<number, number> = {
  2024: 2.5,
  2025: 2.5,
  2026: 2.1,
  2027: 1.9,
}
export const RENT_GUIDELINE_CAP = 2.5
export const N1_NOTICE_DAYS = 90

export type GuidelineLookup = { year: number; pct: number; published: boolean }

/** Guideline for the year an increase takes effect. Unknown future years
 *  fall back to the latest published figure and say so (`published:false`)
 *  so callers can hedge instead of inventing a number. */
export function guidelineFor(effective: string | Date | null | undefined): GuidelineLookup {
  const d = effective instanceof Date ? effective : effective ? new Date(effective) : new Date()
  const year = Number.isFinite(d.getTime()) ? d.getUTCFullYear() : new Date().getUTCFullYear()
  const years = Object.keys(RENT_GUIDELINE).map(Number).sort((a, b) => a - b)
  if (RENT_GUIDELINE[year] != null) return { year, pct: RENT_GUIDELINE[year], published: true }
  const latest = years[years.length - 1]
  const earliest = years[0]
  if (year < earliest) return { year, pct: RENT_GUIDELINE[earliest], published: false }
  return { year, pct: RENT_GUIDELINE[latest], published: false }
}

/** Latest date an N1 may be served for an increase effective on `effective`
 *  (RTA s.116: at least 90 days before). ISO date, UTC. */
export function n1DeadlineFor(effective: string): string {
  const d = new Date(`${effective.slice(0, 10)}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - N1_NOTICE_DAYS)
  return d.toISOString().slice(0, 10)
}

// ── N4 (RTA s.59, as amended by Bill 60 · in force 2026-09-21) ──────────────
export const N4_TERMINATION_DAYS = 7
export const N4_MAIL_DEEMED_SERVICE_DAYS = 5
export const N4_OLD_FORMS_REJECTED_AFTER = '2026-11-30'

/** Earliest termination date an N4 may state for a notice served on
 *  `served` by the given method (mail adds five deemed-service days). */
export function n4EarliestTermination(served: string, method: 'hand' | 'mail' | 'email' = 'hand'): string {
  const d = new Date(`${served.slice(0, 10)}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + N4_TERMINATION_DAYS + (method === 'mail' ? N4_MAIL_DEEMED_SERVICE_DAYS : 0))
  return d.toISOString().slice(0, 10)
}

// ── Persistent late payment (RTA s.58(1.1) + regulation · 2026-09-21) ───────
// "Rent received more than seven days after the due date, at least three
// times within any six-month period" (payments applied to other amounts owed
// do not count). Deterministic over the ledger rows we hold.
export const PERSISTENT_LATE_GRACE_DAYS = 7
export const PERSISTENT_LATE_COUNT = 3
export const PERSISTENT_LATE_WINDOW_MONTHS = 6

export type LedgerRow = { due_date: string; paid_at: string | null; status?: string | null }

export function persistentLatePayment(rows: LedgerRow[], asOf: string | Date = new Date()): { late: string[]; persistent: boolean; window?: [string, string] } {
  const now = asOf instanceof Date ? asOf : new Date(asOf)
  const lateDues: string[] = []
  for (const r of rows) {
    if (!r.due_date) continue
    const due = new Date(`${r.due_date.slice(0, 10)}T00:00:00Z`)
    if (!Number.isFinite(due.getTime())) continue
    const grace = new Date(due.getTime() + PERSISTENT_LATE_GRACE_DAYS * 86_400_000)
    if (r.paid_at) {
      const paid = new Date(r.paid_at)
      if (Number.isFinite(paid.getTime()) && paid.getTime() > grace.getTime()) lateDues.push(r.due_date.slice(0, 10))
    } else if (r.status === 'late' || (now.getTime() > grace.getTime() && r.status !== 'paid')) {
      // Unpaid past the grace period counts once it is more than 7 days late.
      if (now.getTime() > grace.getTime()) lateDues.push(r.due_date.slice(0, 10))
    }
  }
  lateDues.sort()
  for (let i = 0; i + PERSISTENT_LATE_COUNT - 1 < lateDues.length; i++) {
    const first = new Date(`${lateDues[i]}T00:00:00Z`)
    const last = new Date(`${lateDues[i + PERSISTENT_LATE_COUNT - 1]}T00:00:00Z`)
    const limit = new Date(first)
    limit.setUTCMonth(limit.getUTCMonth() + PERSISTENT_LATE_WINDOW_MONTHS)
    if (last.getTime() < limit.getTime()) return { late: lateDues, persistent: true, window: [lateDues[i], lateDues[i + PERSISTENT_LATE_COUNT - 1]] }
  }
  return { late: lateDues, persistent: false }
}

// ── Toronto Rental Renovation Licence (By-law 53-2025 · 2025-07-31) ─────────
export const TORONTO_RENOVATION_LICENCE = {
  applyWithinDays: 7,
  feePerUnit: 728, // 2026 fee; $700 in 2025
  movingAllowance: { studioOrOneBed: 1500, twoPlusBed: 2500 },
  severanceMonthsOfRentGap: 3,
  since: '2025-07-31',
  url: 'https://www.toronto.ca/services-payments/permits-licences-bylaws/renovictions-bylaw-development/',
} as const

export type Rule = {
  id: string
  area: RuleArea
  statute: string
  title: { zh: string; en: string }
  summary: { zh: string; en: string }
  /** What Stayloop does with it (where it is enforced). */
  enforcement: { zh: string; en: string }
  severity: RuleSeverity
  since: string
}

/** One line stating every published guideline year, for rule text and prompts. */
export const GUIDELINE_TEXT = (() => {
  const years = Object.keys(RENT_GUIDELINE).map(Number).sort((a, b) => a - b).filter((y) => y >= 2026)
  return {
    zh: years.map((y) => `${y} 年 ${RENT_GUIDELINE[y]}%`).join('、'),
    en: years.map((y) => `${y}: ${RENT_GUIDELINE[y]}%`).join(', '),
  }
})()

export const ONTARIO_RULES: Rule[] = [
  {
    id: 'RTA-106-deposit-cap', area: 'listing', statute: 'RTA s.106(2)', severity: 'block', since: '2007-01-31',
    title: { zh: '租金押金不得超过一个月租金', en: 'Rent deposit capped at one month' },
    summary: { zh: '房东只能收取不超过一个月（或一个租期）租金的押金，且只能抵扣最后一个月租金。', en: 'A landlord may collect a rent deposit of at most one month (or one rental period) of rent, applied only to the last month.' },
    enforcement: { zh: '发布向导与租约草稿在押金 > 月租时阻止；房源页「入住前费用一览」标红。', en: 'Listing wizard and lease drafts block when deposit > rent; listing page cost card flags it.' },
  },
  {
    id: 'RTA-106-deposit-interest', area: 'lease', statute: 'RTA s.106(6)', severity: 'info', since: '2007-01-31',
    title: { zh: '押金每年按指导比例付息', en: 'Deposit earns annual interest at the guideline' },
    summary: { zh: '房东须每年按当年租金指导比例向租客支付押金利息。', en: 'The landlord pays the tenant interest on the deposit annually at the guideline rate.' },
    enforcement: { zh: '房源页费用卡与续约触点说明。', en: 'Stated on the listing cost card and renewal touchpoints.' },
  },
  {
    id: 'OREG516-17-key-deposit', area: 'listing', statute: 'O. Reg. 516/06 s.17(1)', severity: 'warn', since: '2007-01-31',
    title: { zh: '钥匙押金不得超过更换成本，须可退', en: 'Key deposit ≤ replacement cost, refundable' },
    summary: { zh: '钥匙押金只能是合理更换成本，退租归还钥匙时须退还。', en: 'A key deposit may not exceed the reasonable replacement cost and must be refunded when keys are returned.' },
    enforcement: { zh: '房源页费用卡说明；租约附表 B 检查。', en: 'Listing cost card; Schedule B check.' },
  },
  {
    id: 'RTA-134-no-fees', area: 'screening', statute: 'RTA s.134(1)–(2)', severity: 'block', since: '2007-01-31',
    title: { zh: '不得向租客或申请人收取任何额外费用', en: 'No fees may be charged to tenants or applicants' },
    summary: { zh: '申请费、筛查费、信用检查费、清洁押金、宠物押金等一律禁止。', en: 'Application, screening, credit-check fees, cleaning and pet deposits are all prohibited.' },
    enforcement: { zh: 'Stripe 解锁对 payer=tenant 返回 400；定价页与助手提示词无「让申请人付」。', en: 'Stripe unlock rejects payer=tenant; pricing and prompts carry no applicant-pays path.' },
  },
  {
    id: 'RTA-14-no-pet-clause', area: 'listing', statute: 'RTA s.14', severity: 'block', since: '2007-01-31',
    title: { zh: '「禁止养宠物」条款无效', en: '"No pets" clauses are void' },
    summary: { zh: '租约中禁止宠物的条款无效；房东只能在宠物造成实质干扰时申请 LTB。', en: 'A tenancy agreement term prohibiting pets is void; landlords may only act through the LTB on actual interference.' },
    enforcement: { zh: '房源宠物字段只允许「允许 / 有限制」；附表 B 出现禁宠条款即阻止。', en: 'Listing pets field allows only yes/restricted; Schedule B with a pet ban is blocked.' },
  },
  {
    id: 'OREG9-18-standard-lease', area: 'lease', statute: 'O. Reg. 9/18', severity: 'block', since: '2018-04-30',
    title: { zh: '安省标准租约强制使用', en: 'Ontario standard lease is mandatory' },
    summary: { zh: '2018-04-30 起大多数住宅租约必须使用标准表格；OREA Form 400 只是要约，不是租约。', en: 'Most residential tenancies since 2018-04-30 must use the standard form; OREA Form 400 is an offer, not the lease.' },
    enforcement: { zh: '租约生成默认 ontario_standard；经纪事实包如此说明。', en: 'Lease drafting defaults to ontario_standard; agent facts pack says so.' },
  },
  {
    id: 'RTA-12-copy-21-days', area: 'lease', statute: 'RTA s.12(1)', severity: 'warn', since: '2007-01-31',
    title: { zh: '签约后 21 天内交付租约副本', en: 'Lease copy within 21 days' },
    summary: { zh: '房东须在租客签署后 21 天内交付租约副本，否则租客可暂停付租。', en: 'The landlord must give the tenant a copy within 21 days of signing, or the tenant may withhold rent.' },
    enforcement: { zh: 'e-sign 双签后自动发送永久链接。', en: 'E-sign sends the permanent copy link on full execution.' },
  },
  {
    id: 'RTA-116-n1-90-days', area: 'renewal', statute: 'RTA s.116(1)', severity: 'block', since: '2007-01-31',
    title: { zh: '涨租须提前 90 天书面通知（N1）', en: 'Rent increase needs 90 days’ written notice (N1)' },
    summary: { zh: '涨租通知必须在生效前至少 90 天送达，且 12 个月内只能涨一次。', en: 'Notice must be served at least 90 days before the increase takes effect; once per 12 months.' },
    enforcement: { zh: '续约 90 天触点写明 N1 截止日；60 天触点在截止已过时只允许不涨或月租。', en: '90-day renewal touchpoint states the N1 deadline; the 60-day checkpoint drops the increase once it passes.' },
  },
  {
    id: 'RTA-120-guideline', area: 'renewal', statute: `RTA s.120 · ${GUIDELINE_TEXT.en}`, severity: 'block', since: '2026-01-01',
    title: { zh: '涨幅不超过年度指导比例', en: 'Increase within the annual guideline' },
    summary: { zh: `${GUIDELINE_TEXT.zh}（法定封顶 2.5%）；2018-11-15 后首次入住的单位不受此限（s.6.1）。超过指导线须先向 LTB 申请 AGI（s.126）。`, en: `${GUIDELINE_TEXT.en} (statutory cap 2.5%); units first occupied after 2018-11-15 are exempt (s.6.1). Above-guideline increases need LTB approval (s.126).` },
    enforcement: { zh: '续约方案 B 按涨租生效年份的指导比例计算并注明豁免；N1 截止日按 90 天倒推。', en: 'Renewal option B uses the guideline for the year the increase takes effect and states the exemption; the N1 deadline is 90 days back.' },
  },
  {
    id: 'RTA-38-month-to-month', area: 'renewal', statute: 'RTA s.38(1)', severity: 'info', since: '2007-01-31',
    title: { zh: '到期不续签自动转为月租', en: 'Unrenewed leases continue month-to-month' },
    summary: { zh: '定期租约到期后按原条款自动转为月租，租客无需搬离。2025 年 Bill 60 曾提议取消此规则，未获通过——仍然有效。', en: 'A fixed-term lease continues monthly on the same terms; the tenant need not leave. Bill 60 (2025) proposed removing this and it was dropped — still in force.' },
    enforcement: { zh: '续约触点与租客提示词均说明。', en: 'Stated in renewal touchpoints and tenant prompts.' },
  },
  {
    id: 'RTA-47-n9-60-days', area: 'renewal', statute: 'RTA s.47 · Form N9', severity: 'info', since: '2007-01-31',
    title: { zh: '租客搬离须提前 60 天书面通知', en: 'Tenant move-out needs 60 days’ written notice' },
    summary: { zh: '租客终止租约须以 N9 表格提前 60 天通知，终止日须为租期末日。', en: 'Tenants end a tenancy with Form N9 at least 60 days ahead, ending on the last day of a rental period.' },
    enforcement: { zh: '30 天续约意向邮件中说明。', en: 'Stated in the 30-day intent email.' },
  },
  // ── Tenancy in progress · Bill 60 (S.O. 2025 c.14) / Bill 97 (2023), in force 2026-07-01 and 2026-09-21 ──
  {
    id: 'RTA-59-n4-7-days', area: 'tenancy', statute: 'RTA s.59(1) · Bill 60 · N4 (2026/09)', severity: 'warn', since: '2026-09-21',
    title: { zh: '欠租通知 N4 的终止日至少 7 天后', en: 'N4 termination date at least 7 days out' },
    summary: { zh: '2026-09-21 起，N4 的终止日不得早于送达后 7 天（此前 14 天）；邮寄送达另加 5 天视为送达期。租金逾期次日即可送达。必须用 2026/09 版表格，旧版 2026-11-30 后不再受理。', en: 'From 2026-09-21 an N4 may end the tenancy no earlier than 7 days after service (was 14); mail adds 5 deemed-service days. Serve any day after the due date. Use the 2026/09 form; older versions are rejected after 2026-11-30.' },
    enforcement: { zh: '房东租约页 N 表工具箱与租金提醒执行器按 7 天计算最早终止日；助手事实包同步。', en: 'The N-form toolbox and rent-reminder executor compute the earliest termination date at 7 days; assistant fact packs match.' },
  },
  {
    id: 'RTA-58-persistent-late', area: 'tenancy', statute: 'RTA s.58(1.1) + O. Reg. · Bill 60', severity: 'info', since: '2026-09-21',
    title: { zh: '「持续迟付」有了法定定义', en: '“Persistent late payment” is now defined' },
    summary: { zh: '6 个月内 3 次以上在到期日 7 天后才付租即构成持续迟付（N8 终止理由）；被冲抵其他欠款的付款不算。', en: 'Rent received more than 7 days late at least 3 times within any 6-month period is persistent late payment (an N8 ground); payments applied to other amounts owed do not count.' },
    enforcement: { zh: '在管租约的租金记录按此定义计算并向房东显示提示（只做记录，不发通知）。', en: 'The managed-tenancy rent ledger computes it and shows the landlord a note (record only, no notice is sent).' },
  },
  {
    id: 'RTA-82-half-arrears', area: 'tenancy', statute: 'RTA s.82(2) · Bill 60', severity: 'info', since: '2026-09-21',
    title: { zh: '欠租听证上提维修等问题须先付一半欠款', en: 'Raising issues at an arrears hearing needs half the arrears paid' },
    summary: { zh: '2026-09-21 起提交的 L1 申请，租客要在欠租听证上提出维修或权利问题，须在听证前至少 7 天把申请书上欠款的一半直接付给房东，并仍须提前 7 天书面列出问题。', en: 'For L1 applications filed from 2026-09-21, a tenant who wants to raise maintenance or rights issues at the arrears hearing must pay the landlord half the claimed arrears at least 7 days before the hearing, and still give written notice of the issues 7 days ahead.' },
    enforcement: { zh: '租客与房东助手事实包说明；Stayloop 不代提交 LTB 申请。', en: 'Stated in tenant and landlord fact packs; Stayloop files nothing with the LTB.' },
  },
  {
    id: 'RTA-48-1-n12-120-days', area: 'tenancy', statute: 'RTA s.48.1(2) · Bill 60 · N12 (2026/09)', severity: 'warn', since: '2026-09-21',
    title: { zh: '房东自用 N12：提前 120 天可免一个月补偿', en: 'Landlord’s own use (N12): 120 days’ notice waives the compensation' },
    summary: { zh: '房东本人或家属自用，若提前至少 120 天送达 N12 且终止日为租期末日，不再需要支付一个月补偿或提供替代单位（60–119 天仍需）。买家自用不适用此豁免。房东或指定人须在 N12 终止日后 60 天内入住，否则租客提 T5 时推定恶意。', en: 'For landlord/family own use, an N12 served at least 120 days ahead ending on the last day of a rental period no longer requires one month’s compensation or an alternative unit (60–119 days still does). Purchaser’s own use is not covered. The named person must occupy within 60 days of the termination date or bad faith is presumed on a T5.' },
    enforcement: { zh: 'N 表工具箱 N12 卡按 120 天规则提示；助手事实包同步。', en: 'The N12 toolbox card states the 120-day rule; assistant fact packs match.' },
  },
  {
    id: 'RTA-53-n13-first-refusal', area: 'tenancy', statute: 'RTA s.53 · Bill 97/60 · N13 (2026/09)', severity: 'warn', since: '2026-09-21',
    title: { zh: '装修驱逐 N13：优先回迁义务', en: 'Renovation eviction (N13): right-of-first-refusal duties' },
    summary: { zh: '租客书面表示要回迁的，房东须及时告知预计完工日、时间变动随时更新，并在完工后提前 60 天通知回迁。租客提 T5 的期限改为搬出后 2 年或完工后 6 个月（取较晚者）。', en: 'When the tenant gives written notice they want to return, the landlord must promptly state the expected completion date, update it as it changes, and give 60 days’ notice to reoccupy after the work is done. The T5 deadline is now 2 years after moving out or 6 months after completion, whichever is later.' },
    enforcement: { zh: 'N 表工具箱 N13 卡说明；多伦多另需装修许可证（见下条）。', en: 'Stated on the N13 toolbox card; Toronto additionally requires a licence (next rule).' },
  },
  {
    id: 'TOR-53-2025-renovation-licence', area: 'tenancy', statute: 'City of Toronto By-law 53-2025 · Chapter 354', severity: 'block', since: '2025-07-31',
    title: { zh: '多伦多：发 N13 后 7 天内须申请装修许可证', en: 'Toronto: apply for a Rental Renovation Licence within 7 days of an N13' },
    summary: { zh: '2025-07-31 起，多伦多市内以装修为由发 N13 的房东，须在 7 天内向市府申请 Rental Renovation Licence（2026 年 $728/单元），附建筑许可与 PEO/OAA 持牌人出具的「必须腾空」报告；租客回迁的须提供临时住所或补租金差价，搬家补贴 $1,500（一居及以下）/ $2,500（两居及以上）；不回迁的另付 3 个月租金差价。未申请可罚 $1,000 起、持续违规每日最高 $10,000。', en: 'From 2025-07-31 a Toronto landlord serving an N13 for renovations must apply to the City within 7 days for a Rental Renovation Licence ($728 per unit in 2026) with the building permit and a PEO/OAA report that vacancy is required; returning tenants get temporary housing or rent-gap payments plus a $1,500 (studio/1-bed) or $2,500 (2+ bed) moving allowance; non-returning tenants get three months of rent-gap severance. Fines start at $1,000 and reach $10,000 per day for continuing offences.' },
    enforcement: { zh: 'N13 工具箱卡对多伦多房源标红并链接市府页面；助手事实包同步。', en: 'The N13 toolbox card flags Toronto units and links the City page; assistant fact packs match.' },
  },
  {
    id: 'RTA-209-review-15-days', area: 'tenancy', statute: 'RTA s.209 · Bill 60', severity: 'info', since: '2026-07-01',
    title: { zh: 'LTB 裁决复审申请期限 15 天', en: 'LTB order review requests within 15 days' },
    summary: { zh: '2026-07-01 起，请求 LTB 复审裁决的期限由 30 天缩短为 15 天；AGI 申请的送达指令由 14 天缩为 7 天、送达证明 5 天内提交。', en: 'From 2026-07-01 the window to request review of an LTB order is 15 days (was 30); AGI direction-to-serve is 7 days (was 14) with the certificate of service within 5 days.' },
    enforcement: { zh: '助手事实包说明。', en: 'Stated in assistant fact packs.' },
  },
  {
    id: 'RTA-206-payment-agreement-form', area: 'tenancy', statute: 'RTA s.206 · Bill 60', severity: 'info', since: '2026-07-01',
    title: { zh: '欠租还款计划须用 LTB 付款协议表', en: 'Repayment plans must use the LTB Payment Agreement Form' },
    summary: { zh: '2026-07-01 起，按 s.206 提交的还款计划必须使用 LTB 的 Payment Agreement Form，邮件或信件约定不再受理。', en: 'From 2026-07-01 a s.206 repayment plan must be on the LTB Payment Agreement Form; letters or emails are no longer accepted.' },
    enforcement: { zh: '租金提醒邮件与助手事实包指向该表格。', en: 'Rent-reminder emails and fact packs point to the form.' },
  },
  {
    id: 'RTA-36-1-tenant-ac', area: 'tenancy', statute: 'RTA s.36.1 · Bill 97', severity: 'info', since: '2026-07-01',
    title: { zh: '租客可自装窗式 / 移动空调', en: 'Tenants may install a window or portable air conditioner' },
    summary: { zh: '2026-07-01 起，房东未提供空调的单位，租客书面通知后可自装窗式或移动空调（须安全、合规、不损坏）；租金含电费的，房东可按规定收取季节性电费。租约不得禁止。', en: 'From 2026-07-01 a tenant in a unit without landlord-supplied A/C may install a window or portable unit after written notice (safely and to code); where hydro is included the landlord may charge a prescribed seasonal amount. A lease may not forbid it.' },
    enforcement: { zh: '租约附加条款检查：禁止空调的条款视为无效并阻止。', en: 'Lease additional-terms check: a clause banning air conditioners is void and blocked.' },
  },
  {
    id: 'RTA-238-fines-doubled', area: 'tenancy', statute: 'RTA s.238 · Bill 97', severity: 'info', since: '2026-07-01',
    title: { zh: '违反 RTA 的最高罚款翻倍', en: 'Maximum RTA fines doubled' },
    summary: { zh: '2026-07-01 起，省级检控的最高罚款：个人 $100,000、公司 $500,000（原 $50,000 / $250,000）。', en: 'From 2026-07-01 the maximum fines on provincial prosecution are $100,000 for individuals and $500,000 for corporations (were $50,000 / $250,000).' },
    enforcement: { zh: '规则页披露。', en: 'Disclosed on the rules page.' },
  },
  {
    id: 'LTB-forms-2026-09', area: 'tenancy', statute: 'LTB operational update 2026-09-21', severity: 'warn', since: '2026-09-21',
    title: { zh: '新版 LTB 表格，旧版 2026-11-30 后不再受理', en: 'New LTB forms; old versions rejected after 2026-11-30' },
    summary: { zh: 'N4、N5、N6、N8、N12、N13、L1、L2、L9、L10、T5 已换 2026/09 版；旧版 2026-11-30 前仍受理，之后拒收。', en: 'N4, N5, N6, N8, N12, N13, L1, L2, L9, L10 and T5 have 2026/09 versions; older versions are accepted until 2026-11-30 and rejected after.' },
    enforcement: { zh: 'N 表工具箱每张卡链接 LTB 表格页并注明版本。', en: 'Every toolbox card links the LTB forms page and names the version.' },
  },
  {
    id: 'OHRC-no-income-cutoff', area: 'screening', statute: 'OHRC Policy on human rights and rental housing · O. Reg. 290/98', severity: 'block', since: '2009-07-01',
    title: { zh: '收入租金比不得作为拒绝依据', en: 'Income-to-rent ratios may not be grounds to decline' },
    summary: { zh: '房东可以索取收入信息，但不得用固定比例截止线拒绝；缺信用史不得视为负面。', en: 'Landlords may request income information but may not apply a fixed ratio cut-off; a thin credit file is not negative.' },
    enforcement: { zh: '评分表不设硬门槛；报告标「仅供参考 · 非拒绝依据」；通知信不写比例理由。', en: 'No hard gates in the rubric; reports say "information only"; notice letters never cite a ratio.' },
  },
  {
    id: 'OHRC-protected-grounds', area: 'notice', statute: 'Human Rights Code s.2(1)', severity: 'block', since: '1990-01-01',
    title: { zh: '受保护特征不得进入决定与理由', en: 'Protected grounds never enter decisions or reasons' },
    summary: { zh: '种族、国籍、公民身份、家庭状况、收入来源、年龄、残障、性取向等不得作为拒绝或区别对待的理由。', en: 'Race, nationality, citizenship, family status, receipt of public assistance, age, disability, sexual orientation and the rest may not ground a decision or a reason.' },
    enforcement: { zh: 'guardrail 拦截；婉拒理由需具体且写入审计；模型不得推断这些特征。', en: 'Guardrail blocks; decline reasons must be specific and audited; models never infer these.' },
  },
  {
    id: 'CRA-10-7-notice', area: 'notice', statute: 'Consumer Reporting Act s.10(7)', severity: 'warn', since: '1990-01-01',
    title: { zh: '拒绝时须告知信息性质与来源的索取权', en: 'On decline, tell the applicant they may ask what was used' },
    summary: { zh: '基于报告信息作出不利决定时，须告知申请人可在 60 天内索取信息性质与来源。', en: 'When an adverse decision rests on report information, the applicant must be told they may request its nature and source within 60 days.' },
    enforcement: { zh: '申请人通知信与 send_decision 邮件固定包含此段。', en: 'The applicant notice and send_decision email always include it.' },
  },
  {
    id: 'TRESA-32-registrant-disclosure', area: 'agent', statute: 'TRESA 2002 · O. Reg. 567/05 s.32', severity: 'block', since: '2023-12-01',
    title: { zh: '注册人自己交易须书面披露身份', en: 'Registrants must disclose their status in writing when dealing for themselves' },
    summary: { zh: '持牌经纪以房东或租客身份交易时须在要约前书面披露注册身份。', en: 'A registrant renting out or applying for a unit personally must disclose registration in writing before any offer.' },
    enforcement: { zh: '有 agent_profiles 行的账号发布房源 / 提交申请前弹披露卡并记录。', en: 'Accounts with an agent profile see the disclosure card before publishing or applying; it is recorded.' },
  },
]

export function ruleById(id: string): Rule | undefined {
  return ONTARIO_RULES.find((r) => r.id === id)
}

// ---------------------------------------------------------------------------
// Deterministic checks
// ---------------------------------------------------------------------------

export type Finding = { rule: string; statute: string; severity: RuleSeverity; message: { zh: string; en: string } }

export type ListingInput = {
  monthly_rent?: number | null
  deposit?: number | null
  key_deposit?: number | null
  pets_allowed?: string | null           // yes | no | restricted
  description?: string | null
  title?: string | null
  application_fee?: number | null
  schedule_b?: string | null
}

const AC_BAN_RE = /\b(no|zero)\s+(window\s+|portable\s+)?(air[\s-]?conditioners?|a\/?c\s+units?|ac\s+units?)\b|(air[\s-]?conditioners?|a\/?c\s+units?)\s+(are\s+)?(not\s+(allowed|permitted)|prohibited)|不(许|得|允许|可以?)?(安装|装)?(空调|冷气)|禁止?(安装|装)?(空调|冷气)/i
const PET_BAN_RE = /\b(no|zero)\s+(pets?|animals?|dogs?|cats?)\b|不(许|得|允许|可以?)?养?(宠物|狗|猫)|禁止?(宠物|养宠|养狗|养猫)|pets?\s+(are\s+)?not\s+(allowed|permitted)/i
const FEE_RE = /\b(application|screening|credit[- ]check|processing|admin(istration)?)\s+fee\b|申请费|筛查费|信用(检查|查询)费|手续费|管理费(?=[^一-龥]|$)/i
const PET_DEPOSIT_RE = /\bpet\s+(deposit|fee)\b|宠物(押金|费)|clean(ing)?\s+(deposit|fee)|清洁(押金|费)|damage\s+deposit|损坏押金/i

export function checkListingCompliance(input: ListingInput): { passed: boolean; findings: Finding[] } {
  const f: Finding[] = []
  const rent = Number(input.monthly_rent) || 0
  const dep = input.deposit == null ? null : Number(input.deposit)
  if (rent > 0 && dep != null && dep > rent + 0.5) {
    f.push({ rule: 'RTA-106-deposit-cap', statute: 'RTA s.106(2)', severity: 'block', message: { zh: `押金 $${dep.toLocaleString()} 超过一个月租金 $${rent.toLocaleString()}。`, en: `Deposit $${dep.toLocaleString()} exceeds one month's rent $${rent.toLocaleString()}.` } })
  }
  if (input.key_deposit != null && Number(input.key_deposit) > 250) {
    f.push({ rule: 'OREG516-17-key-deposit', statute: 'O. Reg. 516/06 s.17(1)', severity: 'warn', message: { zh: '钥匙押金看起来高于合理更换成本，请核对。', en: 'Key deposit looks above a reasonable replacement cost — check it.' } })
  }
  const text = `${input.title || ''}\n${input.description || ''}\n${input.schedule_b || ''}`
  if (input.pets_allowed === 'no' || PET_BAN_RE.test(text)) {
    f.push({ rule: 'RTA-14-no-pet-clause', statute: 'RTA s.14', severity: 'block', message: { zh: '出现「禁止养宠」条款或设置。安省租约中禁宠条款无效，改为「允许 / 有限制」。', en: 'A "no pets" term or setting is present. Pet bans are void in Ontario leases — use allowed / restricted.' } })
  }
  if ((input.application_fee != null && Number(input.application_fee) > 0) || FEE_RE.test(text)) {
    f.push({ rule: 'RTA-134-no-fees', statute: 'RTA s.134(1)', severity: 'block', message: { zh: '提到申请费 / 筛查费 / 手续费。安省禁止向申请人收取任何此类费用。', en: 'An application / screening / processing fee is mentioned. Ontario prohibits charging applicants any such fee.' } })
  }
  if (PET_DEPOSIT_RE.test(text)) {
    f.push({ rule: 'RTA-134-no-fees', statute: 'RTA s.134(2)', severity: 'block', message: { zh: '提到宠物押金 / 清洁押金 / 损坏押金。除租金押金与钥匙押金外，其余押金一律禁止。', en: 'A pet / cleaning / damage deposit is mentioned. Only a rent deposit and a key deposit are lawful.' } })
  }
  return { passed: !f.some((x) => x.severity === 'block'), findings: f }
}

export type LeaseTermsInput = {
  rent_amount?: number | null
  deposit_amount?: number | null
  form_type?: string | null            // ontario_standard | trreb | imported
  schedule_b?: string | null
  start_date?: string | null
  end_date?: string | null
}

export function checkLeaseTerms(input: LeaseTermsInput): { passed: boolean; findings: Finding[] } {
  const f: Finding[] = []
  const rent = Number(input.rent_amount) || 0
  const dep = input.deposit_amount == null ? null : Number(input.deposit_amount)
  if (rent > 0 && dep != null && dep > rent + 0.5) {
    f.push({ rule: 'RTA-106-deposit-cap', statute: 'RTA s.106(2)', severity: 'block', message: { zh: `押金 $${dep.toLocaleString()} 超过一个月租金。`, en: `Deposit $${dep.toLocaleString()} exceeds one month's rent.` } })
  }
  if (input.form_type === 'trreb') {
    f.push({ rule: 'OREG9-18-standard-lease', statute: 'O. Reg. 9/18', severity: 'warn', message: { zh: 'TRREB Form 400 是要约；正式租约仍须使用安省标准租约。', en: 'TRREB Form 400 is an offer; the tenancy itself must use the Ontario standard lease.' } })
  }
  const sb = input.schedule_b || ''
  if (PET_BAN_RE.test(sb)) {
    f.push({ rule: 'RTA-14-no-pet-clause', statute: 'RTA s.14', severity: 'block', message: { zh: '附表 B 含禁宠条款，该条款无效。', en: 'Schedule B contains a pet ban, which is void.' } })
  }
  if (AC_BAN_RE.test(sb)) {
    f.push({ rule: 'RTA-36-1-tenant-ac', statute: 'RTA s.36.1', severity: 'block', message: { zh: '附表 B 禁止租客安装空调，该条款自 2026-07-01 起无效。', en: 'Schedule B bans air conditioners; such a clause is void since 2026-07-01.' } })
  }
  if (FEE_RE.test(sb) || PET_DEPOSIT_RE.test(sb)) {
    f.push({ rule: 'RTA-134-no-fees', statute: 'RTA s.134', severity: 'block', message: { zh: '附表 B 含额外费用或押金条款。', en: 'Schedule B adds a fee or deposit that is not permitted.' } })
  }
  if (input.start_date && input.end_date && input.end_date < input.start_date) {
    f.push({ rule: 'OREG9-18-standard-lease', statute: 'O. Reg. 9/18', severity: 'block', message: { zh: '结束日期早于开始日期。', en: 'End date is before the start date.' } })
  }
  return { passed: !f.some((x) => x.severity === 'block'), findings: f }
}

/** The s.10(7) + OHRC paragraph every adverse-decision notice must carry. */
export function decisionNoticeFooter(lang: 'zh' | 'en'): string {
  return lang === 'zh'
    ? '依据安省《消费者报告法》s.10(7)，你可在 60 天内要求房东说明本次决定所依据信息的性质与来源。本决定由房东本人作出，AI 只做资料整理；不考虑《人权法典》受保护的任何特征（种族、国籍、公民身份、家庭状况、收入来源、年龄、残障、性取向等）。如需查阅或更正资料：privacy@stayloop.ai。'
    : 'Under Ontario’s Consumer Reporting Act s.10(7) you may, within 60 days, ask the landlord for the nature and source of the information this decision relied on. The decision was made by the landlord personally; AI only organised the material. No ground protected by the Human Rights Code (race, nationality, citizenship, family status, receipt of public assistance, age, disability, sexual orientation and others) was considered. To access or correct your information: privacy@stayloop.ai.'
}
