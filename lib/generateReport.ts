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
    per_file: Array<{ file_name: string; file_kind: string; flags: Array<{ code: string; severity: string; evidence_en: string; evidence_zh: string }> }>
    cross_doc_flags: Array<{ code: string; severity: string; evidence_en: string; evidence_zh: string }>
  } | null
  forensics_zeroed_dims?: string[]
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

// ─── Main ─────────────────────────────────────────────────────────
export async function generateScreeningReport(
  result: ScoreResult,
  lang: 'en' | 'zh',
  filesCount: number,
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

  // ── 1. Overall Score ──
  html += `<div class="score-box">
    <div style="font-size:12px;color:#64748B;margin-bottom:4px">${zh ? '综合风险评估' : 'Overall Risk Assessment'}</div>
    <div style="font-size:16px;font-weight:700;color:#0B1736;margin-bottom:8px">${esc(result.extracted_name || '—')}</div>
    <div class="score-num">${result.overall}</div>
    <div class="score-sub">/ 100</div>
    <div class="risk-pill">${esc(risk.text)}</div>`

  if (result.v3_tier) {
    const tierMap: Record<string, string> = zh
      ? { approve: '建议通过', conditional: '附加条件', decline: '建议拒绝' }
      : { approve: 'Approve', conditional: 'Conditional', decline: 'Decline' }
    html += `<div style="margin-top:8px;font-size:11px;color:#64748B">${zh ? '决策建议' : 'Decision'}: <strong>${tierMap[result.v3_tier] || result.v3_tier}</strong>`
    if (result.hard_gates_triggered && result.hard_gates_triggered.length > 0) {
      html += ` &nbsp;·&nbsp; ${zh ? '触发硬门槛' : 'Hard gate'}: ${esc(result.hard_gates_triggered.join(', '))}`
    }
    html += `</div>`
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
  if (result.effective_monthly_income != null) {
    html += `<div style="margin-top:8px;font-size:10px;color:#64748B">${zh ? '检测到月收入' : 'Detected income'}: <strong>$${result.effective_monthly_income.toLocaleString()}</strong>${result.income_evidence ? ' · ' + esc(result.income_evidence) : ''}</div>`
  }
  html += `</div>`

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
    html += `<tr>
      <td style="font-weight:600">${zh ? dim.zhLabel : dim.enLabel}</td>
      <td style="text-align:center">${(dim.weight * 100).toFixed(0)}%</td>
      <td style="text-align:center;font-weight:700;color:${sc != null ? scoreColor(sc) : '#64748B'}">${sc ?? '—'}${zeroed ? ' <span style="color:#DC2626;font-size:9px">⚠</span>' : ''}</td>
      <td>${esc(detail)}${zeroed ? ` <span style="color:#DC2626;font-size:9px">(${zh ? '取证归零' : 'Forensics zeroed'})</span>` : ''}</td>
    </tr>`
  }
  html += `</table>`

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
      html += `<tr>
        <td>${esc(q.source)}</td>
        <td style="text-align:center;font-weight:${hits > 0 ? '700' : '400'};color:${hits > 0 ? '#DC2626' : '#334155'}">${hits >= 0 ? hits : (zh ? '不可用' : 'N/A')}</td>
        <td style="text-align:center;color:${riskColor};font-weight:600;font-size:10px">${riskText}</td>
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

  // ── Footer ──
  html += `<div class="footer">
    Stayloop.ai &nbsp;|&nbsp; ${zh ? '此报告由 AI 自动生成，仅供参考，不构成法律意见' : 'AI-generated report — for reference only, not legal advice'} &nbsp;|&nbsp; ${date}
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
