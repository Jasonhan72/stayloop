// Plain labels for screening signal codes in the applicant's disclosure pack (site test 2026-10-17,
// E-D5): codes that lib/screening/signalLabels.ts does not cover fell back to the code's words
// (「其他信号：paystub unknown payroll system」), an English internal phrase in a document written
// for the applicant. This map covers the remaining codes the forensics / scoring modules emit, and
// a code nobody has labelled yet gets a plain category label by its prefix — never the raw code.
import { signalLabel } from '@/lib/screening/signalLabels'

type L = { zh: string; en: string }

const EXTRA: Record<string, L> = {
  // employer relationship (arm's length)
  arm_length_address_overlap: { zh: '雇主地址与申请人地址重合', en: 'Employer address overlaps the applicant’s address' },
  arm_length_applicant_is_officer: { zh: '申请人本人是雇主公司的负责人', en: 'The applicant is an officer of the employer' },
  arm_length_company_not_found: { zh: '注册库里没找到这家雇主', en: 'Employer not found in the corporate registry' },
  arm_length_family_business: { zh: '雇主疑似家族企业', en: 'Employer appears to be a family business' },
  arm_length_hr_phone_collision: { zh: '雇主联系电话与申请人有关', en: 'Employer contact phone is linked to the applicant' },
  arm_length_numbered_company: { zh: '雇主是编号公司', en: 'Employer is a numbered company' },
  arm_length_officers_unavailable: { zh: '查不到雇主公司的负责人信息', en: 'Employer officers could not be looked up' },
  arm_length_recent_incorporation: { zh: '雇主公司成立时间很短', en: 'Employer was incorporated recently' },
  arm_length_registry_not_configured: { zh: '雇主注册库未能查询', en: 'Corporate registry could not be checked' },
  arm_length_related_party_officer: { zh: '雇主负责人与申请人可能有关联', en: 'An employer officer may be related to the applicant' },
  arm_length_signatory_owner_family: { zh: '在职证明签字人与雇主所有人可能是家人', en: 'Letter signatory may be family of the employer’s owner' },
  arm_length_surname_in_employer: { zh: '雇主名称里含申请人的姓', en: 'Employer name contains the applicant’s surname' },
  arm_length_web_index_party_named: { zh: '网上资料把申请人列为雇主相关人', en: 'Public web pages name the applicant as a party of the employer' },
  // bank / statistics
  bank_statement_unknown_source: { zh: '银行流水来源无法识别', en: 'Bank statement source not recognised' },
  benford_anomaly: { zh: '金额数字分布不太寻常', en: 'Amounts show an unusual digit pattern' },
  benford_violation: { zh: '金额数字分布明显不寻常', en: 'Amounts show a strongly unusual digit pattern' },
  trailing_digits_round_anomaly: { zh: '金额尾数整数过多', en: 'Too many round amounts' },
  trailing_digits_too_round: { zh: '金额尾数过于整齐', en: 'Amounts are unusually round' },
  recurring_rent_like_payment: { zh: '流水里有类似房租的定期付款', en: 'Statement shows a recurring rent-like payment' },
  pay_method_mismatch: { zh: '工资发放方式与其他材料不一致', en: 'Pay method differs from other documents' },
  // business number / registry
  bn_employer_mismatch: { zh: '营业号与雇主名称不符', en: 'Business number does not match the employer' },
  bn_not_in_federal_registry: { zh: '联邦注册库里查不到这个营业号', en: 'Business number not found in the federal registry' },
  employer_address_differs_from_registry: { zh: '雇主地址与注册库记录不同', en: 'Employer address differs from the registry' },
  employer_bank_act_listed: { zh: '雇主是《银行法》登记的银行', en: 'Employer is a bank listed under the Bank Act' },
  employer_contact_personal_email: { zh: '雇主联系邮箱是个人邮箱', en: 'Employer contact uses a personal email' },
  employer_court_cases: { zh: '雇主有法院案件记录', en: 'Employer has court cases on record' },
  employer_court_cases_lender_routine: { zh: '雇主有常规的债权类法院案件', en: 'Employer has routine lender court cases' },
  employer_domain_unregistered: { zh: '雇主网站域名未注册', en: 'Employer web domain is not registered' },
  employer_domain_younger_than_employment: { zh: '雇主网站域名比入职时间还新', en: 'Employer web domain is newer than the employment' },
  employer_employment_predates_incorporation: { zh: '入职日期早于公司成立', en: 'Employment starts before the company existed' },
  employer_letter_digit_glyph_artifact: { zh: '在职证明上的数字字形有异常', en: 'Digits on the employment letter look altered' },
  employer_phone_region_differs: { zh: '雇主电话区号与地址不符', en: 'Employer phone area code differs from its address' },
  employer_registry_inactive: { zh: '雇主在注册库中不是活跃状态', en: 'Employer inactive in the corporate registry' },
  employer_registry_unmatched: { zh: '注册库里没找到对得上的雇主', en: 'No matching employer in the corporate registry' },
  employer_tax_default_notice: { zh: '雇主有欠税公告', en: 'Employer has a tax default notice' },
  employer_trade_name: { zh: '雇主用的是商号（非注册法人名）', en: 'Employer uses a trade name' },
  // credit
  bureau_delinquency_history: { zh: '信用报告有逾期记录', en: 'Credit report shows late payments' },
  collection_agency_on_file: { zh: '信用报告有催账机构记录', en: 'Collection agency on the credit report' },
  court_vs_bureau_contradiction: { zh: '法院记录与信用报告对不上', en: 'Court records and credit report disagree' },
  credit_report_ai_judged_fake: { zh: '信用报告疑似不是征信机构出具', en: 'Credit report may not come from a credit bureau' },
  credit_report_ai_verified: { zh: '信用报告格式符合征信机构文件', en: 'Credit report matches a credit bureau format' },
  credit_report_no_bureau_markers: { zh: '信用报告缺少征信机构标识', en: 'Credit report lacks credit bureau markers' },
  credit_report_subject_mismatch: { zh: '信用报告上的姓名与申请人不符', en: 'Credit report names someone other than the applicant' },
  credit_report_thin_bureau_markers: { zh: '信用报告的征信机构标识很少', en: 'Credit report has few credit bureau markers' },
  credit_tradelines_predate_dob: { zh: '信用记录的开户日期早于出生日期', en: 'Credit accounts opened before the date of birth' },
  // cross-document
  cross_doc_income_mismatch: { zh: '各文件上的收入对不上', en: 'Income differs across documents' },
  cross_doc_income_near_match: { zh: '各文件上的收入基本一致', en: 'Income nearly matches across documents' },
  cross_doc_landlord_is_applicant: { zh: '前房东联系方式就是申请人自己', en: 'Previous landlord contact is the applicant' },
  cross_doc_phone_collision: { zh: '不同联系人用了同一个电话', en: 'Different contacts share one phone number' },
  cross_doc_phone_geo_mismatch: { zh: '电话区号与所在地不符', en: 'Phone area code does not match the location' },
  cross_doc_residence_timeline_contradiction: { zh: '各文件的居住时间线对不上', en: 'Residence timeline differs across documents' },
  document_spelling_errors: { zh: '文件里有拼写错误', en: 'Spelling errors in a document' },
  letter_phone_inconsistent: { zh: '信件上的电话与其他材料不一致', en: 'Phone on a letter differs from other documents' },
  name_spelling_variation: { zh: '各文件上的姓名拼写略有不同', en: 'Name spelled slightly differently across documents' },
  scan_content_recognized: { zh: '扫描件内容已识别', en: 'Scanned content was read' },
  // identity documents
  id_dl_dob_match: { zh: '驾照号与出生日期一致', en: 'Licence number matches the date of birth' },
  id_dl_dob_mismatch: { zh: '驾照号与出生日期不符', en: 'Licence number does not match the date of birth' },
  id_dl_surname_match: { zh: '驾照号与姓氏一致', en: 'Licence number matches the surname' },
  id_expired: { zh: '证件已过期', en: 'ID is expired' },
  id_expiring_soon: { zh: '证件即将过期', en: 'ID expires soon' },
  id_ohip_invalid_format: { zh: '安省医保卡号格式不对', en: 'OHIP number format invalid' },
  id_sin_checksum_unverified: { zh: 'SIN 号校验未能完成', en: 'SIN check digit not verified' },
  id_sin_invalid_checksum: { zh: 'SIN 号校验位不对', en: 'SIN check digit invalid' },
  pr_card_expired: { zh: '枫叶卡已过期', en: 'PR card is expired' },
  // pay stubs
  paystub_deduction_cap_income_mismatch: { zh: '工资单扣缴上限与收入对不上', en: 'Pay-stub deduction caps do not fit the income' },
  paystub_deduction_exceeds_legal_max: { zh: '工资单扣缴超过法定上限', en: 'Pay-stub deductions exceed the statutory maximum' },
  paystub_deduction_rate_mismatch: { zh: '工资单扣缴比例不对', en: 'Pay-stub deduction rates are off' },
  paystub_fields_unreliable: { zh: '工资单部分内容读不准', en: 'Some pay-stub fields could not be read reliably' },
  paystub_hours_partial_line: { zh: '工资单工时行不完整', en: 'Pay-stub hours line is incomplete' },
  paystub_math_needs_verification: { zh: '工资单算术需要人工核对', en: 'Pay-stub arithmetic needs a manual check' },
  paystub_period_deductions_verified: { zh: '工资单本期扣缴核对无误', en: 'Pay-stub period deductions check out' },
  paystub_period_math_variance: { zh: '工资单本期算术有小出入', en: 'Small arithmetic difference on the pay stub' },
  paystub_pregenerated_before_payday: { zh: '工资单生成时间早于发薪日', en: 'Pay stub created before its pay date' },
  paystub_rate_reclassified: { zh: '工资单费率已按实际重新归类', en: 'Pay-stub rate was reclassified' },
  paystub_statutory_rates_systematically_off: { zh: '工资单法定扣缴比例整体不对', en: 'Pay-stub statutory rates are consistently off' },
  paystub_unknown_payroll_system: { zh: '工资单来自无法识别的发薪系统', en: 'Pay stub comes from an unrecognised payroll system' },
  paystub_ytd_above_pro_rata: { zh: '工资单年累计高于按月推算', en: 'Pay-stub year-to-date is above the pro-rated amount' },
  paystub_ytd_inflated: { zh: '工资单年累计疑似偏高', en: 'Pay-stub year-to-date appears inflated' },
  paystub_ytd_net_mismatch: { zh: '工资单年累计实发对不上', en: 'Pay-stub year-to-date net does not add up' },
  paystub_ytd_too_low: { zh: '工资单年累计偏低', en: 'Pay-stub year-to-date is too low' },
  // PDF properties
  pdf_author_personal: { zh: 'PDF 作者是个人名字', en: 'PDF author is a personal name' },
  pdf_encrypted: { zh: 'PDF 已加密', en: 'PDF is encrypted' },
  pdf_excessive_fonts: { zh: 'PDF 字体数量异常多', en: 'PDF uses an unusual number of fonts' },
  pdf_freshly_created: { zh: 'PDF 是刚生成的', en: 'PDF was created very recently' },
  pdf_incremental_update: { zh: 'PDF 生成后被追加修改过', en: 'PDF was edited after it was created' },
  pdf_info_revisions: { zh: 'PDF 信息有多次修订', en: 'PDF information was revised' },
  pdf_low_text_density: { zh: 'PDF 文字很少', en: 'PDF has little text' },
  pdf_metadata_stripped: { zh: 'PDF 文件属性被清除', en: 'PDF properties were removed' },
  pdf_mixed_font_families: { zh: 'PDF 混用了多种字体', en: 'PDF mixes font families' },
  pdf_modified_long_after_creation: { zh: 'PDF 在生成很久后被修改', en: 'PDF modified long after it was created' },
  pdf_oversized_for_text: { zh: 'PDF 文件大小与内容不相称', en: 'PDF is large for its content' },
  pdf_parse_failed: { zh: 'PDF 无法读取', en: 'PDF could not be read' },
  pdf_pdflib_font_signature: { zh: 'PDF 字体显示由程序库生成', en: 'PDF fonts show a programmatic library' },
  pdf_producer_consumer_tool_selfauthored: { zh: 'PDF 由个人用编辑工具生成', en: 'PDF produced by a personal editing tool' },
  pdf_producer_unknown: { zh: 'PDF 生成工具无法识别', en: 'PDF producer not recognised' },
  pdf_pure_image: { zh: 'PDF 只有图片没有文字', en: 'PDF is image-only' },
  pdf_reencrypted_after_edit: { zh: 'PDF 修改后重新加密', en: 'PDF re-encrypted after an edit' },
  pdf_structure_pdflib_bureau_portal: { zh: 'PDF 结构符合征信机构网站导出', en: 'PDF structure matches a credit bureau portal export' },
  pdf_structure_pdflib_enterprise: { zh: 'PDF 结构符合企业系统导出', en: 'PDF structure matches an enterprise system export' },
  pdf_title_indicates_image: { zh: 'PDF 标题显示是图片转换的', en: 'PDF title shows it was converted from an image' },
  pdf_title_office_source: { zh: 'PDF 标题显示来自办公软件', en: 'PDF title shows an office-software source' },
  pdf_unusually_short: { zh: 'PDF 篇幅异常短', en: 'PDF is unusually short' },
  timestamp_just_created: { zh: '文件是刚刚生成的', en: 'File was created just now' },
  // processing states
  file_unreadable: { zh: '文件无法读取', en: 'File could not be read' },
  forensics_error: { zh: '文件核查没能完成', en: 'Document check could not finish' },
  forensics_init_error: { zh: '文件核查没能启动', en: 'Document check could not start' },
  in_progress: { zh: '核查进行中', en: 'Check in progress' },
  no_documents: { zh: '没有可核查的文件', en: 'No documents to check' },
}

const PREFIX: Array<[RegExp, L]> = [
  [/^pdf_/, { zh: 'PDF 文件属性提示', en: 'PDF file property note' }],
  [/^(paystub|payroll)_/, { zh: '工资单核对提示', en: 'Pay-stub check note' }],
  [/^(employer|employment|bn)_/, { zh: '雇主核实提示', en: 'Employer check note' }],
  [/^arm_length_/, { zh: '雇主与申请人关系提示', en: 'Employer relationship note' }],
  [/^(id|pr_card|sin)_/, { zh: '证件核对提示', en: 'ID check note' }],
  [/^(credit|bureau)_/, { zh: '信用报告核对提示', en: 'Credit report check note' }],
  [/^cross_doc_/, { zh: '文件互相对照提示', en: 'Cross-document check note' }],
  [/^(bank|deposit)_/, { zh: '银行流水核对提示', en: 'Bank statement check note' }],
  [/^court_/, { zh: '法院记录提示', en: 'Court record note' }],
]

/** The applicant-facing label for a signal code: signalLabels.ts first, then this map, then a plain category label. */
export function packSignalLabel(code: string, zh: boolean): string {
  const c = String(code || '').trim()
  if (!/^[a-z0-9_]+$/.test(c)) return signalLabel(c, zh) // free text from older rows passes through
  const bare = c.replace(/^forensics_/, '')
  const extra = EXTRA[c] ?? EXTRA[bare]
  if (extra) return zh ? extra.zh : extra.en
  const base = signalLabel(c, zh)
  const fallback = zh ? `其他信号：${bare.replace(/_/g, ' ')}` : bare.charAt(0).toUpperCase() + bare.slice(1).replace(/_/g, ' ')
  if (base !== fallback) return base
  const cat = PREFIX.find(([re]) => re.test(bare))?.[1]
  return cat ? (zh ? cat.zh : cat.en) : zh ? '其他核查提示' : 'Other check note'
}
