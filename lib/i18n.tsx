'use client'
import { createContext, useContext, useEffect, useState, ReactNode } from 'react'

export type Lang = 'en' | 'zh'
export type Currency = 'CAD' | 'USD' | 'CNY' | 'EUR' | 'GBP' | 'JPY' | 'KRW' | 'INR' | 'HKD' | 'AUD'

export const CURRENCIES: { code: Currency; symbol: string; label: string; labelZh: string }[] = [
  { code: 'CAD', symbol: 'CA$', label: 'Canadian dollar', labelZh: '加元' },
  { code: 'USD', symbol: 'US$', label: 'United States dollar', labelZh: '美元' },
  { code: 'CNY', symbol: '¥', label: 'Chinese yuan', labelZh: '人民币' },
  { code: 'EUR', symbol: '€', label: 'Euro', labelZh: '欧元' },
  { code: 'GBP', symbol: '£', label: 'British pound', labelZh: '英镑' },
  { code: 'JPY', symbol: '¥', label: 'Japanese yen', labelZh: '日元' },
  { code: 'KRW', symbol: '₩', label: 'South Korean won', labelZh: '韩元' },
  { code: 'INR', symbol: '₹', label: 'Indian rupee', labelZh: '印度卢比' },
  { code: 'HKD', symbol: 'HK$', label: 'Hong Kong dollar', labelZh: '港元' },
  { code: 'AUD', symbol: 'A$', label: 'Australian dollar', labelZh: '澳元' },
]

export const LANGUAGES: { code: Lang; label: string; labelLocal: string }[] = [
  { code: 'en', label: 'English', labelLocal: 'English' },
  { code: 'zh', label: 'Chinese (Simplified)', labelLocal: '简体中文' },
]

// ─── Dictionary ────────────────────────────────────────────────
// Keys are loose strings; every key must exist in both languages.

export const DICT = {
  // Common / nav / buttons
  'nav.signin': { en: 'Sign in', zh: '登录' },
  'nav.register': { en: 'Register', zh: '注册' },
  'nav.profile': { en: 'Account settings', zh: '账户设置' },
  'nav.settings': { en: 'Settings', zh: '设置' },
  'nav.listings': { en: 'Listings', zh: '房源' },
  'nav.tenants': { en: 'Tenant', zh: '租客' },
  'nav.landlords': { en: 'Landlord', zh: '房东' },
  'nav.agents': { en: 'Agent', zh: '经纪' },
  'nav.product': { en: 'I’m a…', zh: '我是' },
  'nav.pricing': { en: 'Pricing', zh: '定价' },
  'nav.screening': { en: 'Screening', zh: '租客筛查' },
  'nav.screenings': { en: 'Screenings', zh: '租客筛查' },
  'nav.login': { en: 'Sign in', zh: '登录' },
  'nav.signOut': { en: 'Sign out', zh: '退出登录' },
  'nav.newScreening': { en: 'New screening', zh: '新建租客筛查' },
  'nav.getStarted': { en: 'Get started →', zh: '开始使用 →' },
  'nav.dashboard': { en: 'Dashboard →', zh: '控制台 →' },
  'nav.back': { en: '← stayloop.ai', zh: '← stayloop.ai' },
  'nav.signout': { en: 'Sign out', zh: '退出' },
  'common.loading': { en: 'Loading…', zh: '加载中…' },
  'common.authenticating': { en: 'Authenticating…', zh: '认证中…' },
  'common.cancel': { en: 'Cancel', zh: '取消' },
  'common.save': { en: 'Save', zh: '保存' },
  'common.delete': { en: 'Delete', zh: '删除' },
  'common.upgrade': { en: 'Upgrade', zh: '升级' },
  'common.free': { en: 'Free', zh: '免费版' },
  'common.pro': { en: 'Pro', zh: '订阅版' },

  // Onboarding · Tier 1 (身份章 · 90 秒身份验证)
  'onb.hi': { en: "Hi, I'm your AI agent.", zh: '嗨，我是你的 AI Agent。' },
  'onb.line2': { en: "First, let's verify your identity — 90 seconds.", zh: '先花 90 秒，验明你的身份。' },
  'onb.body': {
    en: 'This is your identity stamp — the first of four. Just your passport or licence plus a quick selfie — Persona handles it securely. A soft check that never touches your credit.',
    zh: '这是 身份章 —— 四枚章的第一枚。只需护照 / 驾照 + 一张自拍，Persona 帮你安全完成。软查不影响信用。',
  },
  'onb.f1': { en: 'Passport, driver’s licence, or PR card', zh: '护照 / 驾照 / PR 卡，三选一' },
  'onb.f2': { en: 'A quick liveness selfie to confirm it’s you', zh: '活体自拍，确认是你本人' },
  'onb.f3': { en: 'Encrypted end-to-end · your data stays yours · delete anytime', zh: '全程加密 · 资料只属于你 · 随时可删' },
  'onb.cta1': { en: '✓ Start · identity stamp · ~90 seconds', zh: '✓ 开始 · 盖身份章 · 约 90 秒' },
  'onb.cta2': { en: 'Just browse listings first', zh: '先随便逛逛房源' },
  'onb.foot': { en: 'Stronger than 90% of Kijiji inquiries — landlords notice.', zh: '比 90% 的 Kijiji 询盘更让房东放心。' },

  // Listing card + footer
  'common.bd': { en: 'bd', zh: '卧' },
  'common.ba': { en: 'ba', zh: '卫' },
  'listings.matchScore': { en: 'match', zh: '匹配' },
  'foot.tag': { en: 'The AI-native rental OS. Verify once, reuse everywhere.', zh: '为 AI 时代打造的租住操作系统。验证一次，处处通行。' },
  'foot.copy': { en: '© 2026 Stayloop Inc. · PIPEDA · OHRC · RTA compliant', zh: '© 2026 Stayloop Inc. · PIPEDA · OHRC · RTA 合规' },
  // Footer · column titles
  'foot.product': { en: 'Product', zh: '产品' },
  'foot.forWhom': { en: "Who it's for", zh: '为谁打造' },
  'foot.company': { en: 'Company', zh: '公司' },
  // Footer · product links
  'foot.pricing': { en: 'Pricing', zh: '定价' },
  'foot.trustApi': { en: 'Trust API', zh: 'Trust API' },
  'foot.screening': { en: 'Screening', zh: '租客筛查' },
  'foot.passport': { en: 'Tenant Passport', zh: '租客护照' },
  'foot.disputes': { en: 'Disputes', zh: '争议解决' },
  // Footer · for-whom links
  'foot.tenants': { en: 'Tenants', zh: '租客' },
  'foot.landlords': { en: 'Landlords', zh: '房东' },
  'foot.agents': { en: 'Agents', zh: '经纪' },
  'foot.partners': { en: 'Partners', zh: '合作伙伴' },
  // Footer · company links
  'foot.about': { en: 'About', zh: '关于' },
  'foot.privacy': { en: 'Privacy', zh: '隐私' },
  'foot.terms': { en: 'Terms', zh: '使用条款' },
  'foot.contact': { en: 'Contact', zh: '联系' },
  'foot.admin': { en: 'Admin', zh: '后台管理' },

  // Screen page
  'screen.title': { en: 'Stayloop Screening', zh: 'Stayloop Screening' },
  'screen.subtitle': { en: 'AI Tenant Risk Assessment v1.1', zh: 'AI 租客风控评估系统 v1.1' },
  'screen.new': { en: '+ New', zh: '+ 新评估' },
  'screen.tier.free.sources': { en: 'CanLII public records', zh: 'CanLII 公开记录' },
  'screen.tier.pro.sources': { en: 'CanLII + Ontario Courts + Verified Network', zh: 'CanLII + Ontario Courts + Verified Network' },
  'screen.form.name.label': { en: 'Applicant Name (optional)', zh: '申请人姓名（可选）' },
  'screen.form.name.placeholder': { en: 'Leave blank to auto-extract from files', zh: '留空则从文件中自动提取' },
  'screen.form.name.hint': {
    en: 'If blank, we extract the name from ID / Employment Letter / Pay Stub for the court records lookup.',
    zh: '未填写时，系统将从 ID / Employment Letter / Pay Stub 中自动提取姓名用于法庭记录查询',
  },
  'screen.form.rent.label': { en: 'Target Monthly Rent (CAD)', zh: '目标月租金 (CAD)' },
  'screen.form.rent.placeholder': { en: 'e.g. 2500', zh: '例如 2500' },
  'screen.upload.filesUploaded': { en: 'files uploaded', zh: '个文件已上传' },
  'screen.tier.pro': { en: 'Pro', zh: '专业' },
  'screen.tier.free': { en: 'FREE', zh: '免费版' },
  'screen.tier.freeCanlii': { en: 'Go · CanLII', zh: '起步 · CanLII' },
  'screen.tier.proLong': { en: 'Pro', zh: '专业' },
  'screen.tier.freeLong': { en: 'Free', zh: '免费版' },
  'screen.result.court.hitsLabel': { en: 'hit(s)', zh: '条命中' },
  'screen.result.footer.dataSource': { en: 'CanLII (canlii.org)', zh: 'CanLII (canlii.org)' },
  'screen.result.footer.dataSourcePro': { en: ' + Ontario Courts Portal', zh: ' + Ontario Courts Portal' },
  'screen.drop.title': { en: 'Drop tenant application files here', zh: '拖放租客申请文件到这里' },
  'screen.drop.sub': {
    en: 'PDF, JPG, PNG, DOC — Employment Letter, Pay Stubs, Bank Statements, ID, Credit Report…',
    zh: '支持 PDF, JPG, PNG, DOC — Employment Letter, Pay Stubs, Bank Statements, ID, Credit Report 等',
  },
  'screen.drop.pick': { en: '📎 Choose files', zh: '📎 选择文件' },
  'screen.filetype.employment': { en: 'Employment Letter', zh: 'Employment Letter' },
  'screen.filetype.paystub': { en: 'Pay Stubs', zh: 'Pay Stubs' },
  'screen.filetype.bank': { en: 'Bank Statements', zh: 'Bank Statements' },
  'screen.filetype.id': { en: 'ID / Passport', zh: 'ID / Passport' },
  'screen.filetype.credit': { en: 'Credit Report', zh: 'Credit Report' },
  'screen.filetype.offer': { en: 'Offer / Study Permit', zh: 'Offer / Study Permit' },
  'screen.filetype.reference': { en: 'Landlord Reference', zh: 'Landlord Reference' },
  'screen.filetype.other': { en: 'Other Documents', zh: 'Other Documents' },
  'screen.files.uploadedN': { en: 'Uploaded {n} file(s)', zh: '已上传 {n} 个文件' },
  'screen.files.auto.name': { en: `Will use "{name}"`, zh: '将使用「{name}」' },
  'screen.files.auto.extract': { en: 'Will extract name from files', zh: '将从文件中提取姓名' },
  'screen.files.auto.sources.pro': { en: 'and query CanLII + Ontario Courts + Verified Network automatically', zh: '自动查询 CanLII + Ontario Courts + Stayloop Verified Network — 全程自动' },
  'screen.files.auto.sources.free': { en: 'and query CanLII LTB public rulings automatically', zh: '自动查询 CanLII LTB 公开裁决 — 全程自动' },
  'screen.submit': { en: '🔍 Start AI Risk Analysis', zh: '🔍 开始 AI 风控分析' },
  'screen.submit.pro': { en: ' · Pro', zh: ' · Pro' },
  'screen.err.min': { en: 'Please upload at least one file or enter an applicant name', zh: '请至少上传一个文件或填写申请人姓名' },
  'screen.err.tooBig': { en: '{name} is over 10 MB', zh: '{name} 超过 10 MB' },
  'screen.err.unknown': { en: 'Unknown error', zh: '未知错误' },

  // Analysis progress labels
  'screen.step.meta': { en: 'Reading document metadata…', zh: '读取文档元数据...' },
  'screen.step.ocr': { en: 'OCR text extraction…', zh: 'OCR 文字提取中...' },
  'screen.step.extractName': { en: '📛 Extracting applicant name from files…', zh: '📛 从文件中提取申请人姓名...' },
  'screen.step.auth': { en: 'Document authenticity check…', zh: '文档真伪验证...' },
  'screen.step.finance': { en: 'Financial data analysis…', zh: '财务数据分析...' },
  'screen.step.canlii': { en: '🔍 Querying CanLII LTB public rulings…', zh: '🔍 查询 CanLII LTB 公开裁决...' },
  'screen.step.ontarioCourts': { en: '🔍 Querying Ontario Courts civil records…', zh: '🔍 查询 Ontario Courts 民事记录...' },
  'screen.step.network': { en: '🔍 Querying Stayloop Verified Network…', zh: '🔍 查询 Stayloop Verified Network...' },
  'screen.step.cross': { en: 'Cross-verification…', zh: '交叉信息校验...' },
  'screen.step.behavior': { en: 'Behavioral signals…', zh: '行为信号分析...' },
  'screen.step.risk': { en: 'Risk model calculation…', zh: '风险模型计算...' },
  'screen.step.report': { en: 'Generating report…', zh: '生成评估报告...' },
  'screen.step.start': { en: 'Starting analysis…', zh: '启动分析...' },
  'screen.analyzing.court.pro': { en: 'Querying public court records · Pro full query', zh: '正在查询公开法庭记录 · Pro 全量查询' },
  'screen.analyzing.court.free': { en: 'Querying public court records · Basic query', zh: '正在查询公开法庭记录 · 基础查询' },
  'screen.analyzing.name': { en: 'Identifying applicant from files…', zh: '正在从文件中识别申请人信息...' },
  'screen.analyzing.files': { en: 'Analyzing {n} file(s)…', zh: '正在分析 {n} 个文件...' },

  // Results
  'screen.result.headline': { en: 'OVERALL RISK ASSESSMENT', zh: '综合风险评估' },
  'screen.result.nameExtracted': { en: '📛 Name auto-extracted from files', zh: '📛 姓名从申请文件中自动提取' },
  'screen.result.stat.rent': { en: 'Target rent', zh: '目标月租金' },
  'screen.result.stat.files': { en: 'Files analyzed', zh: '文件已分析' },
  'screen.result.stat.courts': { en: 'Court DBs queried', zh: '法庭库已查' },
  'screen.result.stat.ratio': { en: 'Income / Rent', zh: '收入/租金比' },
  'screen.result.summary': { en: '📝 AI Risk Summary', zh: '📝 AI 风险摘要' },
  'screen.result.authenticity.title': { en: '🛡 Document Authenticity', zh: '🛡 资料真实性' },
  'screen.result.authenticity.sub': { en: 'Tap to see document verification details', zh: '点击查看资料核验细节' },
  'screen.result.authenticity.status.verified': { en: 'Verified — no tampering detected', zh: '已核验 — 未发现造假迹象' },
  'screen.result.authenticity.status.concerning': { en: 'Some concerns — review required', zh: '存在疑点 — 需人工复核' },
  'screen.result.authenticity.status.suspicious': { en: 'Suspicious — possible tampering', zh: '高度可疑 — 可能造假' },
  'screen.result.authenticity.score': { en: 'Authenticity score', zh: '真实性评分' },
  'screen.result.authenticity.idMatch': { en: 'Identity cross-match', zh: '身份交叉核验' },
  'screen.result.authenticity.docCheck': { en: 'Document tampering check', zh: '文件篡改检测' },
  'screen.result.authenticity.employerCheck': { en: 'Employer verification', zh: '雇主核实' },
  'screen.result.authenticity.crossDoc': { en: 'Cross-document consistency', zh: '跨文件一致性' },
  'screen.result.authenticity.aiNote': { en: 'AI verification notes', zh: 'AI 核验备注' },
  'screen.result.authenticity.gatesTriggered': { en: 'Hard gates triggered', zh: '已触发硬门槛' },
  'screen.result.authenticity.flagsTriggered': { en: 'Related red flags', zh: '相关红旗信号' },
  'screen.result.authenticity.cov.measured': { en: 'Measured from docs', zh: '从文件中直接测得' },
  'screen.result.authenticity.cov.inferred': { en: 'Inferred from adjacent evidence', zh: '由相邻证据推断' },
  'screen.result.authenticity.cov.action_pending': { en: 'Needs landlord action', zh: '需房东手动核实' },
  'screen.result.authenticity.cov.missing': { en: 'No evidence available', zh: '暂无证据' },
  'screen.result.authenticity.docCheck.desc': { en: 'Checks file metadata, font consistency, and photoshop traces', zh: '检查文件元数据、字体一致性与 PS 痕迹' },
  'screen.result.authenticity.idMatch.desc': { en: 'Cross-checks name, DOB and address across ID, pay stubs and bank statements', zh: '比对证件、工资单与银行流水中的姓名、出生日期与地址' },
  'screen.result.authenticity.employerCheck.desc': { en: 'Verifies employer name, start date and salary consistency across docs', zh: '核验各文件中雇主名称、入职日期与薪资信息的一致性' },
  'screen.result.court.unavailable': { en: 'Temporarily unavailable', zh: '暂不可用' },
  'screen.result.court.skipped': { en: 'Skipped — no name provided', zh: '已跳过 — 未提供姓名' },
  'screen.result.authenticity.gate.doc_tampering': { en: 'Visible tampering / photoshop / font anomalies', zh: '可见篡改 / PS / 字体异常' },
  'screen.result.authenticity.gate.identity_mismatch': { en: 'Identity mismatch across documents', zh: '跨文件身份不一致' },
  'screen.result.authenticity.gate.employer_fraud': { en: 'Employer appears fake or unverifiable', zh: '雇主疑似造假或无法核实' },
  'screen.result.authenticity.flag.cross_doc_contradictions': { en: 'Contradictions between documents', zh: '文件之间存在矛盾' },
  'screen.result.authenticity.flag.hr_phone_is_applicant': { en: 'HR phone matches applicant phone', zh: 'HR 电话与申请人电话相同' },
  'screen.result.authenticity.flag.no_linkedin_for_professional_role': { en: 'No LinkedIn for stated professional role', zh: '声称专业职位但无 LinkedIn' },
  'screen.result.authenticity.flag.volunteered_sin': { en: 'Applicant volunteered SIN (unnecessary)', zh: '申请人主动提供 SIN（非必要）' },
  'screen.result.dims': { en: '📊 Category breakdown · 5 dimensions', zh: '📊 分项评分明细 · 5 个维度' },
  'screen.result.disclaimer.title': { en: '⚠ Important Disclaimer', zh: '⚠ 重要免责声明' },
  'screen.result.disclaimer.body1': {
    en: 'This report is generated by an AI risk model and is provided for informational and reference purposes only. It does not constitute legal, financial, credit, or professional advice, nor is it a consumer credit report issued by a federally regulated credit reporting agency.',
    zh: '本报告由 AI 风险模型自动生成，仅供信息参考使用，不构成任何法律、财务、信贷或专业建议，也不属于受加拿大联邦监管的信用报告机构出具的消费信用报告。'
  },
  'screen.result.disclaimer.body2': {
    en: 'The final leasing decision rests solely with the property owner or authorized agent. Before making any decision, the owner must independently verify all material information — including identity, income, employment, credit history, and prior rental references — through direct contact, official documents, and authorized third-party sources.',
    zh: '最终的租赁决定完全由业主（或其授权代理人）自行做出。在做出任何决定之前，业主必须通过直接联系、官方文件及授权第三方渠道，自行核实所有关键信息 —— 包括身份、收入、工作、信用记录以及过往房东推荐。'
  },
  'screen.result.disclaimer.body3': {
    en: 'All leasing decisions must comply with the Residential Tenancies Act, 2006 and applicable Canadian privacy legislation, including PIPEDA.',
    zh: '所有租赁决定必须符合《2006 住宅租赁法》以及适用的加拿大隐私法律（包括 PIPEDA）。'
  },
  'screen.result.disclaimer.body4': {
    en: 'AI models may contain errors, biases, or omissions and may produce false positives (unfairly flagging a good applicant) or false negatives (missing genuine risks). Name-based court searches on CanLII may return matches for different individuals with similar names — identity must always be independently verified before acting on any result.',
    zh: 'AI 模型可能存在错误、偏差或遗漏，可能产生误报（错误地对优质申请人发出警告）或漏报（未能识别真实风险）。基于姓名的 CanLII 法庭记录查询可能命中同名但不同身份的人 —— 在依据任何查询结果采取行动之前，必须独立核实身份。'
  },
  'screen.result.disclaimer.body5': {
    en: 'Stayloop and its operators make no warranty, express or implied, regarding the accuracy, completeness, or suitability of this report, and accept no liability for any decision, action, or damages arising from its use. By using Stayloop, you acknowledge and accept these terms.',
    zh: 'Stayloop 及其运营方不对本报告的准确性、完整性或适用性作出任何明示或默示的保证，亦不对因使用本报告而产生的任何决定、行为或损失承担责任。使用 Stayloop 即表示您已知悉并接受上述条款。'
  },
  'screen.result.court.title': { en: '⚖️ Court Record Query Details', zh: '⚖️ 法庭记录查询详情' },
  'screen.result.court.queriedName': { en: 'Query name:', zh: '查询姓名:' },
  'screen.result.court.pro': { en: 'Pro · full query', zh: '专业 · 全量查询' },
  'screen.result.court.free': { en: 'Go · basic query', zh: '起步 · 基础查询' },
  'screen.result.court.sources': { en: 'Data sources queried', zh: '已查询数据源' },
  'screen.result.court.clean.title': { en: 'No adverse records found', zh: '未发现不良记录' },
  'screen.result.court.clean.sub': { en: 'No hits across the {n} data source(s) queried', zh: '在已查询的 {n} 个数据源中均无命中' },
  'screen.result.court.hits': { en: '⚠ Found {n} potential match(es). Verify identity via CanLII before deciding.', zh: '⚠ 共发现 {n} 条潜在匹配。请通过 CanLII 链接核实身份后再做决定。' },
  'screen.result.court.hitsN': { en: '{n} hit(s)', zh: '{n} 条命中' },
  'screen.result.court.clean': { en: 'No records', zh: '无记录' },
  'screen.result.court.source.canliiLtb': { en: 'CanLII — LTB rulings database', zh: 'CanLII — LTB 裁决数据库' },
  'screen.result.court.source.canliiScc': { en: 'CanLII — Ontario Small Claims Court', zh: 'CanLII — Ontario Small Claims Court' },
  'screen.result.court.source.ontarioCourts': { en: 'Ontario Courts Public Portal — civil suits', zh: 'Ontario Courts Public Portal — 民事诉讼' },
  'screen.result.court.source.equifax': { en: 'Equifax — credit-related suits/judgments', zh: 'Equifax — 信用相关诉讼/判决' },
  'screen.result.court.source.verifiedNetwork': { en: 'Stayloop Verified Network', zh: 'Stayloop Verified Network' },
  'screen.result.court.comingSoon': { en: 'Coming soon', zh: '即将推出' },
  'screen.result.court.needPro': { en: 'Requires Pro', zh: '需 Pro 版' },
  'screen.result.court.upgrade.title': { en: 'Upgrade to Pro for full court coverage', zh: '升级 Pro 版获取全量法庭记录' },
  'screen.result.court.upgrade.sub': { en: 'Unlock Ontario Courts Portal civil suits + Stayloop Verified Network', zh: '解锁 Ontario Courts Portal 民事诉讼 + Stayloop Verified Network' },
  'screen.result.court.severity.critical': { en: 'High risk to tenancy', zh: '租赁高风险' },
  'screen.result.court.severity.high': { en: 'Moderate risk', zh: '中等风险' },
  'screen.result.court.severity.medium': { en: 'Low relevance', zh: '低相关性' },
  'screen.result.court.aiSummary': { en: 'AI Assessment', zh: 'AI 评估' },
  'screen.result.flags': { en: '🚩 Flags & Recommendations', zh: '🚩 风险标记 & 建议' },
  'screen.result.weights': { en: '⚙️ Scoring Weights', zh: '⚙️ 评分权重说明' },
  'screen.result.footer.notice': {
    en: 'This report is for decision support only. Final leasing decisions must comply with the Ontario Residential Tenancies Act, 2006.',
    zh: '本报告仅供决策参考。最终租赁决定应遵守《2006 安省住宅租赁法》。',
  },

  // Categories — Stayloop Risk Model v3 (2026), 5 dimensions
  'cat.ability_to_pay.label': { en: 'Ability to Pay', zh: '付款能力' },
  'cat.ability_to_pay.desc': {
    en: 'Income-to-rent ratio (target ≥3x), income stability & volatility, emergency liquidity reserves',
    zh: '收入/租金比（目标 ≥3x）、收入稳定性与波动率、应急流动性储备',
  },
  'cat.credit_health.label': { en: 'Credit & Debt Health', zh: '信用健康度' },
  'cat.credit_health.desc': {
    en: 'Credit score (Equifax / TransUnion), debt service ratio, derogatory events',
    zh: '信用分数（Equifax / TransUnion）、债务服务比率、不良记录',
  },
  'cat.rental_history.label': { en: 'Rental & Legal History', zh: '租务与司法历史' },
  'cat.rental_history.desc': {
    en: 'Prior landlord references, LTB eviction filings, Small Claims judgments — willingness-to-pay signal',
    zh: '前房东评价、LTB 驱逐记录、Small Claims 判决 — 付租意愿信号',
  },
  'cat.verification.label': { en: 'Identity & Employer Verification', zh: '身份与雇主核实' },
  'cat.verification.desc': {
    en: 'Identity cross-match across documents, employer existence, document authenticity (anti-fraud)',
    zh: '跨文档身份交叉核验、雇主真实性、文档真伪检测（反欺诈层）',
  },
  'cat.communication.label': { en: 'Application Quality', zh: '申请完整度与沟通' },
  'cat.communication.desc': {
    en: 'Completeness of submitted documents, proactive disclosure, landlord in-person impression',
    zh: '所提交文档的完整度、主动披露意愿、房东面谈直觉印象',
  },
  'cat.weight': { en: 'weight', zh: '权重' },

  // Risk levels
  'risk.safe': { en: 'Safe', zh: '安全' },
  'risk.mostlySafe': { en: 'Mostly Safe', zh: '较安全' },
  'risk.review': { en: 'Review Needed', zh: '需审查' },
  'risk.risky': { en: 'Risky', zh: '有风险' },
  'risk.highRisk': { en: 'High Risk', zh: '高危' },
  'risk.tag.safe': { en: '✅ APPROVED', zh: '✅ APPROVED' },
  'risk.tag.mostlySafe': { en: '👍 LIKELY APPROVE', zh: '👍 LIKELY APPROVE' },
  'risk.tag.review': { en: '⚠️ REVIEW', zh: '⚠️ REVIEW' },
  'risk.tag.risky': { en: '🟠 CAUTION', zh: '🟠 CAUTION' },
  'risk.tag.reject': { en: '🔴 REJECT', zh: '🔴 REJECT' },

  // Flag messages
  'flag.courtHit': { en: '⚖️ Court record hit! Found {n} potential match(es) in public databases. This is one of the strongest default predictors — verify manually via CanLII before deciding.', zh: '⚖️ 法庭记录命中！在公开数据库中发现 {n} 条潜在匹配。这是最强的违约预测指标之一，请极度谨慎并通过 CanLII 链接人工核实。' },
  'flag.courtClean': { en: '⚖️ Court records clean. No LTB evictions or civil suits found in the queried databases.', zh: '⚖️ 法庭记录查询通过。在已检索的公开数据库中未发现 LTB 驱逐令或民事诉讼记录。' },
  'flag.docFailed': { en: 'Document authenticity check failed! Possible tampering or abnormal metadata detected. Manual review of originals strongly recommended.', zh: '文档真伪验证未通过！检测到可能的篡改痕迹或异常元数据。强烈建议人工复核原始文件。' },
  'flag.inconsistent': { en: 'Cross-verification flagged inconsistencies: mismatched employer name, income amounts or dates across documents — possible fraud.', zh: '交叉校验发现不一致：文件间的雇主名称、收入金额或日期存在矛盾，存在欺诈风险。' },
  'flag.strongCandidate': { en: 'Strong financials, sufficient income, documents verified and court records clean. Low overall risk.', zh: '财务状况良好，收入水平充足，文档验证通过，法庭记录清白。综合风险较低。' },
  'flag.upgradeCta': { en: '💎 Upgrade to Pro for Ontario Courts Portal + Stayloop Verified Network coverage and a more complete risk picture.', zh: '💎 升级 Pro 版可查询 Ontario Courts Portal 民事记录 + Stayloop Verified Network，获取更完整的风险画像。' },
  'flag.missingBank': { en: 'No bank statement uploaded — unable to verify actual cash flow. Recommend asking for the last 3 months of statements.', zh: '未检测到银行流水文件，无法验证实际现金流。建议要求申请人补充近 3 个月银行流水。' },
  'flag.missingId': { en: 'No government-issued ID uploaded. Recommend asking for a valid photo ID before proceeding.', zh: '未检测到身份证明文件。建议要求提供政府签发的有效 ID。' },
  'flag.missingPaystub': { en: 'No pay stubs uploaded — income claim cannot be independently verified. Recommend last 2 pay stubs.', zh: '未检测到工资单，收入声明无法独立验证。建议补充近两期工资单。' },
  'flag.missingEmploymentLetter': { en: 'No employment letter uploaded. Recommend requesting one from the current employer for added confidence.', zh: '未检测到在职证明。建议向现任雇主索取在职证明以增强可信度。' },
  'flag.noCreditReport': { en: 'No Canadian credit report provided. For newcomers / students, consider alternative data (bank statements + study/work permit).', zh: '未提供加拿大信用报告。对于新移民/留学生，建议采用替代数据评估（银行流水 + 学签/工签）。' },

  // History
  'history.title': { en: 'Recent assessments', zh: '最近评估' },
  'history.countN': { en: '{n} entries', zh: '{n} 条' },
  'history.autoExtracted': { en: '(auto-extracted)', zh: '(自动提取)' },
  'history.viewHint': { en: 'Click to reopen', zh: '点击查看' },
  'history.loading': { en: 'Loading saved report...', zh: '加载已保存报告...' },
  'history.loadError': { en: 'This report could not be loaded.', zh: '此报告无法加载。' },
  'history.back': { en: '← Back to new screening', zh: '← 返回新建评估' },

  // Reset Password
  'resetPassword.badge': { en: '// RESET PASSWORD', zh: '// 重置密码' },
  'resetPassword.title': { en: 'Set new password', zh: '设置新密码' },
  'resetPassword.sub': { en: 'Enter your new password below.', zh: '请输入您的新密码。' },
  'resetPassword.newPassword': { en: 'New password', zh: '新密码' },
  'resetPassword.confirmPassword': { en: 'Confirm password', zh: '确认密码' },
  'resetPassword.tooShort': { en: 'Password must be at least 6 characters', zh: '密码至少需要 6 个字符' },
  'resetPassword.mismatch': { en: 'Passwords do not match', zh: '两次密码输入不一致' },
  'resetPassword.submit': { en: 'Update password', zh: '更新密码' },
  'resetPassword.updating': { en: 'Updating...', zh: '更新中...' },
  'resetPassword.success': { en: 'Password updated', zh: '密码已更新' },
  'resetPassword.successDetail': { en: 'Your password has been reset successfully. Redirecting...', zh: '您的密码已成功重置。正在跳转...' },
  'resetPassword.invalidLink': { en: 'This reset link is invalid or has expired. Please request a new one.', zh: '此重置链接无效或已过期，请重新请求。' },
  'resetPassword.verifying': { en: 'Verifying reset link...', zh: '验证重置链接...' },
  'resetPassword.backToLogin': { en: 'Back to sign in', zh: '返回登录' },

  // Dashboard
  'dash.tagline': { en: 'dashboard', zh: '控制台' },
  'dash.screenTenant': { en: '⚡ Screen tenant', zh: '⚡ 评估租客' },
  'dash.upgrade': { en: 'Upgrade', zh: '升级' },
  'dash.manageBilling': { en: 'Manage billing', zh: '账单管理' },
  'dash.opening': { en: 'Opening…', zh: '打开中…' },
  'dash.signOut': { en: 'Sign out', zh: '退出' },
  'dash.overview': { en: '// OVERVIEW', zh: '// 概览' },
  'dash.title': { en: 'Dashboard', zh: '控制台' },
  'dash.newListing': { en: 'New listing', zh: '新建房源' },
  'dash.stat.total': { en: 'Total applications', zh: '总申请数' },
  'dash.stat.approved': { en: 'Approved', zh: '已通过' },
  'dash.stat.pending': { en: 'Pending review', zh: '待审核' },
  'dash.stat.flags': { en: 'LTB flags', zh: 'LTB 标记' },
  'dash.yourListings': { en: 'Your listings', zh: '您的房源' },
  'dash.activeN': { en: '{n} active', zh: '{n} 个活跃' },
  'dash.loading': { en: 'Loading...', zh: '加载中...' },
  'dash.noListings': { en: 'No listings yet.', zh: '暂无房源。' },
  'dash.createFirst': { en: 'Create your first listing →', zh: '创建您的第一个房源 →' },
  'dash.copied': { en: '✓ Copied', zh: '✓ 已复制' },
  'dash.copyLink': { en: 'Copy link', zh: '复制链接' },
  'dash.open': { en: 'Open ↗', zh: '打开 ↗' },
  'dash.recentApps': { en: 'Recent applications', zh: '最近申请' },
  'dash.noApps': { en: 'No applications yet. Share a listing link to get started.', zh: '暂无申请。分享房源链接以开始。' },
  'dash.col.applicant': { en: 'Applicant', zh: '申请人' },
  'dash.col.property': { en: 'Property', zh: '房源' },
  'dash.col.income': { en: 'Income', zh: '收入' },
  'dash.col.aiScore': { en: 'AI Score', zh: 'AI 评分' },
  'dash.col.ltb': { en: 'LTB', zh: 'LTB' },
  'dash.col.status': { en: 'Status', zh: '状态' },
  'dash.scorePending': { en: 'pending', zh: '待评估' },
  'dash.ltbClear': { en: '✓ clear', zh: '✓ 清白' },
  'dash.pricing.tag': { en: '// PRICING', zh: '// 价格' },
  'dash.pricing.choose': { en: 'Choose your plan', zh: '选择套餐' },
  'dash.pricing.free': { en: 'Free', zh: '免费' },
  'dash.pricing.foreverFree': { en: 'forever free', zh: '永久免费' },
  'dash.pricing.cancel': { en: 'cancel anytime', zh: '随时取消' },
  'dash.pricing.recommended': { en: 'recommended', zh: '推荐' },
  'dash.pricing.free.f1': { en: '✓ Unlimited listings', zh: '✓ 无限房源' },
  'dash.pricing.free.f2': { en: '✓ AI 6-dim screening', zh: '✓ AI 6 维评估' },
  'dash.pricing.free.f3': { en: '✓ Vision OCR document analysis', zh: '✓ Vision OCR 文档分析' },
  'dash.pricing.free.f4': { en: '✓ CanLII LTB record search', zh: '✓ CanLII LTB 记录查询' },
  'dash.pricing.free.f5': { en: '— Ontario Courts Portal', zh: '— Ontario Courts Portal' },
  'dash.pricing.free.f6': { en: '— Bulk export', zh: '— 批量导出' },
  'dash.pricing.pro.f1': { en: '✓ Everything in Free', zh: '✓ 免费版全部功能' },
  'dash.pricing.pro.f2': { en: '✓ Ontario Courts Portal lookup', zh: '✓ Ontario Courts Portal 查询' },
  'dash.pricing.pro.f3': { en: '✓ Priority AI scoring', zh: '✓ 优先 AI 评分' },
  'dash.pricing.pro.f4': { en: '✓ Bulk CSV export', zh: '✓ CSV 批量导出' },
  'dash.pricing.pro.f5': { en: '✓ Custom branded apply pages', zh: '✓ 自定义品牌申请页' },
  'dash.pricing.pro.f6': { en: '✓ Email + Slack notifications', zh: '✓ Email + Slack 通知' },
  'dash.pricing.redirecting': { en: 'Redirecting to Stripe…', zh: '跳转到 Stripe…' },
  'dash.pricing.upgradeTo': { en: 'Upgrade to Pro →', zh: '升级到 Pro →' },
  'dash.pricing.stripeNotice': { en: 'Secure checkout by Stripe · cancel anytime from Manage billing.', zh: 'Stripe 安全支付 · 可在账单管理中随时取消。' },
  'dash.banner.pending': { en: 'Payment received — unlocking Pro…', zh: '付款已收到 — 正在解锁 Pro…' },
  'dash.banner.success': { en: 'Welcome to Pro!', zh: '欢迎升级到 Pro！' },
  'dash.banner.cancel': { en: 'Checkout canceled — no charge was made.', zh: '支付已取消 — 未产生扣款。' },
  'dash.banner.dismiss': { en: 'dismiss', zh: '关闭' },
  'dash.close': { en: '✕ close', zh: '✕ 关闭' },
  'dash.backToDash': { en: '← back to dashboard', zh: '← 返回控制台' },
  'newListing.tag': { en: '// NEW LISTING', zh: '// 新建房源' },
  'newListing.title': { en: 'Create a listing', zh: '创建房源' },
  'newListing.sub': { en: "You'll get a unique application link to share with prospective tenants.", zh: '您将获得一个专属的申请链接，可分享给潜在租客。' },
  'newListing.street': { en: 'Street address *', zh: '街道地址 *' },
  'newListing.unit': { en: 'Unit (optional)', zh: '单元 (可选)' },
  'newListing.city': { en: 'City *', zh: '城市 *' },
  'newListing.rent': { en: 'Monthly rent CAD *', zh: '月租金 CAD *' },
  'newListing.bedrooms': { en: 'Bedrooms', zh: '卧室数' },
  'newListing.bathrooms': { en: 'Bathrooms', zh: '卫生间' },
  'newListing.availableFrom': { en: 'Available from', zh: '可入住日期' },
  'newListing.cancel': { en: 'Cancel', zh: '取消' },
  'newListing.creating': { en: 'Creating...', zh: '创建中...' },
  'newListing.create': { en: 'Create listing', zh: '创建房源' },
  'newListing.failed': { en: 'Failed to create listing', zh: '创建房源失败' },

  // Apply page
  'apply.loading': { en: 'Loading…', zh: '加载中…' },
  'apply.notFound': { en: 'Listing not found.', zh: '房源不存在。' },
  'apply.title': { en: 'Rental application', zh: '租赁申请' },
  'apply.tagline': { en: 'encrypted · pipeda compliant · ontario', zh: '加密 · pipeda 合规 · 安省' },
  'apply.submitted.title': { en: 'Application submitted', zh: '申请已提交' },
  'apply.submitted.sub': { en: 'The landlord will review your application and be in touch soon.', zh: '房东将审核您的申请并尽快联系您。' },
  'apply.sec.personal': { en: 'Personal information', zh: '个人信息' },
  'apply.sec.employment': { en: 'Employment & income', zh: '工作与收入' },
  'apply.sec.rental': { en: 'Rental history', zh: '租赁历史' },
  'apply.sec.household': { en: 'Household', zh: '家庭情况' },
  'apply.sec.docs': { en: 'Documents (recommended)', zh: '文档（建议）' },
  'apply.docs.intro': { en: 'Uploading your documents lets the landlord verify your application instantly with AI. PDF, JPG, or PNG up to 10 MB each.', zh: '上传文档可让房东通过 AI 即时验证您的申请。支持 PDF、JPG、PNG，单文件最大 10 MB。' },
  'apply.f.firstName': { en: 'First name *', zh: '名 *' },
  'apply.f.lastName': { en: 'Last name *', zh: '姓 *' },
  'apply.f.email': { en: 'Email *', zh: '邮箱 *' },
  'apply.f.phone': { en: 'Phone', zh: '电话' },
  'apply.f.dob': { en: 'Date of birth', zh: '出生日期' },
  'apply.f.currentAddress': { en: 'Current address', zh: '现居地址' },
  'apply.f.status': { en: 'Status', zh: '状态' },
  'apply.f.employer': { en: 'Employer *', zh: '雇主 *' },
  'apply.f.jobTitle': { en: 'Job title', zh: '职位' },
  'apply.f.monthlyIncome': { en: 'Gross monthly income $ *', zh: '税前月收入 $ *' },
  'apply.f.startDate': { en: 'Start date', zh: '入职日期' },
  'apply.f.employerPhone': { en: 'Employer phone', zh: '雇主电话' },
  'apply.f.prevLandlord': { en: 'Previous landlord', zh: '前任房东' },
  'apply.f.landlordPhone': { en: 'Landlord phone', zh: '房东电话' },
  'apply.f.prevRent': { en: 'Monthly rent paid $', zh: '历史月租金 $' },
  'apply.f.reasonLeaving': { en: 'Reason for leaving', zh: '离开原因' },
  'apply.f.prevAddress': { en: 'Previous address', zh: '前任地址' },
  'apply.f.occupants': { en: 'Occupants', zh: '入住人数' },
  'apply.f.pets': { en: 'Pets?', zh: '是否有宠物？' },
  'apply.f.smoker': { en: 'Smoker?', zh: '是否吸烟？' },
  'apply.f.moveIn': { en: 'Desired move-in', zh: '期望入住日期' },
  'apply.filekind.id.label': { en: 'Government ID', zh: '政府 ID' },
  'apply.filekind.id.hint': { en: "Driver's licence, passport, or PR card", zh: '驾照、护照或 PR 卡' },
  'apply.filekind.paystub.label': { en: 'Recent pay stubs', zh: '近期工资单' },
  'apply.filekind.paystub.hint': { en: 'Last 2-3 months (PDF or photo)', zh: '近 2-3 个月（PDF 或照片）' },
  'apply.filekind.bank.label': { en: 'Bank statement', zh: '银行对账单' },
  'apply.filekind.bank.hint': { en: 'Most recent statement showing income deposits', zh: '显示收入入账的最新对账单' },
  'apply.filekind.employment.label': { en: 'Employment letter', zh: '在职证明' },
  'apply.filekind.employment.hint': { en: 'Optional — from your current employer', zh: '可选 — 由现任雇主出具' },
  'apply.addFile': { en: '+ add file', zh: '+ 添加文件' },
  'apply.remove': { en: 'remove', zh: '移除' },
  'apply.consent.tag': { en: '// CONSENT — PIPEDA', zh: '// 同意 — PIPEDA' },
  'apply.consent.body': { en: 'By submitting, you authorize the landlord and Stayloop to verify your information, contact references, search publicly available LTB and Ontario court records, and obtain a credit report. Data is stored in Canadian regions, retained for 90 days and then deleted, in accordance with PIPEDA.', zh: '提交即表示您授权房东和 Stayloop 核实您的信息、联系推荐人、查询公开的 LTB 及安省法庭记录，并获取信用报告。数据存放于加拿大境内，保留 90 天后删除，遵循 PIPEDA。' },
  'apply.consent.check1': { en: 'I agree to the above authorization and confirm all information is accurate. *', zh: '我同意以上授权并确认所有信息属实。*' },
  'apply.consent.check2': { en: 'I consent to a credit check being performed on my behalf.', zh: '我同意进行信用查询。' },
  'apply.submit': { en: 'Submit application →', zh: '提交申请 →' },
  'apply.submitting': { en: 'Submitting...', zh: '提交中...' },
  'apply.uploading': { en: 'Uploading...', zh: '上传中...' },
  'apply.consentRequired': { en: 'Please provide consent to proceed.', zh: '请勾选同意项以继续。' },
  'apply.listingNotFound': { en: 'Listing not found.', zh: '房源不存在。' },
  'apply.submitError': { en: 'Error submitting application. Please try again.', zh: '提交申请出错，请重试。' },
  'apply.uploadProgress': { en: 'Uploading {i} / {n}: {name}', zh: '上传中 {i} / {n}：{name}' },
  'apply.uploadFailed': { en: 'Upload failed for {name}: {err}', zh: '{name} 上传失败：{err}' },
  'apply.fileTooBig': { en: '{name} is larger than 10 MB.', zh: '{name} 超过 10 MB。' },

  // Login
  'login.badge': { en: '// SIGN IN', zh: '// 登录' },
  'login.title': { en: 'Sign in to Stayloop', zh: '登录 Stayloop' },
  'login.sub': { en: 'Enter your email and password to access your account.', zh: '输入邮箱和密码登录您的账户。' },
  'login.email': { en: 'EMAIL ADDRESS', zh: '邮箱地址' },
  'login.send': { en: 'Send magic link →', zh: '发送登录链接 →' },
  'login.sent': { en: 'Check your inbox for the magic link.', zh: '请查收邮箱中的登录链接。' },
  'login.footer': { en: 'Encrypted · PIPEDA compliant · Built in Ontario', zh: '加密 · PIPEDA 合规 · 安省出品' },
  'login.emailLabel': { en: 'Email address', zh: '邮箱地址' },
  'login.sending': { en: 'Sending magic link...', zh: '发送中...' },
  'login.checkInbox': { en: 'Check your inbox', zh: '请查收邮箱' },
  'login.sentDetail': { en: 'We sent a magic link to {email}. Click it to sign in.', zh: '我们已向 {email} 发送登录链接，点击即可登录。' },

  // Register page
  'register.badge': { en: '// CREATE ACCOUNT', zh: '// 创建账户' },
  'register.title': { en: 'Join Stayloop', zh: '加入 Stayloop' },
  'register.sub': { en: 'Create an account to save your screening history and unlock all features.', zh: '创建账户以保存租客筛查记录并解锁全部功能。' },
  'register.emailLabel': { en: 'Email address', zh: '邮箱地址' },
  'register.passwordLabel': { en: 'Password', zh: '密码' },
  'register.passwordHint': { en: 'At least 6 characters', zh: '至少 6 个字符' },
  'register.roleLabel': { en: 'I am a...', zh: '我的身份是...' },
  'register.roleLandlord': { en: 'Landlord', zh: '房东' },
  'register.roleTenant': { en: 'Tenant', zh: '租客' },
  'register.roleAgent': { en: 'Agent / Institution', zh: '经纪 / 机构' },
  'register.submit': { en: 'Create account', zh: '创建账户' },
  'register.submitting': { en: 'Creating account...', zh: '创建中...' },
  'register.googleBtn': { en: 'Continue with Google', zh: '使用 Google 登录' },
  'register.googleSoon': { en: 'Google sign-in coming soon', zh: 'Google 登录即将上线' },
  'register.or': { en: 'or', zh: '或' },
  'register.hasAccount': { en: 'Already have an account?', zh: '已有账户？' },
  'register.signIn': { en: 'Sign in', zh: '登录' },
  'register.success': { en: 'Account created! Check your email to verify.', zh: '账户已创建！请查收邮箱验证。' },
  'register.sentDetail': { en: 'We sent a verification link to {email}. Click it to activate your account.', zh: '我们已向 {email} 发送验证链接，点击即可激活账户。' },
  'register.roleRequired': { en: 'Please select your role.', zh: '请选择您的角色。' },
  'register.passwordTooShort': { en: 'Password must be at least 6 characters.', zh: '密码至少需要 6 个字符。' },
  'register.footer': { en: 'Encrypted · PIPEDA compliant · Built in Ontario', zh: '加密 · PIPEDA 合规 · 安省出品' },

  // Updated login page
  'login.passwordLabel': { en: 'Password', zh: '密码' },
  'login.submit': { en: 'Sign in', zh: '登录' },
  'login.submitting': { en: 'Signing in...', zh: '登录中...' },
  'login.googleBtn': { en: 'Continue with Google', zh: '使用 Google 登录' },
  'login.googleSoon': { en: 'Google sign-in coming soon', zh: 'Google 登录即将上线' },
  'login.or': { en: 'or', zh: '或' },
  'login.noAccount': { en: "Don't have an account?", zh: '还没有账户？' },
  'login.signUp': { en: 'Create one', zh: '立即注册' },
  'login.forgotPassword': { en: 'Forgot password?', zh: '忘记密码？' },
  'login.resetSent': { en: 'Password reset link sent to your email.', zh: '密码重置链接已发送至邮箱。' },
  'login.resetDetail': { en: 'We sent a password reset link to {email}. Check your inbox.', zh: '我们已向 {email} 发送密码重置链接，请查收邮箱。' },
  'login.backToLogin': { en: 'Back to sign in', zh: '返回登录' },
  'login.enterEmail': { en: 'Please enter your email address first.', zh: '请先输入邮箱地址。' },

  // Profile page
  'profile.badge': { en: '// MY PROFILE', zh: '// 我的资料' },
  'profile.title': { en: 'Profile Settings', zh: '个人资料设置' },
  'profile.emailLabel': { en: 'Email address', zh: '电子邮件地址' },
  'profile.emailReadOnly': { en: 'Read-only', zh: '只读' },
  'profile.fullName': { en: 'Full name', zh: '姓名' },
  'profile.phone': { en: 'Phone number', zh: '电话号码' },
  'profile.company': { en: 'Company / Organization', zh: '公司 / 机构名称' },
  'profile.role': { en: 'Role', zh: '角色' },
  'profile.plan': { en: 'Current plan', zh: '当前方案' },
  'profile.save': { en: 'Save changes', zh: '保存更改' },
  'profile.saving': { en: 'Saving...', zh: '保存中...' },
  'profile.saved': { en: 'Saved!', zh: '已保存！' },
  'profile.signOut': { en: 'Sign out', zh: '退出登录' },

  // Auth gate (anonymous limit)
  'authGate.title': { en: 'Sign up to continue', zh: '注册以继续' },
  'authGate.desc': { en: "You've used your free trial screening. Create a free account to keep screening.", zh: '您已使用过免费体验租客筛查。创建免费账户以继续使用。' },
  'authGate.cta': { en: 'Create free account', zh: '免费注册' },
  'authGate.login': { en: 'Already have an account? Sign in', zh: '已有账户？登录' },

  // Auth modal
  'am.tabLogin': { en: 'Sign in', zh: '登录' },
  'am.tabRegister': { en: 'Create account', zh: '注册' },

  // Auth modal — progressive flow (v2)
  'am.title': { en: 'Log in or sign up', zh: '登录 / 注册' },
  'am.titleWelcome': { en: 'Welcome back', zh: '欢迎回来' },
  'am.titleSignup': { en: 'Finish signing up', zh: '完成注册' },
  'am.emailLabel': { en: 'Email', zh: '邮箱' },
  'am.passwordLabel': { en: 'Password', zh: '密码' },
  'am.continue': { en: 'Continue', zh: '继续' },
  'am.signInBtn': { en: 'Sign in', zh: '登录' },
  'am.createBtn': { en: 'Create account', zh: '创建账户' },
  'am.backToEmail': { en: '← Use a different email', zh: '← 使用其它邮箱' },
  'am.notYou': { en: 'Not you?', zh: '不是你？' },
  'am.notYouAction': { en: 'Use a different account', zh: '换个账户' },
  'am.noAccount': { en: "Don't have an account?", zh: '还没有账户？' },
  'am.createNew': { en: 'Create a new account', zh: '创建新账户' },
  'am.hasAccount': { en: 'Already have an account?', zh: '已有账户？' },
  'am.signInInstead': { en: 'Sign in instead', zh: '改为登录' },
  'am.forgotPassword': { en: 'Forgot password?', zh: '忘记密码？' },
  'am.continueWithGoogle': { en: 'Continue with Google', zh: '使用 Google 继续' },
  'am.or': { en: 'or', zh: '或' },
  'am.passwordHint': { en: 'At least 6 characters', zh: '至少 6 个字符' },
  'am.roleLabel': { en: 'I am a...', zh: '我是...' },
  'am.byContinuing': { en: 'By continuing, you agree to our Terms and Privacy Policy.', zh: '继续即表示你同意我们的服务条款和隐私政策。' },
  'am.emailInvalid': { en: 'Please enter a valid email.', zh: '请输入有效的邮箱地址。' },
  'am.signingIn': { en: 'Signing in…', zh: '登录中…' },
  'am.creating': { en: 'Creating account…', zh: '创建中…' },
  'am.greeting': { en: 'Welcome back, {name}', zh: '欢迎回来，{name}' },
  'am.signInWithEmail': { en: 'Continue with email', zh: '使用邮箱继续' },

  // Account settings (Airbnb-style)
  'acct.title': { en: 'Account settings', zh: '账户设置' },
  'acct.section.personal': { en: 'Personal information', zh: '个人资料' },
  'acct.section.security': { en: 'Login & security', zh: '登录与安全' },
  'acct.section.notifications': { en: 'Notifications', zh: '通知偏好' },
  'acct.section.langplan': { en: 'Languages & plan', zh: '语言与计划' },

  'acct.personal.title': { en: 'Personal information', zh: '个人资料' },
  'acct.personal.legalName': { en: 'Legal name', zh: '姓名' },
  'acct.personal.legalNameHint': { en: 'Your full name as it appears on ID.', zh: '与身份证件一致的姓名。' },
  'acct.personal.phone': { en: 'Phone number', zh: '电话号码' },
  'acct.personal.phoneHint': { en: 'Used for verification and account alerts.', zh: '用于账户验证与重要通知。' },
  'acct.personal.email': { en: 'Email address', zh: '邮箱地址' },
  'acct.personal.emailNote': { en: 'Contact support to change your email.', zh: '如需更改邮箱请联系客服。' },
  'acct.personal.role': { en: 'Role', zh: '身份' },
  'acct.personal.roleHint': { en: 'How you use Stayloop.', zh: '你在 Stayloop 上的身份。' },
  'acct.personal.company': { en: 'Company name', zh: '公司名称' },

  'acct.edit': { en: 'Edit', zh: '修改' },
  'acct.cancel': { en: 'Cancel', zh: '取消' },
  'acct.save': { en: 'Save', zh: '保存' },
  'acct.saving': { en: 'Saving…', zh: '保存中…' },
  'acct.saved': { en: 'Saved', zh: '已保存' },
  'acct.notSet': { en: 'Not provided', zh: '未填写' },

  'acct.security.title': { en: 'Login & security', zh: '登录与安全' },
  'acct.security.password': { en: 'Password', zh: '密码' },
  'acct.security.passwordDesc': { en: 'Last changed when you joined. We\'ll email you a secure reset link.', zh: '系统会向你的邮箱发送重置链接。' },
  'acct.security.sendReset': { en: 'Send reset link', zh: '发送重置链接' },
  'acct.security.resetSent': { en: 'Password reset link sent to your email.', zh: '密码重置链接已发送至你的邮箱。' },
  'acct.security.signOutAll': { en: 'Sign out of all devices', zh: '登出所有设备' },
  'acct.security.signOutAllDesc': { en: 'Invalidate all active sessions on other browsers and devices.', zh: '使你在其它浏览器和设备上的登录立即失效。' },
  'acct.security.signOutAllBtn': { en: 'Sign out everywhere', zh: '立即登出全部' },
  'acct.security.signOutConfirm': { en: 'Sign out from all devices? You\'ll need to sign in again.', zh: '确定要登出所有设备吗？你需要重新登录。' },

  'acct.notif.title': { en: 'Notifications', zh: '通知偏好' },
  'acct.notif.email': { en: 'Email notifications', zh: '邮件通知' },
  'acct.notif.emailDesc': { en: 'Receive screening results and account updates by email.', zh: '接收租客筛查结果和账户通知邮件。' },
  'acct.notif.marketing': { en: 'Product updates', zh: '产品更新' },
  'acct.notif.marketingDesc': { en: 'Occasional announcements about new features.', zh: '新功能上线的不定期公告。' },
  'acct.notif.comingSoon': { en: 'Preference sync coming soon. Transactional emails always on.', zh: '偏好同步功能即将上线，交易类邮件始终开启。' },

  'acct.langplan.title': { en: 'Languages & plan', zh: '语言与计划' },
  'acct.langplan.language': { en: 'Language', zh: '界面语言' },
  'acct.langplan.plan': { en: 'Current plan', zh: '当前方案' },
  'acct.langplan.planFreeDesc': { en: '5 screenings per month. Upgrade for unlimited.', zh: '每月 5 次租客筛查。升级解锁无限次使用。' },
  'acct.langplan.planProDesc': { en: 'Unlimited screenings and priority AI scoring.', zh: '无限次租客筛查与优先 AI 评分。' },
  'acct.langplan.manage': { en: 'Manage billing', zh: '管理订阅' },
  'acct.langplan.upgrade': { en: 'Upgrade to Pro', zh: '升级到 Pro' },


  // Language toggle
  'lang.switch': { en: '中文', zh: 'EN' },
} as const

export type DictKey = keyof typeof DICT

// ─── Context ───────────────────────────────────────────────────

interface I18nCtx {
  lang: Lang
  setLang: (l: Lang) => void
  currency: Currency
  setCurrency: (c: Currency) => void
  t: (key: string, varsOrFallback?: Record<string, string | number> | string) => string
}

const Ctx = createContext<I18nCtx | null>(null)

function format(str: string, vars?: Record<string, string | number>) {
  if (!vars) return str
  return str.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : `{${k}}`))
}

// Resolve the language synchronously on the client (SSR stays 'zh'). Must
// mirror the inline <head> script in app/layout.tsx, which applies the same
// logic to <html lang>/<data-lang> before first paint (anti-FOUC).
function resolveInitialLang(): Lang {
  if (typeof window === 'undefined') return 'zh'
  try {
    const stored = localStorage.getItem('stayloop_lang') as Lang | null
    if (stored === 'en' || stored === 'zh') return stored
    return (navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en'
  } catch {
    return 'zh'
  }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  // Lazy init: first client render already uses the user's language — no
  // zh→en flash for EN users. The SSR HTML is zh; the resulting first-frame
  // mismatch is patched by React (suppressHydrationWarning on <html> covers
  // the lang attribute; body copy is state-driven and re-renders).
  const [lang, setLangState] = useState<Lang>(resolveInitialLang)
  const [currency, setCurrencyState] = useState<Currency>('CAD')

  useEffect(() => {
    const storedCurrency = typeof window !== 'undefined' ? (localStorage.getItem('stayloop_currency') as Currency | null) : null
    if (storedCurrency && CURRENCIES.some(c => c.code === storedCurrency)) {
      setCurrencyState(storedCurrency)
    }
  }, [])

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'
      document.documentElement.dataset.lang = lang
    }
  }, [lang])

  const setLang = (l: Lang) => {
    setLangState(l)
    if (typeof window !== 'undefined') localStorage.setItem('stayloop_lang', l)
  }

  const setCurrency = (c: Currency) => {
    setCurrencyState(c)
    if (typeof window !== 'undefined') localStorage.setItem('stayloop_currency', c)
  }

  const t = (key: string, varsOrFallback?: Record<string, string | number> | string) => {
    const entry = (DICT as Record<string, { en: string; zh: string }>)[key]
    const vars = typeof varsOrFallback === 'object' ? varsOrFallback : undefined
    const fallback = typeof varsOrFallback === 'string' ? varsOrFallback : undefined
    if (!entry) return fallback ?? String(key)
    return format(entry[lang] ?? entry.en, vars)
  }

  return <Ctx.Provider value={{ lang, setLang, currency, setCurrency, t }}>{children}</Ctx.Provider>
}

export function useT() {
  const ctx = useContext(Ctx)
  if (!ctx) {
    const t = (key: string, varsOrFallback?: Record<string, string | number> | string) => {
      const entry = (DICT as Record<string, { en: string; zh: string }>)[key]
      const vars = typeof varsOrFallback === 'object' ? varsOrFallback : undefined
      const fallback = typeof varsOrFallback === 'string' ? varsOrFallback : undefined
      return entry ? format(entry.zh, vars) : (fallback ?? String(key))
    }
    return { lang: 'zh' as Lang, setLang: (_: Lang) => {}, currency: 'CAD' as Currency, setCurrency: (_: Currency) => {}, t }
  }
  return ctx
}

// ─── Language toggle button ────────────────────────────────────

export function LanguageToggle({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const { lang, setLang, t } = useT()
  return (
    <button
      onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '5px 10px',
        borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.12)',
        background: 'rgba(255,255,255,0.03)',
        color: '#94a3b8',
        fontSize: 12,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        flexShrink: 0,
        fontFamily: "'JetBrains Mono', monospace",
        ...style,
      }}
      title={lang === 'zh' ? 'Switch to English' : '切换到中文'}
      aria-label="Toggle language"
    >
      <span>🌐</span>
      <span>{t('lang.switch')}</span>
    </button>
  )
}

// ─── V5 compatibility aliases ──────────────────────────────────
export const I18nProvider = LanguageProvider
export function useI18n() {
  const ctx = useT()
  return { ...ctx, toggle: () => ctx.setLang(ctx.lang === 'zh' ? 'en' : 'zh'), currency: ctx.currency, setCurrency: ctx.setCurrency }
}
// Re-export dict for backward compat
export const dict = DICT
