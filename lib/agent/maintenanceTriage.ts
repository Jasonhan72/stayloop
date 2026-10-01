// Maintenance triage (proposal 2026-09-23 §3.4 · ResidentAI mapping). The
// model fills structured fields on a `maintenance_request` proposal; this
// module is the deterministic side: which keys survive, which values are
// legal, and what counts as an emergency (RTA s.20 — the landlord must keep
// the unit fit for habitation; loss of heat / water / a gas smell / flooding
// / a lock that will not secure the unit are the cases that cannot wait).
// It also holds the gate on which cards a chat turn may propose at all.
export const META_KEYS = ['title', 'description', 'priority', 'location', 'subject', 'body', 'category', 'entry_permission', 'pets'] as const
export type MetaKey = (typeof META_KEYS)[number]

export const MAINTENANCE_CATEGORIES = ['plumbing', 'electrical', 'heating_cooling', 'appliance', 'pest', 'structural', 'locks_safety', 'other'] as const
export const ENTRY_PERMISSIONS = ['anytime', 'call_first', 'tenant_present'] as const

export const CATEGORY_LABEL: Record<(typeof MAINTENANCE_CATEGORIES)[number], { zh: string; en: string }> = {
  plumbing: { zh: '水管 / 漏水', en: 'Plumbing / leak' },
  electrical: { zh: '电路', en: 'Electrical' },
  heating_cooling: { zh: '供暖 / 空调', en: 'Heating / cooling' },
  appliance: { zh: '电器', en: 'Appliance' },
  pest: { zh: '虫害', en: 'Pests' },
  structural: { zh: '门窗 / 结构', en: 'Doors, windows / structure' },
  locks_safety: { zh: '门锁 / 安全', en: 'Locks / safety' },
  other: { zh: '其他', en: 'Other' },
}
export const ENTRY_LABEL: Record<(typeof ENTRY_PERMISSIONS)[number], { zh: string; en: string }> = {
  anytime: { zh: '可随时进入（按 RTA s.27 提前 24 小时书面通知）', en: 'Enter anytime (24h written notice per RTA s.27)' },
  call_first: { zh: '进入前先电话联系', en: 'Call before entering' },
  tenant_present: { zh: '须租客在场', en: 'Tenant must be present' },
}

const EMERGENCY_RE = /(gas|燃气|煤气|no heat|没有暖气|暖气(停|坏|不)|没暖|no water|停水|没水|flood|淹|漏水严重|水漫|sewage|污水|lock(ed)? out|lock (?:failed|broken|will not lock|won't lock)|cannot lock|can't lock|锁坏|门锁(坏|失效)|无法锁|carbon monoxide|一氧化碳|smoke|冒烟|火|fire|electrical spark|漏电|no power|停电)/i

export function sanitizeActionMetadata(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (!raw || typeof raw !== 'object') return out
  for (const k of META_KEYS) {
    const v = (raw as Record<string, unknown>)[k]
    if (typeof v === 'string' && v.trim()) out[k] = v.trim().slice(0, k === 'body' || k === 'description' ? 2000 : 200)
  }
  if (out.priority && !['low', 'medium', 'high'].includes(out.priority)) delete out.priority
  if (out.category && !(MAINTENANCE_CATEGORIES as readonly string[]).includes(out.category)) delete out.category
  if (out.entry_permission && !(ENTRY_PERMISSIONS as readonly string[]).includes(out.entry_permission)) delete out.entry_permission
  return out
}

// Which cards a turn may propose, per hat (sweep 2026-10-01). Only types a
// chat card can actually carry to an executor: a model-proposed card has no
// lease / application / recipient id (the sanitizer above keeps none), so
// send_lease, landlord/agent send_message, approve/reject_applicant, payout…
// were approved and then did nothing. Landlord and agent work lives on pages
// that hold the real row (applicant page, lease page, client book, 发消息).
export const PROPOSABLE_ACTIONS: Record<'tenant' | 'landlord' | 'agent', readonly string[]> = {
  tenant: ['maintenance_request', 'send_message'],
  landlord: [],
  agent: [],
}

export type ProposalGate<T> = { action: T | null; dropped: null | { type: string; why: 'not_proposable' | 'no_body' } }

export function gateProposedAction<T extends { action_type: string; metadata?: Record<string, string> | null }>(
  role: 'tenant' | 'landlord' | 'agent',
  action: T | null,
): ProposalGate<T> {
  if (!action) return { action: null, dropped: null }
  const type = String(action.action_type || '')
  if (!(PROPOSABLE_ACTIONS[role] ?? []).includes(type)) return { action: null, dropped: { type, why: 'not_proposable' } }
  // A send without its text can only fail at execution ("message body is empty").
  if (type === 'send_message' && !String(action.metadata?.body ?? '').trim()) return { action: null, dropped: { type, why: 'no_body' } }
  return { action, dropped: null }
}

const DECISION_TYPES = /applicant|decision|reject|approve|decline/i

/** One line the server appends when it drops a proposal — says nothing ran and where the step is done. */
export function droppedProposalNote(role: 'tenant' | 'landlord' | 'agent', dropped: { type: string; why: 'not_proposable' | 'no_body' }, zh: boolean): string {
  if (dropped.why === 'no_body') {
    return zh
      ? '\n\n（要发给房东的正文没有放进待确认卡片，所以这次没有生成卡片，也没有发出任何消息——说一句「把正文放进卡片」，我就把它填进卡片再给你确认。）'
      : "\n\n(The text to send to your landlord wasn't put into a confirmation card, so no card was created and nothing was sent — say \"put the text in a card\" and I'll add it to a card for you to confirm.)"
  }
  if (role === 'tenant') {
    return zh
      ? '\n\n（这一步不在对话里完成，我没有生成待确认卡片，也没有替你提交、签署或付款：申请在房源页点「申请」，租约用邮件里的签署链接（/tenant/lease 可查看），护照分享在 /tenant/passport。）'
      : "\n\n(This step isn't done in the chat — no confirmation card was created and nothing was submitted, signed or paid: apply from the listing page, sign with the link in your email (see /tenant/lease), and share your passport from /tenant/passport.)"
  }
  if (role === 'landlord') {
    if (dropped.type === 'send_lease') {
      return zh
        ? '\n\n（发送租约请到 /landlord/leases 打开这份租约，点「发送」。我没有生成卡片，也没有发出租约。）'
        : '\n\n(To send a lease, open it in /landlord/leases and press Send. No card was created and no lease was sent.)'
    }
    if (DECISION_TYPES.test(dropped.type)) {
      return zh
        ? '\n\n（录取、婉拒或请申请人补材料，请在 /landlord/applicants 打开这位申请人，在页面上选择决定并预览通知（会附上法定说明，由你本人发出）。我没有生成卡片，也没有发出任何通知。）'
        : '\n\n(To accept, decline or ask for more documents, open the applicant in /landlord/applicants and choose the decision there — you preview the notice (with the required statements) and send it yourself. No card was created and no notice was sent.)'
    }
    return zh
      ? '\n\n（这一步要在对应页面上完成：申请人在 /landlord/applicants，租约在 /landlord/leases，给对方发消息用页面上的「发消息」或 /messages。我没有生成卡片，也没有执行任何操作。）'
      : '\n\n(This step is done on its page: applicants in /landlord/applicants, leases in /landlord/leases, and messages with the Message button or /messages. No card was created and nothing was done.)'
  }
  return dropped.type === 'send_message'
    ? (zh
        ? '\n\n（给客户发消息请在 /agent/clients 那一行点「发消息」，或在 /messages 里继续对话。我没有生成卡片，也没有发出任何消息。）'
        : '\n\n(To message a client, use Message on their row in /agent/clients, or continue in /messages. No card was created and nothing was sent.)')
    : (zh
        ? '\n\n（这一步在客户表 /agent/clients 里完成（记录日期、发起委托、发消息、发起筛查）。我没有生成卡片，也没有执行任何操作。）'
        : '\n\n(This step is done in your client book, /agent/clients (record the dates, propose a delegation, message, start a screening). No card was created and nothing was done.)')
}

/** Emergency = habitability-critical: forces priority high and a "call now" line. */
export function isEmergencyMaintenance(meta: Record<string, unknown>): boolean {
  const text = `${meta.title ?? ''} ${meta.description ?? ''}`
  if (EMERGENCY_RE.test(text)) return true
  return meta.category === 'heating_cooling' && /冬|winter|-?\d+\s*°|degrees|零下|below/i.test(text)
}

export function triageLines(meta: Record<string, unknown>, zh: boolean): string[] {
  const out: string[] = []
  const cat = typeof meta.category === 'string' && (MAINTENANCE_CATEGORIES as readonly string[]).includes(meta.category) ? (meta.category as (typeof MAINTENANCE_CATEGORIES)[number]) : null
  const entry = typeof meta.entry_permission === 'string' && (ENTRY_PERMISSIONS as readonly string[]).includes(meta.entry_permission) ? (meta.entry_permission as (typeof ENTRY_PERMISSIONS)[number]) : null
  if (cat) out.push(`${zh ? '类别' : 'Category'}：${zh ? CATEGORY_LABEL[cat].zh : CATEGORY_LABEL[cat].en}`)
  if (typeof meta.location === 'string' && meta.location) out.push(`${zh ? '位置' : 'Location'}：${meta.location}`)
  if (entry) out.push(`${zh ? '进入许可' : 'Entry'}：${zh ? ENTRY_LABEL[entry].zh : ENTRY_LABEL[entry].en}`)
  if (typeof meta.pets === 'string' && meta.pets) out.push(`${zh ? '家中宠物' : 'Pets at home'}：${meta.pets}`)
  return out
}
