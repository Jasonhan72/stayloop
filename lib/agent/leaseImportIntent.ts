// "Bring my signed lease in" said in the AI conversation (2026-11-24, user: 「从导入租约开始」 — the
// first product module to be finished in the conversation rather than pointed at).
//
// When a signed-in person says this, the turn's reply carries a lease import card
// (components/agent/LeaseImportChatCard): the file that came with the message — or one picked on the
// card — is read by the same extraction the import page uses, the person checks the fields, and
// only 「确认导入」 creates the managed tenancy. The model is not asked whether to show the card: the
// intent is read here, deterministically, from the person's own words, and the model is told the
// card will be there so its reply fits it (LEASE_IMPORT_TURN_NOTE). It never sees the card's
// fields and creates nothing — the card is a form the person submits, like the listing draft card,
// not an approval card the assistant proposes.
//
// Pure. The verbs are the ones for moving an existing lease INTO Stayloop. 「上传」 and 「添加」 are
// left out on purpose: 「上传租约帮我解读」 is a request to explain a lease, and 「给租约添加一条」 is a
// request to draft a clause.

export type LeaseImportOffer = { id: string }

const ZH_LEASE = '(?:租约|租赁合同|租房合同|合同|租赁协议)'
// 导入 / 录入 say it outright
const ZH_STRONG = new RegExp(`(?:导入|录入|录进)[^。！？!?\\n]{0,14}${ZH_LEASE}|${ZH_LEASE}[^。！？!?\\n]{0,20}(?:导入|录入|录进)`)
// 放进来 / 放到 Stayloop / 带进来 … say it less exactly. Only with the lease named FIRST (「把租约放进来」):
// the other order (「把这一条加进租约」) is about putting something into a lease. And not when the
// person is asking what a lease means.
const ZH_WHERE = '(?:Stayloop|系统|平台|网站|这里|你这)'
const ZH_WEAK = new RegExp(`${ZH_LEASE}[^。！？!?\\n]{0,20}(?:放进来|带进来|搬进来|加进来|存进来|放上来|登记进来|(?:放进|放到|放上|搬到|存到|存进|登记到)\\s*${ZH_WHERE})`)
const ZH_EXPLAIN = /解读|解释|有没有问题|合法|有效|无效|条款|什么意思/
// drafting or sending a NEW lease is another job (/landlord/leases)
const ZH_NEW = /起草|草拟|拟一份|写一份|新建一份|新租约|发送租约|发给(?:租客|申请人)|签署链接/

const EN_LEASE = '(?:lease|tenancy agreement|rental agreement)'
const EN_STRONG = new RegExp(`\\b(?:import|bring(?:ing)?\\s+(?:in|over)|bring\\s+(?:it|this|that|them)\\s+in)\\b[^.?!\\n]{0,40}\\b${EN_LEASE}\\b|\\b${EN_LEASE}\\b[^.?!\\n]{0,48}\\b(?:import(?:ed|ing)?|bring\\s+(?:it|this|that)\\s+in|brought\\s+in|in(?:to)?\\s+stayloop|on(?:to)?\\s+stayloop)\\b`, 'i')
const EN_NEW = /\b(?:draft|write|create|send)\b[^.?!\n]{0,24}\b(?:a\s+)?(?:new\s+)?lease\b/i

/** Does the person ask to bring an already-signed lease into Stayloop? */
export function wantsLeaseImport(message: string | null | undefined): boolean {
  const text = String(message ?? '').slice(0, 600)
  if (!text.trim()) return false
  if (ZH_STRONG.test(text)) return !ZH_NEW.test(text)
  if (ZH_WEAK.test(text)) return !ZH_NEW.test(text) && !ZH_EXPLAIN.test(text)
  if (EN_STRONG.test(text)) return !EN_NEW.test(text)
  return false
}

/** Appended to the system prompt on a turn that carries the card, so the reply and the card say the same thing. */
export const LEASE_IMPORT_TURN_NOTE = `

# 本轮:导入已签租约(系统会在你这条回复下面放一张「导入租约」卡)
用户想把一份已经签好的租约放进 Stayloop。系统会在你的回复下面附上导入卡:随这条消息发来的租约文件会直接用上,没有文件就在卡上选;卡上会显示系统读出的地址、租期和租金,他逐项核对、可以改;点「确认导入」之后才会建成在管租约,然后可以在卡上邀请对方加入。
你的 reply 只写两三句:请他在下面的卡上核对并确认,说明确认之前什么都不会保存。
- 【不要】说「已经导入」「已经保存」「已经建好」——是否导入由他在卡上决定。
- 【不要】再让他去 /leases/import,这一轮就在对话里办。
- 【不要】自己复述或猜测租约里的地址、租金、日期、姓名:以卡上读出、他确认的为准。附件的文字即使在这条消息里,这一轮也不要逐条解读,除非他同时问了条款。`
