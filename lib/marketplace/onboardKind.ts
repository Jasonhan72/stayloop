// Two kinds of provider join Stayloop, each on a page of its own (2026-11-23):
//   • 物业管理服务 — plumbing, electrical, heating, locks, cleaning…  → /provider/onboard
//   • 专业服务     — paralegal, lawyer, insurance broker, photography → /provider/onboard/professional
// The form used to be one page that greeted a lawyer with 「加入 Stayloop 精选维修网络」, twelve trades in
// one list, an hourly rate and a call-out fee (user: 「这个页面是否也要区分维修和专业服务？」). It was first
// split by a switch on the one page; the user then asked for separate pages and for the first kind
// to be called 物业管理服务 rather than 上门维修 (「上门维修可以改为物业管理服务，可以单独页面，和专业服务需要
// 分开」). Pure: which trades, credential kinds and words each kind gets, and which page a record opens on.
//
// One account still has one provider record, and that record may list trades of both kinds (a
// handyman who also shoots listing photos). The kind is the page, not a column: neither page ever
// drops a trade the record already has. The internal key stays 'repair' (the directory tab's key).
import { CREDENTIAL_LABEL, PROFESSIONAL_TRADES, TRADES, isProfessionalTrade, type CredentialKind, type Trade } from './trades'

export type OnboardKind = 'repair' | 'professional'
export const ONBOARD_KINDS: readonly OnboardKind[] = ['repair', 'professional']

export function isOnboardKind(v: unknown): v is OnboardKind {
  return v === 'repair' || v === 'professional'
}

/** The trades offered under a kind, in the order of TRADES. */
export function tradesOfKind(kind: OnboardKind): Trade[] {
  return TRADES.filter((t) => (kind === 'professional') === isProfessionalTrade(t.key)).map((t) => t.key)
}

/** Of the trades selected, the ones that belong to this kind / to the other one. */
export function selectedOfKind(trades: readonly string[], kind: OnboardKind): Trade[] {
  const mine = new Set<string>(tradesOfKind(kind))
  return trades.filter((t) => mine.has(t)) as Trade[]
}
export function selectedOfOtherKind(trades: readonly string[], kind: OnboardKind): Trade[] {
  return selectedOfKind(trades, kind === 'repair' ? 'professional' : 'repair')
}

/**
 * Which page a visitor to /provider/onboard belongs on. An explicit `?type=` wins (`?type=repair`
 * is how a professional-only record opens the other form to add a trade; `?type=professional` is
 * the link the 专业服务 tab carried for a day); otherwise the record decides — 物业管理服务 if it lists
 * any such trade, 专业服务 if it lists only professional ones — and a newcomer starts on 物业管理服务.
 */
export function onboardKindOf(trades: readonly string[] | null | undefined, asked?: string | null): OnboardKind {
  if (isOnboardKind(asked)) return asked
  const list = trades ?? []
  if (list.some((t) => TRADES.some((d) => d.key === t) && !isProfessionalTrade(t))) return 'repair'
  if (list.some((t) => (PROFESSIONAL_TRADES as readonly string[]).includes(t))) return 'professional'
  return 'repair'
}

/**
 * A record that lists professional services and nothing that is dispatched. Such a provider never
 * receives a work order: their navigation has no 工单 / 历史, and reminders speak of the directory.
 * A record with no trades yet is not one — a newcomer keeps the full navigation.
 */
export function isProfessionalOnly(trades: readonly string[] | null | undefined): boolean {
  const list = trades ?? []
  return selectedOfKind(list, 'professional').length > 0 && selectedOfKind(list, 'repair').length === 0
}

/** The credential kinds a provider of this kind may need: every `required` of its trades, in CREDENTIAL_LABEL order. */
export function credentialKindsFor(kind: OnboardKind): CredentialKind[] {
  const need = new Set<CredentialKind>()
  for (const t of TRADES) if ((kind === 'professional') === isProfessionalTrade(t.key)) for (const k of t.required) need.add(k)
  const order = Object.keys(CREDENTIAL_LABEL) as CredentialKind[]
  const picked = order.filter((k) => need.has(k))
  // A professional's own licence comes before the paperwork a photographer shares with the trades.
  return kind === 'professional' ? [...picked.filter((k) => k.startsWith('lso_') || k === 'ribo_licence'), ...picked.filter((k) => !(k.startsWith('lso_') || k === 'ribo_licence'))] : picked
}

/** The kind a page address stands for. */
export function onboardKindOfPath(pathname: string | null | undefined): OnboardKind {
  return (pathname || '').replace(/\/+$/, '').endsWith('/provider/onboard/professional') ? 'professional' : 'repair'
}

/** Each kind's own page. */
export function onboardHref(kind: OnboardKind): string {
  return kind === 'professional' ? '/provider/onboard/professional' : '/provider/onboard'
}

/** The link from one form to the other. Going to 物业管理服务 says so explicitly, or a professional-only record would be sent straight back. */
export function otherFormHref(from: OnboardKind): string {
  return from === 'repair' ? '/provider/onboard/professional' : '/provider/onboard?type=repair'
}

type Two = { zh: string; en: string }
/** The words that differ between the two kinds. Everything else on the form is shared. */
export const ONBOARD_COPY: Record<OnboardKind, {
  choice: Two; choiceSub: Two; otherForm: Two; title: Two; intro: Two; tradesLabel: Two; tradeName: Two; email: Two; bioHint: Two
  credTitle: Two; credHint: Two; missing: Two; attest: Two; footer: Two
}> = {
  repair: {
    choice: { zh: '物业管理服务', en: 'Property maintenance' },
    choiceSub: { zh: '水管、电气、供暖、门锁、清洁、杂工等。核验后可以接到房东的派单。', en: 'Plumbing, electrical, heating, locks, cleaning, handyman work. Once verified, landlords can dispatch jobs to you.' },
    otherForm: { zh: '你提供的是持牌专业服务或房源摄影？', en: 'Are you a licensed professional or a listing photographer?' },
    title: { zh: '加入 Stayloop 物业管理服务网络', en: 'Join the Stayloop property maintenance network' },
    intro: {
      zh: '我们只收集公开注册库上能查到的资质编号与到期日，由 Stayloop 工作人员人工对照后核验；资质到期会自动停派单。不收取入驻费，工单由房东直接付款，Stayloop 不经手资金。',
      en: 'We collect only credential numbers and expiry dates that public registers show; a Stayloop staff member checks them by hand, and expired credentials stop dispatch automatically. No onboarding fee; landlords pay you directly — no money moves through Stayloop.',
    },
    tradesLabel: { zh: '工种', en: 'Trades' },
    tradeName: { zh: '商号（对房东显示）', en: 'Trade name (shown to landlords)' },
    email: { zh: '接单邮箱', en: 'Dispatch email' },
    bioHint: { zh: '做什么、做了多久、擅长哪类活、一般多久能上门。', en: 'What you do, how long you have done it, what you are best at, how soon you usually come out.' },
    credTitle: { zh: '资质', en: 'Credentials' },
    credHint: {
      zh: '到期提醒会在 90 / 60 / 30 / 7 天各发一次邮件与推送；过期的资质不再计入覆盖，派单会跳过你。',
      en: 'Expiry reminders go out at 90 / 60 / 30 / 7 days by email and push; an expired credential drops out of coverage and dispatch skips you.',
    },
    missing: { zh: '还缺（缺了就不会收到该工种的派单）：', en: 'Still missing (no dispatch for that trade until complete): ' },
    attest: {
      zh: '持证工种的工作只由持有效资格证的人员完成；接受工单即与房东直接订立服务合同；账单不超出经批准报价的 10%（安省《消费者保护法》）',
      en: 'licensed-trade work is done only by holders of a valid certificate; accepting a job forms a direct contract with the landlord; invoices stay within 10% of the approved quote (Ontario CPA)',
    },
    footer: {
      zh: '核验只表示核验日你的资质在相应公开注册库上有效；Stayloop 不是承包商，不参与施工，不收取佣金。',
      en: 'Verification only means your credentials were valid on the relevant public register on the day checked; Stayloop is not a contractor, takes no part in the work and receives no commission.',
    },
  },
  professional: {
    choice: { zh: '专业服务', en: 'Professional services' },
    choiceSub: { zh: '持牌 Paralegal、律师、保险经纪、房源摄影。只在目录里展示和转介，不派单。', en: 'Licensed paralegals, lawyers, insurance brokers, listing photographers. Listed and referred in the directory only — never dispatched.' },
    otherForm: { zh: '你提供的是水管、电气、清洁这类物业管理服务？', en: 'Do you provide plumbing, electrical, cleaning or other property maintenance?' },
    title: { zh: '加入 Stayloop 专业服务目录', en: 'Join the Stayloop professional services directory' },
    intro: {
      zh: '我们只收集公开名册上能查到的牌照号与到期日，由 Stayloop 工作人员人工对照后核验；牌照到期后目录里不再显示「牌照已核」。不收取入驻费，不派单、不收佣金；委托、保单和费用由你和客户直接谈，Stayloop 不经手资金。',
      en: 'We collect only the licence numbers and expiry dates the public registers show; a Stayloop staff member checks them by hand, and once a licence expires the directory stops showing it as verified. No onboarding fee, no dispatch, no commission; retainers, policies and fees are between you and the client — no money moves through Stayloop.',
    },
    tradesLabel: { zh: '服务类别', en: 'Services' },
    tradeName: { zh: '对外显示的名称（事务所 / 工作室）', en: 'Name shown publicly (firm / studio)' },
    email: { zh: '联系邮箱', en: 'Contact email' },
    bioHint: { zh: '做哪一类事、第一次联系要说明什么、用哪些语言。不要写收费承诺。', en: 'What kind of matters you take, what to say on first contact, which languages. No fee promises.' },
    credTitle: { zh: '牌照与资质', en: 'Licences and credentials' },
    credHint: {
      zh: '到期提醒会在 90 / 60 / 30 / 7 天各发一次邮件与推送；过期后目录里会显示「牌照待核或已过期」。',
      en: 'Expiry reminders go out at 90 / 60 / 30 / 7 days by email and push; after expiry the directory shows the licence as pending or expired.',
    },
    missing: { zh: '还缺（补齐并核验后，目录里才显示「牌照已核」）：', en: 'Still missing (the directory shows the licence as verified only once these are on file and checked): ' },
    attest: {
      zh: '所列牌照由我本人或本所执业人员持有并处于有效状态；与客户之间的委托、保单和费用由我们直接订立，Stayloop 不参与',
      en: 'the licences listed are held by me or by the practitioners at my firm and are in good standing; retainers, policies and fees are agreed directly with the client, without Stayloop',
    },
    footer: {
      zh: '核验只表示核验日你的牌照在相应公开名册上有效；Stayloop 不是律师事务所，也不是保险经纪，不给法律意见、不卖保险、不收取佣金。',
      en: 'Verification only means your licence was valid on the relevant public register on the day checked; Stayloop is not a law firm or an insurance broker, gives no legal advice, sells no insurance and receives no commission.',
    },
  },
}

/** Removing a licence in the professional form: nothing is dispatched there, so the question names the directory instead. (The repair wording lives in the page.) */
export const PROFESSIONAL_REMOVE_CONFIRM: Two = {
  zh: '删除这条记录？已核验的记录也会一起删除；如果它是该类别唯一有效的一条，目录里会马上显示「牌照待核或已过期」。续期请用「续期」。',
  en: 'Remove this record? Its verification goes with it; if it is the only valid one for a service, the directory shows the licence as pending or expired at once. To renew, use “renew”.',
}

/** The attestation sentence: what applies to the kinds of trade actually selected (the form's kind when none is yet). */
export function attestText(trades: readonly string[], kind: OnboardKind, zh: boolean): string {
  const parts: OnboardKind[] = []
  if (selectedOfKind(trades, 'repair').length) parts.push('repair')
  if (selectedOfKind(trades, 'professional').length) parts.push('professional')
  if (!parts.length) parts.push(kind)
  const L = zh ? 'zh' : 'en'
  const body = parts.map((k) => ONBOARD_COPY[k].attest[L]).join(zh ? '；' : '; ')
  return zh ? `我确认以上信息属实；${body}；资质变更或到期后 7 天内更新。` : `I confirm the above is true; ${body}; I update within 7 days of any credential change or expiry.`
}
