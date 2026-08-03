/**
 * Client-side PDF report generation for Stayloop screening results.
 *
 * Strategy: build a styled HTML document and open it in a new window
 * with window.print(). The browser's built-in PDF engine handles CJK
 * fonts natively — no need to embed a 20MB font file.
 */

import type { OntarioPortalMatch, CanLIIMatch, CourtQuery, AiFlag, ScoreResult } from './screening-types'
import { scoreColor, sevColor, SCORE_BANDS } from './screening-types'

// ─── Helpers ──────────────────────────────────────────────────────
const DIMS = [
  { id: 'ability_to_pay', zhLabel: '付款能力', enLabel: 'Ability to Pay', weight: 0.40 },
  { id: 'credit_health', zhLabel: '信用健康度', enLabel: 'Credit & Debt Health', weight: 0.25 },
  { id: 'rental_history', zhLabel: '租务与司法历史', enLabel: 'Rental & Legal History', weight: 0.20 },
  { id: 'verification', zhLabel: '身份与雇主核实', enLabel: 'Identity & Employer', weight: 0.10 },
  { id: 'communication', zhLabel: '申请完整度与沟通', enLabel: 'Application Quality', weight: 0.05 },
]

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ─── Forensic check matrix (shared with /screening/[id]/report) ───
// Groups the 65+ deterministic flag codes the forensics engine can emit into
// human-readable check categories, and derives a per-category status from the
// flags that actually fired. Categories that ran but produced NO flags are the
// differentiator vs competitors' one-line "fraud check" — we can show the
// landlord every test that was executed and passed.

export interface ForensicCheckRow {
  id: string
  zh: string
  en: string
  /** what the check does, one line */
  desc_zh: string
  desc_en: string
  status: 'pass' | 'warn' | 'fail' | 'na'
  /** count of non-info (negative) flags in this category */
  findings: number
  /** count of info (authenticity-positive) flags in this category */
  positives: number
}

type FlagLite = { code: string; severity: string }
type PerFileLite = NonNullable<ScoreResult['forensics_detail']>['per_file'][number]

/** Authenticity-POSITIVE corroboration: 'info' severity flags, plus codes that
 *  carry a non-info severity for pipeline reasons but semantically document
 *  evidence FOR the applicant (e.g. AI-verified-authentic credit report is
 *  'low' so it sorts as informational, not because it's a risk signal). */
const POSITIVE_FLAG_CODES = new Set(['credit_report_ai_verified'])
export function isPositiveForensicFlag(f: { code: string; severity: string }): boolean {
  return f.severity === 'info' || POSITIVE_FLAG_CODES.has(f.code)
}

const CHECK_CATEGORIES: Array<{
  id: string
  zh: string
  en: string
  desc_zh: string
  desc_en: string
  match: (code: string) => boolean
}> = [
  {
    id: 'pdf_structure', zh: 'PDF 内部结构指纹', en: 'PDF internal structure fingerprint',
    desc_zh: '扫描原始字节:pdf-lib 等伪造工具标记、%%EOF 增量修改、字体族混用',
    desc_en: 'Raw-byte scan: forgery-tool markers (pdf-lib), incremental-update %%EOF count, mixed font families',
    match: c => c.startsWith('pdf_structure_') || ['pdf_excessive_fonts', 'pdf_mixed_font_families', 'pdf_pdflib_font_signature'].includes(c),
  },
  {
    id: 'text_density', zh: '文字密度 / 图片型 PDF 检测', en: 'Text density / image-only PDF detection',
    desc_zh: '每页字符数分析——识别截图转存或扫描件',
    desc_en: 'Chars-per-page analysis — detects screenshot-to-PDF or scanned documents',
    match: c => c === 'pdf_pure_image' || c === 'pdf_low_text_density',
  },
  {
    id: 'pdf_metadata', zh: 'PDF 元数据检查', en: 'PDF metadata inspection',
    desc_zh: '生成工具(Producer/Creator)、内嵌标题、创建/修改时间戳',
    desc_en: 'Producer/Creator tool, embedded title, creation & modification timestamps',
    match: c => c.startsWith('pdf_') || c === 'timestamp_just_created',
  },
  {
    id: 'benford', zh: 'Benford 数字分布分析', en: "Benford's Law digit analysis",
    desc_zh: '对财务文件金额做首位数字 χ² 检验 + 尾数过整检测',
    desc_en: 'Leading-digit chi-squared test + round-trailing-digit anomaly on financial amounts',
    match: c => c.startsWith('benford') || c.startsWith('trailing_digits') || c === 'deposits_too_clean',
  },
  {
    id: 'statutory', zh: 'CRA 法定扣缴复算', en: 'CRA statutory deduction recomputation',
    desc_zh: '按当年 CRA 参数复算 CPP/CPP2/EI:超过法定上限=数学上不可能',
    desc_en: 'CPP/CPP2/EI recomputed against CRA annual parameters — exceeding the legal max is mathematically impossible',
    match: c => c.startsWith('paystub_deduction') || c === 'paystub_deductions_at_legal_max' || c === 'paystub_period_deductions_verified',
  },
  {
    id: 'paystub_math', zh: '工资单数学一致性', en: 'Pay-stub math consistency',
    desc_zh: 'YTD 累计 vs 年薪推算、时薪×工时 vs 期间总额、发薪节奏',
    desc_en: 'YTD vs pro-rata expectation, hourly×hours vs stated gross, payroll pre-generation rhythm',
    match: c => c.startsWith('paystub_'),
  },
  {
    id: 'source_fingerprint', zh: '来源指纹(银行 / 征信局)', en: 'Source fingerprint (bank / bureau)',
    desc_zh: '银行流水 Producer 白名单、Equifax/TransUnion 真伪标记 + AI 视觉复核',
    desc_en: 'Bank-producer whitelist, Equifax/TransUnion authenticity markers + AI Vision second opinion',
    match: c => c.startsWith('bank_') || c.startsWith('credit_report_'),
  },
  {
    id: 'id_validation', zh: '证件号码校验', en: 'ID number validation',
    desc_zh: 'SIN Luhn 校验和、安省驾照姓氏字母、OHIP 格式、证件与申请人姓名/生日比对',
    desc_en: 'SIN Luhn checksum, Ontario DL surname letter, OHIP format, name/DOB match vs applicant',
    match: c => c.startsWith('id_'),
  },
  {
    id: 'cross_doc', zh: '跨文档交叉核对', en: 'Cross-document consistency',
    desc_zh: '电话/邮箱/地址/雇主跨文件比对、HR 电话与申请人电话撞号、收入三方对账',
    desc_en: 'Phones/emails/addresses/employers compared across files, HR-phone collision, 3-way income reconciliation',
    match: c => c.startsWith('cross_doc_') || c === 'name_spelling_variation',
  },
  {
    id: 'timestamp_cluster', zh: '时间戳聚类(批量伪造)', en: 'Timestamp clustering (batch forgery)',
    desc_zh: '多份"不同时期"文件若在几分钟内批量生成=独立定罪信号',
    desc_en: 'Multiple "different-period" documents created within minutes of each other = independent forgery signal',
    match: c => c === 'timestamp_batch_creation',
  },
  {
    id: 'ocr', zh: 'AI 视觉 OCR', en: 'AI Vision OCR',
    desc_zh: '对图片型文件做视觉识别:证件类型、签发机构、防伪水印',
    desc_en: 'Vision pass on image-only documents: document type, issuer, anti-tamper watermarks',
    match: () => false,
  },
  {
    id: 'arm_length', zh: '雇主独立性核查', en: "Employer arm's-length check",
    desc_zh: '数字公司模式、姓氏与雇主重合、公司注册库比对(深度核查)',
    desc_en: 'Numbered-company pattern, surname-in-employer, corporate-registry cross-check (deep check)',
    match: c => c.startsWith('arm_length_') || c.startsWith('bn_'),
  },
]

export function buildForensicCheckMatrix(
  fd: ScoreResult['forensics_detail'],
  deepCheck?: ScoreResult['deep_check_result'],
): ForensicCheckRow[] {
  if (!fd) return []
  const perFile: PerFileLite[] = fd.per_file || []
  const allFlags: FlagLite[] = (fd.all_flags || []) as FlagLite[]

  const ranByCat: Record<string, boolean> = {
    pdf_structure: perFile.some(pf => !!(pf as { pdf_structure?: unknown }).pdf_structure),
    text_density: perFile.some(pf => !!pf.text_density),
    pdf_metadata: perFile.some(pf => !!pf.pdf_metadata),
    benford: perFile.some(pf => !!(pf as { benford?: unknown }).benford),
    statutory: perFile.some(pf => !!pf.paystub_math),
    paystub_math: perFile.some(pf => !!pf.paystub_math),
    source_fingerprint: perFile.some(pf => !!pf.source_specific),
    id_validation: perFile.some(pf => !!(pf.ocr?.text || pf.text_density?.text_sample)),
    cross_doc: !!fd.cross_doc || (fd.cross_doc_flags?.length ?? 0) > 0,
    timestamp_cluster: perFile.filter(pf => !!pf.pdf_metadata?.creation_date).length >= 2,
    ocr: perFile.some(pf => !!pf.ocr),
    arm_length: !!(deepCheck && deepCheck.checks?.length),
  }

  // Assign each flag to its FIRST matching category (order above encodes
  // specificity: pdf_structure_ before the generic pdf_ prefix, statutory
  // deduction codes before the generic paystub_ prefix).
  const flagsByCat: Record<string, FlagLite[]> = {}
  for (const f of allFlags) {
    const cat = CHECK_CATEGORIES.find(c => c.match(f.code))
    if (!cat) continue
    ;(flagsByCat[cat.id] = flagsByCat[cat.id] || []).push(f)
    // A category with fired flags definitionally ran (covers the cheap
    // arm's-length pass which has no dedicated result object).
    ranByCat[cat.id] = true
  }

  return CHECK_CATEGORIES.map(cat => {
    const flags = flagsByCat[cat.id] || []
    const negatives = flags.filter(f => !isPositiveForensicFlag(f))
    const positives = flags.length - negatives.length
    let status: ForensicCheckRow['status']
    if (!ranByCat[cat.id]) status = 'na'
    else if (negatives.some(f => f.severity === 'critical' || f.severity === 'high')) status = 'fail'
    else if (negatives.length > 0) status = 'warn'
    else status = 'pass'
    return {
      id: cat.id, zh: cat.zh, en: cat.en, desc_zh: cat.desc_zh, desc_en: cat.desc_en,
      status, findings: negatives.length, positives,
    }
  })
}

function riskLabel(score: number, zh: boolean): { text: string; color: string; bg: string } {
  if (score >= 85) return { text: zh ? 'APPROVE — 优质' : 'APPROVE — Safe', color: '#16A34A', bg: '#F0FDF4' }
  if (score >= 70) return { text: zh ? 'APPROVE — 较安全' : 'APPROVE — Mostly Safe', color: '#65A30D', bg: '#F7FEE7' }
  if (score >= 50) return { text: zh ? 'CAUTION — 需审查' : 'CAUTION — Review', color: '#A16207', bg: '#FEFCE8' }
  if (score >= 30) return { text: zh ? 'CAUTION — 有风险' : 'CAUTION — Risky', color: '#C2410C', bg: '#FFF7ED' }
  return { text: zh ? 'REJECT — 高危' : 'REJECT — High Risk', color: '#DC2626', bg: '#FEF2F2' }
}

// ─── Main ─────────────────────────────────────────────────────────
export async function generateScreeningReport(
  result: ScoreResult,
  lang: 'en' | 'zh',
  filesCount: number,
  opts?: { requestedBy?: string },
): Promise<void> {
  const zh = lang === 'zh'
  const risk = riskLabel(result.overall, zh)
  const date = new Date().toLocaleDateString('en-CA')
  const courtQueries = result.court_records_detail?.queries || []
  const totalHits = result.court_records_detail?.total_hits || 0
  const queriedName = result.court_records_detail?.queried_name || '—'
  const dbCount = courtQueries.filter(q => q.status === 'ok').length

  // ── Build HTML sections ──
  let html = `<!DOCTYPE html><html lang="${zh ? 'zh' : 'en'}"><head><meta charset="utf-8">
<title>Stayloop ${zh ? '租户筛选报告' : 'Screening Report'} — ${esc(result.extracted_name || '')}</title>
<style>
  @page { size: A4; margin: 18mm 16mm 16mm 16mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif; font-size: 11px; color: #1E293B; line-height: 1.6; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .header { background: #0B1736; color: #fff; padding: 18px 24px; margin: -18mm -16mm 16px -16mm; width: calc(100% + 32mm); }
  .header h1 { font-size: 20px; font-weight: 800; letter-spacing: 2px; margin-bottom: 2px; }
  .header .sub { font-size: 10px; color: #CBD5E1; }
  h2 { font-size: 13px; font-weight: 700; color: #0B1736; border-bottom: 1.5px solid #E2E8F0; padding-bottom: 4px; margin: 18px 0 10px 0; page-break-after: avoid; }
  .score-box { text-align: center; padding: 20px; border: 2px solid ${risk.color}20; border-radius: 12px; background: ${risk.bg}; margin-bottom: 16px; }
  .score-num { font-size: 48px; font-weight: 800; color: ${risk.color}; }
  .score-sub { font-size: 10px; color: #64748B; }
  .risk-pill { display: inline-block; padding: 4px 16px; border-radius: 16px; font-weight: 700; font-size: 12px; color: ${risk.color}; background: ${risk.color}18; margin-top: 6px; }
  .stats { display: flex; gap: 24px; justify-content: center; margin-top: 14px; text-align: center; font-size: 10px; color: #64748B; }
  .stats .val { font-size: 16px; font-weight: 700; color: #334155; }
  table { width: 100%; border-collapse: collapse; margin: 6px 0 12px 0; font-size: 10px; }
  th { background: #0B1736; color: #fff; font-weight: 600; text-align: left; padding: 5px 8px; }
  td { padding: 5px 8px; border: 1px solid #E2E8F0; vertical-align: top; }
  tr:nth-child(even) td { background: #F8FAFC; }
  .kv { display: flex; gap: 6px; margin-bottom: 3px; }
  .kv .k { font-weight: 600; color: #64748B; min-width: 100px; flex-shrink: 0; }
  .kv .v { color: #334155; }
  .flag-badge { display: inline-block; padding: 1px 7px; border-radius: 3px; font-size: 9px; font-weight: 700; color: #fff; margin-right: 4px; }
  .card { border: 1px solid #E2E8F0; border-radius: 8px; padding: 12px; margin-bottom: 10px; page-break-inside: avoid; }
  .footer { text-align: center; font-size: 8px; color: #94A3B8; margin-top: 20px; padding-top: 10px; border-top: 1px solid #E2E8F0; }
  @media print { .no-print { display: none !important; } }
</style></head><body>`

  // ── Header ──
  html += `<div class="header">
    <h1>STAYLOOP</h1>
    <div class="sub">${zh ? '租户筛选评估报告' : 'Tenant Screening Report'} &nbsp;|&nbsp; ${date} &nbsp;|&nbsp; stayloop.ai</div>
  </div>`

  // ── 0. Report Meta + Applicant Information (FrontLobby-style block) ──
  // `court_records_detail.databases_searched` is deliberately NOT read
  // anywhere anymore. On legacy reports it holds the CanLII fan-out count
  // (~78), and every one of those "searches" hit an endpoint that ignores the
  // name parameter — printing "78 sources searched" from it asserts diligence
  // that never happened. Only rows with status==='ok' (dbCount) are counted.
  html += `<div style="border:1px solid #E2E8F0;border-radius:8px;padding:10px 14px;margin-bottom:10px;font-size:10px;color:#475569">
    <div>${zh ? '报告生成日期' : 'Report generated'}: <strong>${date}</strong>
    ${result.screening_id ? ` &nbsp;·&nbsp; ${zh ? '报告编号' : 'Report ID'}: <strong style="font-family:monospace">${esc(result.screening_id)}</strong>` : ''}
    ${opts?.requestedBy ? ` &nbsp;·&nbsp; ${zh ? '申请方' : 'Requested by'}: <strong>${esc(opts.requestedBy)}</strong>` : ''}
    &nbsp;·&nbsp; ${zh ? '分析引擎' : 'Engine'}: <strong>Stayloop AI ${esc(result.model_version || 'v3')}</strong></div>
    <div style="margin-top:4px;color:#64748B">${zh ? '数据来源' : 'Data sources'}: ${[
      zh ? '确定性文件取证引擎（PDF 元数据 · 结构指纹 · 数学复算 · 跨文档核对）' : 'Deterministic document forensics engine (PDF metadata · structure fingerprints · math recomputation · cross-doc checks)',
      zh ? 'AI 视觉内容分析' : 'AI vision content analysis',
      // CanLII is deliberately NOT in this list. Its API cannot search by name,
      // so it is never a source this report draws on — the court table below
      // discloses it as a manual step with a pre-filled link instead. Listing
      // it here would claim a search that never ran.
      zh ? 'LTB 判令目录（安省开放数据）' : 'LTB Order Catalogue (Ontario Open Data)',
      zh ? '安省法院公开门户' : 'Ontario Courts public portal',
      ...(result.deep_check_result?.checks?.length ? [zh ? '加拿大公司注册库' : 'Canadian corporate registries'] : []),
    ].join(' · ')}</div>
  </div>
  <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:12px 14px;margin-bottom:14px">
    <div style="font-size:11px;font-weight:700;color:#0B1736;margin-bottom:6px">${zh ? '申请人信息' : 'Applicant Information'}</div>
    <div class="kv"><span class="k">${zh ? '申请人姓名' : 'Name'}:</span><span class="v" style="font-weight:700">${esc(result.extracted_name || '—')}</span>${result.name_was_extracted ? `<span style="font-size:9px;color:#94A3B8;margin-left:6px">${zh ? '(AI 从文件提取)' : '(AI-extracted from documents)'}</span>` : ''}</div>
    <div class="kv"><span class="k">${zh ? '法院查询姓名' : 'Court search name'}:</span><span class="v">${esc(queriedName)}</span></div>
    <div class="kv"><span class="k">${zh ? '目标月租金' : 'Target rent'}:</span><span class="v">${result.monthly_rent ? '$' + result.monthly_rent.toLocaleString() + ' CAD' : '—'}</span></div>
    <div class="kv"><span class="k">${zh ? '提交文件' : 'Documents'}:</span><span class="v">${filesCount} ${zh ? '份' : 'file(s)'}${(result.detected_document_kinds || []).length ? ' — ' + esc((result.detected_document_kinds || []).join(', ')) : ''}</span></div>`

  // Full extracted entities — ALL distinct names/phones/emails/addresses/
  // employers from forensics cross-doc extraction (multi-applicant households
  // surface every earner). De-duped, real data only.
  {
    const ents = result.forensics_detail?.cross_doc?.entities
    const allVals = (arr?: Array<{ value: string } | string>): string[] => {
      if (!Array.isArray(arr)) return []
      const seen = new Set<string>(); const out: string[] = []
      for (const it of arr) {
        const v = (typeof it === 'string' ? it : it?.value || '').trim()
        if (v && !seen.has(v.toLowerCase())) { seen.add(v.toLowerCase()); out.push(v) }
      }
      return out.slice(0, 6)
    }
    const nm = allVals(ents?.names), ph = allVals(ents?.phones), em = allVals(ents?.emails), ad = allVals(ents?.addresses), ep = allVals(ents?.employers)
    if (nm.length || ph.length || em.length || ad.length || ep.length) {
      const row = (label: string, vals: string[]) => vals.length
        ? `<div class="kv"><span class="k">${label}:</span><span class="v">${vals.map(v => esc(v)).join('&nbsp;·&nbsp; ')}</span></div>` : ''
      html += `<div style="margin-top:8px;padding-top:8px;border-top:1px dashed #E2E8F0">
        <div style="font-size:10px;font-weight:600;color:#64748B;margin-bottom:4px">${zh ? '从文件中提取的联系/身份/雇主信息' : 'Contact / identity / employer details extracted from documents'}</div>`
      html += row(zh ? '检测到的姓名' : 'Names detected', nm)
      html += row(zh ? '雇主' : 'Employer(s)', ep)
      html += row(zh ? '地址' : 'Address(es)', ad)
      html += row(zh ? '电话' : 'Phone(s)', ph)
      html += row(zh ? '邮箱' : 'Email(s)', em)
      html += `</div>`
    }
  }
  html += `</div>`

  // ── 1. Overall Score + visual band strip ──
  html += `<div class="score-box">
    <div style="font-size:12px;color:#64748B;margin-bottom:4px">${zh ? '综合风险评估' : 'Overall Risk Assessment'}</div>
    <div style="font-size:16px;font-weight:700;color:#0B1736;margin-bottom:8px">${esc(result.extracted_name || '—')}</div>
    <div class="score-num">${result.overall}</div>
    <div class="score-sub">/ 100</div>
    <div class="risk-pill">${esc(risk.text)}</div>`

  // Visual score band strip — shows where this applicant falls on the scale
  html += `<table style="margin:14px auto 0;max-width:430px;border:none">
    <tr>${SCORE_BANDS.map(b => {
      const inBand = result.overall >= b.min && result.overall <= b.max
      return `<td style="border:none;padding:0 1px;width:20%">
        <div style="height:8px;border-radius:3px;background:${b.color}${inBand ? '' : '30'};position:relative">${inBand ? `<div style="position:absolute;top:-5px;left:${Math.round(((result.overall - b.min) / Math.max(1, b.max - b.min)) * 100)}%;width:2px;height:18px;background:#0B1736"></div>` : ''}</div>
        <div style="font-size:8px;text-align:center;margin-top:3px;color:${inBand ? b.color : '#94A3B8'};font-weight:${inBand ? 700 : 400}">${zh ? b.zh : b.en}<br>${b.min}–${b.max}</div>
      </td>`
    }).join('')}</tr>
  </table>`

  if (result.v3_tier) {
    const tierMap: Record<string, string> = zh
      ? { approve: '建议通过', conditional: '附加条件', decline: '建议拒绝' }
      : { approve: 'Approve', conditional: 'Conditional', decline: 'Decline' }
    html += `<div style="margin-top:10px;font-size:11px;color:#64748B">${zh ? '决策建议' : 'Decision'}: <strong>${tierMap[result.v3_tier] || result.v3_tier}</strong>`
    if (result.hard_gates_triggered && result.hard_gates_triggered.length > 0) {
      html += ` &nbsp;·&nbsp; ${zh ? '触发硬门槛' : 'Hard gate'}: ${esc(result.hard_gates_triggered.join(', '))}`
    }
    html += `</div>`
    if (result.tier_reason) {
      html += `<div style="margin-top:4px;font-size:10px;color:#64748B;font-style:italic">${esc(result.tier_reason)}</div>`
    }
  }
  if (typeof result.evidence_coverage === 'number') {
    const cov = result.evidence_coverage
    const covColor = cov >= 0.75 ? '#16A34A' : cov >= 0.6 ? '#A16207' : '#C2410C'
    html += `<div style="margin-top:6px;font-size:10px;color:#64748B">${zh ? '证据充足度' : 'Evidence Coverage'}: <span style="color:${covColor};font-weight:700">${(cov * 100).toFixed(0)}%</span></div>`
  }

  // Stats
  const rentNum = result.monthly_rent ?? 0
  const ratio = result.income_rent_ratio
  html += `<div class="stats">
    <div><div class="val">$${rentNum ? rentNum.toLocaleString() : '—'}</div>${zh ? '目标月租金' : 'Monthly Rent'}</div>
    <div><div class="val">${ratio != null ? ratio.toFixed(1) + 'x' : 'N/A'}</div>${zh ? '收入/租金比' : 'Income Ratio'}</div>
    <div><div class="val">${filesCount}</div>${zh ? '文件已分析' : 'Files Analyzed'}</div>
    <div><div class="val">${dbCount}</div>${zh ? '法庭数据源已查' : 'Court sources'}</div>
  </div>`
  html += `</div>`

  // ── 1.5 Screening Summary — quick ✓/⚠/✗ checks (SingleKey style) ──
  // Every row is derived from REAL pipeline output; rows with no underlying
  // data render as "未检测/Not assessed" rather than a fake pass.
  type Check = { label: string; status: 'pass' | 'warn' | 'fail' | 'na'; detail: string }
  const fdSev = result.forensics_detail?.severity
  const fdFlagCount = result.forensics_detail?.all_flags?.length ?? 0
  const gates = result.hard_gates_triggered || []
  const redFlagsArr = result.red_flags || []
  const idScore = typeof result.identity_match_score === 'number' ? result.identity_match_score : null
  const checks: Check[] = [
    {
      label: zh ? '文件真实性（取证）' : 'Document authenticity (forensics)',
      status: !result.forensics_detail ? 'na' : (fdSev === 'fraud' || fdSev === 'likely_fraud') ? 'fail' : fdSev === 'suspicious' ? 'warn' : 'pass',
      detail: !result.forensics_detail
        ? (zh ? '未运行' : 'Not run')
        : fdFlagCount === 0
          ? (zh ? '未发现伪造特征' : 'No forgery indicators')
          : `${fdFlagCount} ${zh ? '项发现' : 'finding(s)'}`,
    },
    {
      label: zh ? '法院 / LTB 记录' : 'Court / LTB records',
      status: dbCount === 0 ? 'na' : totalHits === 0 ? 'pass' : 'fail',
      detail: dbCount === 0
        ? (zh ? '未查询' : 'Not searched')
        : totalHits === 0
          ? (zh ? `已查 ${dbCount} 个数据源,无记录` : `${dbCount} sources searched, clear`)
          : (zh ? `${totalHits} 条记录命中` : `${totalHits} record(s) found`),
    },
    {
      label: zh ? '收入负担能力' : 'Income affordability',
      status: ratio == null ? 'na' : ratio >= 3 ? 'pass' : ratio >= 2 ? 'warn' : 'fail',
      detail: ratio == null
        ? (zh ? '收入证据不足' : 'Insufficient income evidence')
        : `${ratio.toFixed(1)}x ${zh ? '租金' : 'rent'}${result.effective_monthly_income ? ` ($${result.effective_monthly_income.toLocaleString()}/${zh ? '月' : 'mo'})` : ''}`,
    },
    {
      label: zh ? '身份一致性' : 'Identity consistency',
      status: idScore == null ? 'na' : idScore >= 70 ? 'pass' : idScore >= 50 ? 'warn' : 'fail',
      detail: idScore == null ? (zh ? '证据不足' : 'Insufficient evidence') : `${idScore}/100`,
    },
    {
      label: zh ? '硬门槛(欺诈/篡改)' : 'Hard gates (fraud / tampering)',
      status: gates.length === 0 ? 'pass' : 'fail',
      detail: gates.length === 0 ? (zh ? '未触发' : 'None triggered') : gates.join(', '),
    },
    {
      label: zh ? '风险标记' : 'Red flags',
      status: redFlagsArr.length === 0 ? 'pass' : redFlagsArr.length <= 2 ? 'warn' : 'fail',
      detail: redFlagsArr.length === 0 ? (zh ? '无' : 'None') : `${redFlagsArr.length} ${zh ? '项' : 'flag(s)'}`,
    },
  ]
  const stIcon = (s: Check['status']) => s === 'pass' ? '✓' : s === 'warn' ? '⚠' : s === 'fail' ? '✗' : '—'
  const stColor = (s: Check['status']) => s === 'pass' ? '#16A34A' : s === 'warn' ? '#D97706' : s === 'fail' ? '#DC2626' : '#94A3B8'
  const stBg = (s: Check['status']) => s === 'pass' ? '#F0FDF4' : s === 'warn' ? '#FFFBEB' : s === 'fail' ? '#FEF2F2' : '#F8FAFC'
  html += `<h2>${zh ? '筛查结果总览' : 'Screening Summary'}</h2>
  <table>
    <tr><th style="width:30px;text-align:center"></th><th>${zh ? '检查项' : 'Check'}</th><th>${zh ? '结果' : 'Result'}</th></tr>
    ${checks.map(c => `<tr>
      <td style="text-align:center;background:${stBg(c.status)};color:${stColor(c.status)};font-weight:800;font-size:12px">${stIcon(c.status)}</td>
      <td style="font-weight:600;background:${stBg(c.status)}">${esc(c.label)}</td>
      <td style="background:${stBg(c.status)};color:${stColor(c.status)};font-weight:600">${esc(c.detail)}</td>
    </tr>`).join('')}
  </table>`

  // ── 1.6 Recommendation box — synthesizes the decision prominently ──
  if (result.v3_tier) {
    const recMap: Record<string, { label: string; color: string; bg: string; border: string; icon: string }> = {
      approve: { label: zh ? '建议通过' : 'Approve', color: '#15803D', bg: '#F0FDF4', border: '#86EFAC', icon: '✓' },
      conditional: { label: zh ? '附条件通过' : 'Approve with Conditions', color: '#B45309', bg: '#FFFBEB', border: '#FCD34D', icon: '!' },
      decline: { label: zh ? '建议拒绝' : 'Decline', color: '#B91C1C', bg: '#FEF2F2', border: '#FCA5A5', icon: '✕' },
    }
    const rec = recMap[result.v3_tier] || recMap.conditional
    html += `<div style="display:flex;gap:12px;align-items:flex-start;border:1px solid ${rec.border};border-left:5px solid ${rec.color};border-radius:8px;background:${rec.bg};padding:12px 16px;margin:14px 0">
      <span style="font-size:20px;color:${rec.color};font-weight:800;line-height:1.2">${rec.icon}</span>
      <div style="flex:1">
        <div style="font-size:13px;font-weight:800;color:${rec.color}">${zh ? '建议' : 'Recommendation'}: ${rec.label}</div>
        ${result.tier_reason ? `<div style="font-size:11px;color:#475569;margin-top:3px;line-height:1.6">${esc(result.tier_reason)}</div>` : ''}
        ${result.action_items && result.action_items.length > 0 ? `<div style="font-size:10px;color:#64748B;margin-top:5px">${zh ? '完成下方"待办核实清单"中的事项可进一步降低风险。' : 'Completing the Action Items below further reduces risk.'}</div>` : ''}
      </div>
    </div>`
  }

  // ── 1.65 Red flags & hard gates — full text, top of the report ──
  // The summary table above only counts them; this lists each one verbatim so
  // the landlord sees the exact findings before reading anything else.
  if (gates.length > 0 || redFlagsArr.length > 0) {
    html += `<h2>${zh ? '硬门槛与风险标记明细' : 'Hard Gates & Red Flags'}</h2>`
    if (gates.length > 0) {
      html += `<div style="font-size:10px;font-weight:700;color:#B91C1C;margin-bottom:4px">${zh ? `硬门槛(一票否决信号) · ${gates.length}` : `Hard gates (overriding signals) · ${gates.length}`}</div>`
      for (const g of gates) {
        html += `<div class="card" style="border-left:3px solid #DC2626;padding:8px 12px;margin-bottom:6px">
          <span class="flag-badge" style="background:#DC2626">${zh ? '硬门槛' : 'GATE'}</span>
          <span style="font-size:10.5px;font-family:monospace">${esc(g)}</span>
        </div>`
      }
    }
    if (redFlagsArr.length > 0) {
      html += `<div style="font-size:10px;font-weight:700;color:#C2410C;margin:6px 0 4px">${zh ? `风险标记 · ${redFlagsArr.length}` : `Red flags · ${redFlagsArr.length}`}</div>`
      for (const rf of redFlagsArr) {
        html += `<div class="card" style="border-left:3px solid #EA580C;padding:8px 12px;margin-bottom:6px">
          <span class="flag-badge" style="background:#EA580C">${zh ? '标记' : 'FLAG'}</span>
          <span style="font-size:10.5px">${esc(rf)}</span>
        </div>`
      }
    }
    if (result.red_flag_penalty != null || result.gate_cap != null) {
      html += `<div style="font-size:9px;color:#64748B;margin-top:2px">${zh ? '评分影响' : 'Score impact'}: ${result.red_flag_penalty != null ? `${zh ? '标记扣分' : 'flag penalty'} -${result.red_flag_penalty}` : ''}${result.red_flag_penalty != null && result.gate_cap != null ? ' · ' : ''}${result.gate_cap != null ? `${zh ? '硬门槛封顶' : 'gate score cap'} ${result.gate_cap}` : ''}</div>`
    }
  }

  // ── 1.7 Document completeness matrix — what was provided vs recommended ──
  {
    const provided = new Set(result.detected_document_kinds || [])
    const recommended: Array<{ key: string; zh: string; en: string }> = [
      { key: 'id_document', zh: '身份证件', en: 'Government ID' },
      { key: 'pay_stub', zh: '工资单', en: 'Pay Stubs' },
      { key: 'employment_letter', zh: '雇佣信', en: 'Employment Letter' },
      { key: 'bank_statement', zh: '银行流水', en: 'Bank Statements' },
      { key: 'credit_report', zh: '信用报告', en: 'Credit Report' },
      { key: 'reference', zh: '推荐信 / 前房东', en: 'Reference / Prior Landlord' },
    ]
    const have = recommended.filter(r => provided.has(r.key)).length
    html += `<h2>${zh ? '文件完整度' : 'Document Completeness'}</h2>
    <div style="font-size:10px;color:#64748B;margin-bottom:6px">${zh ? `已提供 ${have} / ${recommended.length} 类推荐文件` : `${have} of ${recommended.length} recommended document types provided`}</div>
    <table><tr><th style="width:30px;text-align:center"></th><th>${zh ? '推荐文件类型' : 'Recommended document'}</th><th style="width:90px;text-align:center">${zh ? '状态' : 'Status'}</th></tr>`
    for (const r of recommended) {
      const ok = provided.has(r.key)
      html += `<tr>
        <td style="text-align:center;background:${ok ? '#F0FDF4' : '#F8FAFC'};color:${ok ? '#16A34A' : '#CBD5E1'};font-weight:800">${ok ? '✓' : '—'}</td>
        <td style="background:${ok ? '#F0FDF4' : '#F8FAFC'};font-weight:${ok ? 600 : 400};color:${ok ? '#0B1736' : '#94A3B8'}">${zh ? r.zh : r.en}</td>
        <td style="text-align:center;background:${ok ? '#F0FDF4' : '#F8FAFC'};color:${ok ? '#15803D' : '#94A3B8'};font-size:10px;font-weight:600">${ok ? (zh ? '已提供' : 'Provided') : (zh ? '未提供' : 'Missing')}</td>
      </tr>`
    }
    html += `</table>`

    // Evidence sub-coverage — HOW each scoring sub-component was evidenced:
    // measured from documents, inferred, pending landlord action, or missing.
    const subCov = result.sub_coverage || {}
    const subKeys = Object.keys(subCov)
    if (subKeys.length > 0) {
      const SUB_LABELS: Record<string, { zh: string; en: string }> = {
        income_rent_ratio: { zh: '收入/租金比', en: 'Income-to-rent ratio' },
        income_stability: { zh: '收入稳定性', en: 'Income stability' },
        emergency_reserves: { zh: '应急储备金', en: 'Emergency reserves' },
        credit_score: { zh: '信用分数', en: 'Credit score' },
        dti: { zh: '非租负债比 (DTI)', en: 'Non-rent DTI' },
        prior_landlord_refs: { zh: '前房东推荐', en: 'Prior landlord references' },
        ltb_check: { zh: 'LTB 记录核查', en: 'LTB record check' },
        employer_verify: { zh: '雇主核实', en: 'Employer verification' },
        doc_authenticity: { zh: '文件真实性', en: 'Document authenticity' },
        identity_match: { zh: '身份一致性', en: 'Identity match' },
      }
      const COV_STATUS: Record<string, { zh: string; en: string; color: string }> = {
        measured: { zh: '✓ 已从文件实测', en: '✓ Measured from documents', color: '#16A34A' },
        inferred: { zh: '◐ 间接推断', en: '◐ Inferred', color: '#A16207' },
        action_pending: { zh: '⚠ 待房东核实', en: '⚠ Pending landlord action', color: '#D97706' },
        missing: { zh: '✗ 证据缺失', en: '✗ Missing', color: '#DC2626' },
      }
      html += `<div style="font-size:11px;font-weight:700;color:#0B1736;margin:12px 0 5px">${zh ? '证据覆盖明细' : 'Evidence Coverage Detail'}${typeof result.evidence_coverage === 'number' ? ` · ${(result.evidence_coverage * 100).toFixed(0)}%` : ''}</div>
      <div style="font-size:9px;color:#64748B;margin-bottom:5px">${zh ? '每个评分子项的证据来源等级。「已实测」计满分权重,「推断」0.6,「待核实」0.3,「缺失」0。' : 'Evidence grade per scoring sub-component. Weights: measured 1.0, inferred 0.6, pending 0.3, missing 0.'}</div>
      <table><tr><th>${zh ? '评分子项' : 'Sub-component'}</th><th style="width:170px">${zh ? '证据等级' : 'Evidence grade'}</th></tr>`
      for (const k of subKeys) {
        const lbl = SUB_LABELS[k] || { zh: k, en: k }
        const st = COV_STATUS[subCov[k]] || { zh: subCov[k], en: subCov[k], color: '#64748B' }
        html += `<tr><td>${esc(zh ? lbl.zh : lbl.en)}</td><td style="color:${st.color};font-weight:600;font-size:9.5px">${zh ? st.zh : st.en}</td></tr>`
      }
      html += `</table>`
    }
  }

  // ── 2. Summary ──
  html += `<h2>${zh ? 'AI 评估摘要' : 'AI Assessment Summary'}</h2>`
  const summary = zh ? (result.summary_zh || result.summary) : (result.summary_en || result.summary)
  html += `<p style="font-size:11px;line-height:1.8;margin-bottom:12px">${esc(summary)}</p>`

  // ── 3. Dimension Scores ──
  html += `<h2>${zh ? '五维度评分明细' : '5-Dimension Score Breakdown'}</h2>
  <table>
    <tr><th>${zh ? '维度' : 'Dimension'}</th><th style="width:50px;text-align:center">${zh ? '权重' : 'Weight'}</th><th style="width:55px;text-align:center">${zh ? '评分' : 'Score'}</th><th>${zh ? '说明' : 'Details'}</th></tr>`
  for (const dim of DIMS) {
    const score = result.scores_v3?.[dim.id]
    const detail = zh
      ? (result.details_zh as any)?.[dim.id] || ''
      : (result.details_en as any)?.[dim.id] || ''
    const zeroed = result.forensics_zeroed_dims?.includes(dim.id)
    const sc = typeof score === 'number' ? score : null
    const barColor = zeroed ? '#DC2626' : (sc != null ? scoreColor(sc) : '#CBD5E1')
    html += `<tr>
      <td style="font-weight:600">${zh ? dim.zhLabel : dim.enLabel}</td>
      <td style="text-align:center">${(dim.weight * 100).toFixed(0)}%</td>
      <td style="text-align:center;font-weight:700;color:${sc != null ? scoreColor(sc) : '#64748B'}">
        ${sc ?? '—'}${zeroed ? ' <span style="color:#DC2626;font-size:9px">⚠</span>' : ''}
        <div style="height:4px;border-radius:2px;background:#E2E8F0;margin-top:3px;overflow:hidden"><div style="height:100%;width:${sc ?? 0}%;background:${barColor}"></div></div>
      </td>
      <td>${esc(detail)}${zeroed ? ` <span style="color:#DC2626;font-size:9px">(${zh ? '取证归零' : 'Forensics zeroed'})</span>` : ''}</td>
    </tr>`
  }
  html += `</table>`

  // ── 3.5 Income & Affordability ──
  // Only renders rows backed by real extracted data — no fabricated numbers.
  if (result.effective_monthly_income != null || result.detected_monthly_income != null || result.bank_min_balance != null || ratio != null) {
    html += `<h2>${zh ? '收入与负担能力' : 'Income & Affordability'}</h2><table>
      <tr><th>${zh ? '指标' : 'Metric'}</th><th style="width:110px;text-align:right">${zh ? '数值' : 'Value'}</th><th>${zh ? '说明' : 'Notes'}</th></tr>`
    if (result.effective_monthly_income != null) {
      html += `<tr><td style="font-weight:600">${zh ? '有效月收入' : 'Effective monthly income'}</td><td style="text-align:right;font-weight:700">$${result.effective_monthly_income.toLocaleString()}</td><td>${esc(result.income_evidence || (zh ? '从上传文件中提取' : 'Extracted from uploaded documents'))}</td></tr>`
    }
    if (result.detected_monthly_income != null && result.detected_monthly_income !== result.effective_monthly_income) {
      html += `<tr><td style="font-weight:600">${zh ? 'AI 检测月收入' : 'AI-detected monthly income'}</td><td style="text-align:right">$${result.detected_monthly_income.toLocaleString()}</td><td>${zh ? '文件中声明的原始数值' : 'Raw figure stated in documents'}</td></tr>`
    }
    if (rentNum > 0) {
      html += `<tr><td style="font-weight:600">${zh ? '目标月租金' : 'Target monthly rent'}</td><td style="text-align:right">$${rentNum.toLocaleString()}</td><td></td></tr>`
    }
    if (ratio != null) {
      const rColor = ratio >= 3 ? '#16A34A' : ratio >= 2 ? '#D97706' : '#DC2626'
      html += `<tr><td style="font-weight:600">${zh ? '收入/租金比' : 'Income-to-rent ratio'}</td><td style="text-align:right;font-weight:700;color:${rColor}">${ratio.toFixed(1)}x</td><td>${zh ? '行业惯例:≥3x 充足,2–3x 偏紧,<2x 风险高' : 'Industry guideline: ≥3x comfortable, 2–3x tight, <2x high risk'}</td></tr>`
    }
    if (result.bank_min_balance != null) {
      html += `<tr><td style="font-weight:600">${zh ? '银行流水最低余额' : 'Minimum bank balance observed'}</td><td style="text-align:right">$${result.bank_min_balance.toLocaleString()}</td><td>${zh ? '来自银行对账单分析' : 'From bank statement analysis'}</td></tr>`
    }
    html += `</table>`

    // Per-source income verification — structured paystub math from forensics,
    // so each pay/employment document's stated salary and YTD consistency is
    // shown individually (multi-applicant households surface each earner).
    const paystubFiles = (result.forensics_detail?.per_file || []).filter(pf =>
      pf.paystub_math && (pf.paystub_math.extraction?.annual_salary || pf.paystub_math.extraction?.ytd_gross || typeof pf.paystub_math.ytd_ratio === 'number'))
    if (paystubFiles.length > 0) {
      html += `<div style="font-size:11px;font-weight:700;color:#0B1736;margin:12px 0 6px">${zh ? '收入来源核验明细' : 'Income Source Verification'}</div>
      <table>
        <tr><th>${zh ? '来源文件' : 'Source document'}</th><th>${zh ? '雇主' : 'Employer'}</th><th style="width:90px;text-align:right">${zh ? '声明年薪' : 'Annual salary'}</th><th style="width:95px;text-align:center">${zh ? 'YTD 一致性' : 'YTD consistency'}</th></tr>`
      for (const pf of paystubFiles) {
        const ps = pf.paystub_math!
        const r = ps.ytd_ratio
        const rOk = typeof r === 'number' && r >= 0.5 && r <= 1.5
        const rTxt = typeof r === 'number' ? `${r.toFixed(2)}× ${rOk ? (zh ? '✓ 合理' : '✓ OK') : (zh ? '⚠ 偏离' : '⚠ off')}` : '—'
        const rColor = typeof r !== 'number' ? '#64748B' : rOk ? '#16A34A' : '#DC2626'
        html += `<tr>
          <td style="word-break:break-all;font-size:9.5px">${esc(pf.file_name)}</td>
          <td>${esc(ps.extraction?.employer_name || (zh ? '未注明' : 'Not stated'))}</td>
          <td style="text-align:right;font-weight:600">${ps.extraction?.annual_salary ? '$' + Math.round(ps.extraction.annual_salary).toLocaleString() : '—'}</td>
          <td style="text-align:center;color:${rColor};font-weight:600;font-size:9.5px">${rTxt}</td>
        </tr>`
      }
      html += `</table>
      <div style="font-size:9px;color:#94A3B8;margin-top:3px">${zh ? 'YTD 一致性 = 工资单年初至今总额 ÷ 按声明年薪推算的预期值。接近 1.0 表示文件内部自洽。' : 'YTD consistency = stated year-to-date gross ÷ expected from annual salary. Near 1.0 = internally consistent.'}</div>`
    }
  }

  // ── 3.7 Application Summary & Cross-Document Verification ──
  // 2026-07 — cross_doc_verification block from the scoring prompt: bank
  // account ownership, income corroboration, related-party signals, the
  // rental-application summary and an executable verification checklist.
  // Old reports have no data → the whole section is skipped; every
  // sub-block is individually guarded so nothing renders undefined.
  {
    const cdv = result.cross_doc_verification
    const app = cdv?.application_summary
    const hasCdv = !!(cdv && (
      (cdv.bank_accounts?.length || 0) > 0 ||
      cdv.income_corroboration ||
      (cdv.related_party && (cdv.related_party.suspected || (cdv.related_party.signals?.length || 0) > 0)) ||
      app ||
      (cdv.suspicious_transfers?.length || 0) > 0 ||
      (cdv.verification_checklist?.length || 0) > 0
    ))
    if (hasCdv && cdv) {
      const money = (n: number | null | undefined) => (typeof n === 'number' ? '$' + Math.round(n).toLocaleString() : '—')
      html += `<h2>${zh ? '申请表摘要与核验清单' : 'Application Summary & Verification Checklist'}</h2>`

      // Application form summary
      if (app) {
        if (app.applying_rent != null) html += `<div class="kv"><span class="k">${zh ? '拟租租金' : 'Applying rent'}:</span><span class="v" style="font-weight:600">${money(app.applying_rent)}/${zh ? '月' : 'mo'}</span></div>`
        if (app.vacating_reason) html += `<div class="kv"><span class="k">${zh ? '搬家原因' : 'Vacating reason'}:</span><span class="v">${esc(app.vacating_reason)}</span></div>`
        if ((app.vehicles || []).length > 0) html += `<div class="kv"><span class="k">${zh ? '车辆' : 'Vehicle(s)'}:</span><span class="v">${(app.vehicles || []).map(v => esc(v)).join(' · ')}</span></div>`
        if ((app.prev_residences || []).length > 0) {
          html += `<table style="margin-top:6px">
            <tr><th>${zh ? '居住地址' : 'Address'}</th><th style="width:90px">${zh ? '期间' : 'Period'}</th><th style="width:110px">${zh ? '房东' : 'Landlord'}</th><th style="width:100px">${zh ? '电话' : 'Phone'}</th></tr>`
          for (const p of app.prev_residences || []) {
            html += `<tr><td>${esc(p.address || '—')}</td><td style="font-size:9px">${esc(p.period || '—')}</td><td style="font-weight:600">${esc(p.landlord_name || '—')}</td><td style="font-family:monospace;font-size:9px">${esc(p.landlord_phone || '—')}</td></tr>`
          }
          html += `</table>`
        }
        if ((app.blank_sections || []).length > 0) {
          html += `<div style="font-size:10px;color:#B45309;margin:4px 0 8px"><strong>${zh ? '申请表留空栏目' : 'Form sections left blank'}:</strong> ${(app.blank_sections || []).map(b => esc(b)).join(' · ')}</div>`
        }
      }

      // Bank account ownership
      if ((cdv.bank_accounts || []).length > 0) {
        html += `<div style="font-size:11px;font-weight:700;color:#0B1736;margin:10px 0 5px">${zh ? '银行流水户名核验' : 'Bank Statement Account Holders'}</div>
        <table>
          <tr><th>${zh ? '户名' : 'Holder'}</th><th style="width:75px">${zh ? '账户类型' : 'Type'}</th><th style="width:100px">${zh ? '对账期间' : 'Period'}</th><th>${zh ? '结论' : 'Verdict'}</th></tr>`
        for (const b of cdv.bank_accounts || []) {
          const ok = b.is_applicant && b.entity_type === 'personal'
          const col = ok ? '#16A34A' : '#DC2626'
          html += `<tr>
            <td style="font-weight:600">${esc(b.holder_name)}</td>
            <td style="color:${b.entity_type === 'business' ? '#DC2626' : '#16A34A'};font-weight:600">${b.entity_type === 'business' ? (zh ? '企业' : 'Business') : (zh ? '个人' : 'Personal')}</td>
            <td style="font-size:9px">${esc(b.statement_period || '—')}</td>
            <td style="color:${col};font-weight:600;font-size:9.5px">${b.is_applicant ? (zh ? '✓ 申请人本人' : '✓ Applicant') : (zh ? '✗ 非申请人本人 — 不能作为个人收入佐证' : '✗ Not the applicant — not personal-income evidence')}</td>
          </tr>`
        }
        html += `</table>`
      }

      // Income corroboration
      if (cdv.income_corroboration) {
        const ic = cdv.income_corroboration
        const vMap: Record<string, { text: string; color: string }> = {
          corroborated: { text: zh ? '已佐证' : 'Corroborated', color: '#16A34A' },
          partial: { text: zh ? '部分佐证' : 'Partial', color: '#D97706' },
          uncorroborated: { text: zh ? '未获佐证' : 'Uncorroborated', color: '#DC2626' },
        }
        const v = vMap[ic.verdict] || vMap.partial
        html += `<div class="card" style="border-left:3px solid ${v.color};margin-top:8px">
          <div style="font-size:11px;font-weight:700;color:#0B1736;margin-bottom:4px">${zh ? '收入佐证核验' : 'Income Corroboration'} · <span style="color:${v.color}">${v.text}</span></div>
          ${ic.claimed_monthly != null ? `<div class="kv"><span class="k">${zh ? '声称月收入' : 'Claimed income'}:</span><span class="v">${money(ic.claimed_monthly)}/${zh ? '月' : 'mo'}</span></div>` : ''}
          <div class="kv"><span class="k">${zh ? '个人账户工资入账' : 'Personal payroll seen'}:</span><span class="v" style="color:${ic.personal_payroll_seen ? '#16A34A' : '#DC2626'};font-weight:600">${ic.personal_payroll_seen ? (zh ? '✓ 有' : '✓ Yes') : (zh ? '✗ 未见' : '✗ None seen')}</span></div>
          ${ic.observed_pattern ? `<div class="kv"><span class="k">${zh ? '实际观察' : 'Observed pattern'}:</span><span class="v">${esc(ic.observed_pattern)}</span></div>` : ''}
          ${ic.detail ? `<div style="font-size:10px;color:#475569;margin-top:3px">${esc(ic.detail)}</div>` : ''}
          ${ic.verdict === 'uncorroborated' ? `<div style="font-size:9px;color:#DC2626;margin-top:4px">${zh ? '后端已强制：付款能力分数封顶 60 · 收入稳定性证据降级为「待房东核实」' : 'Backend-enforced: ability-to-pay capped at 60 · income-stability evidence downgraded to pending landlord action'}</div>` : ''}
        </div>`
      }

      // Related-party signals
      if (cdv.related_party && (cdv.related_party.suspected || (cdv.related_party.signals || []).length > 0)) {
        const rp = cdv.related_party
        const col = rp.suspected ? '#DC2626' : '#16A34A'
        html += `<div class="card" style="border-left:3px solid ${col};margin-top:8px">
          <div style="font-size:11px;font-weight:700;color:${col};margin-bottom:4px">${zh ? '利益相关方信号' : 'Related-Party Signals'} · ${rp.suspected ? (zh ? '疑似利益相关方' : 'SUSPECTED') : (zh ? '未达疑似阈值' : 'Below threshold')}</div>`
        for (const sig of rp.signals || []) {
          html += `<div style="font-size:10px;line-height:1.6;color:#334155">· ${esc(sig)}</div>`
        }
        if (rp.suspected) {
          html += `<div style="font-size:9.5px;color:#64748B;margin-top:4px">${zh ? '收入声明来自利益相关方，需独立核实（CRA NOA / T4 或个人账户工资流水）。' : 'The income claim comes from a non-arm\'s-length party — require independent proof (CRA NOA / T4 or personal-account payroll deposits).'}</div>`
        }
        html += `</div>`
      }

      // Suspicious fund flows
      if ((cdv.suspicious_transfers || []).length > 0) {
        html += `<div style="font-size:11px;font-weight:700;color:#B91C1C;margin:10px 0 5px">${zh ? '可疑资金流' : 'Suspicious Fund Flows'} · ${(cdv.suspicious_transfers || []).length}</div>`
        for (const t of cdv.suspicious_transfers || []) {
          html += `<div class="card" style="border-left:3px solid #DC2626;padding:8px 12px;margin-bottom:6px">
            <span class="flag-badge" style="background:#DC2626">${zh ? '资金流' : 'FLOW'}</span>
            <span style="font-size:10.5px">${esc(t)}</span>
          </div>`
        }
      }

      // Verification checklist
      if ((cdv.verification_checklist || []).length > 0) {
        html += `<div style="font-size:11px;font-weight:700;color:#0B1736;margin:10px 0 5px">${zh ? '房东可执行核验清单' : 'Landlord Verification Checklist'} · ${(cdv.verification_checklist || []).length}</div>
        <table><tr><th style="width:26px;text-align:center">#</th><th>${zh ? '核验步骤' : 'Verification step'}</th></tr>`
        ;(cdv.verification_checklist || []).forEach((c, i) => {
          html += `<tr><td style="text-align:center;font-weight:700;color:#047857">${i + 1}</td><td>${esc(c)}</td></tr>`
        })
        html += `</table>`
      }
    }
  }

  // ── 3.8 Credit Bureau (transcribed from an uploaded credit report) ──
  // Rendered ONLY when the applicant uploaded a real credit report and the
  // AI transcribed it. All figures are copied from that document — Stayloop
  // does not pull bureau data directly.
  const cr = result.credit_report
  if (cr && (cr.credit_score != null || (cr.tradelines && cr.tradelines.length > 0) || (cr.collections && cr.collections.length) || (cr.bankruptcies && cr.bankruptcies.length))) {
    const money = (n: number | null | undefined) => (typeof n === 'number' ? '$' + Math.round(n).toLocaleString() : '—')
    // Credit score band → color (Canadian 300-900 scale)
    const sc = cr.credit_score
    const scColor = sc == null ? '#64748B' : sc >= 760 ? '#16A34A' : sc >= 725 ? '#65A30D' : sc >= 660 ? '#A16207' : sc >= 560 ? '#C2410C' : '#DC2626'
    html += `<h2>${zh ? '信用报告（来自上传文件）' : 'Credit Report (from uploaded document)'}</h2>`
    html += `<div style="display:flex;gap:14px;align-items:center;border:1px solid #E2E8F0;border-radius:10px;padding:14px;margin-bottom:10px">`
    if (sc != null) {
      const pct = Math.max(0, Math.min(100, ((sc - 300) / 600) * 100))
      html += `<div style="text-align:center;flex-shrink:0">
        <svg width="120" height="68" viewBox="0 0 120 68"><path d="M 14 56 A 46 46 0 0 1 106 56" fill="none" stroke="#E2E8F0" stroke-width="9" stroke-linecap="round"/><path d="M 14 56 A 46 46 0 0 1 106 56" fill="none" stroke="${scColor}" stroke-width="9" stroke-linecap="round" stroke-dasharray="${(Math.PI * 46).toFixed(1)}" stroke-dashoffset="${(Math.PI * 46 * (1 - pct / 100)).toFixed(1)}"/><text x="60" y="50" text-anchor="middle" font-size="22" font-weight="800" fill="${scColor}">${sc}</text></svg>
        <div style="font-size:9px;color:#64748B">${esc(cr.score_band || '')} · 300–900</div>
      </div>`
    }
    html += `<div style="flex:1">
      <div class="kv"><span class="k">${zh ? '信用局' : 'Bureau'}:</span><span class="v">${esc(cr.bureau || (zh ? '未注明' : 'Not stated'))}</span></div>
      ${cr.report_date ? `<div class="kv"><span class="k">${zh ? '报告日期' : 'Report date'}:</span><span class="v">${esc(cr.report_date)}</span></div>` : ''}
      ${cr.total_debt != null ? `<div class="kv"><span class="k">${zh ? '总负债' : 'Total debt'}:</span><span class="v" style="font-weight:600">${money(cr.total_debt)}</span></div>` : ''}
      ${cr.monthly_debt_payments != null ? `<div class="kv"><span class="k">${zh ? '每月还款' : 'Monthly debt pmts'}:</span><span class="v">${money(cr.monthly_debt_payments)}</span></div>` : ''}
    </div></div>`

    // Tradelines (credit accounts)
    const tl = cr.tradelines || []
    if (tl.length > 0) {
      html += `<div style="font-size:11px;font-weight:700;color:#0B1736;margin:10px 0 5px">${zh ? '信用账户（Tradelines）' : 'Credit Accounts (Tradelines)'} · ${tl.length}</div>
      <table>
        <tr><th>${zh ? '债权人' : 'Creditor'}</th><th style="width:70px">${zh ? '类型' : 'Type'}</th><th style="width:70px">${zh ? '开户' : 'Opened'}</th><th style="width:75px;text-align:right">${zh ? '余额' : 'Balance'}</th><th style="width:60px;text-align:right">${zh ? '逾期' : 'Past due'}</th><th style="width:55px;text-align:center">30/60/90</th><th>${zh ? '状态' : 'Status'}</th></tr>`
      for (const t of tl) {
        const late = (t.late_30_60_90 && t.late_30_60_90 !== '0/0/0') ? '#DC2626' : '#64748B'
        const pd = (t.past_due ?? 0) > 0 ? '#DC2626' : '#334155'
        html += `<tr>
          <td style="font-weight:600">${esc(t.creditor)}</td>
          <td style="font-size:9px">${esc(t.type)}</td>
          <td style="font-size:9px">${esc(t.date_opened)}</td>
          <td style="text-align:right">${money(t.balance)}</td>
          <td style="text-align:right;color:${pd};font-weight:${(t.past_due ?? 0) > 0 ? 700 : 400}">${money(t.past_due)}</td>
          <td style="text-align:center;font-size:9px;color:${late};font-weight:${late === '#DC2626' ? 700 : 400}">${esc(t.late_30_60_90 || '—')}</td>
          <td style="font-size:9px">${esc(t.payment_status)}</td>
        </tr>`
      }
      html += `</table>`
    }
    // Collections
    const col = cr.collections || []
    if (col.length > 0) {
      html += `<div style="font-size:11px;font-weight:700;color:#B91C1C;margin:10px 0 5px">${zh ? '催收记录' : 'Collections'} · ${col.length}</div>
      <table><tr><th>${zh ? '债权人' : 'Creditor'}</th><th style="width:90px">${zh ? '移交日期' : 'Date assigned'}</th><th style="width:90px;text-align:right">${zh ? '原始金额' : 'Original'}</th><th style="width:90px;text-align:right">${zh ? '余额' : 'Balance'}</th></tr>`
      for (const c of col) html += `<tr><td>${esc(c.creditor)}</td><td style="font-size:9px">${esc(c.date_assigned)}</td><td style="text-align:right">${money(c.original_amount)}</td><td style="text-align:right;color:#B91C1C;font-weight:600">${money(c.balance)}</td></tr>`
      html += `</table>`
    }
    // Bankruptcies / insolvency
    const bk = cr.bankruptcies || []
    if (bk.length > 0) {
      html += `<div style="font-size:11px;font-weight:700;color:#B91C1C;margin:10px 0 5px">${zh ? '破产 / 无力偿债' : 'Bankruptcies / Insolvency'} · ${bk.length}</div>
      <table><tr><th style="width:90px">${zh ? '申报日期' : 'Date filed'}</th><th>${zh ? '类型' : 'Type'}</th><th style="width:90px;text-align:right">${zh ? '金额' : 'Amount'}</th><th style="width:100px">${zh ? '处置' : 'Disposition'}</th></tr>`
      for (const b of bk) html += `<tr><td style="font-size:9px">${esc(b.date_filed)}</td><td>${esc(b.type)}</td><td style="text-align:right">${money(b.amount)}</td><td>${esc(b.disposition)}</td></tr>`
      html += `</table>`
    }
    // Recent inquiries
    const iq = cr.inquiries || []
    if (iq.length > 0) {
      html += `<div style="font-size:11px;font-weight:700;color:#0B1736;margin:10px 0 5px">${zh ? '近期信用查询' : 'Recent Credit Inquiries'} · ${iq.length}</div>
      <table><tr><th style="width:100px">${zh ? '日期' : 'Date'}</th><th>${zh ? '查询机构' : 'Inquirer'}</th></tr>`
      for (const i of iq) html += `<tr><td style="font-size:9px">${esc(i.date)}</td><td>${esc(i.creditor)}</td></tr>`
      html += `</table>`
    }
    html += `<div style="font-size:9px;color:#94A3B8;margin-top:4px;font-style:italic">${zh ? '以上数据由 AI 从申请人上传的信用报告转录,请与原件核对。Stayloop 不直接对接信用局。' : 'Transcribed by AI from the uploaded credit report — verify against the original. Stayloop does not pull bureau data directly.'}</div>`
  }

  // ── 4. Document Forensics ──
  if (result.forensics_detail) {
    const fd = result.forensics_detail
    const sevMap: Record<string, { text: string; color: string }> = {
      clean: { text: zh ? '无异常' : 'Clean', color: '#16A34A' },
      suspicious: { text: zh ? '可疑特征' : 'Suspicious', color: '#D97706' },
      likely_fraud: { text: zh ? '强烈伪造信号' : 'Likely Fraud', color: '#DC2626' },
      fraud: { text: zh ? '极可能伪造' : 'Fraud Detected', color: '#DC2626' },
    }
    const sv = sevMap[fd.severity] || sevMap.clean
    html += `<h2>${zh ? '文件取证分析' : 'Document Forensics'}</h2>
    <div class="kv"><span class="k">${zh ? '取证结论' : 'Verdict'}:</span><span class="v" style="font-weight:700;color:${sv.color}">${sv.text}</span></div>`

    // Checks-performed matrix — every forensic test category that ran, with
    // its outcome. Passed checks are listed too: "checked and clean" is
    // disclosure a one-line fraud-check summary can't provide.
    const checkMatrix = buildForensicCheckMatrix(fd, result.deep_check_result)
    if (checkMatrix.length > 0) {
      const ranCount = checkMatrix.filter(c => c.status !== 'na').length
      const cmIcon = (s: string) => s === 'pass' ? '✓' : s === 'warn' ? '⚠' : s === 'fail' ? '✗' : '—'
      const cmColor = (s: string) => s === 'pass' ? '#16A34A' : s === 'warn' ? '#D97706' : s === 'fail' ? '#DC2626' : '#94A3B8'
      html += `<div style="font-size:10px;color:#64748B;margin:8px 0 4px">${zh ? `已执行取证检查 · ${ranCount} / ${checkMatrix.length} 类` : `Forensic checks performed · ${ranCount} of ${checkMatrix.length} categories`}</div>
      <table>
        <tr><th style="width:26px;text-align:center"></th><th style="width:150px">${zh ? '检查类别' : 'Check category'}</th><th>${zh ? '检查内容' : 'What it tests'}</th><th style="width:95px">${zh ? '结果' : 'Result'}</th></tr>`
      for (const c of checkMatrix) {
        const col = cmColor(c.status)
        const resTxt = c.status === 'na'
          ? (zh ? '未执行（材料不适用或未启用）' : 'Not run (n/a or not enabled)')
          : c.findings === 0
            ? (zh ? `通过${c.positives ? ` · ${c.positives} 项佐证` : ''}` : `Pass${c.positives ? ` · ${c.positives} corroboration(s)` : ''}`)
            : (zh ? `${c.findings} 项发现${c.positives ? ` · ${c.positives} 项佐证` : ''}` : `${c.findings} finding(s)${c.positives ? ` · ${c.positives} corroboration(s)` : ''}`)
        html += `<tr>
          <td style="text-align:center;color:${col};font-weight:800">${cmIcon(c.status)}</td>
          <td style="font-weight:600;color:${c.status === 'na' ? '#94A3B8' : '#0B1736'}">${esc(zh ? c.zh : c.en)}</td>
          <td style="font-size:9px;color:${c.status === 'na' ? '#94A3B8' : '#475569'}">${esc(zh ? c.desc_zh : c.desc_en)}</td>
          <td style="color:${col};font-weight:600;font-size:9.5px">${resTxt}</td>
        </tr>`
      }
      html += `</table>`
    }

    // Per-file evidence cards — every analyzed file expanded with ALL real
    // forensic measurements: PDF metadata, text density, paystub math, bank /
    // Equifax markers, and every flag. The depth competitors show per credit
    // account, built from our deterministic forensics output.
    if (fd.per_file && fd.per_file.length > 0) {
      const money = (n: number | null | undefined) => (typeof n === 'number' ? '$' + Math.round(n).toLocaleString() : '—')
      html += `<div style="font-size:10px;color:#64748B;margin:6px 0 8px">${zh ? `逐文件取证明细 · 共 ${fd.per_file.length} 份文件` : `Per-document forensic detail · ${fd.per_file.length} file(s)`}</div>`
      for (const pf of fd.per_file) {
        const negFlagCount = pf.flags.filter(f => !isPositiveForensicFlag(f)).length
        const infoFlagCount = pf.flags.length - negFlagCount
        const worst = pf.flags.filter(f => !isPositiveForensicFlag(f)).reduce((acc, f) =>
          f.severity === 'critical' || f.severity === 'high' ? 'bad' : (acc === 'bad' ? 'bad' : f.severity === 'medium' ? 'warn' : acc), 'clean' as 'clean' | 'warn' | 'bad')
        const vColor = worst === 'bad' ? '#DC2626' : worst === 'warn' ? '#D97706' : '#16A34A'
        const vText = negFlagCount === 0
          ? (infoFlagCount > 0
              ? (zh ? `✓ 无异常 · ${infoFlagCount} 项佐证` : `✓ Clean · ${infoFlagCount} corroboration(s)`)
              : (zh ? '✓ 无异常' : '✓ Clean'))
          : `${worst === 'bad' ? '✗' : '⚠'} ${negFlagCount} ${zh ? '项发现' : 'flag(s)'}`
        const m = pf.pdf_metadata, ps = pf.paystub_math, ss = pf.source_specific
        const facts: Array<[string, string]> = []
        if (m) facts.push([zh ? '页数 / 大小' : 'Pages / Size', `${m.page_count}p · ${Math.round(m.file_size_bytes / 1024)}KB`])
        if (m?.producer) facts.push([zh ? 'PDF 生成工具' : 'PDF Producer', m.producer])
        if (m?.title) facts.push([zh ? '内嵌标题' : 'Embedded Title', m.title])
        if (m?.creation_date) facts.push([zh ? '创建时间' : 'Created', m.creation_date])
        if (m?.modification_date && m.modification_date !== m.creation_date) facts.push([zh ? '最后修改' : 'Last Modified', m.modification_date])
        if (pf.text_density) facts.push([zh ? '文字密度' : 'Text Density', `${pf.text_density.chars_per_page} ${zh ? '字符/页' : 'chars/pg'}${pf.text_density.is_likely_image_pdf ? (zh ? ' · ⚠ 疑似图片型 PDF' : ' · ⚠ likely image-only') : ''}`])
        if (ps?.extraction?.employer_name) facts.push([zh ? '雇主(文件内)' : 'Employer (on doc)', ps.extraction.employer_name])
        if (ps?.extraction?.annual_salary) facts.push([zh ? '声明年薪' : 'Stated Annual Salary', money(ps.extraction.annual_salary)])
        if (ps?.extraction?.ytd_gross) facts.push([zh ? '声明 YTD 总收入' : 'Stated YTD Gross', money(ps.extraction.ytd_gross)])
        if (ps?.expected_ytd_gross) facts.push([zh ? '预期 YTD(按薪资推算)' : 'Expected YTD', money(ps.expected_ytd_gross)])
        if (typeof ps?.ytd_ratio === 'number') {
          const rOk = ps.ytd_ratio >= 0.5 && ps.ytd_ratio <= 1.5
          facts.push([zh ? 'YTD 实际/预期比' : 'YTD Actual/Expected', `${ps.ytd_ratio.toFixed(2)}× ${rOk ? (zh ? '✓ 合理' : '✓ consistent') : (zh ? '⚠ 偏离' : '⚠ off')}`])
        }
        if (typeof ps?.period_math_error_pct === 'number') facts.push([zh ? '周期数学误差' : 'Period Math Error', `${(ps.period_math_error_pct * 100).toFixed(1)}%`])
        if (ss?.matched_bank) facts.push([zh ? '识别银行' : 'Matched Bank', `${ss.matched_bank}${ss.bank_producer_whitelisted ? ' ✓' : (zh ? ' ⚠ 生成工具不符' : ' ⚠ producer mismatch')}`])
        if (ss?.equifax_authentic_markers != null) facts.push([zh ? 'Equifax 真伪标记' : 'Equifax Markers', ss.equifax_authentic_markers ? (zh ? '✓ 已找到' : '✓ found') : (zh ? '⚠ 未找到' : '⚠ missing')])
        html += `<div class="card" style="border-left:3px solid ${vColor}">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:6px">
            <div><span style="font-weight:700;font-size:11px;word-break:break-all">${esc(pf.file_name)}</span>
              <span style="font-family:monospace;font-size:9px;color:#64748B;margin-left:6px">${esc(pf.file_kind)}</span></div>
            <span style="font-size:10px;font-weight:700;color:${vColor};white-space:nowrap">${vText}</span>
          </div>`
        if (facts.length) html += `<table style="margin:4px 0"><tbody>${facts.map(([k, v]) => `<tr><td style="width:42%;color:#64748B;font-size:9.5px">${esc(k)}</td><td style="font-size:9.5px;font-family:monospace">${esc(v)}</td></tr>`).join('')}</tbody></table>`
        for (const f of pf.flags) {
          const dispSev = isPositiveForensicFlag(f) ? 'info' : f.severity
          html += `<div style="margin-top:4px;font-size:10px;line-height:1.5"><span class="flag-badge" style="background:${sevColor(dispSev)}">${zh ? ({ critical: '严重', high: '高', medium: '中', low: '低', info: '佐证' }[dispSev] || dispSev) : dispSev.toUpperCase()}</span>${esc(zh ? f.evidence_zh : f.evidence_en)}</div>`
        }
        html += `</div>`
      }
    }

    if (fd.all_flags.length > 0) {
      html += `<table style="margin-top:6px">
        <tr><th style="width:60px">${zh ? '严重度' : 'Severity'}</th><th style="width:120px">${zh ? '代码' : 'Code'}</th><th>${zh ? '详情' : 'Evidence'}</th><th style="width:100px">${zh ? '文件' : 'File'}</th></tr>`
      for (const f of fd.all_flags) {
        const sc = sevColor(f.severity)
        html += `<tr>
          <td><span class="flag-badge" style="background:${sc}">${zh ? ({ critical: '严重', high: '高', medium: '中', low: '低', info: '佐证' }[f.severity] || f.severity) : f.severity.toUpperCase()}</span></td>
          <td style="font-family:monospace;font-size:9px">${esc(f.code)}</td>
          <td>${esc(zh ? f.evidence_zh : f.evidence_en)}</td>
          <td style="font-size:9px">${esc(f.file || '')}</td>
        </tr>`
      }
      html += `</table>`
    }
  }

  // ── 5. Court Records ──
  html += `<h2>${zh ? '法庭记录查询' : 'Court Record Search'}</h2>`

  const courtSummary = zh ? result.court_summary_zh : result.court_summary_en
  if (courtSummary) {
    html += `<p style="font-size:10px;margin-bottom:8px;color:#475569">${esc(courtSummary)}</p>`
  }
  html += `<div class="kv"><span class="k">${zh ? '查询姓名' : 'Queried Name'}:</span><span class="v">${esc(queriedName)}</span></div>
  <div class="kv"><span class="k">${zh ? '总命中数' : 'Total Hits'}:</span><span class="v" style="font-weight:700;color:${totalHits > 0 ? '#DC2626' : '#16A34A'}">${totalHits}</span></div>
  <div style="font-size:9px;color:#94A3B8;margin:2px 0 4px">${zh ? '「已检索」列的 ✓ 表示该库已按姓名实际执行检索;结果列单独标注(无记录 / N 条命中)。未检索、超时、不可用的库不带 ✓,绝不计入"无记录"。' : 'A ✓ in the Searched column means that source actually ran a name search; the Result column states only what came back (clear / N hits). Sources not searched, timed out, or unavailable carry no ✓ and are never counted as clear.'}</div>`

  // DB summary table — every free-tier query row is disclosed, including
  // unavailable / timed-out / skipped sources ("searched and clear" vs
  // "didn't answer" is a disclosure difference, not a cosmetic one).
  const dbRows = courtQueries.filter(q =>
    !q.source.startsWith('──') && q.source !== 'rollup' && q.tier === 'free'
  )
  if (dbRows.length > 0) {
    html += `<table style="margin-top:6px">
      <tr><th>${zh ? '数据库' : 'Database'}</th><th style="width:60px;text-align:center">${zh ? '已检索' : 'Searched'}</th><th style="width:75px;text-align:center">${zh ? '结果' : 'Result'}</th><th style="width:70px;text-align:center">${zh ? '风险等级' : 'Risk'}</th><th>${zh ? '备注' : 'Note'}</th></tr>`
    for (const q of dbRows) {
      const hits = q.status === 'ok' ? (q.hits ?? 0) : -1
      // The ✓ answers exactly one question — did this search run — and the
      // result column answers only what it returned. Fused, a red hit count
      // carried no ✓ and the least-skimmable row looked unsearched.
      const searchedTxt = q.status === 'ok'
        ? `<span style="color:#16A34A;font-weight:700">✓</span>`
        : q.status === 'timeout' ? (zh ? '超时' : 'Timeout')
        : '—'
      const statusTxt = q.status === 'ok'
        ? (hits > 0 ? `${hits} ${zh ? '条命中' : 'hit(s)'}` : (zh ? '无记录' : 'Clear'))
        : q.status === 'timeout' ? (zh ? '超时' : 'Timeout')
        : q.status === 'skipped' ? (zh ? '未检索' : 'Not searched')
        : (zh ? '不可用' : 'N/A')
      const riskText = q.severity === 3 ? (zh ? '严重' : 'Critical') : q.severity === 2 ? (zh ? '高' : 'High') : q.severity === 1 ? (zh ? '中' : 'Medium') : (zh ? '无' : 'None')
      const riskColor = q.severity === 3 ? '#DC2626' : q.severity === 2 ? '#D97706' : q.severity === 1 ? '#1D4ED8' : '#16A34A'
      // Certn-style row tinting: green for cleared databases, red for hits
      const rowBg = hits > 0 ? 'background:#FEF2F2' : hits === 0 ? 'background:#F0FDF4' : 'background:#F8FAFC'
      const stColorCourt = hits > 0 ? '#DC2626' : hits === 0 ? '#16A34A' : '#94A3B8'
      // A source that could not be searched automatically may still carry a
      // pre-filled manual search URL (CanLII: the website searches, the API
      // does not). Print it — this is a paper trail, and the link is the step
      // the landlord is being asked to take.
      const manualLink = q.url && q.status !== 'ok'
        ? ` <a href="${esc(q.url)}" style="color:#6D28D9">${zh ? '一键人工检索' : 'run the search yourself'}</a>`
        : ''
      html += `<tr>
        <td style="${rowBg}">${esc(q.source)}</td>
        <td style="${rowBg};text-align:center">${searchedTxt}</td>
        <td style="${rowBg};text-align:center;font-weight:${hits > 0 ? '700' : '400'};color:${stColorCourt}">${statusTxt}</td>
        <td style="${rowBg};text-align:center;color:${riskColor};font-weight:600;font-size:10px">${hits > 0 ? riskText : '—'}</td>
        <td style="${rowBg};font-size:8.5px;color:#64748B">${esc(q.note || '')}${manualLink}</td>
      </tr>`
    }
    html += `</table>`
  }

  // CanLII case details
  const canliiRecords = courtQueries.flatMap(q => (q.records || []).map(r => ({ ...r, dbSource: q.source })))
  if (canliiRecords.length > 0) {
    html += `<h3 style="font-size:11px;font-weight:700;color:#1E3A5F;margin:10px 0 6px">CanLII ${zh ? '案件详情' : 'Case Details'}</h3>
    <table>
      <tr><th>${zh ? '案件标题' : 'Case Title'}</th><th style="width:120px">${zh ? '引用' : 'Citation'}</th><th style="width:80px">${zh ? '来源' : 'Source'}</th></tr>`
    for (const r of canliiRecords) {
      html += `<tr>
        <td><a href="${esc(r.url)}" style="color:#1D4ED8;text-decoration:none">${esc(r.title)}</a></td>
        <td style="font-size:9px">${esc(r.citation)}</td>
        <td style="font-size:9px">${esc(r.databaseName || r.dbSource)}</td>
      </tr>`
    }
    html += `</table>`
  }

  // Ontario Courts Portal cases
  const portalRecords = courtQueries.flatMap(q => q.portalRecords || [])
  if (portalRecords.length > 0) {
    html += `<h3 style="font-size:11px;font-weight:700;color:#0284C7;margin:10px 0 6px">${zh ? '安省法院门户案件详情' : 'Ontario Courts Portal Cases'}</h3>
    <table>
      <tr>
        <th style="background:#0284C7">${zh ? '案件编号' : 'Case #'}</th>
        <th style="background:#0284C7">${zh ? '案件标题' : 'Title'}</th>
        <th style="background:#0284C7;width:65px">${zh ? '角色' : 'Role'}</th>
        <th style="background:#0284C7;width:75px">${zh ? '类别' : 'Category'}</th>
        <th style="background:#0284C7;width:70px">${zh ? '立案日期' : 'Filed'}</th>
        <th style="background:#0284C7;width:50px">${zh ? '状态' : 'Status'}</th>
      </tr>`
    for (const r of portalRecords) {
      const filed = r.filedDate ? new Date(r.filedDate).toLocaleDateString('en-CA') : ''
      html += `<tr>
        <td style="font-family:monospace;font-size:9px">${esc(r.caseNumber)}</td>
        <td>${esc(r.caseTitle)}</td>
        <td style="font-weight:600">${esc(r.partyRole)}</td>
        <td>${esc(r.caseCategory)}</td>
        <td>${filed}</td>
        <td style="color:${r.closedFlag ? '#64748B' : '#D97706'};font-weight:600">${r.closedFlag ? (zh ? '已结案' : 'Closed') : (zh ? '进行中' : 'Active')}</td>
      </tr>`
    }
    html += `</table>`
  }

  // ── 5.5 Deep Check — Arm's-Length Employment Verification ──
  // Corporate-registry cross-check: is the "employer" a real, independent
  // company, or one the applicant controls? Only rendered when it was run.
  if (result.deep_check_result && result.deep_check_result.checks.length > 0) {
    const dc = result.deep_check_result
    const orMap: Record<string, { text: string; color: string }> = {
      high: { text: zh ? '高风险 — 非独立雇佣关系' : 'High Risk — Not Arm\'s Length', color: '#DC2626' },
      medium: { text: zh ? '中等风险' : 'Medium Risk', color: '#D97706' },
      low: { text: zh ? '低风险' : 'Low Risk', color: '#65A30D' },
      clean: { text: zh ? '正常 — 独立雇佣关系' : 'Clean — Arm\'s Length', color: '#16A34A' },
    }
    const ov = orMap[dc.overall_risk] || orMap.clean
    html += `<h2>${zh ? '雇主深度核查 (Arm\'s Length)' : 'Employer Deep Check (Arm\'s Length)'}</h2>
    <div class="kv"><span class="k">${zh ? '总体结论' : 'Overall'}:</span><span class="v" style="font-weight:700;color:${ov.color}">${ov.text}</span></div>
    <div class="kv"><span class="k">${zh ? '核查时间' : 'Checked'}:</span><span class="v">${new Date(dc.checked_at).toLocaleString('en-CA')} · ${zh ? '数据源' : 'Source'}: OpenCorporates / ${zh ? '加拿大公司注册' : 'Canadian Corporate Registry'}</span></div>`
    for (const check of dc.checks) {
      const cr = orMap[check.arm_length_risk] || orMap.clean
      html += `<div class="card" style="border-left:3px solid ${cr.color}">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px">
          <span style="font-weight:700;font-size:11px">${esc(check.employer_name)}</span>
          <span style="font-weight:700;font-size:10px;color:${cr.color}">${cr.text}</span>
        </div>`
      if (check.company_info) {
        const ci = check.company_info
        html += `<div class="kv"><span class="k">${zh ? '注册名称' : 'Registered name'}:</span><span class="v">${esc(ci.name)}</span></div>`
        if (ci.incorporation_date) html += `<div class="kv"><span class="k">${zh ? '成立日期' : 'Incorporated'}:</span><span class="v"${check.is_recently_incorporated ? ' style="color:#DC2626;font-weight:700"' : ''}>${esc(ci.incorporation_date)}${check.is_recently_incorporated ? (zh ? ' ⚠ 不到 2 年' : ' ⚠ under 2 years') : ''}</span></div>`
        if (ci.status) html += `<div class="kv"><span class="k">${zh ? '注册状态' : 'Status'}:</span><span class="v">${esc(ci.status)}</span></div>`
        if (ci.officers.length > 0) html += `<div class="kv"><span class="k">${zh ? '董事/高管' : 'Officers'}:</span><span class="v"${check.applicant_is_officer ? ' style="color:#DC2626;font-weight:700"' : ''}>${esc(ci.officers.map(o => o.name + (o.position ? ` (${o.position})` : '')).join(', '))}${check.applicant_is_officer ? (zh ? ' ⚠ 申请人是公司高管' : ' ⚠ applicant is an officer') : ''}</span></div>`
        if (ci.registered_address) html += `<div class="kv"><span class="k">${zh ? '注册地址' : 'Address'}:</span><span class="v"${check.company_address_matches_applicant ? ' style="color:#DC2626;font-weight:700"' : ''}>${esc(ci.registered_address)}${check.company_address_matches_applicant ? (zh ? ' ⚠ 与申请人地址重叠' : ' ⚠ overlaps applicant address') : ''}</span></div>`
      } else {
        html += `<div style="font-size:10px;color:#94A3B8;font-style:italic">${zh ? '未在加拿大公司注册数据库中找到该雇主' : 'Employer not found in Canadian corporate registries'}</div>`
      }
      for (const f of check.flags) {
        html += `<div style="margin-top:4px;font-size:10px"><span class="flag-badge" style="background:${sevColor(f.severity)}">${zh ? ({ critical: '严重', high: '高', medium: '中', low: '低', info: '佐证' }[f.severity] || f.severity) : f.severity.toUpperCase()}</span>${esc(zh ? f.evidence_zh : f.evidence_en)}</div>`
      }
      html += `</div>`
    }
  }

  // ── 6. Action Items ──
  if (result.action_items && result.action_items.length > 0) {
    html += `<h2>${zh ? '待人工核实清单' : 'Action Items'}</h2>
    <p style="font-size:10px;color:#64748B;margin-bottom:6px">${zh ? '以下内容无法仅凭上传文档确认，需要您亲自核实。' : 'These items cannot be verified from documents alone.'}</p>
    <table>
      <tr><th style="background:#6D28D9">${zh ? '项目' : 'Item'}</th><th style="background:#6D28D9;width:80px">${zh ? '维度' : 'Dimension'}</th><th style="background:#6D28D9">${zh ? '详情' : 'Details'}</th><th style="background:#6D28D9;width:90px">${zh ? '对评分影响' : 'Impact'}</th></tr>`
    for (const item of result.action_items) {
      html += `<tr>
        <td style="font-weight:600">${esc(zh ? item.title_zh : item.title_en)}</td>
        <td style="font-size:9px;font-family:monospace">${esc(item.dimension)}</td>
        <td>${esc(zh ? item.details_zh : item.details_en)}</td>
        <td style="font-size:9px">${esc(item.impact_on_score)}</td>
      </tr>`
    }
    html += `</table>`
  }

  // ── 7. Flags ──
  if (result.flags && result.flags.length > 0) {
    html += `<h2>${zh ? '风险标记' : 'Risk Flags'}</h2>`
    for (const f of result.flags) {
      const typeColor: Record<string, string> = { danger: '#DC2626', warning: '#D97706', info: '#1D4ED8', success: '#16A34A' }
      const typeLabel: Record<string, string> = zh
        ? { danger: '危险', warning: '警告', info: '提示', success: '正常' }
        : { danger: 'DANGER', warning: 'WARNING', info: 'INFO', success: 'OK' }
      html += `<div class="card" style="border-left:3px solid ${typeColor[f.type] || '#64748B'}">
        <span class="flag-badge" style="background:${typeColor[f.type] || '#64748B'}">${typeLabel[f.type] || f.type}</span>
        <span style="font-size:11px">${esc(zh ? f.text_zh : f.text_en)}</span>
      </div>`
    }
  }

  // ── 8. Compliance Audit ──
  if (result.compliance_audit) {
    const ca = result.compliance_audit
    html += `<h2>${zh ? '合规审计 (HRC 证据链)' : 'Compliance Audit (HRC Paper Trail)'}</h2>`
    if (ca.protected_grounds_observed && ca.protected_grounds_observed.length > 0) {
      html += `<div class="kv"><span class="k">${zh ? '观察到的受保护特征' : 'Protected Grounds Observed'}:</span><span class="v">${esc(ca.protected_grounds_observed.join(', '))}</span></div>`
    }
    html += `<div class="kv"><span class="k">${zh ? '用于评分' : 'Used in Scoring'}:</span><span class="v">${ca.protected_grounds_used_in_scoring?.length ? esc(ca.protected_grounds_used_in_scoring.join(', ')) : (zh ? '无' : 'None')}</span></div>`
    html += `<div class="kv"><span class="k">${zh ? 'HRC 合规' : 'HRC Compliant'}:</span><span class="v" style="color:${ca.hrc_compliant ? '#16A34A' : '#DC2626'};font-weight:700">${ca.hrc_compliant ? (zh ? '是 ✓' : 'Yes ✓') : (zh ? '否 ✗' : 'No ✗')}</span></div>`
    if (ca.reviewer_note) {
      html += `<div class="kv"><span class="k">${zh ? '审计备注' : 'Note'}:</span><span class="v" style="font-style:italic">${esc(ca.reviewer_note)}</span></div>`
    }
  }

  // ── 9. Legal & Methodology ──
  html += `<h2>${zh ? '法律声明与方法说明' : 'Legal & Methodology'}</h2>
  <div style="font-size:9px;color:#64748B;line-height:1.7">
    <p style="margin-bottom:5px">${zh
      ? '本报告由 Stayloop AI 基于申请人自愿提交的文件自动生成,数据来源包括:上传文件的 AI 内容分析与确定性取证检测(PDF 元数据、文字密度、来源指纹、跨文档一致性)、安省 LTB 判令目录(开放数据,依《安大略省开放政府许可》使用)、安大略省法院公开门户,以及加拿大公司注册公开数据。CanLII 不在自动检索之列(其 API 不支持按姓名检索),报告仅提供预填姓名的人工检索链接。本报告不含信用局(Equifax/TransUnion)征信数据。'
      : 'This report was generated automatically by Stayloop AI from documents voluntarily submitted by the applicant. Data sources include: AI content analysis and deterministic forensics of the uploaded files (PDF metadata, text density, source fingerprints, cross-document consistency), the Ontario LTB Order Catalogue (open data, used under the Open Government Licence – Ontario), the Ontario Courts public portal, and public Canadian corporate-registry data. CanLII is not searched automatically (its API offers no name search); the report provides a pre-filled manual search link instead. This report does NOT include credit-bureau (Equifax/TransUnion) data.'}</p>
    <p style="margin-bottom:5px">${zh
      ? '本报告仅可在申请人知情同意下,为订立或续订租赁协议之目的查看与使用,不得向无正当目的的第三方分发。依据《安大略省人权法典》,受保护特征(种族、国籍、宗教、性别、年龄、家庭状况、残障等)未被用于评分;详见合规审计一节。'
      : 'This report may only be viewed and used, with the applicant\'s knowledge and consent, in connection with entering into or renewing a tenancy agreement, and may not be distributed to third parties without a valid purpose. Per the Ontario Human Rights Code, protected grounds (race, nationality, religion, sex, age, family status, disability, etc.) were excluded from scoring — see the Compliance Audit section.'}</p>
    <p style="margin-bottom:5px">${zh
      ? 'Stayloop 不是《消费者报告法》(Consumer Reporting Act) 意义上的信用报告机构,本报告亦非该法意义上的"消费者报告"。个人信息按 PIPEDA 要求加密存储,保留 7 年,申请人有权查阅其被收集的信息并要求更正。'
      : 'Stayloop is not a consumer reporting agency within the meaning of the Consumer Reporting Act (Ontario), and this report is not a "consumer report" under that Act. Personal information is stored encrypted and retained for 7 years per PIPEDA; the applicant has the right to access and correct the information collected about them.'}</p>
    <p>${zh
      ? '评分为 AI 辅助评估,仅供参考,不构成法律、金融或租赁决策意见。最终决策责任由房东承担,建议结合面谈、推荐人核实与查档原件后综合判断。'
      : 'Scores are AI-assisted assessments for reference only and do not constitute legal, financial, or tenancy-decision advice. The final decision rests with the landlord; we recommend combining this report with interviews, reference checks, and original-document review.'}</p>
  </div>`

  // ── Footer ──
  html += `<div class="footer">
    Stayloop.ai &nbsp;|&nbsp; ${zh ? '此报告由 AI 自动生成，仅供参考，不构成法律意见' : 'AI-generated report — for reference only, not legal advice'} &nbsp;|&nbsp; ${date}${result.screening_id ? ` &nbsp;|&nbsp; ${zh ? '报告编号' : 'Report ID'}: ${esc(result.screening_id)}` : ''}${opts?.requestedBy ? ` &nbsp;|&nbsp; ${zh ? '申请方' : 'Requested by'}: ${esc(opts.requestedBy)}` : ''}
  </div>`

  html += `</body></html>`

  // ── Open & print ──
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const win = window.open(url, '_blank')
  if (win) {
    win.onload = () => {
      setTimeout(() => {
        win.print()
        URL.revokeObjectURL(url)
      }, 300)
    }
  } else {
    // Popup blocked — fallback: download HTML file
    const a = document.createElement('a')
    a.href = url
    a.download = `Stayloop_Report_${(result.extracted_name || 'screening').replace(/[^a-zA-Z0-9]/g, '_')}_${date}.html`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}
