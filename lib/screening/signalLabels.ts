// Plain-language labels for hard-gate and red-flag codes (three-role test
// report 2026-09-24, SL-L-06: the report and the done page printed raw codes
// like `cross_doc_contradictions` in both languages). Unknown codes fall back
// to a readable form of the code, never an empty string.
type L = { zh: string; en: string }

const LABELS: Record<string, L> = {
  // hard gates
  doc_tampering: { zh: '文件疑似被改动（取证）', en: 'Documents appear altered (forensics)' },
  producer_consumer_tool: { zh: '财务文件由消费级编辑工具生成', en: 'Financial document produced by a consumer editing tool' },
  pdf_fabrication_tool: { zh: 'PDF 由已知伪造工具生成', en: 'PDF produced by a known fabrication tool' },
  batch_forgery: { zh: '多份文件同一时刻批量生成', en: 'Several documents generated in one batch' },
  paystub_math_impossible: { zh: '工资单算术不可能成立', en: 'Pay stub arithmetic is impossible' },
  self_issued_employment: { zh: '在职证明疑似自己开具', en: 'Employment letter appears self-issued' },
  employer_fraud: { zh: '雇主疑似不存在或无法核实', en: 'Employer appears fake or unverifiable' },
  identity_mismatch: { zh: '各文件身份不一致', en: 'Identity differs across documents' },
  court_record_defendant: { zh: '法院记录：作为被告 / 债务人', en: 'Court record as defendant / debtor' },
  court_record_defendant_multi: { zh: '法院记录：多次作为被告', en: 'Multiple court records as defendant' },
  court_record_active: { zh: '有未结案的法院记录', en: 'Open court case on record' },
  // red flags
  cross_doc_contradictions: { zh: '文件之间有矛盾', en: 'Documents contradict each other' },
  coherence_anomaly: { zh: '材料整体一致性存疑', en: 'Package coherence issue' },
  self_issued_employment_letter: { zh: '在职证明疑似自己开具', en: 'Employment letter appears self-issued' },
  portal_name_match_unverified: { zh: '法院门户有同名记录（未佐证为本人）', en: 'Same-name court record (not confirmed as the applicant)' },
  residence_timeline_contradiction: { zh: '居住时间线与加拿大足迹矛盾', en: 'Residence timeline contradicts Canadian footprint' },
  no_linkedin_for_professional_role: { zh: '专业岗位但查不到职业档案', en: 'No professional profile found for the stated role' },
  court_record_strong_match: { zh: '法院记录与申请人强匹配', en: 'Court record strongly matches the applicant' },
  credit_report_age_inconsistent: { zh: '信用报告日期不一致', en: 'Credit report dates inconsistent' },
  id_format_invalid: { zh: '证件号码格式不符', en: 'ID number format invalid' },
  stale_documents: { zh: '材料过旧', en: 'Documents are out of date' },
  hr_phone_is_applicant: { zh: 'HR 电话就是申请人自己的电话', en: 'HR phone is the applicant’s own number' },
  volunteered_sin: { zh: '主动提供了 SIN 号', en: 'SIN volunteered' },
  // corroboration codes (rubric CORROBORATION_CODES — shown under 文件互证)
  payroll_processor_recognized: { zh: '工资由可识别的代发机构发放', en: 'Pay comes from a recognised payroll processor' },
  deposits_match_paystub_net: { zh: '银行入账等于工资单实发', en: 'Deposits equal the pay-stub net pay' },
  employer_registry_active: { zh: '雇主在注册库中处于活跃状态', en: 'Employer active in the corporate registry' },
  paystub_deductions_at_legal_max: { zh: '工资单扣缴已到法定上限（与真实工资单一致）', en: 'Pay-stub deductions at the statutory maximum' },
  cross_doc_bonus_corroborated: { zh: '奖金在多份文件中一致', en: 'Bonus corroborated across documents' },
  bonus_deposit_reconciled: { zh: '奖金入账与工资单对得上', en: 'Bonus deposit reconciles with the pay stub' },
  cross_doc_income_corroborated: { zh: '收入在多份文件中一致', en: 'Income corroborated across documents' },
  employer_counterparty_on_statement: { zh: '流水上出现雇主本身的付款', en: 'Employer appears as a counterparty on the statement' },
  paystub_ytd_one_off_reconciled: { zh: '年累计中的一次性项目已对账', en: 'Year-to-date one-off items reconciled' },
  // forensics_* (prefix stripped before lookup)
  pdf_producer_consumer_tool: { zh: 'PDF 由消费级编辑工具生成', en: 'PDF produced by a consumer editing tool' },
  timestamp_batch_creation: { zh: '多份文件创建时间几乎相同', en: 'Documents created at nearly the same time' },
  pdf_created_before_document_date: { zh: 'PDF 创建时间早于文件上的日期', en: 'PDF created before the date printed on it' },
  employer_registry_dissolved: { zh: '雇主在注册库中已注销', en: 'Employer dissolved in the corporate registry' },
  pdf_structure_pdflib_detected: { zh: 'PDF 结构显示由程序库拼装', en: 'PDF structure shows a programmatic library' },
  paystub_period_math_error: { zh: '工资单期间算术错误', en: 'Pay stub period arithmetic error' },
  paystub_generator_signature: { zh: '工资单带在线生成器特征', en: 'Pay stub carries an online generator signature' },
  employment_predates_incorporation: { zh: '入职日期早于公司成立', en: 'Employment starts before the company existed' },
  pdf_producer_paystub_doc_tool: { zh: '工资单由文档工具生成', en: 'Pay stub produced by a document tool' },
  document_stale: { zh: '文件过旧', en: 'Document is out of date' },
  all_ids_expired: { zh: '所有证件都已过期', en: 'All IDs are expired' },
  id_dl_surname_mismatch: { zh: '驾照号与姓氏不符', en: 'Licence number does not match the surname' },
  credit_report_date_conflict: { zh: '信用报告日期冲突', en: 'Credit report date conflict' },
  bank_producer_mismatch: { zh: '银行流水生成方与银行不符', en: 'Bank statement producer does not match the bank' },
  income_package_stale: { zh: '收入材料整体过旧', en: 'Income documents are out of date' },
}

export function signalLabel(code: string, zh: boolean): string {
  const c = String(code || '').trim()
  const hit = LABELS[c] ?? LABELS[c.replace(/^forensics_/, '')]
  if (hit) return zh ? hit.zh : hit.en
  // Free text (older rows stored sentences) passes through; codes become readable.
  if (!/^[a-z0-9_]+$/.test(c)) return c
  const words = c.replace(/^forensics_/, '').replace(/_/g, ' ')
  return zh ? `其他信号：${words}` : words.charAt(0).toUpperCase() + words.slice(1)
}
