// Threads · pure helpers shared by the panel, the pages and the server
// (节点 4 「连贯」, 2026-09-26). One thread per matter (work order /
// application / tenancy / dispute); messages are append-only; a retraction is
// a new row that hides the original from the default view but never from the
// record; read marks are per-party high-water marks (送达 · 打开 · 确认).

export type ThreadKind = 'work_order' | 'application' | 'tenancy' | 'dispute' | 'listing_inquiry' | 'agent_client' | 'support'
export type SenderKind = 'tenant' | 'landlord' | 'provider' | 'external' | 'agent' | 'system' | 'admin' | 'member'
export type Channel = 'app' | 'email' | 'sms' | 'system'
export type MessageKind = 'message' | 'system' | 'formal_copy' | 'retraction'

export type Attachment = { path: string; name: string; mime: string | null; size: number; sha256: string }
export type ThreadMessage = {
  id: number
  sender_id: string | null
  sender_kind: SenderKind
  acting_role: string | null
  sender_label: string | null
  kind: MessageKind
  body: string
  ref_message_id: number | null
  attachments: Attachment[]
  meta: Record<string, unknown>
  created_at: string
  channel?: Channel | null
  thread_id?: string
  prev_hash?: string | null
  hash?: string | null
}
export type ReadMark = { user_id: string; last_delivered_id: number; last_opened_id: number; last_acknowledged_id: number }

export const PARTY_LABEL: Record<SenderKind, { zh: string; en: string }> = {
  tenant: { zh: '租客', en: 'Tenant' },
  landlord: { zh: '房东', en: 'Landlord' },
  provider: { zh: '服务商', en: 'Provider' },
  external: { zh: '服务商（邮件链接）', en: 'Contractor (email link)' },
  agent: { zh: '经纪', en: 'Agent' },
  system: { zh: '系统', en: 'System' },
  admin: { zh: 'Stayloop', en: 'Stayloop' },
  member: { zh: '用户', en: 'Member' },
}
export const KIND_LABEL: Record<ThreadKind, { zh: string; en: string }> = {
  work_order: { zh: '工单对话', en: 'Work-order thread' },
  application: { zh: '申请对话', en: 'Application thread' },
  tenancy: { zh: '租约对话', en: 'Tenancy thread' },
  dispute: { zh: '争议对话', en: 'Dispute thread' },
  listing_inquiry: { zh: '房源咨询', en: 'Listing inquiry' },
  agent_client: { zh: '经纪委托', en: 'Agent & client' },
  support: { zh: '联系 Stayloop', en: 'Contact Stayloop' },
}
/** Short type tags for the message-centre list. */
export const KIND_TAG: Record<ThreadKind, { zh: string; en: string }> = {
  work_order: { zh: '维修工单', en: 'Work order' },
  application: { zh: '申请', en: 'Application' },
  tenancy: { zh: '在管租约', en: 'Tenancy' },
  dispute: { zh: '争议', en: 'Dispute' },
  listing_inquiry: { zh: '房源咨询', en: 'Listing inquiry' },
  agent_client: { zh: '经纪委托', en: 'Agent & client' },
  support: { zh: '联系 Stayloop', en: 'Stayloop' },
}
export const CHANNEL_LABEL: Record<Channel, { zh: string; en: string }> = {
  app: { zh: '站内', en: 'In app' },
  email: { zh: '邮件回复', en: 'Email reply' },
  sms: { zh: '短信回复', en: 'SMS reply' },
  system: { zh: '系统', en: 'System' },
}
/** The message centre is the one entry for every thread. */
export const messageCenterHref = (threadId: string) => `/messages?t=${threadId}`
/** Every formal-notice copy carries this line: the email is the notice, the thread copy is a record. */
export const FORMAL_COPY_NOTE = { zh: '正式通知副本 · 以邮件送达为准 · 不构成 RTA 法定送达', en: 'Copy of a formal notice · the email is the notice · not statutory service under the RTA' }

/** A sender may retract their own message for this long; the original stays in the record. */
export const RETRACT_WINDOW_MS = 10 * 60_000

export type ViewMessage = ThreadMessage & { retracted: boolean; retractedAt: string | null }

/** Hide retraction rows, mark their targets. Order preserved. */
export function applyRetractions(msgs: ThreadMessage[]): ViewMessage[] {
  const retracted = new Map<number, string>()
  for (const m of msgs) if (m.kind === 'retraction' && m.ref_message_id != null) retracted.set(m.ref_message_id, m.created_at)
  return msgs.filter((m) => m.kind !== 'retraction').map((m) => ({ ...m, retracted: retracted.has(m.id), retractedAt: retracted.get(m.id) ?? null }))
}

export function canRetract(m: ThreadMessage, me: string | null, now = new Date()): boolean {
  if (!me || m.sender_id !== me || m.kind !== 'message') return false
  return now.getTime() - new Date(m.created_at).getTime() <= RETRACT_WINDOW_MS
}

export type ReadState = 'sent' | 'delivered' | 'opened' | 'acknowledged'
/** How far the OTHER parties got with my message id. */
export function readStateFor(messageId: number, reads: ReadMark[], me: string | null): ReadState {
  const others = reads.filter((r) => r.user_id !== me)
  if (others.some((r) => r.last_acknowledged_id >= messageId)) return 'acknowledged'
  if (others.some((r) => r.last_opened_id >= messageId)) return 'opened'
  if (others.some((r) => r.last_delivered_id >= messageId)) return 'delivered'
  return 'sent'
}
export const READ_LABEL: Record<ReadState, { zh: string; en: string }> = {
  sent: { zh: '已发送', en: 'Sent' },
  delivered: { zh: '已送达', en: 'Delivered' },
  opened: { zh: '已读', en: 'Read' },
  acknowledged: { zh: '已确认收到', en: 'Acknowledged' },
}

export function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 102.4) / 10} KB`
  return `${Math.round(n / 104857.6) / 10} MB`
}

/** Where a thread lives in the UI for each party. */
export function threadHref(kind: ThreadKind, refId: string, householdId: string | null, viewer: 'tenant' | 'landlord' | 'provider' | 'agent' | 'admin'): string {
  switch (kind) {
    case 'listing_inquiry':
    case 'agent_client':
    case 'support': return '/messages'
    case 'tenancy': return `/h/${refId}?tab=messages`
    case 'work_order':
    case 'dispute': return viewer === 'provider' ? '/provider/jobs' : householdId ? `/h/${householdId}?tab=maintenance` : '/landlord/maintenance'
    case 'application': return viewer === 'landlord' ? `/landlord/applicants/${refId}` : `/tenant/applications/${refId}`
  }
}

/** One bilingual system line per work-order transition, written into the tri-party thread. */
export function workOrderSystemLine(action: string, payload: Record<string, unknown> = {}): string {
  const money = (n: unknown) => (typeof n === 'number' ? `$${n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '')
  const reason = typeof payload.reason === 'string' && payload.reason ? payload.reason : ''
  switch (action) {
    case 'accept': return `服务商接单并报价 ${money(payload.amount)}${payload.version ? `（第 ${payload.version} 版）` : ''} / Accepted with a quote ${money(payload.amount)}`
    case 'quote': return `服务商修改了报价：${money(payload.amount)}（第 ${payload.version ?? '?'} 版） / Quote revised: ${money(payload.amount)} (v${payload.version ?? '?'})`
    case 'decline': return `服务商婉拒${payload.code ? `（${String(payload.code)}）` : ''}${reason ? `：${reason}` : ''} / Declined${reason ? `: ${reason}` : ''}`
    case 'approve_quote': return `房东批准了报价${payload.auto_policy ? '（按预授权自动）' : ''} / Quote approved${payload.auto_policy ? ' (pre-authorised)' : ''}`
    case 'reject_quote': return `房东未接受报价 / Quote rejected`
    case 'arrive': return `服务商已到场 / Contractor arrived`
    case 'complete': return `服务商报告完工${typeof payload.invoice_amount === 'number' ? ` · 账单 ${money(payload.invoice_amount)}` : ''} / Work reported complete${typeof payload.invoice_amount === 'number' ? ` · invoice ${money(payload.invoice_amount)}` : ''}`
    case 'tenant_confirm': return `租客确认问题已解决 / Tenant confirmed the fix`
    case 'accept_completion': return `房东验收 / Landlord accepted the work`
    case 'request_rework': return `房东要求返工${reason ? `：${reason}` : ''} / Rework requested${reason ? `: ${reason}` : ''}`
    case 'dispute': return `进入争议${reason ? `：${reason}` : ''} / Disputed${reason ? `: ${reason}` : ''}`
    case 'resolve_dispute': return `争议已由 Stayloop 裁定 / Dispute resolved by Stayloop`
    case 'mark_paid': return `房东标记已付款（线下） / Marked paid (offline)`
    case 'close': return `工单已归档 / Work order closed`
    case 'cancel': return `工单已取消${reason ? `：${reason}` : ''} / Cancelled${reason ? `: ${reason}` : ''}`
    default: return action
  }
}

// ── People (找得到人, 2026-09-30) ────────────────────────────────────────────
// A person in a conversation, as the viewer may see them (people_for / thread_people):
// never an address. `name` is null when the account never set one.
export type Person = { user_id: string | null; name: string | null; role: string; channel: 'app' | 'email'; pending: boolean; is_me: boolean }

/** The role word shown next to a person (never alone when a name exists). */
export const PERSON_ROLE: Record<string, { zh: string; en: string }> = {
  tenant: { zh: '租客', en: 'Tenant' },
  landlord: { zh: '房东', en: 'Landlord' },
  provider: { zh: '服务商', en: 'Provider' },
  external: { zh: '外部服务商', en: 'Contractor' },
  agent: { zh: '经纪', en: 'Agent' },
  admin: { zh: 'Stayloop', en: 'Stayloop' },
  member: { zh: '用户', en: 'Member' },
}
/** Role accent colours (identity colours from lib/roleTheme + provider orange + Stayloop brand). */
export const ROLE_ACCENT: Record<string, string> = {
  tenant: '#7C3AED', landlord: '#047857', agent: '#2563EB', provider: '#C2410C', external: '#C2410C', admin: '#00ACE4', member: '#6E6E8A',
}
export function roleLabel(role: string, zh: boolean): string {
  const r = PERSON_ROLE[role]
  return r ? (zh ? r.zh : r.en) : role
}
/** "Sarah Wang" or, with no name, the role word ("房东"). */
export function personName(name: string | null | undefined, role: string, zh: boolean): string {
  return name && name.trim() ? name.trim() : roleLabel(role, zh)
}
/** First visible character for an initial avatar (Han characters stay whole; Latin uppercased). */
export function initialOf(name: string | null | undefined, role: string, zh: boolean): string {
  if (role === 'admin') return 'S'
  const s = personName(name, role, zh)
  const ch = Array.from(s)[0] ?? '?'
  return /[a-z]/i.test(ch) ? ch.toUpperCase() : ch
}
/**
 * The name line for a conversation from the viewer's side: "Sarah Wang",
 * "Northline · Sarah Wang", or "Sarah Wang 等 3 人". Names are paired with their
 * roles by index (people_for orders both arrays the same way).
 */
export function counterpartLine(names: string[], roles: string[], zh: boolean, max = 2): string {
  // Named people are listed once each; unnamed people are counted per role (「租客 ×2」), never collapsed into one.
  const named = Array.from(new Set(names.filter((n) => n && n.trim()).map((n) => n.trim())))
  const unnamedByRole = new Map<string, number>()
  names.forEach((n, i) => { if (!n || !n.trim()) { const r = roles[i] ?? 'member'; unnamedByRole.set(r, (unnamedByRole.get(r) ?? 0) + 1) } })
  const unnamed = Array.from(unnamedByRole.entries()).map(([r, k]) => (k > 1 ? `${roleLabel(r, zh)} ×${k}` : roleLabel(r, zh)))
  const uniq = [...named, ...unnamed]
  if (uniq.length === 0) return zh ? '只有你' : 'Only you'
  if (uniq.length <= max) return uniq.join(zh ? '、' : ', ')
  return zh ? `${uniq.slice(0, max).join('、')} 等 ${uniq.length} 人` : `${uniq.slice(0, max).join(', ')} +${uniq.length - max}`
}
/** A conversation is "two-party" when exactly one other person is in it — only then may a button say 「发消息给 X」. */
export function isTwoParty(roles: string[]): boolean {
  return roles.length === 1
}
/** The counterpart group a conversation belongs to in the message-centre filters. */
export function counterpartGroup(kind: ThreadKind, roles: string[]): 'landlord' | 'tenant' | 'applicant' | 'provider' | 'agent' | 'stayloop' | 'other' {
  if (kind === 'support') return 'stayloop'
  if (kind === 'application' && roles.includes('tenant')) return 'applicant'
  if (roles.includes('provider') || roles.includes('external')) return 'provider'
  if (roles.includes('agent')) return 'agent'
  if (roles.includes('landlord')) return 'landlord'
  if (roles.includes('tenant')) return 'tenant'
  return 'other'
}
export const COUNTERPART_GROUP_LABEL: Record<string, { zh: string; en: string }> = {
  landlord: { zh: '房东', en: 'Landlords' },
  tenant: { zh: '租客', en: 'Tenants' },
  applicant: { zh: '申请人', en: 'Applicants' },
  provider: { zh: '服务商', en: 'Providers' },
  agent: { zh: '经纪 · 客户', en: 'Agents · clients' },
  stayloop: { zh: 'Stayloop', en: 'Stayloop' },
  other: { zh: '其他', en: 'Other' },
}
/** Honest audience line for a composer: everyone in the matter reads every message. */
export function audienceLine(people: Person[], zh: boolean): string {
  const others = people.filter((p) => !p.is_me)
  if (!others.length) return zh ? '这件事里还没有其他人能收到消息' : 'Nobody else in this matter can receive messages yet'
  const list = others.map((p) => `${personName(p.name, p.role, zh)}${p.name ? (zh ? `（${roleLabel(p.role, zh)}）` : ` (${roleLabel(p.role, zh)})`) : ''}${p.pending ? (zh ? '·邀请中' : ' · invited') : ''}`)
  return zh ? `这段对话里的每个人都能看到：${list.join('、')}、你` : `Everyone here can read it: ${list.join(', ')}, you`
}
