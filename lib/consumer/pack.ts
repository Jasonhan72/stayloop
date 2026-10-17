// Disclosure pack = what the file says about THIS applicant, in plain words
// (Consumer Reporting Act s.12(3), (5), (9)). Pure: the route loads the rows
// (lib/consumer/server.ts) and hands them in; nothing here touches Supabase.
//
// Two rules the guard tests pin:
//   1. Only screenings the route already matched to the applicant's email AND
//      name are passed in — this module never widens that set.
//   2. Nothing about any other person is listed. The model's extracted_names
//      carry HR signatories, previous landlords, brokers; only names that cover
//      the applicant's own name, or that appear on an identity document inside
//      the file (the co-applicant), survive. Scores: ai_score and the tier
//      label only — no dimension numbers.
import { signalLabel } from '@/lib/screening/signalLabels'
import { summaryFor } from '@/lib/screening/summaryText'
import { courtNoteZh, courtSourceZh } from '@/lib/screening/localize'
import { nameMatches, nameTokens } from './match'
import type { ConsumerAlert, ConsumerLang, ConsumerRequest, DisclosurePack, PackItem, PackRecipient, PackScreening, PackViewer, ScreeningCorrection } from './types'

/** The screening columns the pack reads (service-role select in the route). */
export const PACK_SCREENING_COLUMNS = 'id, created_at, scored_at, landlord_id, tenant_name, ai_extracted_name, ai_score, v3_tier, ai_summary, ai_summary_en, ai_summary_zh, ai_dimension_notes, hard_gates_triggered, red_flags, forensics_detail, court_records_detail, verification, files, notes, application_id, delegation_id, partner_key_id, notice_confirmed_how'

export type PackScreeningRow = {
  id: string
  created_at: string
  scored_at?: string | null
  landlord_id: string | null
  tenant_name: string | null
  ai_extracted_name: string | null
  ai_score: number | null
  v3_tier: string | null
  ai_summary?: string | null
  ai_summary_en?: string | null
  ai_summary_zh?: string | null
  ai_dimension_notes: Record<string, unknown> | null
  hard_gates_triggered: string[] | null
  red_flags: string[] | null
  forensics_detail: Record<string, unknown> | null
  court_records_detail: Record<string, unknown> | null
  verification: Record<string, unknown> | null
  files: unknown
  notes: string | null
  application_id: string | null
  notice_confirmed_how?: string | null
  /** Filled by the loader: landlords row for landlord_id (profile id or auth id). */
  landlord?: { full_name: string | null; email: string | null; phone: string | null } | null
}

export type PackApplicationRow = {
  id: string
  first_name: string | null
  last_name: string | null
  date_of_birth?: string | null
  listing?: { address?: string | null; unit?: string | null; city?: string | null } | null
}

export type BuildPackInput = {
  request: Pick<ConsumerRequest, 'id' | 'email' | 'name' | 'matched_screening_ids'>
  screenings: PackScreeningRow[]
  applications: PackApplicationRow[]
  /** verification_requests rows for the matched screenings (steps only). */
  verifications: Array<{ screening_id: string; steps: Record<string, unknown> | null; updated_at?: string | null }>
  corrections: ScreeningCorrection[]
  viewers: PackViewer[]
  recipients: PackRecipient[]
  alerts: ConsumerAlert[]
  lang: ConsumerLang
  now?: Date
}

const TIER_LABEL: Record<string, { zh: string; en: string }> = {
  approve: { zh: '优质 · 建议通过', en: 'Strong · proceed' },
  conditional: { zh: '待定 · 附加条件', en: 'Conditional' },
  decline: { zh: '建议拒绝', en: 'Decline recommended' },
}

export function tierLabel(tier: string | null | undefined, lang: ConsumerLang): string | null {
  if (!tier) return null
  const t = TIER_LABEL[String(tier)]
  return t ? t[lang] : String(tier)
}

type V3 = {
  extracted_names?: unknown
  detected_monthly_income?: unknown
  effective_monthly_income?: unknown
  coherence_review?: { documents?: Array<{ file?: string; kind?: string; key_facts?: { names?: string[]; addresses?: string[]; employer?: string | null; employment_start?: string | null; dob?: string | null } }> } | null
  ltb_check?: { status?: string; as_respondent?: Array<Record<string, unknown>>; corroborated?: Array<Record<string, unknown>>; summary_en?: string; summary_zh?: string } | null
  credit_report?: { score?: unknown; bureau?: unknown; report_date?: unknown; subject_name?: unknown } | null
}

function v3Of(row: PackScreeningRow): V3 {
  const notes = row.ai_dimension_notes
  const v = notes && typeof notes === 'object' ? (notes as Record<string, unknown>)._v3 : null
  return (v && typeof v === 'object' ? v : {}) as V3
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

/** Names on identity documents inside the file: the applicant and any co-applicant. */
function idDocumentNames(v3: V3): string[] {
  const docs = v3.coherence_review?.documents ?? []
  const out: string[] = []
  for (const d of docs) {
    if (!/id|passport|licen|permit|pr_card/i.test(String(d.kind ?? ''))) continue
    for (const n of d.key_facts?.names ?? []) if (str(n)) out.push(String(n))
  }
  return out
}

/** Keep a name only when it is the applicant's own, or appears on an ID document in the file (co-applicant). */
export function filterToApplicantNames(names: unknown, applicantName: string | null, idNames: string[]): string[] {
  const list = Array.isArray(names) ? names.map(str).filter((n): n is string => !!n) : []
  const keep = (n: string) => {
    if (applicantName && nameMatches(applicantName, { tenant_name: n })) return true
    if (applicantName && nameMatches(n, { tenant_name: applicantName })) return true
    return idNames.some((i) => nameMatches(i, { tenant_name: n }) || nameMatches(n, { tenant_name: i }))
  }
  const seen = new Set<string>()
  const out: string[] = []
  for (const n of list) {
    const k = nameTokens(n).join(' ')
    if (!k || seen.has(k)) continue
    if (!keep(n)) continue
    seen.add(k)
    out.push(n)
  }
  return out
}

/** The applicant's own documents in the coherence review: no names, or names that cover the applicant / co-applicant. */
function ownDocuments(v3: V3, applicantName: string | null, idNames: string[]) {
  const docs = v3.coherence_review?.documents ?? []
  return docs.filter((d) => {
    const names = d.key_facts?.names ?? []
    if (!names.length) return true
    return filterToApplicantNames(names, applicantName, idNames).length > 0
  })
}

function propertyOf(row: PackScreeningRow, app: PackApplicationRow | undefined): string | null {
  const l = app?.listing
  if (l && l.address) return `${l.address}${l.unit ? ` #${l.unit}` : ''}${l.city ? `, ${l.city}` : ''}`
  const m = /^Listing:\s*(.+)$/m.exec(row.notes ?? '')
  return m ? m[1].trim().slice(0, 200) : null
}

function money(n: unknown): string | null {
  const x = typeof n === 'number' ? n : typeof n === 'string' ? Number(n) : NaN
  if (!Number.isFinite(x) || x <= 0) return null
  return `$${Math.round(x).toLocaleString('en-CA')}`
}

export function buildScreeningSection(row: PackScreeningRow, input: Pick<BuildPackInput, 'request' | 'applications' | 'verifications' | 'corrections' | 'lang'>): PackScreening {
  const zh = input.lang === 'zh'
  const v3 = v3Of(row)
  const app = input.applications.find((a) => a.id === row.application_id)
  const applicantName = input.request.name ?? row.tenant_name ?? null
  const idNames = idDocumentNames(v3)
  const items: PackItem[] = []

  // ── facts the file records about the applicant ──
  const names = filterToApplicantNames(v3.extracted_names, applicantName, idNames)
  names.forEach((n, i) => items.push({ kind: 'fact', ref: `names:${i}`, label: zh ? '档案里的姓名' : 'Name on file', detail: n, unverified: false }))
  const income = money(v3.effective_monthly_income ?? v3.detected_monthly_income)
  if (income) items.push({ kind: 'fact', ref: 'income:monthly', label: zh ? '从材料里读出的月收入' : 'Monthly income read from the documents', detail: income, unverified: false })
  const seenEmp = new Set<string>()
  const seenAddr = new Set<string>()
  for (const d of ownDocuments(v3, applicantName, idNames)) {
    const kf = d.key_facts ?? {}
    const emp = str(kf.employer)
    if (emp && !seenEmp.has(emp.toLowerCase())) {
      seenEmp.add(emp.toLowerCase())
      items.push({ kind: 'fact', ref: `employer:${seenEmp.size - 1}`, label: zh ? '档案里的雇主' : 'Employer on file', detail: `${emp}${kf.employment_start ? ` · ${zh ? '入职' : 'since'} ${kf.employment_start}` : ''}${d.file ? ` · ${d.file}` : ''}`, unverified: false })
    }
    for (const a of kf.addresses ?? []) {
      const s = str(a)
      if (!s || seenAddr.has(s.toLowerCase())) continue
      seenAddr.add(s.toLowerCase())
      items.push({ kind: 'fact', ref: `address:${seenAddr.size - 1}`, label: zh ? '档案里的地址' : 'Address on file', detail: s, unverified: false })
    }
  }

  // ── screening signals (codes → plain labels) ──
  for (const g of row.hard_gates_triggered ?? []) items.push({ kind: 'forensic_flag', ref: `gate:${g}`, label: signalLabel(g, zh), detail: zh ? '硬门槛：这一项直接影响了结论' : 'Hard gate: this item set the ceiling of the conclusion', unverified: false, severity: 'critical' })
  for (const f of row.red_flags ?? []) items.push({ kind: 'forensic_flag', ref: `flag:${f}`, label: signalLabel(f, zh), detail: zh ? '风险标记' : 'Risk flag', unverified: false, severity: 'high' })
  const fd = row.forensics_detail
  const allFlags = fd && Array.isArray((fd as { all_flags?: unknown }).all_flags) ? ((fd as { all_flags: Array<{ code?: string; severity?: string; file?: string; evidence_en?: string; evidence_zh?: string }> }).all_flags) : []
  for (const f of allFlags) {
    if (!f || typeof f.code !== 'string') continue
    if (f.severity === 'info') continue
    items.push({ kind: 'forensic_flag', ref: `forensic:${f.code}${f.file ? `:${f.file}` : ''}`, label: signalLabel(f.code, zh), detail: [zh ? f.evidence_zh || f.evidence_en : f.evidence_en || f.evidence_zh, f.file].filter(Boolean).join(' · ') || null, unverified: false, severity: f.severity ?? null })
  }

  // ── public records: every hit, marked unverified unless corroborated (s.9(3)(b)) ──
  const sources: string[] = [zh ? '申请人提交的文件' : 'Documents the applicant submitted']
  const crd = row.court_records_detail as { queries?: Array<Record<string, unknown>> } | null
  for (const q of crd?.queries ?? []) {
    const source = str(q.source) ?? ''
    if (source) sources.push(zh ? courtSourceZh(source) : source)
    const status = str(q.status)
    if (status && status !== 'ok') {
      items.push({ kind: 'public_record', ref: `source:${source}`, label: zh ? `${courtSourceZh(source)} · 未能检索` : `${source} · not searched`, detail: zh ? courtNoteZh(str(q.note)) || null : str(q.note), unverified: true })
      continue
    }
    for (const r of (Array.isArray(q.portalRecords) ? q.portalRecords : []) as Array<Record<string, unknown>>) {
      const strong = r.matchConfidence === 'strong'
      items.push({ kind: 'public_record', ref: `portal:${str(r.caseNumber) ?? ''}`, label: zh ? '安省法院门户记录' : 'Ontario Courts Portal record', detail: [str(r.caseTitle), str(r.caseNumber), str(r.partyRole), str(r.filedDate)?.slice(0, 10), r.closedFlag ? (zh ? '已结案' : 'closed') : (zh ? '未结' : 'active')].filter(Boolean).join(' · '), unverified: !strong })
    }
    for (const r of (Array.isArray(q.records) ? q.records : []) as Array<Record<string, unknown>>) {
      items.push({ kind: 'public_record', ref: `canlii:${str(r.citation) ?? str(r.caseId) ?? ''}`, label: zh ? 'CanLII 判决' : 'CanLII decision', detail: [str(r.title), str(r.citation)].filter(Boolean).join(' · '), unverified: r.nameInTitle !== true })
    }
    for (const r of (Array.isArray(q.indexRecords) ? q.indexRecords : []) as Array<Record<string, unknown>>) {
      items.push({ kind: 'public_record', ref: `canlii-mention:${str(r.url) ?? ''}`, label: zh ? 'canlii.org 上提到这个姓名的页面（不计分）' : 'Page on canlii.org mentioning the name (not scored)', detail: str(r.title), unverified: true })
    }
  }
  const ltb = v3.ltb_check
  if (ltb && (ltb.as_respondent?.length || ltb.status)) {
    sources.push(zh ? 'LTB 判令目录（安省开放数据）' : 'LTB Order Catalogue (Ontario Open Data)')
    const corro = new Set((ltb.corroborated ?? []).map((m) => String(m.document_id ?? m.file_number ?? '')))
    for (const m of ltb.as_respondent ?? []) {
      const id = String(m.document_id ?? m.file_number ?? '')
      items.push({ kind: 'public_record', ref: `ltb:${id}`, label: zh ? 'LTB 判令（以该姓名列为被申请租客）' : 'LTB order naming this name as responding tenant', detail: [str(m.file_number), str(m.order_date), Array.isArray(m.application_codes) ? m.application_codes.join('/') : null, str(m.unit_address)].filter(Boolean).join(' · '), unverified: !corro.has(id) })
    }
  }

  // ── credit (score + bureau only) ──
  const cr = v3.credit_report
  if (cr && typeof cr.score === 'number') {
    sources.push(zh ? '申请人提供的信用报告' : 'Credit report the applicant provided')
    items.push({ kind: 'credit', ref: 'credit:score', label: zh ? '信用报告' : 'Credit report', detail: [`${zh ? '分数' : 'score'} ${cr.score}`, str(cr.bureau), str(cr.report_date)].filter(Boolean).join(' · '), unverified: false })
  }

  // ── applicant-authorised verification steps ──
  const ver = row.verification as { id?: { status?: string; provider?: string; sandbox?: boolean }; bank?: { status?: string; provider?: string; sandbox?: boolean }; credit?: { status?: string; provider?: string; sandbox?: boolean } } | null
  const stepLabel: Record<string, { zh: string; en: string }> = { id: { zh: '身份核验', en: 'Identity verification' }, bank: { zh: '银行直连', en: 'Bank connection' }, credit: { zh: '征信直拉', en: 'Credit pull' } }
  for (const k of ['id', 'bank', 'credit'] as const) {
    const s = ver?.[k]
    if (!s || !s.status) continue
    if (s.provider) sources.push(s.provider)
    items.push({ kind: 'verification', ref: `verification:${k}`, label: stepLabel[k][input.lang], detail: `${s.status}${s.provider ? ` · ${s.provider}` : ''}${s.sandbox ? (zh ? ' · 沙箱（不计分）' : ' · sandbox (not scored)') : ''}`, unverified: s.status !== 'verified' })
  }

  const documents = (Array.isArray(row.files) ? (row.files as Array<{ kind?: string; name?: string; path?: string }>) : [])
    .map((f) => ({ kind: str(f.kind) ?? 'other', name: str(f.name) ?? (str(f.path)?.split('/').pop() ?? 'file') }))

  return {
    screening_id: row.id,
    created_at: row.created_at,
    landlord_name: row.landlord?.full_name ?? null,
    property: propertyOf(row, app),
    tier_label: tierLabel(row.v3_tier, input.lang),
    ai_score: typeof row.ai_score === 'number' ? row.ai_score : null,
    summary: summaryFor(row, zh) || null,
    items,
    sources: Array.from(new Set(sources)),
    documents,
    corrections: input.corrections.filter((c) => c.screening_id === row.id),
    notice_confirmed_how: row.notice_confirmed_how ?? null,
  }
}

export function buildDisclosurePack(input: BuildPackInput): DisclosurePack {
  const matched = new Set(input.request.matched_screening_ids ?? [])
  // Rule 1: never widen the match — a row the route did not match is not in the pack even if it was handed in.
  const rows = input.screenings.filter((s) => matched.has(s.id))
  const alert = input.alerts.find((a) => !a.revoked_at && new Date(a.expires_at).getTime() > (input.now ?? new Date()).getTime()) ?? null
  const ids = new Set(rows.map((r) => r.id))
  return {
    version: 'consumer-file-v1',
    request_id: input.request.id,
    email: input.request.email,
    name: input.request.name ?? null,
    generated_at: (input.now ?? new Date()).toISOString(),
    lang: input.lang,
    screenings: rows.map((r) => buildScreeningSection(r, input)),
    viewers: input.viewers.slice().sort((a, b) => b.when.localeCompare(a.when)),
    recipients: input.recipients.filter((r) => ids.has(r.screening_id)),
    alert,
  }
}

/** Deterministic JSON (sorted keys) for the fingerprint — same shape as lib/export/evidencePack.ts canonicalJson. */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`
  if (v && typeof v === 'object') return `{${Object.keys(v as Record<string, unknown>).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson((v as Record<string, unknown>)[k])}`).join(',')}}`
  return JSON.stringify(v === undefined ? null : v)
}

export async function packFingerprint(pack: DisclosurePack): Promise<string> {
  const { fingerprint: _omit, ...rest } = pack
  void _omit
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson(rest)))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}
