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
export type RuleArea = 'listing' | 'lease' | 'screening' | 'notice' | 'agent' | 'renewal'

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
    id: 'RTA-120-guideline', area: 'renewal', statute: 'RTA s.120 · 2026 guideline 2.5%', severity: 'block', since: '2026-01-01',
    title: { zh: '涨幅不超过年度指导比例', en: 'Increase within the annual guideline' },
    summary: { zh: '2026 年指导比例 2.5%；2018-11-15 后首次入住的单位不受此限（s.6.1）。', en: '2026 guideline is 2.5%; units first occupied after 2018-11-15 are exempt (s.6.1).' },
    enforcement: { zh: '续约方案 B 按 2.5% 计算并注明豁免。', en: 'Renewal option B computes 2.5% and states the exemption.' },
  },
  {
    id: 'RTA-38-month-to-month', area: 'renewal', statute: 'RTA s.38(1)', severity: 'info', since: '2007-01-31',
    title: { zh: '到期不续签自动转为月租', en: 'Unrenewed leases continue month-to-month' },
    summary: { zh: '定期租约到期后按原条款自动转为月租，租客无需搬离。', en: 'A fixed-term lease continues monthly on the same terms; the tenant need not leave.' },
    enforcement: { zh: '续约触点与租客提示词均说明。', en: 'Stated in renewal touchpoints and tenant prompts.' },
  },
  {
    id: 'RTA-47-n9-60-days', area: 'renewal', statute: 'RTA s.47 · Form N9', severity: 'info', since: '2007-01-31',
    title: { zh: '租客搬离须提前 60 天书面通知', en: 'Tenant move-out needs 60 days’ written notice' },
    summary: { zh: '租客终止租约须以 N9 表格提前 60 天通知，终止日须为租期末日。', en: 'Tenants end a tenancy with Form N9 at least 60 days ahead, ending on the last day of a rental period.' },
    enforcement: { zh: '30 天续约意向邮件中说明。', en: 'Stated in the 30-day intent email.' },
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
