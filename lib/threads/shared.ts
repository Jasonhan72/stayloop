// Threads · pure helpers shared by the panel, the pages and the server
// (节点 4 「连贯」, 2026-09-26). One thread per matter (work order /
// application / tenancy / dispute); messages are append-only; a retraction is
// a new row that hides the original from the default view but never from the
// record; read marks are per-party high-water marks (送达 · 打开 · 确认).

export type ThreadKind = 'work_order' | 'application' | 'tenancy' | 'dispute'
export type SenderKind = 'tenant' | 'landlord' | 'provider' | 'external' | 'agent' | 'system' | 'admin'
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
}
export const KIND_LABEL: Record<ThreadKind, { zh: string; en: string }> = {
  work_order: { zh: '工单对话', en: 'Work-order thread' },
  application: { zh: '申请对话', en: 'Application thread' },
  tenancy: { zh: '租约对话', en: 'Tenancy thread' },
  dispute: { zh: '争议对话', en: 'Dispute thread' },
}
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
