// Applicant pack → printable HTML (V1.0 阶段 4 · 乙 #7, G14).
//
// Pure function: no DOM, no Supabase. The page hands it the applicant's own
// profile rows, the Stayloop-confirmed tenancies (computed by
// lib/profile/history.ts) and the file list, and gets back one HTML document
// that renders as an A4 sheet on screen and prints as the same sheet
// (the lib/generateReport.ts convention). Every user string goes through
// esc(); files are listed by name + SHA-256 + upload date + freshness only —
// the documents themselves are never embedded.
import { PROFILE_FILE_KINDS, type ApplicantProfile, type ProfileFile, type ProfileFileKind, type ProfileHistoryEntry, type StayloopHistoryEntry } from '@/lib/profile/types'
import { APPLICANT_PROFILE_CONSENT_VERSION } from '@/lib/profile/consent'
import { freshness } from '@/lib/profile/freshness'

export type PackLang = 'zh' | 'en'

/** One Stayloop-confirmed tenancy (lib/profile/history.ts) — counts only, never amounts. */
export type StayloopSegment = Pick<StayloopHistoryEntry, 'address' | 'unit' | 'city' | 'start' | 'end' | 'onTime' | 'lateOver7' | 'total'> & { landlordName?: string }

/** Which self-declared items have a third-party verification behind them (applicant-authorised steps only). */
export type PackVerified = {
  identity?: boolean
  income?: boolean
}

export type RenderPackInput = {
  profile: Partial<ApplicantProfile> | null
  history: ProfileHistoryEntry[]
  stayloopHistory: StayloopSegment[]
  files: ProfileFile[]
  lang: PackLang
  /** Who the pack is being shown to (printed on the sheet when given). */
  presentedTo?: string | null
  verified?: PackVerified
  /** Injected for deterministic tests; defaults to now. */
  now?: Date
}

export function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Kind labels, from the one list in lib/profile/types.ts. */
export const FILE_KIND_LABEL: Record<ProfileFileKind, { zh: string; en: string }> = Object.fromEntries(
  PROFILE_FILE_KINDS.map((k) => [k.kind, k.label]),
) as Record<ProfileFileKind, { zh: string; en: string }>

export const EMPLOYMENT_STATUS_LABEL: Record<string, { zh: string; en: string }> = {
  employed: { zh: '受雇', en: 'Employed' },
  self_employed: { zh: '自雇', en: 'Self-employed' },
  student: { zh: '学生', en: 'Student' },
  retired: { zh: '退休', en: 'Retired' },
  unemployed: { zh: '待业', en: 'Not currently employed' },
  other: { zh: '其他', en: 'Other' },
}

function fmtDate(iso: string | null | undefined, lang: PackLang): string {
  if (!iso) return '—'
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso)
  if (Number.isNaN(d.getTime())) return esc(iso)
  return d.toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-CA', { year: 'numeric', month: 'short', day: 'numeric' })
}

function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  return `$${Math.round(n).toLocaleString('en-CA')}`
}

/** Which of the four self-declared sections has anything filled in (drives the completeness strip and the suggestions). */
export function sectionCompleteness(p: Partial<ApplicantProfile> | null | undefined, history: ProfileHistoryEntry[], stayloop: StayloopSegment[]) {
  const has = (v: unknown) => (typeof v === 'string' ? v.trim().length > 0 : typeof v === 'number')
  return {
    identity: !!p && has(p.first_name) && has(p.last_name) && has(p.phone) && has(p.current_address),
    employment: !!p && (has(p.employment_status) || has(p.employer_name)) && has(p.monthly_income),
    history: history.length > 0 || stayloop.length > 0,
    other: !!p && typeof p.num_occupants === 'number',
  }
}

/** 「按时付租 N 期 · 迟付 M 期」— statuses only, never amounts. */
export function stayloopRentLine(s: Pick<StayloopSegment, 'onTime' | 'lateOver7' | 'total'>, lang: PackLang): string {
  const zh = lang === 'zh'
  if (!s.total) return zh ? '还没有租金记录' : 'no rent records yet'
  const late = s.lateOver7 ? (zh ? ` · 迟付超过 7 天 ${s.lateOver7} 期` : ` · ${s.lateOver7} paid more than 7 days late`) : ''
  return zh ? `${s.total} 期已记录 · 按时 ${s.onTime} 期${late}` : `${s.total} period(s) recorded · ${s.onTime} on time${late}`
}

/** The applicant's display name — first + last, or a neutral placeholder. */
export function packDisplayName(profile: Partial<ApplicantProfile> | null | undefined, lang: PackLang): string {
  const name = [profile?.first_name, profile?.last_name].filter((x) => typeof x === 'string' && x.trim()).join(' ').trim()
  return name || (lang === 'zh' ? '（未填写姓名）' : '(name not provided)')
}

export function renderApplicantPack(input: RenderPackInput): string {
  const { lang, files, history, stayloopHistory } = input
  const zh = lang === 'zh'
  const p = input.profile ?? {}
  const now = input.now ?? new Date()
  const name = packDisplayName(p, lang)
  const verified = input.verified ?? {}
  const consentVersion = (typeof p.consent_version === 'string' && p.consent_version) || APPLICANT_PROFILE_CONSENT_VERSION
  const consentAt = typeof p.consent_at === 'string' ? p.consent_at : null

  const tagSelf = `<span class="tag self">${zh ? '自述' : 'Self-declared'}</span>`
  const tagVerified = `<span class="tag ok">${zh ? '已核验' : 'Verified'}</span>`
  const row = (k: string, v: string, tag = tagSelf) => `<div class="kv"><span class="k">${k}</span><span class="v">${v || '—'}</span>${tag}</div>`

  // ── Identity ──
  const identity = [
    row(zh ? '法定姓名' : 'Legal name', esc(name), verified.identity ? tagVerified : tagSelf),
    row(zh ? '电话' : 'Phone', esc(p.phone)),
    row(zh ? '现住址' : 'Current address', esc(p.current_address)),
    row(zh ? '出生日期' : 'Date of birth', p.date_of_birth ? fmtDate(p.date_of_birth, lang) : (zh ? '（未提供 · 只用于本人同意的信用查询）' : '(not provided · used only for a credit check the applicant consents to)')),
  ].join('')

  // ── Employment & income ──
  const statusKey = typeof p.employment_status === 'string' ? p.employment_status : ''
  const statusLabel = statusKey ? (EMPLOYMENT_STATUS_LABEL[statusKey] ? (zh ? EMPLOYMENT_STATUS_LABEL[statusKey].zh : EMPLOYMENT_STATUS_LABEL[statusKey].en) : esc(statusKey)) : ''
  const employment = [
    row(zh ? '雇佣状态' : 'Employment status', statusLabel),
    row(zh ? '雇主' : 'Employer', esc(p.employer_name)),
    row(zh ? '职位' : 'Job title', esc(p.job_title)),
    row(zh ? '入职' : 'Start date', p.employment_start_date ? fmtDate(p.employment_start_date, lang) : ''),
    row(zh ? '月收入' : 'Monthly income', fmtMoney(p.monthly_income), verified.income ? tagVerified : tagSelf),
    row(zh ? '雇主联系方式' : 'Employer contact', esc([p.employer_phone, p.employer_email].filter(Boolean).join(' · '))),
  ].join('')

  // ── Rental history ──
  const stayloopRows = stayloopHistory.map((s) => {
    const period = `${fmtDate(s.start, lang)} → ${s.end ? fmtDate(s.end, lang) : (zh ? '至今' : 'present')}`
    const rent = stayloopRentLine(s, lang)
    const where = [s.address, s.unit ? (zh ? `${s.unit} 单元` : `unit ${s.unit}`) : '', s.city].filter(Boolean).map(esc).join(' · ')
    const landlord = s.landlordName ? `<div class="muted">${zh ? '房东' : 'Landlord'} ${esc(s.landlordName)}</div>` : ''
    return `<tr><td>${where || '—'}</td><td>${period}</td><td>${rent}${landlord}</td><td>${tagVerified}</td></tr>`
  }).join('')
  const selfRows = [...history]
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((h) => {
      const period = `${h.prev_move_in ? fmtDate(h.prev_move_in, lang) : '—'} → ${h.prev_move_out ? fmtDate(h.prev_move_out, lang) : (zh ? '至今' : 'present')}`
      const landlord = [h.prev_landlord_name, h.prev_landlord_phone, h.prev_landlord_email].filter(Boolean).map(esc).join(' · ')
      const extra = [h.prev_rent ? `${zh ? '月租' : 'Rent'} ${fmtMoney(h.prev_rent)}` : '', h.reason_for_leaving ? `${zh ? '搬离原因' : 'Reason for leaving'}: ${esc(h.reason_for_leaving)}` : ''].filter(Boolean).join(' · ')
      return `<tr><td>${esc(h.prev_address) || '—'}</td><td>${period}</td><td>${landlord || '—'}${extra ? `<div class="muted">${extra}</div>` : ''}</td><td>${tagSelf}</td></tr>`
    }).join('')
  const historyTable = stayloopRows || selfRows
    ? `<table><thead><tr><th>${zh ? '地址' : 'Address'}</th><th>${zh ? '期间' : 'Period'}</th><th>${zh ? '房东 / 记录' : 'Landlord / record'}</th><th>${zh ? '来源' : 'Source'}</th></tr></thead><tbody>${stayloopRows}${selfRows}</tbody></table>`
    : `<p class="muted">${zh ? '申请人没有填写租史。' : 'No rental history provided.'}</p>`

  // ── Other ──
  const other = [
    row(zh ? '同住人数' : 'Occupants', typeof p.num_occupants === 'number' ? String(p.num_occupants) : ''),
    row(zh ? '宠物' : 'Pets', p.has_pets ? `${zh ? '有' : 'Yes'}${p.pet_details ? ` · ${esc(p.pet_details)}` : ''}` : (zh ? '无' : 'No')),
    row(zh ? '吸烟' : 'Smoking', p.is_smoker ? (zh ? '是' : 'Yes') : (zh ? '否' : 'No')),
    row(zh ? '备注' : 'Notes', esc(p.additional_notes)),
  ].join('')

  // ── Files: name + fingerprint + upload date + freshness, never the file itself ──
  const fileRows = files.map((f) => {
    const label = FILE_KIND_LABEL[f.kind as ProfileFileKind] ?? FILE_KIND_LABEL.other
    const fr = freshness(f.kind as ProfileFileKind, f.as_of ?? f.uploaded_at, now)
    const fresh = fr.state === 'fresh' ? (zh ? '新' : 'Current') : fr.state === 'aging' ? (zh ? '建议更新' : 'Ageing') : (zh ? '已过期' : 'Stale')
    const freshCls = fr.state === 'fresh' ? 'ok' : fr.state === 'aging' ? 'warn' : 'bad'
    return `<tr><td>${zh ? label.zh : label.en}</td><td>${esc(f.name)}</td><td class="mono">${esc(f.sha256)}</td><td>${fmtDate(f.uploaded_at, lang)}${f.as_of ? `<div class="muted">${zh ? '文件日期' : 'As of'} ${fmtDate(f.as_of, lang)}</div>` : ''}</td><td><span class="tag ${freshCls}">${fresh}</span></td></tr>`
  }).join('')
  const filesTable = files.length
    ? `<table><thead><tr><th>${zh ? '类型' : 'Kind'}</th><th>${zh ? '文件名' : 'File'}</th><th>SHA-256</th><th>${zh ? '上传' : 'Uploaded'}</th><th>${zh ? '新鲜度' : 'Freshness'}</th></tr></thead><tbody>${fileRows}</tbody></table>`
    : `<p class="muted">${zh ? '申请包里还没有文件。' : 'No files in the pack.'}</p>`

  const generated = now.toLocaleString(zh ? 'zh-CN' : 'en-CA', { hour12: false })
  const presented = input.presentedTo ? `<div class="kv"><span class="k">${zh ? '出示给' : 'Presented to'}</span><span class="v">${esc(input.presentedTo)}</span></div>` : ''

  return `<!DOCTYPE html><html lang="${zh ? 'zh' : 'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${zh ? '申请包' : 'Application pack'} · ${esc(name)}</title>
<style>
  @page { size: A4; margin: 18mm 16mm 16mm 16mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif; font-size: 11px; color: #1B1B3C; line-height: 1.6; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .header { background: #1B1B3C; color: #fff; padding: 18px 24px; margin: -18mm -16mm 16px -16mm; width: calc(100% + 32mm); }
  .header h1 { font-size: 20px; font-weight: 800; letter-spacing: 1px; margin-bottom: 2px; }
  .header .sub { font-size: 10px; color: #D3E3EF; }
  h2 { font-size: 13px; font-weight: 700; color: #1B1B3C; border-bottom: 1.5px solid #E4EEF6; padding-bottom: 4px; margin: 18px 0 10px 0; page-break-after: avoid; }
  .kv { display: flex; gap: 8px; align-items: baseline; margin-bottom: 4px; }
  .kv .k { font-weight: 600; color: #6E6E8A; min-width: 110px; flex-shrink: 0; }
  .kv .v { color: #1B1B3C; flex: 1; min-width: 0; overflow-wrap: anywhere; }
  .tag { display: inline-block; padding: 1px 7px; border-radius: 999px; font-size: 9px; font-weight: 700; white-space: nowrap; }
  .tag.self { background: #EEF5FA; color: #4A4A6A; }
  .tag.ok { background: #E6F6EC; color: #047857; }
  .tag.warn { background: #FEF3C7; color: #92400E; }
  .tag.bad { background: #FEE2E2; color: #B91C1C; }
  table { width: 100%; border-collapse: collapse; margin: 6px 0 12px 0; font-size: 10px; }
  th { background: #1B1B3C; color: #fff; font-weight: 600; text-align: left; padding: 5px 8px; }
  td { padding: 5px 8px; border: 1px solid #E4EEF6; vertical-align: top; overflow-wrap: anywhere; }
  tr:nth-child(even) td { background: #F3F8FC; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 8.5px; }
  .muted { color: #6E6E8A; font-size: 9.5px; }
  .note { border: 1px solid #E4EEF6; border-radius: 8px; padding: 10px 12px; margin-top: 10px; background: #F3F8FC; }
  .footer { text-align: center; font-size: 8.5px; color: #6E6E8A; margin-top: 22px; padding-top: 10px; border-top: 1px solid #E4EEF6; }
  @media screen {
    html { background: #E2E8F0; }
    body { padding: 20px 12px 48px 12px; }
    .toolbar { width: 210mm; max-width: 100%; margin: 0 auto 12px auto; display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 12px; color: #475569; }
    .toolbar button { font: inherit; font-weight: 700; color: #fff; background: #1B1B3C; border: 0; border-radius: 999px; padding: 8px 18px; cursor: pointer; }
    .sheet { width: 210mm; max-width: 100%; margin: 0 auto; background: #fff; padding: 18mm 16mm 16mm 16mm; box-shadow: 0 2px 24px rgba(15, 23, 42, 0.18); overflow: hidden; }
  }
  @media print {
    .no-print { display: none !important; }
    body { padding: 0; }
    .sheet { width: auto; max-width: none; margin: 0; padding: 0; box-shadow: none; overflow: visible; }
  }
</style></head><body>
<div class="toolbar no-print">
  <span>${zh ? '预览与打印后的 PDF 版式一致 · 在打印对话框里选「另存为 PDF」' : 'This preview matches the printed PDF · choose "Save as PDF" in the print dialog'}</span>
  <button type="button" onclick="window.print()">${zh ? '打印 / 保存为 PDF' : 'Print / Save as PDF'}</button>
</div>
<div class="sheet">
<div class="header">
  <h1>${zh ? '申请包' : 'APPLICATION PACK'} · ${esc(name)}</h1>
  <div class="sub">${zh ? '由申请人本人准备' : 'Prepared by the applicant'} &nbsp;|&nbsp; ${zh ? '生成时间' : 'Generated'} ${esc(generated)} &nbsp;|&nbsp; stayloop.ai</div>
</div>
<div class="kv"><span class="k">${zh ? '同意版本' : 'Consent version'}</span><span class="v">${esc(consentVersion)}${consentAt ? ` · ${fmtDate(consentAt, lang)}` : ''}</span></div>
${presented}
<p class="muted">${zh ? '「自述」= 申请人自己填写；「已核验」= 来自申请人本人授权的第三方核验，或 Stayloop 内双方都确认过的租约。' : '"Self-declared" = filled in by the applicant; "Verified" = from a third-party check the applicant authorised, or a tenancy both sides confirmed on Stayloop.'}</p>

<h2>${zh ? '① 身份' : '① Identity'}</h2>
${identity}

<h2>${zh ? '② 雇佣与收入' : '② Employment & income'}</h2>
${employment}

<h2>${zh ? '③ 租史' : '③ Rental history'}</h2>
${historyTable}

<h2>${zh ? '④ 其他' : '④ Other'}</h2>
${other}

<h2>${zh ? '⑤ 文件清单' : '⑤ Files'}</h2>
<p class="muted">${zh ? '只列文件名与指纹（SHA-256），文件本身由申请人另行提供；指纹相同即同一份文件。' : 'Names and fingerprints (SHA-256) only; the documents themselves are provided by the applicant separately. Same fingerprint = same file.'}</p>
${filesTable}

<div class="note">${zh ? '本申请包由申请人本人准备并出示；Stayloop 未替任何一方查询任何记录。' : 'This application pack was prepared and presented by the applicant; Stayloop did not look up any record on anyone’s behalf.'}</div>
<div class="footer">Stayloop · ${zh ? '申请包' : 'Application pack'} · ${esc(consentVersion)}</div>
</div>
</body></html>`
}
