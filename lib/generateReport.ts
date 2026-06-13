/**
 * Client-side PDF report generation for Stayloop screening results.
 *
 * Strategy: build a styled HTML document and open it in a new window
 * with window.print(). The browser's built-in PDF engine handles CJK
 * fonts natively — no need to embed a 20MB font file.
 */

// ─── Types (mirrors page.tsx — keep in sync) ──────────────────────
interface OntarioPortalMatch {
  caseNumber: string
  caseTitle: string
  caseCategory: string
  filedDate: string
  partyRole: string
  partyDisplayName: string
  courtAbbreviation: string
  closedFlag: boolean
}

interface CanLIIMatch {
  title: string
  citation: string
  url: string
  databaseId: string
  databaseName?: string
  caseId: string
  nameInTitle?: boolean
}

interface CourtQuery {
  source: string
  tier: 'free' | 'pro'
  status: 'ok' | 'unavailable' | 'skipped' | 'coming_soon'
  hits: number | null
  url?: string
  note?: string
  severity?: number
  records?: CanLIIMatch[]
  portalRecords?: OntarioPortalMatch[]
}

interface AiFlag { type: 'danger' | 'warning' | 'info' | 'success'; text_en: string; text_zh: string }

interface ScoreResult {
  overall: number
  scores_v3?: Record<string, number>
  details_en?: Record<string, string> | null
  details_zh?: Record<string, string> | null
  flags?: AiFlag[]
  detected_document_kinds?: string[]
  detected_monthly_income?: number | null
  effective_monthly_income?: number | null
  income_evidence?: string | null
  monthly_rent?: number | null
  income_rent_ratio?: number | null
  extracted_name: string
  name_was_extracted: boolean
  summary_en?: string
  summary_zh?: string
  summary: string
  court_summary_en?: string
  court_summary_zh?: string
  court_records_detail: { queries: CourtQuery[]; total_hits: number; queried_name: string }
  tier: 'free' | 'pro'
  v3_tier?: 'approve' | 'conditional' | 'decline'
  hard_gates_triggered?: string[]
  red_flags?: string[]
  evidence_coverage?: number
  action_items?: {
    id: string; dimension: string
    title_en: string; title_zh: string
    details_en: string; details_zh: string
    impact_on_score: string; status: string
  }[]
  compliance_audit?: {
    protected_grounds_observed?: string[]
    protected_grounds_used_in_scoring?: string[]
    hrc_compliant?: boolean
    reviewer_note?: string
  } | null
  forensics_detail?: {
    severity: string
    hard_gates: string[]
    all_flags: Array<{ code: string; severity: string; evidence_en: string; evidence_zh: string; file?: string }>
    per_file: Array<{
      file_name: string; file_kind: string
      pdf_metadata?: { page_count: number; file_size_bytes: number; producer: string | null } | null
      flags: Array<{ code: string; severity: string; evidence_en: string; evidence_zh: string }>
    }>
    cross_doc_flags: Array<{ code: string; severity: string; evidence_en: string; evidence_zh: string }>
  } | null
  forensics_zeroed_dims?: string[]
  tier_reason?: string
  identity_match_score?: number | null
  bank_min_balance?: number | null
  deep_check_result?: {
    checks: Array<{
      employer_name: string
      company_info: {
        name: string; company_number: string | null; jurisdiction: string | null
        incorporation_date: string | null; status: string | null
        registered_address: string | null; company_type: string | null
        officers: Array<{ name: string; position: string }>
        registry_url: string | null; source: string
      } | null
      is_numbered_company: boolean
      is_recently_incorporated: boolean
      applicant_is_officer: boolean
      applicant_lastname_match: boolean
      company_address_matches_applicant: boolean
      arm_length_risk: 'high' | 'medium' | 'low' | 'clean'
      flags: Array<{ code: string; severity: string; evidence_en: string; evidence_zh: string }>
    }>
    overall_risk: 'high' | 'medium' | 'low' | 'clean'
    total_flags: number
    checked_at: string
  } | null
}

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

function riskLabel(score: number, zh: boolean): { text: string; color: string; bg: string } {
  if (score >= 85) return { text: zh ? 'APPROVE — 优质' : 'APPROVE — Safe', color: '#16A34A', bg: '#F0FDF4' }
  if (score >= 70) return { text: zh ? 'APPROVE — 较安全' : 'APPROVE — Mostly Safe', color: '#65A30D', bg: '#F7FEE7' }
  if (score >= 50) return { text: zh ? 'CAUTION — 需审查' : 'CAUTION — Review', color: '#A16207', bg: '#FEFCE8' }
  if (score >= 30) return { text: zh ? 'CAUTION — 有风险' : 'CAUTION — Risky', color: '#C2410C', bg: '#FFF7ED' }
  return { text: zh ? 'REJECT — 高危' : 'REJECT — High Risk', color: '#DC2626', bg: '#FEF2F2' }
}

function scoreColor(s: number): string {
  if (s >= 80) return '#16A34A'
  if (s >= 60) return '#65A30D'
  if (s >= 40) return '#A16207'
  if (s >= 20) return '#C2410C'
  return '#DC2626'
}

function sevColor(sev: string): string {
  switch (sev) {
    case 'critical': return '#DC2626'
    case 'high': return '#EA580C'
    case 'medium': return '#D97706'
    default: return '#94A3B8'
  }
}

// Score bands for the visual range strip (FrontLobby/Equifax style, but on
// our 0-100 scale). Order matters: rendered left → right.
const SCORE_BANDS = [
  { min: 0,  max: 29,  zh: '高危',   en: 'High Risk',   color: '#DC2626' },
  { min: 30, max: 49,  zh: '有风险', en: 'Risky',       color: '#C2410C' },
  { min: 50, max: 69,  zh: '需审查', en: 'Review',      color: '#A16207' },
  { min: 70, max: 84,  zh: '较安全', en: 'Mostly Safe', color: '#65A30D' },
  { min: 85, max: 100, zh: '优质',   en: 'Safe',        color: '#16A34A' },
]

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
  html += `<div style="border:1px solid #E2E8F0;border-radius:8px;padding:10px 14px;margin-bottom:10px;font-size:10px;color:#475569">
    ${zh ? '报告生成日期' : 'Report generated'}: <strong>${date}</strong>
    ${opts?.requestedBy ? ` &nbsp;·&nbsp; ${zh ? '申请方' : 'Requested by'}: <strong>${esc(opts.requestedBy)}</strong>` : ''}
    &nbsp;·&nbsp; ${zh ? '分析引擎' : 'Engine'}: <strong>Stayloop AI v3</strong>
  </div>
  <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:12px 14px;margin-bottom:14px">
    <div style="font-size:11px;font-weight:700;color:#0B1736;margin-bottom:6px">${zh ? '申请人信息' : 'Applicant Information'}</div>
    <div class="kv"><span class="k">${zh ? '申请人姓名' : 'Name'}:</span><span class="v" style="font-weight:700">${esc(result.extracted_name || '—')}</span>${result.name_was_extracted ? `<span style="font-size:9px;color:#94A3B8;margin-left:6px">${zh ? '(AI 从文件提取)' : '(AI-extracted from documents)'}</span>` : ''}</div>
    <div class="kv"><span class="k">${zh ? '法院查询姓名' : 'Court search name'}:</span><span class="v">${esc(queriedName)}</span></div>
    <div class="kv"><span class="k">${zh ? '目标月租金' : 'Target rent'}:</span><span class="v">${result.monthly_rent ? '$' + result.monthly_rent.toLocaleString() + ' CAD' : '—'}</span></div>
    <div class="kv"><span class="k">${zh ? '提交文件' : 'Documents'}:</span><span class="v">${filesCount} ${zh ? '份' : 'file(s)'}${(result.detected_document_kinds || []).length ? ' — ' + esc((result.detected_document_kinds || []).join(', ')) : ''}</span></div>
  </div>`

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
    <div><div class="val">${dbCount}</div>${zh ? '法庭库已查' : 'Court DBs'}</div>
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
          ? (zh ? `已查 ${dbCount} 个数据库,无记录` : `${dbCount} databases searched, clear`)
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

    // Documents-reviewed table (FrontLobby-style evidence inventory):
    // every analyzed file with its per-file forensic verdict.
    if (fd.per_file && fd.per_file.length > 0) {
      html += `<table style="margin-top:6px">
        <tr><th>${zh ? '文件名' : 'File'}</th><th style="width:110px">${zh ? '识别类型' : 'Detected type'}</th><th style="width:80px;text-align:center">${zh ? '页数/大小' : 'Pages / Size'}</th><th style="width:90px;text-align:center">${zh ? '取证结果' : 'Verdict'}</th></tr>`
      for (const pf of fd.per_file) {
        const worst = pf.flags.reduce((acc, f) =>
          f.severity === 'critical' || f.severity === 'high' ? 'bad' : (acc === 'bad' ? 'bad' : f.severity === 'medium' ? 'warn' : acc), 'clean' as 'clean' | 'warn' | 'bad')
        const vColor = worst === 'bad' ? '#DC2626' : worst === 'warn' ? '#D97706' : '#16A34A'
        const vText = pf.flags.length === 0
          ? (zh ? '✓ 无异常' : '✓ Clean')
          : `${worst === 'bad' ? '✗' : '⚠'} ${pf.flags.length} ${zh ? '项' : 'flag(s)'}`
        const meta = pf.pdf_metadata
          ? `${pf.pdf_metadata.page_count}p · ${Math.round(pf.pdf_metadata.file_size_bytes / 1024)}KB`
          : '—'
        html += `<tr>
          <td style="word-break:break-all">${esc(pf.file_name)}</td>
          <td style="font-family:monospace;font-size:9px">${esc(pf.file_kind)}</td>
          <td style="text-align:center;font-size:9px">${meta}</td>
          <td style="text-align:center;color:${vColor};font-weight:700">${vText}</td>
        </tr>`
      }
      html += `</table>`
    }

    if (fd.all_flags.length > 0) {
      html += `<table style="margin-top:6px">
        <tr><th style="width:60px">${zh ? '严重度' : 'Severity'}</th><th style="width:120px">${zh ? '代码' : 'Code'}</th><th>${zh ? '详情' : 'Evidence'}</th><th style="width:100px">${zh ? '文件' : 'File'}</th></tr>`
      for (const f of fd.all_flags) {
        const sc = sevColor(f.severity)
        html += `<tr>
          <td><span class="flag-badge" style="background:${sc}">${zh ? ({ critical: '严重', high: '高', medium: '中', low: '低' }[f.severity] || f.severity) : f.severity.toUpperCase()}</span></td>
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
  <div class="kv"><span class="k">${zh ? '总命中数' : 'Total Hits'}:</span><span class="v" style="font-weight:700;color:${totalHits > 0 ? '#DC2626' : '#16A34A'}">${totalHits}</span></div>`

  // DB summary table
  const dbRows = courtQueries.filter(q =>
    !q.source.startsWith('──') && q.source !== 'rollup' && q.tier === 'free' &&
    (q.status === 'ok' || q.status === 'unavailable')
  )
  if (dbRows.length > 0) {
    html += `<table style="margin-top:6px">
      <tr><th>${zh ? '数据库' : 'Database'}</th><th style="width:60px;text-align:center">${zh ? '命中数' : 'Hits'}</th><th style="width:80px;text-align:center">${zh ? '风险等级' : 'Risk'}</th></tr>`
    for (const q of dbRows) {
      const hits = q.status === 'ok' ? (q.hits ?? 0) : -1
      const riskText = q.severity === 3 ? (zh ? '严重' : 'Critical') : q.severity === 2 ? (zh ? '高' : 'High') : q.severity === 1 ? (zh ? '中' : 'Medium') : (zh ? '无' : 'None')
      const riskColor = q.severity === 3 ? '#DC2626' : q.severity === 2 ? '#D97706' : q.severity === 1 ? '#1D4ED8' : '#16A34A'
      // Certn-style row tinting: green for cleared databases, red for hits
      const rowBg = hits > 0 ? 'background:#FEF2F2' : hits === 0 ? 'background:#F0FDF4' : ''
      html += `<tr>
        <td style="${rowBg}">${esc(q.source)}</td>
        <td style="${rowBg};text-align:center;font-weight:${hits > 0 ? '700' : '400'};color:${hits > 0 ? '#DC2626' : '#16A34A'}">${hits > 0 ? hits : hits === 0 ? (zh ? '✓ 无记录' : '✓ Clear') : (zh ? '不可用' : 'N/A')}</td>
        <td style="${rowBg};text-align:center;color:${riskColor};font-weight:600;font-size:10px">${hits === 0 ? '—' : riskText}</td>
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
        html += `<div style="margin-top:4px;font-size:10px"><span class="flag-badge" style="background:${sevColor(f.severity)}">${zh ? ({ critical: '严重', high: '高', medium: '中', low: '低' }[f.severity] || f.severity) : f.severity.toUpperCase()}</span>${esc(zh ? f.evidence_zh : f.evidence_en)}</div>`
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
      ? '本报告由 Stayloop AI 基于申请人自愿提交的文件自动生成,数据来源包括:上传文件的 AI 内容分析与确定性取证检测(PDF 元数据、文字密度、来源指纹、跨文档一致性)、CanLII 公开判例库、安大略省法院公开门户,以及加拿大公司注册公开数据。本报告不含信用局(Equifax/TransUnion)征信数据。'
      : 'This report was generated automatically by Stayloop AI from documents voluntarily submitted by the applicant. Data sources include: AI content analysis and deterministic forensics of the uploaded files (PDF metadata, text density, source fingerprints, cross-document consistency), the public CanLII case-law database, the Ontario Courts public portal, and public Canadian corporate-registry data. This report does NOT include credit-bureau (Equifax/TransUnion) data.'}</p>
    <p style="margin-bottom:5px">${zh
      ? '本报告仅可在申请人知情同意下,为订立或续订租赁协议之目的查看与使用,不得向无正当目的的第三方分发。依据《安大略省人权法典》,受保护特征(种族、国籍、宗教、性别、年龄、家庭状况、残障等)未被用于评分;详见合规审计一节。'
      : 'This report may only be viewed and used, with the applicant\'s knowledge and consent, in connection with entering into or renewing a tenancy agreement, and may not be distributed to third parties without a valid purpose. Per the Ontario Human Rights Code, protected grounds (race, nationality, religion, sex, age, family status, disability, etc.) were excluded from scoring — see the Compliance Audit section.'}</p>
    <p>${zh
      ? '评分为 AI 辅助评估,仅供参考,不构成法律、金融或租赁决策意见。最终决策责任由房东承担,建议结合面谈、推荐人核实与查档原件后综合判断。'
      : 'Scores are AI-assisted assessments for reference only and do not constitute legal, financial, or tenancy-decision advice. The final decision rests with the landlord; we recommend combining this report with interviews, reference checks, and original-document review.'}</p>
  </div>`

  // ── Footer ──
  html += `<div class="footer">
    Stayloop.ai &nbsp;|&nbsp; ${zh ? '此报告由 AI 自动生成，仅供参考，不构成法律意见' : 'AI-generated report — for reference only, not legal advice'} &nbsp;|&nbsp; ${date}${opts?.requestedBy ? ` &nbsp;|&nbsp; ${zh ? '申请方' : 'Requested by'}: ${esc(opts.requestedBy)}` : ''}
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
