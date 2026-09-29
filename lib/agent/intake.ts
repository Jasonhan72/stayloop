// Guided intake for the quick-start cards (2026-09-27; design/guided-intake-2026-09.md).
//
// A card no longer drops a template with 【…】 placeholders into the composer.
// It opens a small slot-filling dialogue IN the thread: one question at a time,
// quick-reply chips plus a free-text field, a summary of what was answered, an
// emergency branch with a "do this first" line, an optional attachment step and
// a review of the composed sentence before it goes out. Deterministic — no
// model call until the send.
//
// `compose` must return a COMPLETE request (never a placeholder), phrased so the
// deterministic layers downstream read it: a home search says「预算 $2,500 以内」
// /「1 房」/「我有宠物」(lib/agent/hardConstraints.ts), a repair says「没有暖气」
// /「漏水严重」/「停电」/「门锁失效」/「燃气味」when it is an emergency
// (lib/agent/maintenanceTriage.ts isEmergencyMaintenance).
export type Bi = { zh: string; en: string }
export type Lang = 'zh' | 'en'

export type IntakeOption = {
  value: string
  label: Bi
  /** 'danger' = the emergency choice: red chip + `note` shown once picked */
  tone?: 'danger'
  note?: Bi
}
export type IntakeInput = 'text' | 'textarea' | 'money' | 'date' | 'number'
export type IntakeStep = {
  key: string
  ask: Bi
  hint?: Bi
  options?: IntakeOption[]
  /** several chips may be chosen */
  multi?: boolean
  /** a free-text field beside (or instead of) the chips */
  input?: IntakeInput
  placeholder?: Bi
  optional?: boolean
  /** this step offers files (photos of the fault, the lease PDF) */
  attach?: boolean
}
export type StepAnswer = { picks: string[]; text: string }
export type IntakeAnswers = Record<string, StepAnswer | undefined>

/** What a compose function reads — labels already in the user's language. */
export type IntakeQuery = {
  lang: Lang
  attachments: number
  /** first chosen chip value of a step, or null */
  pick: (key: string) => string | null
  picks: (key: string) => string[]
  /** the typed text of a step ('' when none) */
  text: (key: string) => string
  /** chip labels + typed text (money / date formatted), as a list */
  labels: (key: string) => string[]
  /** labels joined with 、 (zh) or ', ' (en); '' when none */
  said: (key: string) => string
  has: (key: string, value: string) => boolean
}
export type IntakeSpec = {
  id: string
  title: Bi
  /** one line under the card label: how many steps, what they ask */
  outline: Bi
  steps: IntakeStep[]
  compose: (q: IntakeQuery) => string
}

export const ANSWER_EMPTY: StepAnswer = { picks: [], text: '' }

export function isAnswered(step: IntakeStep, a: StepAnswer | undefined, attachments = 0): boolean {
  const x = a ?? ANSWER_EMPTY
  if (x.picks.length > 0 || x.text.trim().length > 0) return true
  return !!step.attach && attachments > 0
}

export function labelOf(step: IntakeStep, value: string, lang: Lang): string {
  const o = step.options?.find((x) => x.value === value)
  return o ? o.label[lang] : value
}

export function fmtMoney(raw: string): string {
  const n = Number(String(raw).replace(/[^0-9.]/g, ''))
  if (!isFinite(n) || n <= 0) return raw.trim()
  return `$${Math.round(n).toLocaleString('en-CA')}`
}

/** 'YYYY-MM-DD' → 「11 月 1 日」/ "Nov 1" (with the year when it is not this year). */
export function fmtDate(raw: string, lang: Lang, now = new Date()): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim())
  if (!m) return raw.trim()
  const y = Number(m[1]); const mo = Number(m[2]); const d = Number(m[3])
  const sameYear = y === now.getFullYear()
  if (lang === 'zh') return `${sameYear ? '' : `${y} 年 `}${mo} 月 ${d} 日`
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][mo - 1] ?? m[2]
  return `${month} ${d}${sameYear ? '' : `, ${y}`}`
}

export function joinList(items: string[], lang: Lang): string {
  return items.filter(Boolean).join(lang === 'zh' ? '、' : ', ')
}

export function queryFor(spec: IntakeSpec, answers: IntakeAnswers, lang: Lang, attachments = 0): IntakeQuery {
  const step = (key: string) => spec.steps.find((s) => s.key === key)
  const ans = (key: string) => answers[key] ?? ANSWER_EMPTY
  const text = (key: string) => ans(key).text.trim()
  const labels = (key: string) => {
    const s = step(key)
    if (!s) return []
    const out = ans(key).picks.map((v) => labelOf(s, v, lang))
    const t = text(key)
    if (t) out.push(s.input === 'money' ? fmtMoney(t) : s.input === 'date' ? fmtDate(t, lang) : t)
    return out
  }
  return {
    lang,
    attachments,
    pick: (key) => ans(key).picks[0] ?? null,
    picks: (key) => ans(key).picks,
    text,
    labels,
    said: (key) => joinList(labels(key), lang),
    has: (key, value) => ans(key).picks.includes(value),
  }
}

const PLACEHOLDER_RE = /【[^】]*】/g

/** The sentence to send. Defensive: no placeholder can survive, whatever a spec does. */
export function composeIntake(spec: IntakeSpec, answers: IntakeAnswers, lang: Lang, attachments = 0): string {
  return spec.compose(queryFor(spec, answers, lang, attachments)).replace(PLACEHOLDER_RE, '').replace(/[ \t]+\n/g, '\n').trim()
}

// ---------------------------------------------------------------------------
// shared option lists
// ---------------------------------------------------------------------------
const AREAS: IntakeOption[] = [
  { value: 'downtown', label: { zh: '市中心 Downtown', en: 'Downtown Toronto' } },
  { value: 'north_york', label: { zh: '北约克 North York', en: 'North York' } },
  { value: 'scarborough', label: { zh: '士嘉堡 Scarborough', en: 'Scarborough' } },
  { value: 'etobicoke', label: { zh: '怡陶碧谷 Etobicoke', en: 'Etobicoke' } },
  { value: 'mississauga', label: { zh: '密西沙加 Mississauga', en: 'Mississauga' } },
  { value: 'markham_rh', label: { zh: '万锦 · 列治文山', en: 'Markham · Richmond Hill' } },
  { value: 'campus', label: { zh: '多大 · TMU 周边', en: 'Near U of T · TMU' } },
]
// Labels carry the words the bedroom parser reads (「1 房」/「Studio」/「3 bedrooms」).
const BEDS: IntakeOption[] = [
  { value: 'studio', label: { zh: 'Studio / 开间', en: 'Studio' } },
  { value: 'b1', label: { zh: '1 房', en: '1 bedroom' } },
  { value: 'b1d', label: { zh: '1+1（1 房 + den）', en: '1+1 (1 bedroom + den)' } },
  { value: 'b2', label: { zh: '2 房', en: '2 bedrooms' } },
  { value: 'b3', label: { zh: '3 房及以上', en: '3 bedrooms or more' } },
]
const UNIT_TYPES: IntakeOption[] = [
  { value: 'condo', label: { zh: 'Condo 公寓', en: 'Condo' } },
  { value: 'apartment', label: { zh: '出租公寓（Apartment）', en: 'Apartment' } },
  { value: 'townhouse', label: { zh: '联排', en: 'Townhouse' } },
  { value: 'house', label: { zh: '独立屋 · 整租', en: 'House (whole)' } },
  { value: 'basement', label: { zh: '地下室单元', en: 'Basement unit' } },
  { value: 'room', label: { zh: '独立房间', en: 'Room' } },
]
const RENT_CHIPS: IntakeOption[] = ['2000', '2500', '3000', '3500'].map((v) => ({ value: v, label: { zh: fmtMoney(v), en: fmtMoney(v) } }))
const COUNT: IntakeOption[] = [
  { value: '1', label: { zh: '1 位', en: '1' } },
  { value: '2', label: { zh: '2 位（合租 / 夫妻）', en: '2 (co-applicants)' } },
  { value: '3', label: { zh: '3 位及以上', en: '3 or more' } },
]
const COUNT_PHRASE: Record<string, Bi> = {
  '1': { zh: '1 位', en: 'one applicant' },
  '2': { zh: '2 位共同', en: 'two co-applicants' },
  '3': { zh: '3 位及以上', en: 'three or more applicants' },
}
const WHEN_CHIPS: IntakeOption[] = [
  { value: 'now', label: { zh: '立即', en: 'Immediately' } },
  { value: 'next_month', label: { zh: '下个月 1 号', en: 'The 1st of next month' } },
]

// ---------------------------------------------------------------------------
// tenant
// ---------------------------------------------------------------------------
const FIND_HOME: IntakeSpec = {
  id: 'find_home',
  title: { zh: '帮我找房', en: 'Find me a home' },
  outline: { zh: '5 步 · 区域 · 预算 · 户型 · 硬条件 · 入住时间', en: '5 steps · area · budget · unit · must-haves · move-in' },
  steps: [
    { key: 'area', ask: { zh: '想住哪一带？', en: 'Where do you want to live?' }, hint: { zh: '选一个，或直接写街道 / 地铁站 / 社区名', en: 'Pick one, or type a street, subway station or neighbourhood' }, options: AREAS, input: 'text', placeholder: { zh: '例如 Yonge & Eglinton、Liberty Village', en: 'e.g. Yonge & Eglinton, Liberty Village' } },
    { key: 'budget', ask: { zh: '每月预算上限？', en: 'Monthly budget cap?' }, options: [...RENT_CHIPS, { value: '4000', label: { zh: '$4,000', en: '$4,000' } }, { value: 'nolimit', label: { zh: '不限 · 先看行情', en: 'No cap — show me the market' } }], input: 'money', placeholder: { zh: '自己填一个数', en: 'Or type a number' } },
    { key: 'beds', ask: { zh: '户型？', en: 'Unit type?' }, options: BEDS },
    { key: 'needs', ask: { zh: '硬条件？（可多选）', en: 'Must-haves? (pick any)' }, multi: true, optional: true, options: [
      { value: 'pets', label: { zh: '我有宠物，需允许宠物', en: 'I have a pet — pets must be allowed' } },
      { value: 'transit', label: { zh: '近地铁', en: 'Near the subway' } },
      { value: 'parking', label: { zh: '带车位', en: 'Parking included' } },
      { value: 'utilities', label: { zh: '含水电', en: 'Utilities included' } },
      { value: 'furnished', label: { zh: '带家具', en: 'Furnished' } },
      { value: 'laundry', label: { zh: '室内洗衣', en: 'In-unit laundry' } },
    ], input: 'text', placeholder: { zh: '其他，如 高层、朝南', en: 'Other, e.g. high floor, south-facing' } },
    { key: 'movein', ask: { zh: '什么时候入住？', en: 'When do you want to move in?' }, optional: true, options: [
      { value: 'asap', label: { zh: '尽快', en: 'As soon as possible' } },
      { value: 'next_month', label: { zh: '下个月 1 号', en: 'The 1st of next month' } },
      { value: 'two_months', label: { zh: '两个月内', en: 'Within two months' } },
    ], input: 'date' },
  ],
  compose: (q) => {
    const zh = q.lang === 'zh'
    const area = q.said('area') || (zh ? '多伦多' : 'Toronto')
    const budget = q.has('budget', 'nolimit') ? (zh ? '预算不限' : 'no budget cap') : q.said('budget') ? (zh ? `预算 ${q.said('budget')} 以内` : `under ${q.said('budget')}`) : ''
    const beds = q.said('beds') || (zh ? '房源' : 'place')
    const needs = q.said('needs')
    const movein = q.said('movein')
    if (zh) return `帮我找${area}${budget ? `、${budget}` : ''}的${beds}${needs ? `，要求：${needs}` : ''}${movein ? `，${movein}入住` : ''}。`
    return `Find me a ${beds} in ${area}${budget ? `, ${budget}` : ''}${needs ? `; must-haves: ${needs}` : ''}${movein ? `; move-in ${movein}` : ''}.`
  },
}

const EXPLAIN_LEASE: IntakeSpec = {
  id: 'explain_lease',
  title: { zh: '解读租约', en: 'Explain my lease' },
  outline: { zh: '3 步 · 租约在哪 · 最关心哪几条 · 你的处境', en: '3 steps · the lease · what matters · your situation' },
  steps: [
    { key: 'source', ask: { zh: '租约在哪？', en: 'Where is the lease?' }, hint: { zh: '上传文件，或把条款贴进来；安省标准租约也可以直接问', en: 'Upload it, paste the clauses, or ask about the Ontario Standard Lease' }, options: [
      { value: 'upload', label: { zh: '上传租约（PDF / 照片）', en: 'Upload the lease (PDF / photos)' } },
      { value: 'paste', label: { zh: '我把条款贴进来', en: 'I will paste the clauses' } },
      { value: 'standard', label: { zh: '就是安省标准租约（2229E），先讲通用条款', en: 'It is the Ontario Standard Lease (2229E) — the standard clauses' } },
    ], input: 'textarea', placeholder: { zh: '把想问的条款贴在这里', en: 'Paste the clauses you want explained' }, attach: true },
    { key: 'focus', ask: { zh: '最想弄清楚哪几条？（可多选）', en: 'Which parts matter most? (pick any)' }, multi: true, optional: true, options: [
      { value: 'deposit', label: { zh: '押金与钥匙押金', en: 'Deposit & key deposit' } },
      { value: 'increase', label: { zh: '涨租规则', en: 'Rent increases' } },
      { value: 'early_exit', label: { zh: '提前退租 / 转租', en: 'Ending early / assignment' } },
      { value: 'repairs', label: { zh: '维修责任', en: 'Repairs & maintenance' } },
      { value: 'pets_guests', label: { zh: '宠物与访客', en: 'Pets & guests' } },
      { value: 'entry', label: { zh: '房东进入', en: 'Landlord entry' } },
      { value: 'schedule_b', label: { zh: '附加条款（Schedule B）', en: 'Additional terms (Schedule B)' } },
      { value: 'utilities', label: { zh: '水电与停车', en: 'Utilities & parking' } },
    ] },
    { key: 'context', ask: { zh: '你现在处在哪一步？', en: 'Where are you in the process?' }, optional: true, options: [
      { value: 'unsigned', label: { zh: '还没签', en: 'Not signed yet' } },
      { value: 'signed_lt1', label: { zh: '已签，住了不到一年', en: 'Signed, under a year in' } },
      { value: 'signed_gt1', label: { zh: '已签，住了一年以上', en: 'Signed, over a year in' } },
      { value: 'renewing', label: { zh: '正在续约', en: 'Renewing' } },
    ], input: 'text', placeholder: { zh: '其他背景', en: 'Anything else' } },
  ],
  compose: (q) => {
    const zh = q.lang === 'zh'
    const std = q.has('source', 'standard')
    const pasted = q.text('source')
    const focus = q.said('focus')
    const ctx = q.said('context')
    const head = zh
      ? (std ? '我要签的是安省标准租约（2229E），帮我逐条解释最需要注意的通用条款' : `帮我逐条解释这份租约里最需要注意的条款${q.attachments ? '（租约已上传）' : ''}`)
      : (std ? 'I am signing the Ontario Standard Lease (2229E) — walk me through the standard clauses I should watch' : `Walk me through the clauses of this lease I should watch out for${q.attachments ? ' (lease attached)' : ''}`)
    const parts = [head]
    if (focus) parts.push(zh ? `，特别是 ${focus}` : `, especially ${focus}`)
    parts.push('。'.replace('。', zh ? '。' : '.'))
    if (ctx) parts.push(zh ? `背景：${ctx}。` : ` Context: ${ctx}.`)
    if (pasted) parts.push(zh ? `\n条款如下：\n${pasted}` : `\nThe clauses:\n${pasted}`)
    return parts.join('')
  },
}

const EMERGENCY_PHRASE: Record<string, Bi> = {
  leak: { zh: '漏水严重，正在扩大', en: 'severe leak, flooding and spreading' },
  heat: { zh: '没有暖气', en: 'no heat' },
  hot_water: { zh: '没有热水', en: 'no hot water' },
  electrical: { zh: '停电 / 漏电', en: 'no power / electrical shock hazard' },
  lock: { zh: '门锁失效，无法锁门', en: 'the lock failed and the door cannot be secured' },
  gas: { zh: '燃气味 / 一氧化碳报警', en: 'gas smell / carbon monoxide alarm' },
}

const REPAIR: IntakeSpec = {
  id: 'repair',
  title: { zh: '发起报修', en: 'Report a repair' },
  outline: { zh: '7 步 · 哪里 · 什么问题 · 从何时 · 紧急程度 · 进门 · 宠物 · 照片', en: '7 steps · where · what · since · urgency · entry · pets · photos' },
  steps: [
    { key: 'where', ask: { zh: '哪里出了问题？', en: 'Where is the problem?' }, options: [
      { value: 'kitchen', label: { zh: '厨房', en: 'Kitchen' } },
      { value: 'bathroom', label: { zh: '卫生间', en: 'Bathroom' } },
      { value: 'bedroom', label: { zh: '卧室', en: 'Bedroom' } },
      { value: 'living', label: { zh: '客厅', en: 'Living room' } },
      { value: 'balcony', label: { zh: '阳台', en: 'Balcony' } },
      { value: 'common', label: { zh: '楼道 · 公共区域', en: 'Hallway / common area' } },
      { value: 'whole', label: { zh: '整个单元', en: 'Whole unit' } },
    ], input: 'text', placeholder: { zh: '其他位置', en: 'Somewhere else' } },
    { key: 'what', ask: { zh: '是什么问题？', en: 'What is wrong?' }, hint: { zh: '选最接近的一项，再补一句细节', en: 'Pick the closest, then add a line of detail' }, options: [
      { value: 'leak', label: { zh: '漏水 · 渗水', en: 'Leak / water damage' } },
      { value: 'clog', label: { zh: '堵塞 · 下水慢', en: 'Clog / slow drain' } },
      { value: 'hot_water', label: { zh: '没有热水', en: 'No hot water' } },
      { value: 'heat', label: { zh: '没有暖气 · 空调不工作', en: 'No heat / AC not working' } },
      { value: 'appliance', label: { zh: '电器坏了（冰箱 / 炉灶 / 洗衣机…）', en: 'Appliance broken (fridge / stove / washer…)' } },
      { value: 'electrical', label: { zh: '插座 · 电路 · 停电', en: 'Outlets / wiring / power out' } },
      { value: 'lock', label: { zh: '门锁失效 · 无法锁门', en: 'Lock failed / cannot lock the door' } },
      { value: 'gas', label: { zh: '燃气味 · 一氧化碳报警', en: 'Gas smell / CO alarm' } },
      { value: 'pest', label: { zh: '虫害', en: 'Pests' } },
      { value: 'structural', label: { zh: '门窗 · 墙面 · 地板 · 天花板', en: 'Doors, windows, walls, floor, ceiling' } },
    ], input: 'text', placeholder: { zh: '例如：水槽下方滴水，地柜已经泡湿', en: 'e.g. dripping under the sink, the cabinet floor is soaked' } },
    { key: 'since', ask: { zh: '从什么时候开始的？', en: 'Since when?' }, options: [
      { value: 'today', label: { zh: '今天', en: 'Today' } },
      { value: 'yesterday', label: { zh: '昨天', en: 'Yesterday' } },
      { value: 'this_week', label: { zh: '这周', en: 'This week' } },
      { value: 'longer', label: { zh: '一周以上', en: 'More than a week' } },
    ], input: 'date' },
    { key: 'urgency', ask: { zh: '紧急程度？', en: 'How urgent?' }, options: [
      { value: 'emergency', tone: 'danger', label: { zh: '🚨 紧急：没法正常居住或有安全风险', en: '🚨 Emergency — unsafe or unlivable' }, note: { zh: '先做这件事：漏水关总阀；漏电拉总闸；闻到燃气或 CO 报警立即开窗离开并打 911。房东须在合理时间内修复（RTA s.20）。', en: 'Do this first: shut the main valve for a leak; cut the breaker for a shock hazard; for gas or a CO alarm open windows, leave and call 911. The landlord must repair within a reasonable time (RTA s.20).' } },
      { value: 'soon', label: { zh: '尽快：影响日常使用', en: 'Soon — it disrupts daily life' } },
      { value: 'can_wait', label: { zh: '可以等几天', en: 'Can wait a few days' } },
    ] },
    { key: 'entry', ask: { zh: '维修人员可以怎么进门？', en: 'How may the repair person enter?' }, options: [
      { value: 'anytime', label: { zh: '我不在家也可以进（提前 24 小时书面通知）', en: 'Enter when I am out (24 h written notice)' } },
      { value: 'call_first', label: { zh: '先打电话约时间', en: 'Call me first to arrange a time' } },
      { value: 'tenant_present', label: { zh: '需要我在场', en: 'I must be present' } },
    ] },
    { key: 'pets', ask: { zh: '家里有宠物吗？', en: 'Pets at home?' }, optional: true, options: [
      { value: 'none', label: { zh: '没有', en: 'None' } },
      { value: 'cat', label: { zh: '有猫', en: 'A cat' } },
      { value: 'dog', label: { zh: '有狗', en: 'A dog' } },
    ], input: 'text', placeholder: { zh: '其他', en: 'Other' } },
    { key: 'photos', ask: { zh: '拍几张照片？', en: 'Add a few photos?' }, hint: { zh: '最多 3 张，能让房东和师傅少跑一趟', en: 'Up to 3 — saves the landlord and the trades a trip' }, optional: true, attach: true },
  ],
  compose: (q) => {
    const zh = q.lang === 'zh'
    const where = q.said('where') || (zh ? '家里' : 'the unit')
    const what = q.pick('what')
    const whatLabel = what ? q.labels('what')[0] : ''
    const detail = q.text('what')
    const since = (() => {
      const p = q.pick('since')
      if (p === 'longer') return zh ? '一周多以前' : 'more than a week ago'
      const s = q.said('since')
      return s || (zh ? '最近' : 'recently')
    })()
    const urgency = q.pick('urgency')
    const em = what ? EMERGENCY_PHRASE[what] : undefined
    const urgencyText = urgency === 'emergency'
      ? (zh ? `情况紧急（${em ? em.zh : '已影响正常居住 / 有安全风险'}）` : `this is an emergency (${em ? em.en : 'unsafe or unlivable'})`)
      : urgency === 'soon' ? (zh ? '希望尽快处理，已影响日常使用' : 'please handle it soon — it disrupts daily life')
      : urgency === 'can_wait' ? (zh ? '不急，可以等几天' : 'not urgent — it can wait a few days') : ''
    const entry = q.said('entry')
    const petsPick = q.pick('pets')
    const pets = petsPick === 'none' ? (zh ? '没有宠物' : 'no pets') : q.said('pets')
    if (zh) {
      return `我要报修：${where}${whatLabel ? whatLabel : '有问题'}${detail ? `——${detail}` : ''}。从${since}开始${urgencyText ? `，${urgencyText}` : ''}。${entry ? `维修人员进门：${entry}。` : ''}${pets ? `家里${pets}。` : ''}${q.attachments ? `已附 ${q.attachments} 张照片。` : ''}请整理成报修工单发给房东。`
    }
    return `Repair request: ${where} — ${whatLabel || 'a problem'}${detail ? ` (${detail})` : ''}. Since ${since}${urgencyText ? `; ${urgencyText}` : ''}. ${entry ? `Entry: ${entry}. ` : ''}${pets ? `Pets: ${pets}. ` : ''}${q.attachments ? `${q.attachments} photo(s) attached. ` : ''}Turn it into a repair ticket for my landlord.`
  },
}

const STAMPS: IntakeSpec = {
  id: 'stamps',
  title: { zh: '盖下一枚章', en: 'Earn my next stamp' },
  outline: { zh: '2 步 · 哪一枚 · 为了什么', en: '2 steps · which stamp · what for' },
  steps: [
    { key: 'which', ask: { zh: '想先了解哪一枚？', en: 'Which stamp first?' }, options: [
      { value: 'identity', label: { zh: '身份章', en: 'Identity stamp' } },
      { value: 'income', label: { zh: '收入章', en: 'Income stamp' } },
      { value: 'bank', label: { zh: '银行章', en: 'Bank stamp' } },
      { value: 'credit', label: { zh: '信用 + 法庭章', en: 'Credit + court stamp' } },
      { value: 'all', label: { zh: '都看看', en: 'All of them' } },
    ] },
    { key: 'why', ask: { zh: '盖章是为了？', en: 'What is it for?' }, optional: true, options: [
      { value: 'applying', label: { zh: '正在申请一套房', en: 'Applying for a place now' } },
      { value: 'prepare', label: { zh: '想提前准备', en: 'Getting ready ahead of time' } },
      { value: 'curious', label: { zh: '只是想了解', en: 'Just curious' } },
    ], input: 'text' },
  ],
  compose: (q) => {
    const zh = q.lang === 'zh'
    const all = q.has('which', 'all') || !q.pick('which')
    const which = q.said('which')
    const why = q.said('why')
    if (zh) return `我现在盖了几枚章？${all ? '每一枚' : `我想先盖「${which}」`}：怎么盖、要准备什么、盖上后房东能看到什么？${why ? `我${why}。` : ''}`
    return `How many stamps do I have? ${all ? 'For each stamp' : `For the ${which}`}: how do I earn it, what do I need, and what will a landlord see?${why ? ` I am ${why.toLowerCase()}.` : ''}`
  },
}

// ---------------------------------------------------------------------------
// landlord
// ---------------------------------------------------------------------------
const SCREEN: IntakeSpec = {
  id: 'screen',
  title: { zh: '租客筛查', en: 'Tenant screening' },
  outline: { zh: '3 步 · 到哪一步了 · 几位申请人 · 目标月租', en: '3 steps · stage · how many · target rent' },
  steps: [
    { key: 'stage', ask: { zh: '申请人到哪一步了？', en: 'Where is the applicant?' }, options: [
      { value: 'docs_in', label: { zh: '已收到申请材料', en: 'Documents received' } },
      { value: 'no_docs', label: { zh: '还没收材料，先了解要什么', en: 'No documents yet — what do I ask for?' } },
      { value: 'explain', label: { zh: '先了解报告会查什么', en: 'Explain what the report checks first' } },
    ] },
    { key: 'count', ask: { zh: '几位申请人？', en: 'How many applicants?' }, optional: true, options: COUNT },
    { key: 'rent', ask: { zh: '目标月租？', en: 'Target monthly rent?' }, hint: { zh: '只作付款能力的参考，不是门槛（OHRC 租房政策）', en: 'Context for ability to pay — never a cut-off (OHRC rental policy)' }, optional: true, options: RENT_CHIPS, input: 'money' },
  ],
  compose: (q) => {
    const zh = q.lang === 'zh'
    const c = q.pick('count')
    const count = c ? COUNT_PHRASE[c][q.lang] : (zh ? '一位' : 'an')
    const stage = q.said('stage')
    const rent = q.said('rent')
    if (zh) return `我要筛查${count}申请人（${stage}${rent ? `，目标月租 ${rent}` : ''}）：告诉我报告会查什么、还缺哪些材料，然后带我开始。`
    return `I want to screen ${count} applicant${c && c !== '1' ? 's' : ''} (${stage.toLowerCase()}${rent ? `, target rent ${rent}` : ''}): tell me what the report checks and which documents are still missing, then take me to start.`
  },
}

const LIST: IntakeSpec = {
  id: 'list',
  title: { zh: '发布房源', en: 'List a property' },
  outline: { zh: '7 步 · 地址 · 类型 · 户型 · 租金 · 入住 · 条件 · 补充', en: '7 steps · address · type · unit · rent · available · terms · extras' },
  steps: [
    { key: 'address', ask: { zh: '地址和单元号？', en: 'Address and unit?' }, input: 'text', placeholder: { zh: '28 Avondale Ave #1203, Toronto', en: '28 Avondale Ave #1203, Toronto' } },
    { key: 'type', ask: { zh: '房源类型？', en: 'Property type?' }, options: UNIT_TYPES },
    { key: 'beds', ask: { zh: '户型？', en: 'Unit type?' }, options: BEDS },
    { key: 'rent', ask: { zh: '月租？', en: 'Monthly rent?' }, options: RENT_CHIPS, input: 'money', placeholder: { zh: '自己填一个数', en: 'Or type a number' } },
    { key: 'available', ask: { zh: '什么时候可入住？', en: 'Available from?' }, options: WHEN_CHIPS, input: 'date' },
    { key: 'terms', ask: { zh: '租赁条件？（可多选）', en: 'Terms? (pick any)' }, multi: true, optional: true, options: [
      { value: 'pets_ok', label: { zh: '允许宠物', en: 'Pets allowed' } },
      { value: 'furnished', label: { zh: '带家具', en: 'Furnished' } },
      { value: 'parking', label: { zh: '含车位', en: 'Parking included' } },
      { value: 'utilities', label: { zh: '含水电', en: 'Utilities included' } },
      { value: 'no_smoking', label: { zh: '禁烟', en: 'No smoking' } },
      { value: 'one_year', label: { zh: '一年起租', en: 'One-year minimum' } },
    ] },
    { key: 'extra', ask: { zh: '还有什么要写进去？', en: 'Anything else for the listing?' }, optional: true, input: 'text', placeholder: { zh: '面积、卫生间数、楼层、朝向、押金…', en: 'Size, bathrooms, floor, exposure, deposit…' } },
  ],
  compose: (q) => {
    const zh = q.lang === 'zh'
    const address = q.said('address')
    const type = q.said('type'); const beds = q.said('beds'); const rent = q.said('rent'); const avail = q.said('available'); const terms = q.said('terms'); const extra = q.said('extra')
    if (zh) return `帮我发一个房源：${address}，${[type, beds].filter(Boolean).join('，')}${rent ? `，${rent}/月` : ''}${avail ? `，${avail}可入住` : ''}${terms ? `，${terms}` : ''}${extra ? `；补充：${extra}` : ''}。`
    return `Help me list a unit: ${address}, ${[type, beds].filter(Boolean).join(', ')}${rent ? `, ${rent}/month` : ''}${avail ? `, available ${avail.toLowerCase()}` : ''}${terms ? `, ${terms.toLowerCase()}` : ''}${extra ? `; also: ${extra}` : ''}.`
  },
}

const APPLICATIONS: IntakeSpec = {
  id: 'applications',
  title: { zh: '看看新申请', en: 'Review applications' },
  outline: { zh: '2 步 · 哪些房源 · 按什么整理', en: '2 steps · which listings · organise by' },
  steps: [
    { key: 'scope', ask: { zh: '看哪些申请？', en: 'Which applications?' }, options: [
      { value: 'all', label: { zh: '全部房源', en: 'All listings' } },
      { value: 'one', label: { zh: '某一套（写在下面）', en: 'One listing (type it below)' } },
    ], input: 'text', placeholder: { zh: '地址或单元', en: 'Address or unit' } },
    { key: 'order', ask: { zh: '按什么整理？', en: 'Organise by?' }, options: [
      { value: 'complete', label: { zh: '材料是否齐全', en: 'Whether documents are complete' } },
      { value: 'screened', label: { zh: '是否已筛查', en: 'Screened or not yet' } },
      { value: 'recency', label: { zh: '递交时间先后', en: 'Submission time' } },
    ] },
  ],
  compose: (q) => {
    const zh = q.lang === 'zh'
    const one = q.text('scope')
    const scope = one || (zh ? '全部房源' : 'all my listings')
    const order = q.said('order') || (zh ? '递交时间先后' : 'submission time')
    if (zh) return `帮我看看${scope}的新申请，按${order}整理，并说明每份还缺什么。`
    return `Show me the new applications for ${scope}, organised by ${order.toLowerCase()}, and say what each one is still missing.`
  },
}

const RENEWAL: IntakeSpec = {
  id: 'renewal',
  title: { zh: '续约方案', en: 'Renewal options' },
  outline: { zh: '3 步 · 哪份租约 · 你的打算 · 到期日', en: '3 steps · which lease · your intention · end date' },
  steps: [
    { key: 'which', ask: { zh: '看哪份租约？', en: 'Which lease?' }, options: [
      { value: 'all', label: { zh: '全部快到期的', en: 'Every lease coming up' } },
      { value: 'one', label: { zh: '某一套（写在下面）', en: 'One unit (type it below)' } },
    ], input: 'text', placeholder: { zh: '地址或单元', en: 'Address or unit' } },
    { key: 'intent', ask: { zh: '你的打算？', en: 'Your intention?' }, options: [
      { value: 'guideline', label: { zh: '续约，按指导上限涨租', en: 'Renew at the guideline increase' } },
      { value: 'flat', label: { zh: '续约，不涨租', en: 'Renew with no increase' } },
      { value: 'market', label: { zh: '还没定，先看行情', en: 'Undecided — show me the market first' } },
      { value: 'end', label: { zh: '不打算续（了解 N 表与程序）', en: 'Not renewing — which notices and steps apply' } },
    ] },
    { key: 'expiry', ask: { zh: '到期日？', en: 'Lease end date?' }, optional: true, input: 'date' },
  ],
  compose: (q) => {
    const zh = q.lang === 'zh'
    const which = q.text('which') || (zh ? '全部快到期的租约' : 'every lease coming up')
    const expiry = q.said('expiry')
    const intent = q.pick('intent')
    if (zh) {
      const tail = intent === 'end' ? '我不打算续约：告诉我需要哪些通知（N 表）、期限和程序。' : `我${q.said('intent') || '还没定'}；给我 A/B 方案、N1 截止日和 TRREB 行情。`
      return `帮我看${which}的续约${expiry ? `（${expiry}到期）` : ''}：${tail}`
    }
    const tail = intent === 'end' ? 'I am not renewing: which notices (N forms), deadlines and steps apply?' : `I want to ${(q.said('intent') || 'decide').toLowerCase()}; give me options A/B, the N1 deadline and the TRREB benchmark.`
    return `Review the renewal of ${which}${expiry ? ` (ends ${expiry})` : ''}: ${tail}`
  },
}

const COMPLIANCE: IntakeSpec = {
  id: 'compliance',
  title: { zh: '合规检查', en: 'Compliance check' },
  outline: { zh: '2 步 · 检查什么 · 贴文本或上传', en: '2 steps · what to check · paste or upload' },
  steps: [
    { key: 'what', ask: { zh: '检查什么？', en: 'Check what?' }, options: [
      { value: 'listing', label: { zh: '一套房源的挂牌文案', en: 'A listing’s text' } },
      { value: 'lease', label: { zh: '一份租约（含附加条款）', en: 'A lease (incl. additional terms)' } },
      { value: 'notice', label: { zh: '准备发给租客的通知', en: 'A notice I am about to send a tenant' } },
      { value: 'all', label: { zh: '我全部的房源与租约', en: 'All my listings and leases' } },
    ] },
    { key: 'paste', ask: { zh: '把文本贴进来或上传', en: 'Paste the text or upload it' }, hint: { zh: '不贴也行，我按你账号里的数据查', en: 'Optional — otherwise I check what is on your account' }, optional: true, input: 'textarea', attach: true },
  ],
  compose: (q) => {
    const zh = q.lang === 'zh'
    const what = q.said('what') || (zh ? '我的房源与租约' : 'my listings and leases')
    const text = q.text('paste')
    if (zh) return `帮我检查${what}有没有 RTA 合规风险${q.attachments ? '（文件已上传）' : ''}。${text ? `内容如下：\n${text}` : ''}`
    return `Check ${what.toLowerCase()} for RTA compliance risks${q.attachments ? ' (file attached)' : ''}.${text ? `\nThe text:\n${text}` : ''}`
  },
}

// ---------------------------------------------------------------------------
// agent (Brief)
// ---------------------------------------------------------------------------
const AGENT_SCREEN: IntakeSpec = {
  id: 'agent_screen',
  title: { zh: '租客筛查', en: 'Tenant screening' },
  outline: { zh: '3 步 · 代表协议 · 申请人同意 · 几位申请人', en: '3 steps · representation · consent · how many' },
  steps: [
    { key: 'rep', ask: { zh: '和房东客户签了书面代表协议吗？', en: 'Do you have a written representation agreement with the landlord?' }, options: [
      { value: 'yes', label: { zh: '已签', en: 'Yes, signed' } },
      { value: 'no', label: { zh: '还没签', en: 'Not yet' } },
      { value: 'tenant_side', label: { zh: '我是租客方经纪', en: 'I represent the tenant' } },
    ] },
    { key: 'consent', ask: { zh: '申请人签了同意核查（OREA Form 410）吗？', en: 'Has the applicant signed consent (OREA Form 410)?' }, options: [
      { value: 'yes', label: { zh: '已签', en: 'Yes' } },
      { value: 'no', label: { zh: '还没', en: 'Not yet' } },
    ] },
    { key: 'count', ask: { zh: '几位申请人？', en: 'How many applicants?' }, optional: true, options: COUNT },
  ],
  compose: (q) => {
    const zh = q.lang === 'zh'
    const rep = q.pick('rep')
    const consent = q.pick('consent')
    const c = q.pick('count')
    if (zh) {
      const repT = rep === 'yes' ? '已签书面代表协议' : rep === 'no' ? '还没签代表协议' : '我代表租客方'
      const conT = consent === 'yes' ? '已签 Form 410 同意核查' : '还没签 Form 410'
      return `我替房东客户收到${c ? COUNT_PHRASE[c].zh : '一位'}申请人的申请（${repT}；申请人${conT}）。帮我筛查：报告会查什么、还要收哪些材料，然后带我开始。`
    }
    const repT = rep === 'yes' ? 'representation agreement signed' : rep === 'no' ? 'no representation agreement yet' : 'I represent the tenant'
    const conT = consent === 'yes' ? 'the applicant signed Form 410 consent' : 'the applicant has not signed Form 410 yet'
    return `I have an application from ${c ? COUNT_PHRASE[c].en : 'an applicant'} for my landlord client (${repT}; ${conT}). Screen them: what the report checks, what else to collect, then take me to start.`
  },
}

const PRICING: IntakeSpec = {
  id: 'pricing',
  title: { zh: '挂牌定价', en: 'Price the listing' },
  outline: { zh: '5 步 · 区域 · 类型 · 户型 · 卖点 · 入住日', en: '5 steps · area · type · unit · features · move-in' },
  steps: [
    { key: 'area', ask: { zh: '房源在哪个区域？', en: 'Where is the unit?' }, options: AREAS, input: 'text', placeholder: { zh: '街道 / 楼名 / 社区', en: 'Street / building / neighbourhood' } },
    { key: 'type', ask: { zh: '房源类型？', en: 'Property type?' }, options: UNIT_TYPES },
    { key: 'beds', ask: { zh: '户型？', en: 'Unit type?' }, options: BEDS },
    { key: 'features', ask: { zh: '卖点？（可多选）', en: 'Features? (pick any)' }, multi: true, optional: true, options: [
      { value: 'parking', label: { zh: '车位', en: 'Parking' } },
      { value: 'locker', label: { zh: '储物柜', en: 'Locker' } },
      { value: 'furnished', label: { zh: '带家具', en: 'Furnished' } },
      { value: 'view', label: { zh: '高层 · 景观', en: 'High floor / view' } },
      { value: 'balcony', label: { zh: '阳台', en: 'Balcony' } },
      { value: 'renovated', label: { zh: '新装修', en: 'Renovated' } },
    ], input: 'text', placeholder: { zh: '面积、楼层、朝向…', en: 'Size, floor, exposure…' } },
    { key: 'date', ask: { zh: '目标入住日？', en: 'Target move-in?' }, optional: true, options: WHEN_CHIPS, input: 'date' },
  ],
  compose: (q) => {
    const zh = q.lang === 'zh'
    const area = q.said('area'); const type = q.said('type'); const beds = q.said('beds'); const feats = q.said('features'); const date = q.said('date')
    if (zh) return `帮客户的房源定租金：${[area, type, beds].filter(Boolean).join('，')}${feats ? `，${feats}` : ''}${date ? `，${date}可入住` : ''}；拉同区域同户型的实时挂牌和 TRREB 官方成交数据做比价。`
    return `Price my client's unit: ${[area, type, beds].filter(Boolean).join(', ')}${feats ? `, ${feats.toLowerCase()}` : ''}${date ? `, available ${date.toLowerCase()}` : ''}; pull live listings for the same area and unit type plus the TRREB benchmark.`
  },
}

const SHOWING: IntakeSpec = {
  id: 'showing',
  title: { zh: '带看准备包', en: 'Showing prep pack' },
  outline: { zh: '3 步 · 什么时候 · 哪套房 · 房东授权答什么', en: '3 steps · when · which unit · what you may answer' },
  steps: [
    { key: 'when', ask: { zh: '什么时候带看？', en: 'When is the showing?' }, options: [
      { value: 'today', label: { zh: '今天', en: 'Today' } },
      { value: 'tomorrow', label: { zh: '明天', en: 'Tomorrow' } },
      { value: 'weekend', label: { zh: '这个周末', en: 'This weekend' } },
    ], input: 'text', placeholder: { zh: '例如 11 月 2 日下午 3 点', en: 'e.g. Nov 2 at 3 pm' } },
    { key: 'where', ask: { zh: '带看哪套房？', en: 'Which unit?' }, input: 'text', placeholder: { zh: '地址 + 单元', en: 'Address + unit' } },
    { key: 'authorised', ask: { zh: '房东授权你回答哪些？（可多选）', en: 'What did the landlord authorise you to answer? (pick any)' }, multi: true, options: [
      { value: 'rent_range', label: { zh: '租金区间', en: 'Rent range' } },
      { value: 'move_in', label: { zh: '入住日期', en: 'Move-in date' } },
      { value: 'pets', label: { zh: '宠物政策', en: 'Pet policy' } },
      { value: 'utilities', label: { zh: '水电与停车', en: 'Utilities & parking' } },
      { value: 'term', label: { zh: '租期长短', en: 'Lease length' } },
      { value: 'none', label: { zh: '其余一概不答', en: 'Nothing else' } },
    ] },
  ],
  compose: (q) => {
    const zh = q.lang === 'zh'
    const when = q.said('when'); const where = q.said('where')
    const auth = q.labels('authorised').filter((l) => l !== (zh ? '其余一概不答' : 'Nothing else'))
    const authT = joinList(auth, q.lang)
    if (zh) return `帮我为${when ? `${when}` : '下一场'}在${where || '客户房源'}的带看准备材料包：房东授权我回答 ${authT || '（暂无授权项）'}，其余不授权；给我现场 checklist 和要向申请人收的材料。`
    return `Prep my ${when ? `${when.toLowerCase()} ` : 'next '}showing at ${where || "the client's unit"}: the landlord authorised me to answer ${authT.toLowerCase() || 'nothing yet'} and nothing else; give me the on-site checklist and the documents to collect from applicants.`
  },
}

const LEASE_DEPOSIT: IntakeSpec = {
  id: 'lease_deposit',
  title: { zh: '租约与押金', en: 'Lease & deposit' },
  outline: { zh: '2 步 · 想弄清哪几条 · 你代表谁', en: '2 steps · which points · whom you represent' },
  steps: [
    { key: 'topics', ask: { zh: '想弄清哪几条？（可多选）', en: 'Which points? (pick any)' }, multi: true, options: [
      { value: 'forms', label: { zh: '安省标准租约 vs OREA Form 400 各管什么', en: 'Ontario Standard Lease vs OREA Form 400' } },
      { value: 'deposit', label: { zh: '押金最多收多少、只能抵什么', en: 'Deposit cap and what it may cover' } },
      { value: 'fees', label: { zh: '哪些费用不能向租客收', en: 'Charges that cannot be collected' } },
      { value: 'key', label: { zh: '钥匙押金', en: 'Key deposit' } },
      { value: 'copy', label: { zh: '签后几天内要给租客副本', en: 'When the tenant must get a copy' } },
      { value: 'schedule', label: { zh: '附加条款能写什么、不能写什么', en: 'What additional terms may / may not say' } },
    ] },
    { key: 'side', ask: { zh: '你代表哪一方？', en: 'Whom do you represent?' }, options: [
      { value: 'landlord', label: { zh: '房东', en: 'The landlord' } },
      { value: 'tenant', label: { zh: '租客', en: 'The tenant' } },
    ] },
  ],
  compose: (q) => {
    const zh = q.lang === 'zh'
    const topics = q.said('topics'); const side = q.said('side')
    if (zh) return `客户要签约了（我代表${side || '一方'}）：请讲清 ${topics || '标准租约、押金与不能收的费用'}。`
    return `My client is ready to sign (I represent ${side ? side.toLowerCase() : 'one side'}): explain ${topics.toLowerCase() || 'the standard lease, the deposit and prohibited charges'}.`
  },
}

const BOUNDARIES: IntakeSpec = {
  id: 'boundaries',
  title: { zh: '合规边界', en: 'Compliance boundaries' },
  outline: { zh: '2 步 · 想弄清哪几条 · 什么场景', en: '2 steps · which points · which situation' },
  steps: [
    { key: 'topics', ask: { zh: '想弄清哪几条？（可多选）', en: 'Which points? (pick any)' }, multi: true, options: [
      { value: 'questions', label: { zh: '哪些问题不能问（人权法）', en: 'Questions that are off-limits (Human Rights Code)' } },
      { value: 'answers', label: { zh: '哪些话不能替房东答', en: 'What I must not answer for the landlord' } },
      { value: 'tresa_docs', label: { zh: 'TRESA 要先给客户什么文件', en: 'What TRESA requires me to give a client first' } },
      { value: 'multiple', label: { zh: '多重代表怎么披露', en: 'Multiple representation disclosure' } },
      { value: 'ads', label: { zh: '挂牌广告的措辞', en: 'Listing ad wording' } },
    ] },
    { key: 'scene', ask: { zh: '在什么场景？', en: 'In which situation?' }, options: [
      { value: 'showing', label: { zh: '带看现场', en: 'At a showing' } },
      { value: 'intake', label: { zh: '收申请', en: 'Taking applications' } },
      { value: 'prescreen', label: { zh: '电话 / 微信初筛', en: 'Phone / chat pre-screening' } },
    ] },
  ],
  compose: (q) => {
    const zh = q.lang === 'zh'
    const topics = q.said('topics'); const scene = q.said('scene')
    if (zh) return `${scene || '带看和收申请'}时：${topics || '哪些问题不能问、哪些话不能替房东答、TRESA 要先给什么文件'}？请按 RECO / TRESA 与《人权法典》讲清边界。`
    return `${scene || 'At showings and intake'}: ${topics.toLowerCase() || 'which questions are off-limits, what I must not answer for the landlord, and what TRESA requires first'}? Explain the boundaries under RECO / TRESA and the Human Rights Code.`
  },
}

export const INTAKES: Record<string, IntakeSpec> = {
  find_home: FIND_HOME,
  explain_lease: EXPLAIN_LEASE,
  repair: REPAIR,
  stamps: STAMPS,
  screen: SCREEN,
  list: LIST,
  applications: APPLICATIONS,
  renewal: RENEWAL,
  compliance: COMPLIANCE,
  agent_screen: AGENT_SCREEN,
  pricing: PRICING,
  showing: SHOWING,
  lease_deposit: LEASE_DEPOSIT,
  boundaries: BOUNDARIES,
}

export function intakeFor(id: string | undefined | null): IntakeSpec | null {
  return id ? INTAKES[id] ?? null : null
}
