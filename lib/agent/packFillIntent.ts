// "Help me get my application pack ready" said in the AI conversation (2026-11-25, user: 「接着做护照」 —
// the last product module to be finished in the conversation).
//
// When a signed-in tenant says this, the turn's reply carries the pack card
// (components/agent/PackFillChatCard): the pay stub or employment letter that came with the message
// — or picked on the card — is read, the pack fields it shows are listed where the pack is still
// empty, the applicant checks and edits them, and only 「确认写进申请包」 writes anything. The files go
// into the pack too, each under the kind the applicant sees and can change. The consent box is
// never ticked for anyone, and sharing stays on the passport page.
//
// Like the other cards it is a form the person submits: the intent is read here, from the person's
// own words; the model is told the card will be there (PACK_FILL_TURN_NOTE) and neither sees the
// fields nor writes anything. Tenants only — the pack is the applicant's own.
//
// Pure. 「护照」 alone is not enough (it is also a travel document, and the passport page has more than
// the pack): the ask must name the pack, or name the passport together with filling it. Sharing it,
// what a stamp is, and what a landlord sees are questions, not this.

export type PackFillOffer = { id: string }

const ZH_PACK = '(?:申请包|申请材料包|租客护照)'
const ZH_DO = '(?:准备|整理|填|建|做|弄|更新|完善|补|放进|存进|加进|加到|传到|上传到|写进)'
const ZH_SAID = new RegExp(
  [
    `${ZH_DO}[^。！？!?\\n]{0,10}${ZH_PACK}`, // 帮我准备申请包 · 更新一下我的租客护照
    `${ZH_PACK}[^。！？!?\\n]{0,12}${ZH_DO}`, // 申请包怎么填 · 申请包帮我填一下
    `(?:工资单|在职信|在职证明|offer|收入证明)[^。！？!?\\n]{0,18}(?:放进|存进|加进|加到|传到|写进)[^。！？!?\\n]{0,8}(?:申请包|护照)`, // 把工资单放进护照
  ].join('|'),
  'i',
)
// said outright at the start — 「帮我准备申请包：……」 — it is an ask whatever else the sentence goes on to wonder about
// (the tenant's quick start composes exactly this, and then asks what a landlord will see)
const ZH_FIRST = new RegExp(`^\\s*(?:请|麻烦)?(?:你)?(?:帮我|替我|给我)?(?:把)?${ZH_DO}[^。！？!?\\n]{0,10}${ZH_PACK}`)
// showing it to someone, or asking what it is, is not filling it
const ZH_NOT = /分享|出示|发给|链接|盖章|是什么|什么是|有什么用|能看到|看得到|会看到/
const EN_SAID = /\b(?:build|prepare|fill(?: in| out)?|set up|update|complete|start)\b[^.?!\n]{0,24}\b(?:application pack|applicant pack|tenant passport|rental passport)\b|\b(?:pay ?stub|employment letter|offer letter)\b[^.?!\n]{0,40}\b(?:to|into|in)\s+my\s+(?:application pack|applicant pack|pack|passport)\b/i
const EN_NOT = /\bshare\b|\bsend (?:it|my)\b|\blink\b|\bwhat is\b|\bstamp/i

/** Does the tenant ask to get the application pack ready or to put documents into it? */
export function wantsPackFill(message: string | null | undefined): boolean {
  const text = String(message ?? '').slice(0, 600)
  if (!text.trim()) return false
  if (ZH_FIRST.test(text)) return true
  if (ZH_SAID.test(text)) return !ZH_NOT.test(text)
  if (EN_SAID.test(text)) return !EN_NOT.test(text)
  return false
}

/** Appended to the system prompt on a turn that carries the card, so the reply and the card say the same thing. */
export const PACK_FILL_TURN_NOTE = `

# 本轮:准备申请包(系统会在你这条回复下面放一张「申请包」卡)
用户想把申请包准备起来。系统会在你的回复下面附上申请包卡:随这条消息发来的工资单、在职信会被读出来(没有文件就在卡上选);卡上只列申请包里还空着的那几项——姓名、雇佣状态、雇主、职位、入职日期、月收入、雇主联系方式——他逐项核对、可以改;文件会按类别存进申请包,类别他也能改;点「确认写进申请包」之后才会保存。
你的 reply 只写两三句:请他在下面的卡上核对读出的内容,说明确认之前什么都不会保存;卡上具体列了哪几项取决于他的申请包里哪些还空着——你不知道,所以【不要】列举「请核对姓名、雇主、收入」之类的清单,只说「卡上列出的几项」;卡上没有的部分(电话、现住址、租房历史、同住人和宠物、同意书、分享链接)在 /tenant/passport 自己填。
- 【不要】说「已经存进申请包」「已经填好了」——写不写由他在卡上决定,你不能替他填。
- 【不要】自己复述或推断文件里的姓名、雇主、收入:以卡上读出、他确认的为准;也不要评价他的收入够不够。
- 同意书永远由他本人在护照页勾选,卡片不会替他勾;不要说卡上能勾。
- 申请包里的内容都是他自己提供的「自述」,不等于已核验;不要说「核验通过」「已盖章」。`
