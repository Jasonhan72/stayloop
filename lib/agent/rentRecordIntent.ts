// "This month's rent came in — record it" said in the AI conversation (2026-11-24, user: 「接着做记租金」 —
// the second product module finished in the conversation, after the lease import).
//
// When a signed-in landlord or tenant says this, the turn's reply carries the rent record card
// (components/agent/RentRecordChatCard): the periods of their managed tenancy that nobody has
// recorded yet, the one they named already ticked, a payment date for each — and only 「确认」 records
// anything, through `mark_rent_paid`, the function the tenancy page's rent tab calls. Like the lease
// import card it is a form the person submits: the intent is read here, deterministically, from the
// person's own words; the model is told the card will be there (RENT_RECORD_TURN_NOTE) and neither
// sees its rows nor records anything. So a landlord's conversation still proposes no approval card.
//
// Pure. What counts: saying rent was received / paid, or asking to record it. What does not: rent
// that has NOT come in, a reminder to send, a question whether it arrived, an increase, a receipt.

export type RentRecordOffer = { id: string }

const ZH_RENT = '(?:租金|房租|月租)'
const ZH_GOT = '(?:收到了?|到账了?|入账了?|收了|已收|已付|转给我了?|转过来了?|打过来了?|打给我了?|付了|交了|给了|结清了?)'
const ZH_NOTE = '(?:记一下|记上|记一笔|记个?账|登记一下|登记上|标记|记为已[收付]|标[成为]已[收付])'
const ZH_SAID = new RegExp(
  [
    `${ZH_RENT}[^。！？!?\\n]{0,16}${ZH_GOT}`, // 这个月的租金租客已经转给我了
    `${ZH_RENT}[^。！？!?\\n]{0,16}${ZH_NOTE}`, // 租金帮我记一下
    `(?:记|登记|标记)[^。！？!?\\n]{0,8}${ZH_RENT}`, // 帮我记一下这个月的租金 · 记租金
    `${ZH_RENT}[^。！？!?\\n]{0,6}(?:怎么|如何|在哪里?)(?:记|登记|标记)`, // 租金怎么记
    `(?:交了|付了|转了|打了|收了|收到了?)[^。！？!?\\n]{0,10}${ZH_RENT}`, // 我交了这个月的房租 · 收到 10 月房租了
  ].join('|'),
)
// rent that has not come in, chasing it, asking whether it came, or another matter that mentions rent
const ZH_NOT = /还没|没有?(?:交|付|给|收到|到账|转)|未(?:付|交|收|到账)|欠|拖|逾期|催|提醒|收据|发票|涨租|涨价|退还|退租|(?:收到了?|到账了?|交了|付了)(?:吗|没|么)|多少/

const EN_SAID = new RegExp(
  [
    '\\brent\\b[^.?!\\n]{0,40}\\b(?:received|came in|come in|arrived|was paid|is paid|has been paid|got paid|paid)\\b',
    '\\b(?:received|got|collected)\\b[^.?!\\n]{0,30}\\brent\\b',
    '\\b(?:record|mark|log)\\b[^.?!\\n]{0,30}\\brent\\b',
    '\\bpaid\\b[^.?!\\n]{0,30}\\brent\\b',
  ].join('|'),
  'i',
)
const EN_NOT = /n['’]t\b|\bnot\b|\bnever\b|\bunpaid\b|\boverdue\b|\bowes?\b|\bremind|\bincrease|\breceipt\b|\bhow much\b|\bdeposit\b/i
const EN_ASKS = /^\s*(?:did|has|have|is|was|are|were|do|does)\b[^.!\n]*\?\s*$/i

/** Does the person say rent was received or paid, or ask to record it? */
export function wantsRentRecord(message: string | null | undefined): boolean {
  const text = String(message ?? '').slice(0, 600)
  if (!text.trim()) return false
  if (ZH_SAID.test(text)) return !ZH_NOT.test(text)
  if (EN_SAID.test(text)) return !EN_NOT.test(text) && !EN_ASKS.test(text)
  return false
}

const ZH_NUM: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 十一: 11, 十二: 12 }
const EN_MONTH = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

const ym = (y: number, m: number) => { const d = new Date(Date.UTC(y, m - 1, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}` }

/**
 * The month the person named, as `YYYY-MM` — 「10 月的租金」「十月房租」「这个月」「上个月」, "October's rent",
 * "this month" — or null when they named none. A bare month number means its most recent occurrence
 * that is not past next month (in January, 「12 月的租金」 is last December's). `today` is a Toronto date.
 */
export function rentMonthHint(message: string | null | undefined, today: string): string | null {
  const text = String(message ?? '')
  const [y, m] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))]
  if (!y || !m) return null
  const recent = (month: number) => (month >= 1 && month <= 12 ? ym(month > m + 1 ? y - 1 : y, month) : null)
  // the month attached to the rent: 「10 月的租金」「11月份房租」「十月的房租」
  const zh = /(\d{1,2}|十[一二]?|[一二三四五六七八九])\s*月(?:份)?(?:的)?\s*(?:租金|房租|月租)/.exec(text)
  if (zh) return recent(/^\d/.test(zh[1]) ? Number(zh[1]) : ZH_NUM[zh[1]] ?? 0)
  if (/上个?月/.test(text)) return ym(y, m - 1)
  if (/这个?月|本月|当月/.test(text)) return ym(y, m)
  const en = new RegExp(`\\b(${EN_MONTH.join('|')}|${EN_MONTH.map((x) => x.slice(0, 3)).join('|')})\\b(?:['’]s)?\\s+rent\\b|\\brent\\s+for\\s+(${EN_MONTH.join('|')}|${EN_MONTH.map((x) => x.slice(0, 3)).join('|')})\\b`, 'i').exec(text)
  if (en) return recent(EN_MONTH.findIndex((x) => x.startsWith((en[1] || en[2]).toLowerCase().slice(0, 3))) + 1)
  if (/\blast month\b/i.test(text)) return ym(y, m - 1)
  if (/\bthis month\b/i.test(text)) return ym(y, m)
  return null
}

/** Appended to the system prompt on a turn that carries the card, so the reply and the card say the same thing. */
export const RENT_RECORD_TURN_NOTE = `

# 本轮:记租金(系统会在你这条回复下面放一张「记租金」卡)
用户说租金收到了(或付了),要把它记上。系统会在你的回复下面附上记租金的卡:卡上列出他在管租约里还没有记录的各期,他提到的那一期已经勾上;每一期可以改成实际收到的日期(日期决定记成准时还是迟付);点确认之后才会记上,对方之后可以在租约页确认。
你的 reply 只写两三句:请他在下面的卡上核对是哪一期、哪一天收到的,再点确认;说明确认之前什么都不会记。
- 【不要】说「已经记好了」「已记为已收」「已更新租金记录」——记不记由他在卡上决定,你不能替他记。
- 【不要】自己说是哪一期、多少钱、迟了几天:以卡上的为准。
- 【不要】再让他去 /landlord/finance 或租金页,这一轮就在对话里办。
- Stayloop 不经手资金:这只是把他们自己收付的租金记下来。`
