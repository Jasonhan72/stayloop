// The homepage film (user 2026-09-28: "按照三个角色联动的方式…希望有真人的角色演绎",
// then "先用 C 3D 卡通人物来做"): Mia Chen (tenant), Sarah Wang (landlord) and
// David Park (agent) — the site's sample canon — each with their own assistant,
// one unit from listing to renewal. This file is only the script and its
// timing; components/home/ThreeRoleFilm.tsx plays it through the product's OWN
// chat (AgentChat), cards (ApprovalActionCard, ListingChatCard) and lines:
//   · greetings and the "✅ 已执行" line — lib/agent/chatCopy,
//   · the "已按 … 过滤" suffix — lib/agent/hardConstraints.constraintsNote,
//   · the showing card and its push — the wording /api/showing-intent writes,
//   · the admission card — the one /landlord/applicants/[id] creates,
//   · the renewal card and its push — lib/agent/renewalStages.buildRenewalProposal
//     itself and the proactive sweep's push,
//   · the agent's "正在代表" line — lib/delegations/shared.representingLine,
//   · email subjects — the ones /api/agent/execute and lib/lease/sendLease send.
// Only live flows: no rent collection, no passport stamps, the agent never
// decides for the landlord, the tenant never sees a score, no statistics.
import type { AgentRole, AgentStatus, ChatMessage, ListingCard, PendingAction } from '@/lib/agent/types'
import type { Lang } from '@/lib/i18n'
import { constraintsNote } from '@/lib/agent/hardConstraints'
import { executedText, greeting, rentAmount } from '@/lib/agent/chatCopy'
import { buildRenewalProposal } from '@/lib/agent/renewalStages'
import { representingLine } from '@/lib/delegations/shared'
import { isoDate, todayUtc } from '@/lib/dates'

export type Person = 'mia' | 'sarah' | 'david'
/** Left to right: Sarah sits in the middle — every hand-off in the story goes through her. */
export const PEOPLE: Person[] = ['mia', 'sarah', 'david']
type Bi = { zh: string; en: string }

export const CAST: Record<Person, { name: string; role: AgentRole; hat: Bi; assistant: string; avatar: string; color: string }> = {
  mia: { name: 'Mia Chen', role: 'tenant', hat: { zh: '租客', en: 'Tenant' }, assistant: 'Momo', avatar: 'cat', color: '#7C3AED' },
  sarah: { name: 'Sarah Wang', role: 'landlord', hat: { zh: '房东', en: 'Landlord' }, assistant: 'Bao', avatar: 'panda', color: '#047857' },
  david: { name: 'David Park', role: 'agent', hat: { zh: '经纪', en: 'Agent' }, assistant: 'Ollie', avatar: 'owl', color: '#2563EB' },
}

/** 3D character stills generated for the film (fictional people). */
export const SHOTS = {
  'sarah-kitchen': '/home/film/sarah-kitchen.webp',
  'david-lobby': '/home/film/david-lobby.webp',
  'mia-subway': '/home/film/mia-subway.webp',
  'sarah-lunch': '/home/film/sarah-lunch.webp',
  showing: '/home/film/showing.webp',
  'mia-sofa': '/home/film/mia-sofa.webp',
  'david-car': '/home/film/david-car.webp',
  'sarah-report': '/home/film/sarah-report.webp',
  'mia-cafe': '/home/film/mia-cafe.webp',
  'sarah-couch': '/home/film/sarah-couch.webp',
  'mia-cat': '/home/film/mia-cat.webp',
  'sarah-tea': '/home/film/sarah-tea.webp',
} as const
export type ShotKey = keyof typeof SHOTS

/** Head-and-shoulders crops of the same three characters (name chips, the phone relay bar). */
export const FACES: Record<Person, string> = {
  mia: '/home/film/face-mia.webp',
  sarah: '/home/film/face-sarah.webp',
  david: '/home/film/face-david.webp',
}

/** Listing-card photos: the placeholders the product itself uses when a listing
 *  has none (lib/agent/listingSearch.ts STOCK; a guard test keeps them equal). */
export const FILM_STOCK = [
  'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=600&q=80&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=600&q=80&auto=format&fit=crop',
]

export const MIA_EMAIL = 'mia.chen@example.com'
export const SARAH_EMAIL = 'sarah.wang@example.com'
export const RENT = 2800
export const ADDR = 'King St W #1207'
export const UNIT = 'Unit 1207'

export type NotifyKind = 'push' | 'mail'

export type Beat =
  | { at: number; k: 'caption'; text: string }
  | { at: number; k: 'focus'; lanes: Person[]; shots: Partial<Record<Person, ShotKey>> }
  | { at: number; k: 'strip'; lane: Person; text: string; note: string }
  | { at: number; k: 'type'; lane: Person; text: string; dur: number }
  | { at: number; k: 'send'; lane: Person; text: string }
  | { at: number; k: 'status'; lane: Person; status: AgentStatus }
  | { at: number; k: 'reply'; lane: Person; msg: Omit<ChatMessage, 'id' | 'role'>; card?: PendingAction }
  | { at: number; k: 'card'; lane: Person; card: PendingAction }
  | { at: number; k: 'reveal'; lane: Person; option?: 'A' | 'B' }
  | { at: number; k: 'pointer'; lane: Person; option?: 'A' | 'B' }
  | { at: number; k: 'click'; lane: Person; option?: 'A' | 'B' }
  | { at: number; k: 'done'; lane: Person; text: string }
  | { at: number; k: 'handoff'; from: Person; to: Person; label: string }
  | { at: number; k: 'notify'; lane: Person; kind: NotifyKind; title: string; body?: string }

/** A beat before it is placed on the clock (Omit over each member of the union). */
type Unplaced<T> = T extends unknown ? Omit<T, 'at'> : never
type BeatIn = Unplaced<Beat>

export type FilmChapter = { key: string; stage: string; title: string; beats: Beat[]; end: number; keyAt: number }

/** Every date in the film follows from today, so the cards never show a stale or impossible date. */
export function filmDates(now: Date) {
  const t = todayUtc(now)
  const moveIn = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 2, 1))
  const leaseEnd = new Date(Date.UTC(moveIn.getUTCFullYear() + 1, moveIn.getUTCMonth(), 0))
  // The renewal chapter plays one year on: 91 days before the term ends —
  // inside the 90-day touchpoint's window, the N1 still servable.
  const renewalDay = new Date(leaseEnd.getTime() - 91 * 86_400_000)
  const delegationUntil = new Date(Date.UTC(t.getUTCFullYear() + 1, t.getUTCMonth(), t.getUTCDate()))
  return { today: t, moveIn: isoDate(moveIn), leaseEnd: isoDate(leaseEnd), renewalDay, delegationUntil: delegationUntil.toISOString() }
}

export function greetingFor(p: Person, lang: Lang): string {
  return greeting(CAST[p].role, CAST[p].assistant, lang)
}

function typeDur(text: string, lang: Lang): number {
  return Math.max(900, Math.min(1800, Array.from(text).length * (lang === 'zh' ? 80 : 38)))
}

function card(p: Omit<PendingAction, 'user_id' | 'status' | 'requires_approval' | 'metadata' | 'created_at'> & { metadata?: Record<string, unknown> }, now: Date): PendingAction {
  return { user_id: 'film', status: 'pending', requires_approval: true, metadata: {}, created_at: now.toISOString(), ...p }
}

/** A small timeline writer: beats land on the running clock; `wait` moves it. */
function writer(lang: Lang) {
  let t = 0
  let keyAt = 0
  const beats: Beat[] = []
  const w = {
    beats,
    get t() { return t },
    get keyAt() { return keyAt },
    /** The chapter's key frame: what reduced motion shows, and where a paused jump lands. */
    key() { keyAt = t + 1 },
    wait(ms: number) { t += ms; return w },
    push(b: BeatIn) { beats.push({ ...b, at: t } as Beat); return w },
    /** type → send → the thinking indicator */
    ask(lane: Person, text: string) {
      const dur = typeDur(text, lang)
      w.push({ k: 'type', lane, text, dur })
      t += dur + 280
      w.push({ k: 'send', lane, text })
      w.push({ k: 'status', lane, status: 'understanding' })
      t += 450
      w.push({ k: 'status', lane, status: 'working' })
      t += 750
      return w
    },
    /** Scroll to the card's own button, tap it; the 60-second undo is skipped and the executed line lands. */
    approve(lane: Person, done: string, option?: 'A' | 'B') {
      w.push({ k: 'reveal', lane, option })
      t += 450
      w.push({ k: 'pointer', lane, option })
      t += 820
      w.push({ k: 'click', lane, option })
      t += 1800
      w.push({ k: 'done', lane, text: done })
      return w
    },
  }
  return w
}

export function filmFor(lang: Lang, now: Date): FilmChapter[] {
  const zh = lang === 'zh'
  const L = (b: Bi) => (zh ? b.zh : b.en)
  const D = filmDates(now)
  const chapters: FilmChapter[] = []
  const strip = {
    text: representingLine({ principal_name: 'Sarah Wang', principal_email: SARAH_EMAIL, scope: ['listing', 'matter'], expires_at: D.delegationUntil }, zh),
    note: L({ zh: '代客的每一步都记入客户的审计并标注委托', en: 'Every step for a client is written to their audit log under the delegation' }),
  }

  // ── 1 · Delegation and price ────────────────────────────────────────────
  {
    const w = writer(lang)
    w.push({ k: 'focus', lanes: ['sarah', 'david'], shots: { mia: 'mia-subway', sarah: 'sarah-kitchen', david: 'david-lobby' } })
    w.push({ k: 'caption', text: L({ zh: 'Sarah 要把 Unit 1207 租出去，请经纪 David 代办。', en: 'Sarah is letting Unit 1207 and asks her agent, David, to handle it.' }) })
    w.wait(600)
    w.ask('sarah', L({ zh: '把 Unit 1207 交给 David 代租，申请来了告诉我', en: 'Have David lease Unit 1207, and tell me when applications arrive' }))
    w.push({ k: 'reply', lane: 'sarah', msg: { text: L({
      zh: '好。David 会从他的客户表发一份委托给你确认；确认后他可以在委托范围内替你筛查申请、起草租约。录取和任何对外发出的东西，仍然要你本人批准。',
      en: 'Sure. David sends you a delegation to confirm from his client table; once you confirm, he can screen applications and draft the lease within it. Admitting a tenant and anything sent out still needs your own approval.',
    }) } })
    w.push({ k: 'status', lane: 'sarah', status: 'result' })
    w.key()
    w.wait(1500)
    w.push({ k: 'caption', text: L({ zh: 'Sarah 在邮件链接里确认了委托，David 的工作台上多了一行「正在代表」。', en: 'Sarah confirms the delegation from the email link; David’s workspace now says who he represents.' }) })
    w.push({ k: 'handoff', from: 'sarah', to: 'david', label: L({ zh: '委托已确认', en: 'Delegation confirmed' }) })
    w.wait(800)
    w.push({ k: 'strip', lane: 'david', ...strip })
    w.wait(700)
    w.ask('david', L({ zh: '帮 Sarah 的 King West 一房定租金', en: 'Price Sarah’s one-bed in King West' }))
    w.push({ k: 'reply', lane: 'david', msg: { text: L({
      zh: '按同区一房的实时挂牌和 TRREB 官方成交数据，建议挂 $2,800/月；楼层高、景观好可以略往上调。',
      en: 'From live one-bed listings nearby and TRREB’s official leased data: list at $2,800/month, a little more for a high floor or a view.',
    }) } })
    w.push({ k: 'status', lane: 'david', status: 'result' })
    w.wait(1400)
    w.push({ k: 'caption', text: L({ zh: '定价回到 Sarah 手里，房源经 Stayloop 核验后上线。', en: 'The price goes back to Sarah; the listing goes live after Stayloop verifies it.' }) })
    w.push({ k: 'handoff', from: 'david', to: 'sarah', label: L({ zh: '定价 $2,800', en: 'Price: $2,800' }) })
    w.wait(2300)
    chapters.push({ key: 'delegate', stage: L({ zh: '租前', en: 'Before' }), title: L({ zh: '委托定价', en: 'Delegate' }), beats: w.beats, end: w.t, keyAt: w.keyAt })
  }

  // ── 2 · Search and showing ──────────────────────────────────────────────
  {
    const w = writer(lang)
    w.push({ k: 'focus', lanes: ['mia', 'sarah'], shots: { mia: 'mia-subway', sarah: 'sarah-lunch', david: 'david-lobby' } })
    w.push({ k: 'strip', lane: 'david', ...strip })
    w.push({ k: 'caption', text: L({ zh: 'Mia 在地铁上说出想要的房子。', en: 'On the subway, Mia says what she is looking for.' }) })
    w.wait(600)
    w.ask('mia', L({ zh: 'King West 一房，能养猫，2,800 以内', en: 'One-bed in King West, cats OK, under $2,800' }))
    const listings: ListingCard[] = [
      { id: 'film-l1', source: 'stayloop', title: UNIT, address: `${UNIT} · King St W`, neighborhood: 'King West', city: 'Toronto', price: RENT, beds: 1, baths: 1, sqft: 610, image: FILM_STOCK[0], tags: zh ? ['允许宠物', '近 504 电车'] : ['Pets OK', 'By the 504'] },
      { id: 'film-l2', source: 'realtor', title: 'Strachan Ave', address: 'Strachan Ave & King St W', neighborhood: 'Niagara', city: 'Toronto', price: 2750, beds: 1, baths: 1, sqft: 580, image: FILM_STOCK[1], tags: ['den', zh ? '允许宠物' : 'Pets OK'] },
    ]
    w.push({ k: 'reply', lane: 'mia', msg: {
      text: L({ zh: '找到 2 套合适的：1 套 Stayloop 已核验，1 套来自 Realtor.ca 实时挂牌。点开卡片看详情、约看房。', en: 'Found 2 that fit: 1 verified on Stayloop, 1 live on Realtor.ca. Open a card for details and to book a showing.' })
        + constraintsNote({ max_price: RENT, min_beds: 1, pets: true, from_memory: [], no_budget_limit: false }, zh, 0),
      listings,
      // One card per page in a phone-width chat: Unit 1207 first, the second behind 「换一批」.
      listingsPage: 1,
    } })
    w.push({ k: 'status', lane: 'mia', status: 'result' })
    w.wait(1700)
    w.push({ k: 'caption', text: L({ zh: '她在房源页点「预约看房」，请求变成 Sarah 助理里的一张卡片。', en: 'She taps “Book a showing” on the listing; the request becomes a card in Sarah’s AI Agent.' }) })
    w.push({ k: 'handoff', from: 'mia', to: 'sarah', label: L({ zh: '看房请求', en: 'Showing request' }) })
    w.wait(800)
    // /api/showing-intent: the card, then the push to the landlord.
    const line = L({ zh: `想看房，期望入住 ${D.moveIn}：周六上午方便的话想来看看`, en: `would like a showing, move-in ${D.moveIn}: Saturday morning if that works` })
    const showing = card({
      id: 'film-showing', role: 'landlord', action_type: 'showing_request', risk_level: 'low',
      title: L({ zh: `看房请求：Mia Chen · ${ADDR}`, en: `Showing request: Mia Chen · ${ADDR}` }),
      summary: zh
        ? `Mia Chen（${MIA_EMAIL}）${line}。批准 = 同意安排看房：我会把你的联系邮箱发给对方，由你们直接约时间；拒绝则不回复。 按 OHRC 租房政策，看房与回答提问不得因受保护特征区别对待。`
        : `Mia Chen (${MIA_EMAIL}) ${line}. Approve = agree to a showing: I send your contact email to her and you set the time directly; reject = no reply. Under the OHRC rental policy, showings and answers may not differ by protected grounds.`,
      recipient_label: MIA_EMAIL,
      data_scope: zh ? ['你的联系邮箱', '房源地址'] : ['Your contact email', 'The listing address'],
      excluded_data: zh ? ['筛查报告', '其他申请人信息'] : ['Screening reports', 'Other applicants’ information'],
    }, now)
    w.push({ k: 'notify', lane: 'sarah', kind: 'push', title: L({ zh: `看房请求 · ${ADDR}`, en: `Showing request · ${ADDR}` }), body: `Mia Chen${zh ? '：' : ': '}${line}` })
    // she taps the push: the banner goes, the card is there
    w.wait(1300)
    w.push({ k: 'card', lane: 'sarah', card: showing })
    w.push({ k: 'status', lane: 'sarah', status: 'approval' })
    w.key()
    w.wait(1300)
    w.approve('sarah', executedText({ title: showing.title, actionType: showing.action_type, sentTo: MIA_EMAIL, zh }))
    w.wait(400)
    w.push({ k: 'handoff', from: 'sarah', to: 'mia', label: L({ zh: '看房已确认', en: 'Showing confirmed' }) })
    w.wait(700)
    w.push({ k: 'notify', lane: 'mia', kind: 'mail', title: `看房请求已确认 · ${ADDR} / Showing request accepted` })
    w.wait(2300)
    chapters.push({ key: 'showing', stage: L({ zh: '租前', en: 'Before' }), title: L({ zh: '找房看房', en: 'Search' }), beats: w.beats, end: w.t, keyAt: w.keyAt })
  }

  // ── 3 · Application and screening ───────────────────────────────────────
  {
    const w = writer(lang)
    w.push({ k: 'focus', lanes: ['mia', 'david'], shots: { mia: 'mia-sofa', sarah: 'sarah-lunch', david: 'showing' } })
    w.push({ k: 'strip', lane: 'david', ...strip })
    w.push({ k: 'caption', text: L({ zh: 'David 带 Mia 看完房，Mia 在申请页一次交齐材料。', en: 'David shows Mia the unit; she applies once, with all her documents.' }) })
    w.wait(1600)
    w.push({ k: 'handoff', from: 'mia', to: 'sarah', label: L({ zh: '申请', en: 'Application' }) })
    w.wait(1000)
    w.push({ k: 'focus', lanes: ['david', 'sarah'], shots: { david: 'david-car', sarah: 'sarah-report' } })
    w.push({ k: 'caption', text: L({ zh: 'David 在委托范围内，替 Sarah 发起筛查。', en: 'Within the delegation, David starts the screening for Sarah.' }) })
    w.wait(500)
    w.ask('david', L({ zh: '帮 Sarah 筛查 Mia Chen 的申请', en: 'Screen Mia Chen’s application for Sarah' }))
    w.push({ k: 'reply', lane: 'david', msg: { text: L({
      zh: '你和 Sarah 的委托包含筛查。在客户表里点「发起筛查」；报告 Sarah 也能直接看到，录取由她本人决定。',
      en: 'Your delegation from Sarah covers screening. Start it from your client table; Sarah sees the report directly, and the decision is hers.',
    }) } })
    w.push({ k: 'status', lane: 'david', status: 'result' })
    w.wait(1600)
    w.push({ k: 'handoff', from: 'david', to: 'sarah', label: L({ zh: '筛查报告', en: 'Screening report' }) })
    w.push({ k: 'caption', text: L({ zh: '报告交到 Sarah 手里，每条结论注明依据。她在申请人页点「录取 · 起草通知」。', en: 'The report reaches Sarah, every finding with its evidence. On the applicant page she taps “Admit · draft notice”.' }) })
    w.wait(1400)
    // /landlord/applicants/[id] proposeNotice('approved')
    const decision = card({
      id: 'film-decision', role: 'landlord', action_type: 'send_decision', risk_level: 'low',
      title: L({ zh: `录取通知：Mia Chen · ${ADDR}`, en: `Admission notice: Mia Chen · ${ADDR}` }),
      summary: L({
        zh: `批准后我会给 ${MIA_EMAIL} 发录取通知，并说明租约随后送达。信里固定带《消费者报告法》s.10(7) 与 OHRC 声明。`,
        en: `Once approved I send the admission notice to ${MIA_EMAIL} and say the lease follows. The letter always carries the Consumer Reporting Act s.10(7) and OHRC statements.`,
      }),
      recipient_label: MIA_EMAIL,
      data_scope: zh ? ['申请结果', '房东联系邮箱'] : ['The decision', 'Your contact email'],
      excluded_data: zh ? ['筛查报告', '评分', '其他申请人信息'] : ['Screening report', 'Score', 'Other applicants’ information'],
    }, now)
    w.push({ k: 'card', lane: 'sarah', card: decision })
    w.push({ k: 'status', lane: 'sarah', status: 'approval' })
    w.key()
    w.wait(1300)
    w.approve('sarah', executedText({ title: decision.title, actionType: decision.action_type, sentTo: MIA_EMAIL, zh }))
    w.wait(400)
    w.push({ k: 'handoff', from: 'sarah', to: 'mia', label: L({ zh: '录取通知', en: 'Admission notice' }) })
    w.wait(700)
    w.push({ k: 'notify', lane: 'mia', kind: 'mail', title: `申请已录取 · ${ADDR} / Your application was approved` })
    w.wait(2300)
    chapters.push({ key: 'screen', stage: L({ zh: '租前', en: 'Before' }), title: L({ zh: '申请筛查', en: 'Screen' }), beats: w.beats, end: w.t, keyAt: w.keyAt })
  }

  // ── 4 · The lease ───────────────────────────────────────────────────────
  {
    const w = writer(lang)
    w.push({ k: 'focus', lanes: ['sarah', 'mia'], shots: { mia: 'mia-cafe', sarah: 'sarah-couch', david: 'david-lobby' } })
    w.push({ k: 'strip', lane: 'david', ...strip })
    w.push({ k: 'caption', text: L({ zh: 'Sarah 从这份申请生成安省标准租约，交给助理发给 Mia 签。', en: 'Sarah turns the application into an Ontario Standard Lease and has her AI Agent send it to Mia.' }) })
    w.wait(600)
    w.ask('sarah', L({ zh: '把租约发给 Mia 签', en: 'Send the lease to Mia to sign' }))
    const lease = card({
      id: 'film-lease', role: 'landlord', action_type: 'send_lease', risk_level: 'medium',
      title: L({ zh: `发送租约给 Mia Chen 签署 · ${UNIT}`, en: `Send the lease to Mia Chen to sign · ${UNIT}` }),
      summary: L({
        zh: `安省标准租约 · ${D.moveIn} 起一年 · 月租 $2,800 · 押金一个月（RTA s.106）。签署链接只发给 Mia；双方签完后自动建立在管租约。`,
        en: `Ontario Standard Lease · one year from ${D.moveIn} · $2,800/month · one month’s deposit (RTA s.106). The signing link goes to Mia only; once both sign, the managed tenancy is set up.`,
      }),
      recipient_label: MIA_EMAIL,
      data_scope: zh ? ['租约全文', '签署链接'] : ['The full lease', 'The signing link'],
      excluded_data: zh ? ['筛查报告', '你的其他租约'] : ['Screening report', 'Your other leases'],
    }, now)
    w.push({ k: 'reply', lane: 'sarah', msg: { text: L({
      zh: `租约按安省标准租约生成：${UNIT}，${D.moveIn} 起一年，月租 $2,800，押金一个月。发给 Mia 之前请你确认。`,
      en: `The lease follows the Ontario Standard Lease: ${UNIT}, one year from ${D.moveIn}, $2,800/month, one month’s deposit. Confirm before it goes to Mia.`,
    }) }, card: lease })
    w.push({ k: 'status', lane: 'sarah', status: 'approval' })
    w.key()
    w.wait(1300)
    w.approve('sarah', executedText({ title: lease.title, actionType: lease.action_type, sentTo: MIA_EMAIL, zh }))
    w.wait(400)
    w.push({ k: 'handoff', from: 'sarah', to: 'mia', label: L({ zh: '租约', en: 'Lease' }) })
    w.wait(700)
    w.push({ k: 'notify', lane: 'mia', kind: 'mail', title: `Your lease for ${UNIT} is ready to sign — Ontario Standard Lease` })
    w.wait(1500)
    w.push({ k: 'caption', text: L({ zh: 'Mia 在手机上签字，Sarah 回签：两人有了同一份「在管租约」。', en: 'Mia signs on her phone and Sarah countersigns: both now share one managed tenancy.' }) })
    w.push({ k: 'handoff', from: 'mia', to: 'sarah', label: L({ zh: '已签署', en: 'Signed' }) })
    w.wait(2300)
    chapters.push({ key: 'lease', stage: L({ zh: '租中', en: 'During' }), title: L({ zh: '签约', en: 'Sign' }), beats: w.beats, end: w.t, keyAt: w.keyAt })
  }

  // ── 5 · Renewal, a year on ──────────────────────────────────────────────
  {
    const w = writer(lang)
    w.push({ k: 'focus', lanes: ['sarah', 'mia'], shots: { mia: 'mia-cat', sarah: 'sarah-tea', david: 'david-lobby' } })
    w.push({ k: 'strip', lane: 'david', ...strip })
    w.push({ k: 'caption', text: L({ zh: '一年后，离到期还有 91 天：Sarah 的助理按指导比例备好了续约方案。', en: 'A year on, 91 days before the term ends: Sarah’s AI Agent has renewal options within the guideline.' }) })
    w.wait(800)
    // The card the 90-day sweep builds — the product's own builder, run on the film's date.
    const p = buildRenewalProposal('film', { id: 'film-lease', tenant_name: 'Mia Chen', tenant_email: MIA_EMAIL, unit_label: UNIT, monthly_rent: RENT, end_date: D.leaseEnd }, D.renewalDay, null)
    const m = p.metadata as { current_rent: number; guideline_rent: number; guideline_pct: number; guideline_year: number; notice_deadline: string }
    const days = Math.round((Date.parse(`${D.leaseEnd}T00:00:00Z`) - D.renewalDay.getTime()) / 86_400_000)
    const renewal = card({
      id: 'film-renewal', role: 'landlord', action_type: p.action_type, risk_level: p.risk_level,
      title: zh ? p.title : `Renewal window · 90-day touchpoint: Mia Chen · ends ${D.leaseEnd} (${days} days left)`,
      summary: zh ? p.summary : `${UNIT} rent $${rentAmount(m.current_rent)}. Option A: renew with no increase; option B: the ${m.guideline_year} guideline +${m.guideline_pct}% → $${rentAmount(m.guideline_rent)}${p.summary.includes('尚未公布') ? ` (the ${m.guideline_year} guideline is not published yet; the latest published one is used)` : ''} (units first occupied after 2018-11-15 are exempt from the cap). N1/N2 must be served 90 days ahead, by ${m.notice_deadline} at the latest. Once approved I send the renewal letter to ${MIA_EMAIL}.`,
      recipient_label: p.recipient_label,
      data_scope: zh ? p.data_scope : ['Lease summary', 'Renewal options', 'Local market'],
      excluded_data: zh ? p.excluded_data : ['Screening report', 'Original income documents'],
      metadata: p.metadata,
    }, now)
    // The sweep's push: one card → its title, and "runs only after you approve".
    w.push({ k: 'notify', lane: 'sarah', kind: 'push', title: renewal.title.slice(0, 80), body: '批准后才会执行 / Runs only after you approve' })
    w.wait(1300)
    w.push({ k: 'card', lane: 'sarah', card: renewal })
    w.push({ k: 'status', lane: 'sarah', status: 'approval' })
    w.key()
    w.wait(1900)
    w.approve('sarah', executedText({ title: renewal.title, actionType: renewal.action_type, sentTo: MIA_EMAIL, rent: m.guideline_rent, zh }), 'B')
    w.wait(400)
    w.push({ k: 'handoff', from: 'sarah', to: 'mia', label: L({ zh: '续约函', en: 'Renewal letter' }) })
    w.wait(700)
    w.push({ k: 'notify', lane: 'mia', kind: 'mail', title: `Lease renewal offer — ${UNIT}` })
    w.wait(1500)
    w.push({ k: 'caption', text: L({ zh: 'Mia 在在管租约里点「续约」，意向回到 Sarah 那里。三个人，三个助理，一条线办完。', en: 'Mia taps “Renew” in the managed tenancy and her intent goes back to Sarah. Three people, three AI Agents, one thread.' }) })
    w.push({ k: 'handoff', from: 'mia', to: 'sarah', label: L({ zh: '续约意向', en: 'Renewal intent' }) })
    w.wait(3000)
    chapters.push({ key: 'renew', stage: L({ zh: '租后', en: 'After' }), title: L({ zh: '续约', en: 'Renew' }), beats: w.beats, end: w.t, keyAt: w.keyAt })
  }

  return chapters
}

/** What a screen reader gets instead of the animation. */
export function filmSummary(lang: Lang): string {
  return lang === 'zh'
    ? '示范动画，三个人物由 AI 生成：租客 Mia Chen、房东 Sarah Wang、经纪 David Park，各有自己的 AI 助理，围绕同一套房 Unit 1207。一，Sarah 请 David 代办出租并在邮件链接里确认委托，David 按实时挂牌和 TRREB 官方数据定价，房源经核验上线。二，Mia 一句话找到这套房，在房源页预约看房，请求变成 Sarah 助理里的一张卡片，Sarah 批准后 Mia 收到确认邮件。三，Mia 提交申请，David 在委托范围内替 Sarah 发起筛查，报告交给 Sarah，Sarah 自己批准录取通知。四，Sarah 发送安省标准租约，Mia 签字、Sarah 回签，两人共享在管租约。五，一年后到期前 91 天，Sarah 的助理按指导比例给出续约方案，Sarah 选定后续约函发给 Mia，Mia 点续约。每一张卡都要本人批准，批准后 60 秒内可撤销，执行后写入审计。'
    : 'Sample animation with three AI-generated characters: tenant Mia Chen, landlord Sarah Wang and agent David Park, each with their own AI Agent, around one unit, Unit 1207. One: Sarah asks David to lease the unit and confirms his delegation from an email link; David prices it from live listings and official TRREB data, and the listing goes live after verification. Two: Mia finds the unit with one sentence and books a showing; the request becomes a card in Sarah’s AI Agent, and after Sarah approves, Mia gets a confirmation email. Three: Mia applies, David starts the screening for Sarah within his delegation, the report goes to Sarah, and Sarah approves the admission notice herself. Four: Sarah sends the Ontario Standard Lease, Mia signs and Sarah countersigns, and both share the managed tenancy. Five: a year on, 91 days before the end, Sarah’s AI Agent proposes renewal options within the guideline; after Sarah picks one, the renewal letter goes to Mia and Mia taps renew. Every card needs its owner’s approval, can be undone for 60 seconds, and is written to the audit log.'
}
