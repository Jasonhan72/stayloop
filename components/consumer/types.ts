// V0.8 · 消费者索取档案 — the applicant-side view of the shapes in
// design/consumer-file-access-contract-2026-10.md. Declared here (not in
// lib/consumer, which another group owns) so these components compile and
// test independently; every field mirrors the contract and is read-only.

export type ConsumerRequestStatus = 'pending_verification' | 'matched' | 'needs_review' | 'fulfilled' | 'closed'
export type DeliveryMode = 'electronic' | 'mail' | 'phone'
export type DisputeStatus = 'open' | 'corrected' | 'supplemented' | 'deleted' | 'maintained'
export type ItemKind = 'fact' | 'public_record' | 'forensic_flag' | 'credit' | 'verification' | 'other'
export type CorrectionAction = 'corrected' | 'supplemented' | 'deleted' | 'maintained'

export type PackScreeningSummary = {
  screening_id: string
  created_at: string | null
  landlord_name?: string | null
  property?: string | null
}

export type ConsumerDisputeView = {
  id: string
  screening_id: string
  item_kind: ItemKind
  item_ref: string
  item_label: string
  statement?: string | null
  status: DisputeStatus
  resolution_note?: string | null
  created_at: string
  resolved_at?: string | null
}

export type ConsumerAlertView = {
  statement: string
  created_at: string
  expires_at?: string | null
}

/** GET /api/consumer/request/<token> and the body returned by …/verify. */
export type RequestView = {
  status: ConsumerRequestStatus
  email_masked: string
  name?: string | null
  delivery: DeliveryMode
  due_at?: string | null
  matched: PackScreeningSummary[]
  disputes: ConsumerDisputeView[]
  alert: ConsumerAlertView | null
}

export type PackItem = {
  kind: ItemKind
  ref: string
  label: string
  detail?: string | null
  unverified?: boolean
}

export type PackCorrection = {
  id?: string
  item_kind?: string | null
  item_ref?: string | null
  item_label?: string | null
  action: CorrectionAction
  note?: string | null
  created_at: string
}

export type PackScreening = PackScreeningSummary & {
  tier_label?: string | null
  summary?: string | null
  items: PackItem[]
  sources?: string[]
  documents?: { kind: string; name: string }[]
  corrections?: PackCorrection[]
}

/** GET …/pack?format=json — only the parts the page reads; the rest is passed through to the JSON download untouched. */
export type DisclosurePack = {
  screenings: PackScreening[]
  generated_at?: string
  [k: string]: unknown
}

export type VerifyInput = {
  name: string
  date_of_birth?: string
  delivery: DeliveryMode
  mail_address?: string
  phone?: string
}

/** Row shape read from screening_corrections (RLS: readable when the caller can read the screening). */
export type ScreeningCorrectionRow = {
  id: string
  item_kind: string | null
  item_ref: string | null
  item_label: string | null
  action: CorrectionAction
  note: string | null
  created_at: string
}

export const TOKEN_RE = /^[0-9a-f]{64}$/i
export const DISPUTE_MAX = 2000
export const ALERT_MAX = 500

export function disputeStatusText(s: DisputeStatus, zh: boolean): string {
  const t: Record<DisputeStatus, [string, string]> = {
    open: ['正在核实', 'Being checked'],
    corrected: ['已更正', 'Corrected'],
    supplemented: ['已补充说明', 'Supplemented'],
    deleted: ['已删除', 'Deleted'],
    maintained: ['维持原记录（已写明理由）', 'Kept as recorded (reason given)'],
  }
  const row = t[s] || t.open
  return zh ? row[0] : row[1]
}

export function correctionActionText(a: CorrectionAction, zh: boolean): string {
  const t: Record<CorrectionAction, [string, string]> = {
    corrected: ['已更正', 'Corrected'],
    supplemented: ['已补充', 'Supplemented'],
    deleted: ['已删除', 'Deleted'],
    maintained: ['维持原记录', 'Kept as recorded'],
  }
  const row = t[a] || t.maintained
  return zh ? row[0] : row[1]
}

export function itemKindText(k: ItemKind | string, zh: boolean): string {
  const t: Record<string, [string, string]> = {
    fact: ['档案事实', 'File fact'],
    public_record: ['公开记录', 'Public record'],
    forensic_flag: ['文件检查', 'Document check'],
    credit: ['信用信息', 'Credit information'],
    verification: ['核验步骤', 'Verification step'],
    other: ['其他', 'Other'],
  }
  const row = t[k] || t.other
  return zh ? row[0] : row[1]
}

export function fmtDate(iso: string | null | undefined, zh: boolean, withTime = false): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  return withTime
    ? d.toLocaleString(zh ? 'zh-CN' : 'en-CA', { dateStyle: 'medium', timeStyle: 'short' })
    : d.toLocaleDateString(zh ? 'zh-CN' : 'en-CA', { dateStyle: 'medium' })
}
