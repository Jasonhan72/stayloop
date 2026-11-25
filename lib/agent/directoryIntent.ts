// "Find me an agent / a plumber / a paralegal" said in the AI conversation (2026-11-24, user: 「接着做
// 找人」 — the third product module finished in the conversation).
//
// Until now the assistant, asked this, gave the three directory paths and nothing else: it cannot
// see who is in the directory, so it names nobody. That half is unchanged. What is new is that the
// SYSTEM answers alongside it: when a signed-in person asks, the turn's reply carries the directory
// card (components/agent/DirectoryChatCard) — the directory's own rows, read the way the directory
// pages read them, in the directory's fixed order, as the directory's own cards, narrowed by what
// the person said (a trade, a language, a city) — and the person can write to someone from the card.
// The model still sees none of it: it is told a card will be there and that it must go on naming,
// counting and recommending nobody (directoryTurnNote).
//
// Pure. The ask is read from the person's own words. It needs a subject (who they want) AND a sign
// that they are looking for one; it is not an ask when they want to JOIN the directory, when a
// landlord wants to dispatch a ticket (that is done on the ticket), or when a tenant wants a
// tradesperson — something broken in a rental is a repair request first, and the landlord pays.
import type { AssistantRole } from '@/lib/homeDeepLink'
import { CITIES, type Trade } from '@/lib/marketplace/trades'

export type DirectoryKind = 'agents' | 'repairs' | 'professional'
export type DirectoryAsk = { kind: DirectoryKind; trade: Trade | null; language: string | null; city: string | null }
export type DirectoryOffer = DirectoryAsk & { id: string }

// 「找房」「找工作」 are not looking for a person; 「需要」 alone is too common a word to count
const LOOKING = /找(?!房|工作)|推荐|介绍(?:一|个|位|几)|哪里|哪儿|有没有|需要(?:一位|一个|个|找|请)|想要(?:一位|一个|个|找)|想请|请(?:个|一个|一位|位)|联系(?:一|个)|认识|\b(?:find|looking for|look for|need an?|need some|recommend|know (?:a|an|any)|where can i|where do i|is there|are there|hire|get me)\b/i
// wanting to be IN the directory, not to find someone in it
const JOINING = /加入|入驻|申请|注册成为|怎么(?:让我|才能)出现|我是(?:一名|一个|个)?(?:水管工|电工|经纪|律师|摄影|锁匠|师傅|服务商|paralegal)|\b(?:join|become an?|sign up as|list (?:my|our)|i am an?|i'm an?)\b/i
// a landlord sending someone to a ticket: done on the ticket, not from a directory
const DISPATCH = /派单|指派|派给|派人|工单|\b(?:dispatch|assign|work order|ticket)\b/i

const PROFESSIONAL: [Trade, RegExp][] = [
  ['paralegal', /paralegal|法律代理|持牌代理/i],
  ['lawyer', /律师|\b(?:lawyer|attorney|solicitor)\b/i],
  ['insurance_broker', /保险|租客险|房东险|\binsurance\b/i],
  ['photographer_floorplan', /摄影|拍房源|拍照的|户型图|\b(?:photographer|floor ?plans?)\b/i],
]
const REPAIR: [Trade, RegExp][] = [
  ['plumbing', /水管|水暖|通下水|通马桶|\b(?:plumber|plumbing)\b/i],
  ['electrical', /电工|电路|\b(?:electrician|electrical)\b/i],
  ['heating_cooling', /暖气|供暖|空调|锅炉|暖通|\b(?:hvac|furnace|heating|air[- ]?condition\w*)\b/i],
  ['appliance', /电器|修(?:洗衣机|冰箱|烤箱|洗碗机|烘干机|炉头)|\bappliances?\b/i],
  ['pest', /除虫|灭虫|杀虫|虫害|蟑螂|老鼠|臭虫|\b(?:pest|exterminator)\b/i],
  ['locks_safety', /锁匠|换锁|开锁|门锁|\b(?:locksmith|locks?)\b/i],
  ['structural', /门窗|修门|修窗|墙面|\b(?:drywall|windows?|doors?)\b/i],
  ['handyman', /杂工|清洁|保洁|打扫|\b(?:handyman|cleaners?|cleaning)\b/i],
]
const REPAIR_ANY = /维修师傅|修理工|维修工|师傅|服务商|物业管理服务|\b(?:contractor|tradesperson|repair (?:person|company|service))\b/i
const AGENT = /经纪|中介|\b(?:realtor|(?:leasing|rental|real estate) agent|broker)\b/i

// The languages people ask for, to the agent directory's codes (lib/agentPublic.ts AGENT_LANGUAGES).
const LANGUAGES: [string, RegExp][] = [
  ['yue', /粤语|广东话|\bcantonese\b/i],
  ['zh', /中文|国语|普通话|华语|\b(?:mandarin|chinese)\b/i],
  ['fr', /法语|\bfrench\b/i], ['ko', /韩语|韩文|\bkorean\b/i], ['fa', /波斯语|\b(?:farsi|persian)\b/i],
  ['hi', /印地语|\bhindi\b/i], ['pa', /旁遮普语|\bpunjabi\b/i], ['ur', /乌尔都语|\burdu\b/i],
  ['ta', /泰米尔语|\btamil\b/i], ['tl', /他加禄语|菲律宾语|\b(?:tagalog|filipino)\b/i], ['vi', /越南语|\bvietnamese\b/i],
  ['es', /西班牙语|\bspanish\b/i], ['pt', /葡萄牙语|\bportuguese\b/i], ['ru', /俄语|\brussian\b/i],
  ['uk', /乌克兰语|\bukrainian\b/i], ['ar', /阿拉伯语|\barabic\b/i], ['it', /意大利语|\bitalian\b/i],
  ['en', /英语|英文|\benglish\b/i],
]
const CITY_ZH: Record<string, string> = {
  多伦多: 'Toronto', 士嘉堡: 'Scarborough', 士嘉宝: 'Scarborough', 北约克: 'North York', 怡陶碧谷: 'Etobicoke', 密西沙加: 'Mississauga',
  宾顿: 'Brampton', 布兰普顿: 'Brampton', 旺市: 'Vaughan', 万锦: 'Markham', 列治文山: 'Richmond Hill', 奥克维尔: 'Oakville',
  伯灵顿: 'Burlington', 哈密尔顿: 'Hamilton', 汉密尔顿: 'Hamilton', 皮克林: 'Pickering', 阿贾克斯: 'Ajax', 惠特比: 'Whitby', 奥沙瓦: 'Oshawa', 新市: 'Newmarket', 奥罗拉: 'Aurora',
}

function cityIn(text: string): string | null {
  // the longest name first: 「North York」 before 「York」-like prefixes, 「Richmond Hill」 whole
  for (const c of [...CITIES].sort((a, b) => b.length - a.length)) if (new RegExp(`\\b${c}\\b`, 'i').test(text)) return c
  for (const [zh, c] of Object.entries(CITY_ZH)) if (text.includes(zh)) return c
  return null
}
const first = <T,>(list: [T, RegExp][], text: string): T | null => list.find(([, re]) => re.test(text))?.[0] ?? null

/** What the person is looking for in the directory, or null when this is not such an ask. */
export function directoryAsk(message: string | null | undefined, role: AssistantRole): DirectoryAsk | null {
  const text = String(message ?? '').slice(0, 600)
  if (!text.trim() || JOINING.test(text) || DISPATCH.test(text)) return null
  // the looking and the who must be in one clause: 「我找房的时候经纪让我先付押金，合法吗」 is not an ask
  const asked = text.split(/[，。？！；,.?!;\n]+/).filter((c) => LOOKING.test(c)).join(' ')
  if (!asked) return null
  // the rest of what they said still narrows it: 「我想找一位经纪，最好会说中文，在北约克」
  const city = cityIn(text)
  const language = first(LANGUAGES, text)
  // 「保险经纪」 is a professional, not a leasing agent: the professions are read before 「经纪」
  const pro = first(PROFESSIONAL, asked)
  if (pro) return { kind: 'professional', trade: pro, language, city }
  if (AGENT.test(asked)) {
    // an agent's own conversation is not where one looks for an agent
    return role === 'agent' ? null : { kind: 'agents', trade: null, language, city }
  }
  // 「暖气不热，帮我找个师傅」: the trade may be named in the clause before the ask
  const generic = REPAIR_ANY.test(asked)
  const trade = first(REPAIR, asked) ?? (generic ? first(REPAIR, text) : null)
  if (trade || generic) {
    // a tenant's broken thing is the landlord's to repair: the assistant takes the repair request instead
    return role === 'tenant' ? null : { kind: 'repairs', trade, language: null, city }
  }
  return null
}

const KIND_ZH: Record<DirectoryKind, string> = { agents: '经纪', repairs: '物业管理服务商', professional: '专业服务' }

/** Appended to the system prompt on a turn that carries the card, so the reply and the card say the same thing. */
export function directoryTurnNote(kind: DirectoryKind): string {
  return `

# 本轮:找人(系统会在你这条回复下面放一张「${KIND_ZH[kind]}」目录卡)
用户在找${KIND_ZH[kind]}。系统会在你的回复下面附上目录卡:它直接读「找经纪和服务商」目录,按目录的固定顺序列出符合条件的人,用户可以在卡上看主页、直接发消息。
你【看不到】卡上是谁——这一点没有变。你的 reply 只写两三句:告诉他下面的卡按他说的条件列出了目录里的人,条件可以在卡上改,想联系谁就在卡上发消息。
- 【不要】点名,不要推荐某一位,不要说「有很多」「有 N 位」「下面这几位都不错」:卡上有谁、有几位你不知道,也可能一位都没有。
- 【不要】编造名字、电话、评分、价格或资质。
- 可以如实说:目录的顺序是固定的,不是推荐也不收排名费;核验只表示核验当天注册有效,不是 Stayloop 的背书;Stayloop 不抽成,费用由他和对方直接谈。${kind === 'repairs' ? '服务商目录还在试点,目前覆盖多伦多及周边。如果这是 Stayloop 上已经有的一张报修工单,提醒他:派单要在 /landlord/maintenance 那张工单上点「指派」(报价批准、进入通知和验收都跟着工单走),卡片只是看人和联系。' : ''}${kind === 'professional' ? 'Paralegal 就写 Paralegal,不要译成「法律顾问」或「律师」;你不给法律意见,也不卖保险。' : ''}
- 【不要】再只丢一个目录链接让他自己去翻,这一轮就在对话里看。`
}
