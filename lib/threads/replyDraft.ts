// An agent's reply, drafted for them — never sent for them (V0.9, 2026-11-22).
//
// A person who writes to an agent from the agent's public page waits for the agent to answer; the
// draft cuts that wait. The agent presses 「AI 起草回复」 in the conversation, the draft lands in the
// composer, the agent edits it and sends it as their own message. Nothing is posted by the model:
// an agent answers for what goes out under their name, messages between people are an append-only
// record of who said what, and the agent-role model never acts — so the model only ever fills a
// text box. (An AI that answers a visitor on its own, labelled as the agent's AI, is a separate
// step that needs the agent's and their brokerage's say-so; it is not built.)
//
// This file is the pure half: which messages go to the model, the instructions, and what is kept
// of the answer. The route is app/api/threads/draft-reply.

/** Messages given to the model, newest last. */
export const DRAFT_HISTORY_MAX = 12
/** Each message is cut to this many characters on the way in. */
export const DRAFT_BODY_MAX = 1200
/** What the agent has already typed, cut to this. */
export const DRAFT_SEED_MAX = 1500
/** The draft is cut to this many characters on the way out. */
export const DRAFT_OUT_MAX = 1800
export const DRAFT_NOTES_MAX = 3

export type DraftTurn = { from: 'client' | 'agent'; body: string; at: string }

type Row = { id: number; sender_id: string | null; kind: string; body: string | null; ref_message_id: number | null; created_at: string }

const clean = (s: string | null | undefined) => (s ?? '').replace(/\u0000/g, '').replace(/[ \t]+\n/g, '\n').trim()

/**
 * The conversation as the model sees it: people's messages only (no system rows, no formal-notice
 * copies), retracted ones left out, the last DRAFT_HISTORY_MAX, each cut to DRAFT_BODY_MAX.
 * `agentId` decides who is who — anyone else on the thread is the client side.
 */
export function draftableTurns(rows: readonly Row[], agentId: string): DraftTurn[] {
  const retracted = new Set<number>()
  for (const r of rows) if (r.kind === 'retraction' && r.ref_message_id != null) retracted.add(r.ref_message_id)
  return rows
    .filter((r) => r.kind === 'message' && !retracted.has(r.id) && clean(r.body))
    .sort((a, b) => a.id - b.id)
    .slice(-DRAFT_HISTORY_MAX)
    .map((r) => ({ from: r.sender_id === agentId ? ('agent' as const) : ('client' as const), body: clean(r.body).slice(0, DRAFT_BODY_MAX), at: r.created_at }))
}

/** The message the draft answers: the client's latest. null = nothing to reply to. */
export function lastClientTurn(turns: readonly DraftTurn[]): DraftTurn | null {
  for (let i = turns.length - 1; i >= 0; i--) if (turns[i].from === 'client') return turns[i]
  return null
}

export type DraftContext = {
  agent: { name: string; descriptor: string; brokerage: string; languages: string[]; areas: string[]; focus: string[]; bio: string | null }
  client: { name: string | null; role: 'tenant' | 'landlord' | null; area: string | null; budget: string | null }
  turns: DraftTurn[]
  /** what the agent has already typed in the box */
  seed: string
  /** the knowledge-base reference block for the client's question, or '' */
  reference: string
  /** language of the notes (the agent's interface); the draft follows the client's own language */
  notesLang: 'zh' | 'en'
}

export function replyDraftSystemPrompt(): string {
  return [
    '你在替一位安大略省的注册地产经纪起草一条回复。草稿会放进经纪的输入框，由经纪本人修改后自己发送。你不发送任何东西，也不代表经纪做任何决定。',
    '',
    '规则：',
    '1. 以经纪本人的口吻、第一人称写。不提 AI、不提「草稿」、不署名、不写称呼以外的抬头（平台会显示发送人）。',
    '2. 用对方最后一条消息的语言回复。简短，像真人发的消息：三到六句，不用标题、列表符号、加粗或表情。',
    '3. 只用下面给你的事实。不知道的不编：不报具体房源、地址、价格、空置情况、带看时间、佣金或任何费用，不保证结果。也不评价市场或房源多少——你没有任何市场数据，不说「房源不少」「选择很多」「行情不错」「很抢手」「应该不难找」之类的话。需要这些信息时，写成向对方确认，或说「我确认后回复你」。',
    '4. 可以问推进所需的信息。租客客户：想住的区域、预算、入住时间、租期、住几个人、要不要车位、是否带宠物。房东客户：房源地址、户型、期望租金、可入住日期。已经在对话里说过的不再问，一次最多问三项。',
    '5. 不问、也不评论受《人权法》保护的事项：年龄、族裔、出生地、国籍或移民身份、宗教、性别与性取向、婚姻与家庭状况（包括有没有孩子、是否怀孕）、残障、是否领取社会救助。不问收入来源；可以说之后的申请需要收入证明。',
    '6. 对方问到法规时，只按「参考资料」里的内容简要回答，条号只用参考资料里出现的。参考资料没有覆盖的，说「我核对后回复你」，不要凭记忆给条号或数字。',
    '7. 不说已经做了任何事（已预约、已发送、已提交、已安排），除非对话里经纪自己说过。',
    '8. 不作代表关系上的承诺：不说「我已经是你的经纪」「我会代表你」之类的话；可以说很乐意帮忙、下一步怎么联系。',
    '9. 「经纪已写」不为空时，在它的基础上写完整：保留他的意思和措辞，不要另起一份。',
    '',
    '只输出 JSON：{"draft": "要发的正文", "notes": ["只给经纪看的提醒"]}。',
    'notes 最多三条，写你没法确认、需要经纪补充或核对的点，用「提醒语言」指定的语言；没有就给空数组。draft 里不要出现 notes 的内容。',
  ].join('\n')
}

const list = (xs: readonly string[]) => (xs.length ? xs.join('、') : '（未填）')

export function replyDraftUserText(c: DraftContext): string {
  const who = (t: DraftTurn) => (t.from === 'agent' ? '经纪' : '对方')
  const roleZh = c.client.role === 'landlord' ? '房东（有房要出租）' : c.client.role === 'tenant' ? '租客（想租房）' : '未注明'
  return [
    '【经纪】',
    `注册名：${c.agent.name}（${c.agent.descriptor}）`,
    `经纪公司：${c.agent.brokerage || '（未填）'}`,
    `语言：${list(c.agent.languages)}`,
    `服务区域：${list(c.agent.areas)}`,
    `专长：${list(c.agent.focus)}`,
    c.agent.bio ? `自我介绍：${c.agent.bio.slice(0, 600)}` : '',
    '',
    '【对方】',
    `称呼：${c.client.name || '（未知）'}`,
    `身份：${roleZh}`,
    `想找的区域：${c.client.area || '（未填）'}`,
    `预算：${c.client.budget || '（未填）'}`,
    '',
    '【对话 · 从早到晚】',
    ...c.turns.map((t) => `${who(t)}（${t.at.slice(0, 10)}）：${t.body}`),
    '',
    `【经纪已写】${c.seed ? `\n${c.seed.slice(0, DRAFT_SEED_MAX)}` : '（空）'}`,
    '',
    c.reference ? `【参考资料】\n${c.reference}` : '【参考资料】（本次没有检索到相关原文；对方问到法规时按规则 6 处理）',
    '',
    `【提醒语言】${c.notesLang === 'zh' ? '中文' : 'English'}`,
  ].filter((l) => l !== '').join('\n')
}

export type ParsedDraft = { draft: string; notes: string[] }

/** The model's answer → what goes into the box. JSON when it is JSON; otherwise the text itself is the draft. */
export function parseReplyDraft(raw: string): ParsedDraft {
  const text = clean(raw).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  let draft = ''
  let notes: string[] = []
  const from = text.indexOf('{')
  const to = text.lastIndexOf('}')
  if (from !== -1 && to > from) {
    try {
      const j = JSON.parse(text.slice(from, to + 1)) as { draft?: unknown; notes?: unknown }
      if (typeof j.draft === 'string') draft = j.draft
      if (Array.isArray(j.notes)) notes = j.notes.filter((n): n is string => typeof n === 'string')
    } catch { /* not JSON after all: fall through */ }
  }
  // A half-written JSON object is not a message: only plain text may stand in for the draft.
  if (!draft && !/^\s*\{/.test(text)) draft = text
  draft = clean(draft).replace(/^(草稿|回复|Draft|Reply)\s*[:：]\s*/i, '').replace(/\n{3,}/g, '\n\n').slice(0, DRAFT_OUT_MAX).trim()
  return {
    draft,
    notes: notes.map((n) => clean(n).slice(0, 200)).filter(Boolean).slice(0, DRAFT_NOTES_MAX),
  }
}

// The reference block numbers its passages [K1]… and asks the model to mark what it used (lib/kb/cite.ts).
// In the assistant's own replies those marks become a source list; in a message a person sends to another
// person they are noise — the first live draft on a rules question read 「…的租金 [K1][K2]。」 (2026-11-22).
// The route reads which passages were used, then takes the marks out; the sources go to the agent, beside the box.
const KB_MARK = /[ \t]*\[\s*K\s*\d{1,2}(?:\s*[,，、;；]\s*K?\s*\d{1,2})*\s*\]/g

export function stripKbMarks(text: string): string {
  return text.replace(KB_MARK, '').replace(/[ \t]+([。，、；：,.;:!?！？])/g, '$1').replace(/[ \t]{2,}/g, ' ').trim()
}

// Questions a landlord's or agent's side must not put to a renter (Ontario Human Rights Code grounds,
// OHRC rental housing policy). The prompt forbids them; this is the net under it. It only flags — the
// agent reads the note and decides — and it looks at questions, not at every mention of a word.
const SENSITIVE: { re: RegExp; zh: string; en: string }[] = [
  { re: /(你|您|你们)[^。？?\n]{0,12}(几岁|多大|年龄)|how old are you|your age\b|date of birth/i, zh: '年龄', en: 'age' },
  { re: /(哪国人|国籍|移民身份|是不是公民|有没有身份|永久居民吗|签证[^。？?\n]{0,6}(吗|？|\?))|(are you a )?(citizen|permanent resident)\?|immigration status|what country are you from|where are you (originally )?from/i, zh: '国籍或移民身份', en: 'citizenship or immigration status' },
  { re: /(结婚了吗|已婚吗|单身吗|有没有孩子|有孩子吗|几个孩子|怀孕|打算要孩子)|are you married|marital status|do you have (any )?(kids|children)|are you pregnant|planning to have (kids|children)/i, zh: '婚姻与家庭状况', en: 'marital or family status' },
  { re: /(信什么教|宗教信仰|哪个民族|什么族裔)|your religion|what religion|your ethnicity|your race\b/i, zh: '宗教或族裔', en: 'religion or ethnicity' },
  { re: /(领[^。？?\n]{0,6}(救济|福利|低保)|靠什么生活|收入来源是什么|ODSP|Ontario Works)[^。\n]{0,10}(吗|？|\?)|are you on (welfare|social assistance|ODSP|Ontario Works)|source of (your )?income\?/i, zh: '是否领取社会救助 / 收入来源', en: 'social assistance or source of income' },
  { re: /(有没有残疾|身体有什么问题|有什么病)|do you have (a|any) disabilit|any health (issues|problems|conditions)\?/i, zh: '残障或健康状况', en: 'disability or health' },
]

/** Notes for the agent when the draft seems to ask about a protected ground. Empty when it does not. */
export function flagSensitiveAsks(draft: string, zh: boolean): string[] {
  const hit = SENSITIVE.filter((s) => s.re.test(draft)).map((s) => (zh ? s.zh : s.en))
  if (!hit.length) return []
  return [zh
    ? `草稿里可能问到了人权法不让问的内容（${hit.join('、')}），发出前请删掉或改写。`
    : `The draft may ask about something the Human Rights Code does not allow (${hit.join(', ')}) — remove or reword it before sending.`]
}

// The model has no market data, and the first live draft still wrote 「North York 两室目前的房源选择不少」
// (2026-11-22). The prompt says not to; this tells the agent when it did anyway.
const MARKET_CLAIM = /房源[^。，,\n]{0,8}(不少|很多|充足|紧张|稀缺|抢手)|(选择|选项)[^。，,\n]{0,4}(不少|很多)|行情[^。，,\n]{0,6}(不错|很好|火热|低迷)|应该不难找|很快就能找到|plenty of (listings|options|choices)|(lots|a lot) of (listings|options|inventory)|(hot|slow|tight|competitive) market|shouldn['’]t be hard to find/i

/** A note for the agent when the draft passes a judgement on the market or on how much is available. */
export function flagMarketClaims(draft: string, zh: boolean): string[] {
  return MARKET_CLAIM.test(draft)
    ? [zh ? '草稿里有一句对市场或房源多少的判断，AI 没有这方面的数据，请按你了解的情况改写或删掉。' : 'The draft passes a judgement on the market or on how much is available — the AI has no data for that. Reword it from what you know, or remove it.']
    : []
}

/** What the agent's own records say they still owe this person. From the client row, not from the model. */
export function draftReminders(client: { info_guide_given_at: string | null }, zh: boolean): string[] {
  return client.info_guide_given_at ? [] : [zh
    ? '客户表里还没有记录向这位客户提供 RECO Information Guide 的日期。'
    : 'Your client book has no date yet for giving this person the RECO Information Guide.']
}

/** What the composer says when the draft could not be made. */
export function draftErrorText(code: string | null | undefined, zh: boolean): string {
  switch (code) {
    case 'nothing_to_reply': return zh ? '对方还没有发来消息，没有可回复的内容。' : 'There is no message from the other side to reply to yet.'
    case 'registration_not_live': return zh ? 'RECO 注册核验有效后才能用 AI 起草。' : 'AI drafting is available once your RECO registration is verified and current.'
    case 'provider_not_verified': return zh ? '资质核验有效后才能用 AI 起草。' : 'AI drafting is available once your credentials are verified.'
    case 'agent_only':
    case 'provider_only':
    case 'not_supported': return zh ? '这里只有答复咨询的一方（经纪或服务商）可以用 AI 起草。' : 'Only the side answering the inquiry (the agent or the provider) can use AI drafting here.'
    case 'rate_limited':
    case 'busy': return zh ? '用得太频繁了，过一会儿再试。' : 'Too many drafts just now — try again in a little while.'
    case 'sign_in_required': return zh ? '请先登录。' : 'Sign in first.'
    default: return zh ? 'AI 这次没有写出来，请再试一次，或者自己写。' : 'The AI did not produce a draft this time — try again, or write it yourself.'
  }
}

/** Whose reply may be drafted, by conversation kind: the agent of an agent ↔ client conversation, and (since the
 *  directory got 「发消息」 on 2026-11-22) the provider of a provider inquiry. The person who wrote in is never offered it. */
export const DRAFT_SIDE: Record<string, string> = { agent_client: 'agent', provider_inquiry: 'provider' }

/** The answering side of such a conversation, with something from the other side to answer. */
export function canOfferDraft(viewer: string, kind: string, messages: readonly { kind: string; sender_id: string | null }[], me: string | null): boolean {
  return !!DRAFT_SIDE[kind] && DRAFT_SIDE[kind] === viewer && !!me && messages.some((m) => m.kind === 'message' && m.sender_id !== me)
}

// ───────────────────────────────────────────────────────── the provider's side (维修服务 / 专业服务)

export type ProviderDraftContext = {
  provider: {
    name: string
    trades: string[]
    cities: string[]
    /** as registered in the provider's profile; null = not on file */
    callOutFee: number | null
    hourlyRate: number | null
    fixedQuotes: boolean
    /** a licensed profession (paralegal, lawyer, insurance broker): intake only, never an opinion */
    professional: boolean
  }
  person: { name: string | null; hat: 'tenant' | 'landlord' | 'agent' | null }
  turns: DraftTurn[]
  seed: string
  notesLang: 'zh' | 'en'
}

export function providerDraftSystemPrompt(professional: boolean): string {
  return [
    `你在替一家${professional ? '持牌的专业服务（律师、持牌 Paralegal 或保险经纪）' : '上门服务（维修，或房源拍摄）'}服务商起草一条回复。草稿会放进服务商的输入框，由服务商本人修改后自己发送。你不发送任何东西，也不代表服务商做任何决定。`,
    '',
    '规则：',
    '1. 以服务商本人的口吻写，可以用「我」或「我们」。不提 AI、不提「草稿」、不署名、不写称呼以外的抬头（平台会显示发送人）。',
    '2. 用对方最后一条消息的语言回复。简短，像真人发的消息：三到六句，不用标题、列表符号、加粗或表情。',
    '3. 只用下面给你的事实。价格只能引用「服务商资料」里登记的上门费和工时费，原样引用；不估算总价、不给资料里没有的任何金额、不承诺上门时间或档期、不保证结果。资料里没有登记价格，就说了解情况后再报价。',
    professional
      ? '4. 这是持牌专业服务，这条消息只做接待：确认收到，问清基本情况（大概是哪一类事、有没有期限或开庭日期、所在城市），说明需要先安排一次咨询。不给法律意见或保险建议，不评价对方的事有没有道理或胜算，不解释法条或保单怎样适用于对方的情况，不报任何费用或保费。提醒对方不要在消息里发证件号码。'
      : '4. 可以问推进所需的信息：要做什么（出了什么问题，或要拍哪套房）、在哪个城市或大概位置、有没有照片、什么时候方便上门、对方是房东还是租客（谁来确认工作和付款）。已经在对话里说过的不再问，一次最多问三项。',
    professional
      ? '5. 对方描述的事如果有紧迫的期限（比如几天内要开庭或要答复），只提醒尽快安排咨询，不替对方判断该怎么做。'
      : '5. 对方提到燃气味、冒烟起火、触电风险或正在大量漏水时，先请对方注意安全：离开现场或关掉总闸，拨打 911 或燃气、电力公司的紧急电话；然后再谈维修。',
    '6. 不问、也不评论受《人权法》保护的事项：年龄、族裔、出生地、国籍或移民身份、宗教、性别与性取向、婚姻与家庭状况、残障、是否领取社会救助。',
    '7. 对方是租客时，不替任何人决定费用该谁出；可以提一句维修通常要先告诉房东。',
    '8. 不说已经做了任何事（已预约、已派人、已安排、已下单），除非对话里服务商自己说过。',
    '9. 「服务商已写」不为空时，在它的基础上写完整：保留原意和措辞，不要另起一份。',
    '',
    '只输出 JSON：{"draft": "要发的正文", "notes": ["只给服务商看的提醒"]}。',
    'notes 最多三条，写你没法确认、需要服务商补充或核对的点，用「提醒语言」指定的语言；没有就给空数组。draft 里不要出现 notes 的内容。',
  ].join('\n')
}

const cad = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`

export function providerDraftUserText(c: ProviderDraftContext): string {
  const who = (t: DraftTurn) => (t.from === 'agent' ? '服务商' : '对方')
  const hat = c.person.hat === 'landlord' ? '房东' : c.person.hat === 'tenant' ? '租客' : c.person.hat === 'agent' ? '经纪' : '未注明'
  const price = c.provider.fixedQuotes
    ? '固定报价（了解情况后报价），没有登记单价'
    : [c.provider.callOutFee != null ? `上门费 ${cad(c.provider.callOutFee)}` : '', c.provider.hourlyRate != null ? `工时费 ${cad(c.provider.hourlyRate)}/小时` : ''].filter(Boolean).join('，') || '没有登记价格'
  return [
    '【服务商资料】',
    `名称：${c.provider.name}`,
    `服务项目：${list(c.provider.trades)}`,
    `服务城市：${list(c.provider.cities)}`,
    `登记的价格：${price}`,
    '',
    '【对方】',
    `称呼：${c.person.name || '（未知）'}`,
    `发消息时的身份：${hat}`,
    '',
    '【对话 · 从早到晚】',
    ...c.turns.map((t) => `${who(t)}（${t.at.slice(0, 10)}）：${t.body}`),
    '',
    `【服务商已写】${c.seed ? `\n${c.seed.slice(0, DRAFT_SEED_MAX)}` : '（空）'}`,
    '',
    `【提醒语言】${c.notesLang === 'zh' ? '中文' : 'English'}`,
  ].join('\n')
}

// The provider's own prices are the only amounts a draft may state. Any other dollar figure is the model's.
const AMOUNT = /\$\s?(\d[\d,]*(?:\.\d+)?)|(\d[\d,]*(?:\.\d+)?)\s?(?:加元|加币|元|块钱|dollars?|CAD)/gi

/** A note for the provider when the draft states an amount that is not one of their registered prices. */
export function flagUnlistedAmounts(draft: string, listed: readonly (number | null)[], zh: boolean): string[] {
  const ok = new Set(listed.filter((n): n is number => typeof n === 'number').map((n) => Number(n)))
  const odd: string[] = []
  for (const m of draft.matchAll(AMOUNT)) {
    const n = Number((m[1] || m[2] || '').replace(/,/g, ''))
    if (Number.isFinite(n) && !ok.has(n) && !odd.includes(String(n))) odd.push(String(n))
  }
  if (!odd.length) return []
  return [zh
    ? `草稿里出现了资料里没有登记的金额（${odd.map((x) => '$' + x).join('、')}），AI 不知道你的报价，请核对或删掉。`
    : `The draft states an amount that is not in your profile (${odd.map((x) => '$' + x).join(', ')}) — the AI does not know your prices; check it or remove it.`]
}

