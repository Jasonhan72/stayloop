// Applicant pack — shared types and pure helpers (V1.0 阶段 4 · 乙 #7 · G13, 2026-10-16).
// Contract: design/applicant-pack-contract-2026-10.md. The passport page (G14) and
// the apply page (G15) import from here; the column names mirror the migration
// 20261016_applicant_profiles.sql exactly. No 'use client' — the routes import it.
import type { ApplicationFile, FileKind } from '@/types'

// ── Profile row ────────────────────────────────────────────────────────────────
export type ApplicantProfile = {
  auth_id: string
  first_name: string | null
  last_name: string | null
  phone: string | null
  current_address: string | null
  date_of_birth: string | null
  employment_status: string | null
  employer_name: string | null
  job_title: string | null
  employment_start_date: string | null
  monthly_income: number | null
  employer_phone: string | null
  employer_email: string | null
  num_occupants: number
  has_pets: boolean
  pet_details: string | null
  is_smoker: boolean
  additional_notes: string | null
  consent_version: string | null
  consent_at: string | null
  created_at: string
  updated_at: string
}

/** The editable columns (everything but the key and the timestamps). */
export type ApplicantProfileInput = Partial<Omit<ApplicantProfile, 'auth_id' | 'created_at' | 'updated_at'>>

// ── Previous addresses the applicant typed (applicant_profile_history) ─────────
export type ProfileHistoryEntry = {
  id: string
  auth_id: string
  /** 0 = the most recent tenancy. */
  position: number
  prev_address: string | null
  prev_landlord_name: string | null
  prev_landlord_phone: string | null
  prev_landlord_email: string | null
  prev_rent: number | null
  prev_move_in: string | null
  prev_move_out: string | null
  reason_for_leaving: string | null
  created_at: string
  updated_at: string
}

/**
 * A tenancy both sides confirmed on Stayloop, computed by lib/profile/history.ts —
 * never a row in the history table. Counts only, no amounts.
 */
export type StayloopHistoryEntry = {
  source: 'stayloop'
  address: string
  unit: string | null
  city: string | null
  start: string | null
  end: string | null
  /** Periods recorded as paid on or before the due date. */
  onTime: number
  /** Periods recorded as paid more than 7 days after the due date (RTA s.58 wording). */
  lateOver7: number
  /** All recorded periods (status paid or late). */
  total: number
  landlordName?: string
}

// ── Files ──────────────────────────────────────────────────────────────────────
export const PROFILE_FILE_KINDS = [
  { kind: 'id', label: { zh: '身份证件', en: 'Government ID' }, hint: { zh: '驾照、护照、枫叶卡任一；魁北克房源不收证件复印件', en: 'Driver’s licence, passport or PR card; Quebec listings do not collect ID copies' } },
  { kind: 'paystub', label: { zh: '工资单', en: 'Pay stubs' }, hint: { zh: '最近 2–3 张，超过 90 天房东会要求更新', en: 'The latest 2–3; landlords ask for a refresh after 90 days' } },
  { kind: 'bank_statement', label: { zh: '银行对账单', en: 'Bank statements' }, hint: { zh: '最近 3 个月，可遮住账号', en: 'The last 3 months; the account number may be masked' } },
  { kind: 'employment_letter', label: { zh: '在职信 / Offer', en: 'Employment letter / offer' }, hint: { zh: '公司信头、日期、职位与薪资、联系人', en: 'Company letterhead, date, title and pay, a contact' } },
  { kind: 'credit_report', label: { zh: '信用报告', en: 'Credit report' }, hint: { zh: '你自己向 Equifax / TransUnion 申请的报告；超过 90 天建议更新', en: 'A report you requested yourself from Equifax / TransUnion; refresh after 90 days' } },
  { kind: 'reference', label: { zh: '推荐信', en: 'Reference letters' }, hint: { zh: '前房东或雇主的推荐信', en: 'From a previous landlord or an employer' } },
  { kind: 'other', label: { zh: '其他', en: 'Other' }, hint: { zh: '报税单 / NOA、学生证明等', en: 'Tax slips / NOA, proof of enrolment and the like' } },
] as const satisfies readonly { kind: string; label: { zh: string; en: string }; hint: { zh: string; en: string } }[]

export type ProfileFileKind = (typeof PROFILE_FILE_KINDS)[number]['kind']
export const PROFILE_FILE_KIND_IDS = PROFILE_FILE_KINDS.map((k) => k.kind) as ProfileFileKind[]
export function isProfileFileKind(v: unknown): v is ProfileFileKind {
  return typeof v === 'string' && (PROFILE_FILE_KIND_IDS as string[]).includes(v)
}

export type ProfileFile = {
  id: string
  auth_id: string
  kind: ProfileFileKind
  path: string
  name: string | null
  size: number | null
  mime: string | null
  sha256: string | null
  /** The document's own date (pay date, statement end, letter date, ID expiry). */
  as_of: string | null
  uploaded_at: string
}

/** What the files route returns (the row without auth_id). */
export type ProfileFileOut = Omit<ProfileFile, 'auth_id'>

export const PROFILE_FILE_MAX_BYTES = 25 * 1024 * 1024
/** Per kind and in total — the bucket is private, the pack is small by design. */
export const PROFILE_FILES_PER_KIND = 6
export const PROFILE_FILES_TOTAL = 20
export const PROFILE_FILE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'] as const
export type ProfileFileMime = (typeof PROFILE_FILE_MIMES)[number]
const EXT_BY_MIME: Record<ProfileFileMime, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'application/pdf': 'pdf' }
const MIME_BY_EXT: Record<string, ProfileFileMime> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heic', pdf: 'application/pdf' }

export type ProfileFileAccept = { ok: true; mime: ProfileFileMime; ext: string } | { ok: false; reason: 'empty' | 'file_size' | 'file_type' }

/**
 * Type / size gate, the same on the client and on the route (same rules as the
 * rent receipt: iOS hands HEIC over with an empty type, so the extension decides
 * when the browser did not; a declared type off the list is refused).
 */
export function acceptProfileFile(file: { name: string; type?: string | null; size: number }): ProfileFileAccept {
  if (!file || !(file.size > 0)) return { ok: false, reason: 'empty' }
  if (file.size > PROFILE_FILE_MAX_BYTES) return { ok: false, reason: 'file_size' }
  const declared = (file.type || '').toLowerCase().trim()
  const ext = (file.name.split('.').pop() || '').toLowerCase()
  let mime: ProfileFileMime | null = null
  if (declared) {
    if ((PROFILE_FILE_MIMES as readonly string[]).includes(declared)) mime = declared as ProfileFileMime
    else if (declared === 'image/heif') mime = 'image/heic'
    else if (declared === 'application/octet-stream' && MIME_BY_EXT[ext]) mime = MIME_BY_EXT[ext]
  } else if (MIME_BY_EXT[ext]) mime = MIME_BY_EXT[ext]
  if (!mime) return { ok: false, reason: 'file_type' }
  return { ok: true, mime, ext: EXT_BY_MIME[mime] }
}

/** A file name safe for a storage key: ASCII word characters, dots and dashes, ≤ 80; the extension is `ext`. */
export function safeFileName(name: string, ext: string): string {
  const raw = (name || '').replace(/[\r\n]/g, ' ').trim()
  const m = /^(.*?)(?:\.([A-Za-z0-9]{1,8}))?$/.exec(raw)
  const base = (m?.[1] ?? '').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^[._]+|[._]+$/g, '').replace(/_{2,}/g, '_').slice(0, 72) || 'file'
  // The extension is the accepted MIME's, never the name's (the name's is only stripped).
  const extension = (ext || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'bin'
  return `${base}.${extension}`
}

/** `profile/<auth_id>/<kind>/<sha8>-<safe-name>` — first segment fixed, second the owner. */
export function profileFilePath(authId: string, kind: ProfileFileKind, sha256: string, name: string, ext: string): string {
  return `profile/${authId}/${kind}/${sha256.slice(0, 8)}-${safeFileName(name, ext)}`
}

/** Where a pack file lands when attached to an application: `<application_id>/<kind>/<sha8>-<safe-name>`. */
export function attachedFilePath(applicationId: string, kind: ProfileFileKind, sha256: string, name: string, ext: string): string {
  return `${applicationId}/${kind}/${sha256.slice(0, 8)}-${safeFileName(name, ext)}`
}

/** The apply flow's FileKind has five values; the pack's two extra kinds travel as `other`. */
export function toApplicationFileKind(kind: ProfileFileKind): FileKind {
  if (kind === 'id' || kind === 'paystub' || kind === 'bank_statement' || kind === 'employment_letter') return kind
  return 'other'
}

export function toApplicationFile(f: Pick<ProfileFile, 'kind' | 'name' | 'size' | 'mime'>, path: string, uploadedAt: string): ApplicationFile {
  const k = toApplicationFileKind(f.kind)
  return { kind: k, type: k, path, name: f.name || path.split('/').pop() || 'file', size: f.size ?? 0, mime: f.mime || 'application/octet-stream', uploaded_at: uploadedAt }
}

// ── Profile → /apply form ───────────────────────────────────────────────────────
/** The /apply form keys a pack can fill (email and move-in date stay the page's own). */
export type ApplyFormFill = Partial<Record<
  | 'first_name' | 'last_name' | 'phone' | 'date_of_birth' | 'current_address'
  | 'employment_status' | 'employer_name' | 'job_title' | 'monthly_income' | 'employment_start_date'
  | 'employer_phone' | 'employer_email'
  | 'prev_landlord_name' | 'prev_landlord_phone' | 'prev_address' | 'prev_rent' | 'prev_move_in' | 'prev_move_out' | 'reason_for_leaving'
  | 'num_occupants' | 'has_pets' | 'pet_details' | 'is_smoker' | 'additional_notes',
  string
>>

const str = (v: string | number | null | undefined): string | null => {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s ? s : null
}

/**
 * Map the pack onto the apply form's own field names, giving only the values that
 * are non-empty — the page spreads this over its state, so an empty pack changes
 * nothing. Booleans are given only when true (`'true'` is what the form stores;
 * false equals the form default). `history` is the most recent previous tenancy:
 * a typed row (position 0) or a Stayloop-confirmed one (no rent, no phone).
 */
// The pack stores a short key (employed / self_employed / student / retired /
// unemployed / other); the /apply form's <select> uses display values
// ('Full-time employed' …). Map both ways so neither side shows a raw key.
const PACK_TO_APPLY_STATUS: Record<string, string> = {
  employed: 'Full-time employed', self_employed: 'Self-employed', student: 'Student', retired: 'Retired', unemployed: 'Other', other: 'Other',
}
const APPLY_TO_PACK_STATUS: Record<string, string> = {
  'Full-time employed': 'employed', 'Part-time employed': 'employed', 'Self-employed': 'self_employed', Student: 'student', Retired: 'retired', Other: 'other',
}
export function toApplyEmploymentStatus(v: string | null | undefined): string | null {
  if (!v) return null
  return PACK_TO_APPLY_STATUS[v] ?? (Object.keys(APPLY_TO_PACK_STATUS).includes(v) ? v : null)
}
export function toPackEmploymentStatus(v: string | null | undefined): string | null {
  if (!v) return null
  return APPLY_TO_PACK_STATUS[v] ?? (Object.keys(PACK_TO_APPLY_STATUS).includes(v) ? v : 'other')
}

export function profileToApplyForm(
  profile: Partial<ApplicantProfile> | null | undefined,
  history?: ProfileHistoryEntry | StayloopHistoryEntry | null,
): ApplyFormFill {
  const out: ApplyFormFill = {}
  const p = profile ?? {}
  const put = (k: keyof ApplyFormFill, v: string | number | null | undefined) => {
    const s = str(v)
    if (s !== null) out[k] = s
  }
  put('first_name', p.first_name)
  put('last_name', p.last_name)
  put('phone', p.phone)
  put('date_of_birth', p.date_of_birth)
  put('current_address', p.current_address)
  put('employment_status', toApplyEmploymentStatus(p.employment_status))
  put('employer_name', p.employer_name)
  put('job_title', p.job_title)
  put('monthly_income', typeof p.monthly_income === 'number' && p.monthly_income > 0 ? p.monthly_income : null)
  put('employment_start_date', p.employment_start_date)
  put('employer_phone', p.employer_phone)
  put('employer_email', p.employer_email)
  put('num_occupants', typeof p.num_occupants === 'number' && p.num_occupants >= 1 ? p.num_occupants : null)
  if (p.has_pets === true) out.has_pets = 'true'
  put('pet_details', p.pet_details)
  if (p.is_smoker === true) out.is_smoker = 'true'
  put('additional_notes', p.additional_notes)
  if (history) {
    if ('source' in history && history.source === 'stayloop') {
      const addr = [history.address, history.unit ? `#${history.unit}` : null, history.city].filter(Boolean).join(', ')
      put('prev_address', addr)
      put('prev_landlord_name', history.landlordName)
      put('prev_move_in', history.start)
      put('prev_move_out', history.end)
    } else {
      const h = history as ProfileHistoryEntry
      put('prev_address', h.prev_address)
      put('prev_landlord_name', h.prev_landlord_name)
      put('prev_landlord_phone', h.prev_landlord_phone)
      put('prev_rent', typeof h.prev_rent === 'number' && h.prev_rent > 0 ? h.prev_rent : null)
      put('prev_move_in', h.prev_move_in)
      put('prev_move_out', h.prev_move_out)
      put('reason_for_leaving', h.reason_for_leaving)
    }
  }
  return out
}

/** The routes' error words, in plain language (the pages show these). */
export function profileFileErrorText(code: string, zh: boolean): string {
  const c = code || ''
  if (/sign_in_required/.test(c)) return zh ? '请先登录。' : 'Please sign in.'
  if (/rate_limited/.test(c)) return zh ? '这一小时上传得太多了，稍后再试。' : 'Too many uploads this hour — try again later.'
  if (/file_type/.test(c)) return zh ? '只收 JPG / PNG / WebP / HEIC 图片或 PDF。' : 'Only JPG / PNG / WebP / HEIC images or a PDF.'
  if (/file_size/.test(c)) return zh ? '单个文件最大 25 MB。' : 'Each file must be 25 MB or smaller.'
  if (/kind_limit/.test(c)) return zh ? `这一类最多 ${PROFILE_FILES_PER_KIND} 份，先删掉一份再传。` : `At most ${PROFILE_FILES_PER_KIND} files of this kind — remove one first.`
  if (/total_limit/.test(c)) return zh ? `申请包最多 ${PROFILE_FILES_TOTAL} 份文件。` : `The pack holds at most ${PROFILE_FILES_TOTAL} files.`
  if (/bad_kind/.test(c)) return zh ? '文件类别无效。' : 'Unknown file kind.'
  if (/bad_as_of/.test(c)) return zh ? '日期格式应为 YYYY-MM-DD。' : 'The date must be YYYY-MM-DD.'
  if (/not_found/.test(c)) return zh ? '找不到这份文件。' : 'That file was not found.'
  if (/not_your_application/.test(c)) return zh ? '这份申请不是用你的邮箱提交的。' : 'This application was not submitted with your email.'
  if (/application_too_old/.test(c)) return zh ? '申请提交已超过一小时，不能再附加材料。' : 'The application is more than an hour old — files can no longer be attached.'
  if (/application_has_files/.test(c)) return zh ? '这份申请已经有材料了。' : 'This application already has files.'
  if (/copy_failed/.test(c)) return zh ? '有文件没能复制到申请里，请重试。' : 'Some files could not be copied to the application — please retry.'
  return zh ? `没有成功：${c}` : `Not saved: ${c}`
}
