// V0.8 · 消费者索取档案 / 争议更正 / 身份警示 — shared shapes (G19, 2026-10-17).
// Contract: design/consumer-file-access-contract-2026-10.md. No 'use client': the
// pages (G20), the admin queue (G21) and the routes all import from here.

export type ConsumerLang = 'zh' | 'en'

export type ConsumerRequestStatus = 'pending_verification' | 'matched' | 'needs_review' | 'fulfilled' | 'closed'
export type ConsumerDelivery = 'electronic' | 'mail' | 'phone'

export type ConsumerRequest = {
  id: string
  email: string
  token: string
  token_expires_at: string
  email_verified_at: string | null
  name: string | null
  date_of_birth: string | null
  delivery: ConsumerDelivery
  mail_address: string | null
  phone: string | null
  status: ConsumerRequestStatus
  matched_screening_ids: string[]
  candidate_screening_ids: string[]
  due_at: string | null
  fulfilled_at: string | null
  closed_at: string | null
  admin_note: string | null
  handled_by: string | null
  ip_hash: string | null
  lang: ConsumerLang
  created_at: string
  updated_at: string
}

export type DisputeItemKind = 'fact' | 'public_record' | 'forensic_flag' | 'credit' | 'verification' | 'other'
export type DisputeStatus = 'open' | 'corrected' | 'supplemented' | 'deleted' | 'maintained'
export type CorrectionAction = 'corrected' | 'supplemented' | 'deleted' | 'maintained'

export const DISPUTE_ITEM_KINDS: readonly DisputeItemKind[] = ['fact', 'public_record', 'forensic_flag', 'credit', 'verification', 'other']
export const CORRECTION_ACTIONS: readonly CorrectionAction[] = ['corrected', 'supplemented', 'deleted', 'maintained']

export type ConsumerDispute = {
  id: string
  request_id: string
  screening_id: string | null
  item_kind: DisputeItemKind
  item_ref: string | null
  item_label: string | null
  statement: string
  evidence_path: string | null
  status: DisputeStatus
  resolution_note: string | null
  resolved_by: string | null
  resolved_at: string | null
  notified_at: string | null
  notified_to: Array<{ to: string; kind: 'landlord' | 'principal' | 'partner_webhook' | 'applicant'; ok: boolean; at: string }>
  created_at: string
}

export type ScreeningCorrection = {
  id: string
  screening_id: string
  dispute_id: string | null
  item_kind: DisputeItemKind | null
  item_ref: string | null
  item_label: string | null
  action: CorrectionAction
  note: string | null
  created_by: string | null
  created_at: string
}

export type ConsumerAlert = {
  id: string
  email: string
  name: string | null
  statement: string
  created_at: string
  expires_at: string
  revoked_at: string | null
  request_id: string | null
}

/** One line of the disclosure pack: what the file says about the applicant, in plain words. */
export type PackItem = {
  kind: Exclude<DisputeItemKind, 'other'>
  /** Stable reference the dispute form sends back (`names:0`, `flag:pdf_producer_consumer_tool`, `portal:CV-26-…`). */
  ref: string
  /** Plain-language label (signalLabel / localized note), never a raw code. */
  label: string
  detail: string | null
  /** s.9(3)(b): adverse information that was not corroborated is marked, never silently listed. */
  unverified: boolean
  severity?: string | null
}

export type PackViewer = {
  /** Who looked (name, or a role word when the name is unknown). */
  name: string
  role: 'landlord' | 'agent' | 'partner' | 'share_link' | 'stayloop'
  phone: string | null
  email: string | null
  when: string
  /** What they opened — `screening report`, `application file`, `passport (api)`, `passport (link)`. */
  what: string
}

export type PackRecipient = {
  name: string
  role: 'landlord' | 'principal' | 'partner'
  phone: string | null
  email: string | null
  received_at: string
  screening_id: string
}

export type PackScreening = {
  screening_id: string
  created_at: string
  landlord_name: string | null
  property: string | null
  tier_label: string | null
  ai_score: number | null
  summary: string | null
  items: PackItem[]
  sources: string[]
  documents: Array<{ kind: string; name: string }>
  /** Corrections without the staff account id; `by` is always Stayloop. */
  corrections: Array<Omit<ScreeningCorrection, 'created_by'> & { by: string }>
  /** s.11(3) record — how the landlord confirmed the applicant was told. */
  notice_confirmed_how: string | null
}

export type DisclosurePack = {
  version: 'consumer-file-v1'
  request_id: string
  email: string
  name: string | null
  generated_at: string
  lang: ConsumerLang
  screenings: PackScreening[]
  viewers: PackViewer[]
  recipients: PackRecipient[]
  alert: ConsumerAlert | null
  /** SHA-256 of the canonical JSON of everything above; set by the route before rendering. */
  fingerprint?: string
}
