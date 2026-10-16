// Rent-period evidence — pure (V1.0 阶段 3 · 甲 #4 · G9, 2026-10-16).
//
// A period is "evidenced" when three independent marks line up on its
// rent_payments row: someone RECORDED it (mark_rent_paid — tenant_id is the
// recorder), the OTHER side CONFIRMED it (confirm_rent_payment — never the
// recorder), and a receipt file was ATTACHED (/api/rent/evidence — the server
// computes the SHA-256, the file lives in the private tenancy-files bucket under
// the household's folder). Nothing here moves money; nothing here deletes:
// evidence is appended for the record, a dispute reads it later.
//
// This module is shared by the hub row, the landlord ledger and the tenant's
// rent list so the three surfaces say the same thing about the same row.

export const EVIDENCE_MAX_BYTES = 10 * 1024 * 1024
/** What a receipt may be: a photo / screenshot of the transfer, or a PDF statement. */
export const EVIDENCE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'] as const
export type EvidenceMime = (typeof EVIDENCE_MIMES)[number]
const EXT_BY_MIME: Record<EvidenceMime, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'application/pdf': 'pdf' }
const MIME_BY_EXT: Record<string, EvidenceMime> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heic', pdf: 'application/pdf' }

export type EvidenceAccept = { ok: true; mime: EvidenceMime; ext: string } | { ok: false; reason: 'empty' | 'file_size' | 'file_type' }

/**
 * Type / size gate for a receipt, the same on the client (before the upload) and on
 * the route. iOS hands a HEIC over with an empty `type`, so the extension decides when
 * the browser did not; a declared type that is not on the list is refused even when
 * the extension looks fine (the server trusts neither — it only decides what to store).
 */
export function acceptEvidenceFile(file: { name: string; type?: string | null; size: number }): EvidenceAccept {
  if (!file || !(file.size > 0)) return { ok: false, reason: 'empty' }
  if (file.size > EVIDENCE_MAX_BYTES) return { ok: false, reason: 'file_size' }
  const declared = (file.type || '').toLowerCase().trim()
  const ext = (file.name.split('.').pop() || '').toLowerCase()
  let mime: EvidenceMime | null = null
  if (declared) {
    if ((EVIDENCE_MIMES as readonly string[]).includes(declared)) mime = declared as EvidenceMime
    else if (declared === 'image/heif') mime = 'image/heic'
    else if (declared === 'application/octet-stream' && MIME_BY_EXT[ext]) mime = MIME_BY_EXT[ext]
  } else if (MIME_BY_EXT[ext]) mime = MIME_BY_EXT[ext]
  if (!mime) return { ok: false, reason: 'file_type' }
  return { ok: true, mime, ext: EXT_BY_MIME[mime] }
}

/**
 * Where a receipt is stored: `<household>/rent/<lease>/<due>-<sha8>.<ext>`.
 * The first folder segment is the household id — tenancy_files_member_read keys
 * on it, so only members of that tenancy can sign a URL for the file. The due
 * date and the hash prefix make the name say which period and which bytes.
 */
export function evidencePath(householdId: string, leaseId: string, due: string, sha256: string, ext: string): string {
  const safeExt = (ext || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'bin'
  const day = due.slice(0, 10)
  return `${householdId}/rent/${leaseId}/${day}-${sha256.slice(0, 8)}.${safeExt}`
}

/** The hash as shown next to a receipt: the first 12 hex characters. */
export function shortSha(sha256: string | null | undefined): string {
  return (sha256 || '').slice(0, 12)
}

export type EvidenceRow = {
  status?: string | null
  /** Who recorded the period (rent_payments.tenant_id — the recorder, whatever their role). */
  tenant_id?: string | null
  /** The facts RPCs expose the recorder under this name. */
  recorded_by?: string | null
  confirmed_by?: string | null
  confirmed_at?: string | null
  evidence_path?: string | null
  evidence_name?: string | null
  evidence_sha256?: string | null
  evidence_at?: string | null
  note?: string | null
}

export type PeriodEvidenceState = {
  recorded: boolean
  recordedBy: string | null
  recordedByMe: boolean
  confirmed: boolean
  confirmedByMe: boolean
  /** The signed-in member may confirm: recorded, not yet confirmed, and recorded by someone else. */
  canConfirm: boolean
  hasEvidence: boolean
}

export function periodEvidenceState(row: EvidenceRow | null | undefined, myUid: string | null | undefined): PeriodEvidenceState {
  const recorded = !!row && (row.status === 'paid' || row.status === 'late')
  const recordedBy = recorded ? (row?.recorded_by ?? row?.tenant_id ?? null) : null
  const recordedByMe = !!myUid && !!recordedBy && recordedBy === myUid
  const confirmed = recorded && !!row?.confirmed_by
  const confirmedByMe = confirmed && !!myUid && row?.confirmed_by === myUid
  const hasEvidence = recorded && !!row?.evidence_path
  return {
    recorded,
    recordedBy,
    recordedByMe,
    confirmed,
    confirmedByMe,
    canConfirm: recorded && !confirmed && !!myUid && !!recordedBy && recordedBy !== myUid,
    hasEvidence,
  }
}

export type EvidenceBadge = 'receipt_confirmed' | 'receipt' | 'confirmed' | 'awaiting_me' | 'awaiting_other' | 'none'

/** One word for the dashboards' 凭证 column. */
export function evidenceBadge(row: EvidenceRow | null | undefined, myUid: string | null | undefined): EvidenceBadge {
  const s = periodEvidenceState(row, myUid)
  if (!s.recorded) return 'none'
  if (s.hasEvidence && s.confirmed) return 'receipt_confirmed'
  if (s.hasEvidence) return 'receipt'
  if (s.confirmed) return 'confirmed'
  return s.canConfirm ? 'awaiting_me' : 'awaiting_other'
}

export const EVIDENCE_BADGE_LABEL: Record<EvidenceBadge, { zh: string; en: string }> = {
  receipt_confirmed: { zh: '✓ 回执 · 对方已确认', en: '✓ Receipt · confirmed' },
  receipt: { zh: '✓ 回执', en: '✓ Receipt' },
  confirmed: { zh: '对方已确认', en: 'Confirmed by the other side' },
  awaiting_me: { zh: '等我确认', en: 'Awaiting my confirmation' },
  awaiting_other: { zh: '等对方确认', en: 'Awaiting confirmation' },
  none: { zh: '无', en: '—' },
}

/** The route's and the RPC's error words, in plain language. */
export function evidenceErrorText(code: string, zh: boolean): string {
  const c = code || ''
  if (/self_confirm/.test(c)) return zh ? '记录人不能自己确认，要由对方确认。' : 'The person who recorded it cannot confirm it — the other side does.'
  if (/not_recorded/.test(c)) return zh ? '这一期还没有记录为已付，先填付款日期再附回执。' : 'This period is not recorded as paid yet — set the payment date and attach the receipt together.'
  if (/evidence_exists/.test(c)) return zh ? '这一期已经有回执了；要补充材料请在租约对话里发附件。' : 'This period already has a receipt; send any further file in the tenancy thread.'
  if (/file_type/.test(c)) return zh ? '只收 JPG / PNG / WebP / HEIC 图片或 PDF。' : 'Only JPG / PNG / WebP / HEIC images or a PDF.'
  if (/file_size/.test(c)) return zh ? '文件最大 10 MB。' : 'The file must be 10 MB or smaller.'
  if (/rate_limited/.test(c)) return zh ? '这一小时附得太多了，稍后再试。' : 'Too many receipts this hour — try again later.'
  if (/not_a_member/.test(c)) return zh ? '只有这份租约的成员可以操作。' : 'Only members of this tenancy can do this.'
  if (/sign_in_required/.test(c)) return zh ? '请先登录。' : 'Please sign in.'
  return zh ? `没有成功：${c}` : `Not saved: ${c}`
}
