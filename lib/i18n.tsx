'use client'
import { createContext, useContext, useEffect, useState, ReactNode } from 'react'

export type Lang = 'en' | 'zh'

// ─── Dictionary ────────────────────────────────────────────────
// Keys are loose strings; every key must exist in both languages.

export const DICT = {
  // Common / nav / buttons
  'nav.signin': { en: 'Sign in', zh: '登录' },
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

  // Home page
  'home.badge': { en: 'Built for Ontario landlords · PIPEDA compliant', zh: '为安省房东打造 · PIPEDA 合规' },
  'home.hero.line1': { en: 'Tenant screening,', zh: '租客风控评估，' },
  'home.hero.line2': { en: 're-engineered for AI.', zh: '由 AI 重新定义。' },
  'home.hero.sub': {
    en: 'Stayloop scores every rental application in seconds — pulling income, employment, rental history, and Ontario LTB records into one clear decision.',
    zh: 'Stayloop 在几秒钟内对每份租赁申请打分 — 整合收入、就业、租赁历史和安省 LTB 记录，给出一个清晰的决策。',
  },
  'home.cta.primary': { en: 'Start screening free', zh: '免费开始评估' },
  'home.cta.secondary': { en: 'See how it works', zh: '了解工作原理' },
  'home.preview.score': { en: 'AI Score', zh: 'AI 评分' },
  'home.preview.score.sub': { en: '+ low risk', zh: '低风险' },
  'home.preview.ltb': { en: 'LTB Records', zh: 'LTB 记录' },
  'home.preview.ltb.sub': { en: 'clear', zh: '清白' },
  'home.preview.ratio': { en: 'Income / Rent', zh: '收入 / 租金' },
  'home.preview.ratio.sub': { en: 'healthy', zh: '良好' },
  'home.preview.analysisTitle': { en: 'Claude analysis', zh: 'Claude 分析' },
  'home.preview.analysis': {
    en: 'Strong income-to-rent ratio at 3.2×. Stable two-year employment history, positive prior landlord reference, and zero LTB records.',
    zh: '收入租金比 3.2×，表现优秀。两年稳定就业，前房东反馈良好，无 LTB 记录。',
  },
  'home.preview.recommend': { en: ' Recommended for approval.', zh: ' 建议通过。' },

  'home.features.tag': { en: '// FEATURES', zh: '// 功能' },
  'home.features.title': { en: 'Built on a real screening stack', zh: '构建于真实的评估栈之上' },
  'home.features.1.title': { en: 'AI risk scoring', zh: 'AI 风险评分' },
  'home.features.1.desc': {
    en: 'Claude analyzes income, employment, rental history, LTB records and references. Returns a 0–100 score with reasoning per category.',
    zh: 'Claude 分析收入、就业、租赁历史、LTB 记录和推荐信，给出 0–100 分及各维度理由。',
  },
  'home.features.2.title': { en: 'LTB record search', zh: 'LTB 记录查询' },
  'home.features.2.desc': {
    en: 'Automatic search of Ontario Landlord and Tenant Board records to surface eviction history and prior disputes.',
    zh: '自动查询安省房东与租客管理局记录，暴露历史驱逐和纠纷。',
  },
  'home.features.3.title': { en: 'PIPEDA compliant', zh: 'PIPEDA 合规' },
  'home.features.3.desc': {
    en: 'Built-in consent forms, data minimization, and 90-day retention. Aligned with the Ontario Human Rights Code from day one.',
    zh: '内置同意书、数据最小化、90 天保留。从第一天起就遵循安省人权法典。',
  },

  'home.workflow.tag': { en: '// WORKFLOW', zh: '// 工作流程' },
  'home.workflow.title': { en: 'From listing to decision in minutes', zh: '从房源到决策，只需几分钟' },
  'home.workflow.1.t': { en: 'Create listing', zh: '创建房源' },
  'home.workflow.1.d': { en: 'Add an address and rent. Get a unique application link.', zh: '添加地址和租金，获取专属申请链接。' },
  'home.workflow.2.t': { en: 'Share link', zh: '分享链接' },
  'home.workflow.2.d': { en: 'Send the link to applicants — works on any device.', zh: '把链接发给申请人 — 任何设备都可用。' },
  'home.workflow.3.t': { en: 'Run AI score', zh: '运行 AI 评分' },
  'home.workflow.3.d': { en: 'One click triggers Claude + LTB lookup in seconds.', zh: '一键触发 Claude + LTB 查询，秒级返回。' },
  'home.workflow.4.t': { en: 'Decide', zh: '做出决策' },
  'home.workflow.4.d': { en: 'Approve or decline with full audit trail and reasoning.', zh: '通过或拒绝，附完整审计轨迹和理由。' },

  'home.pricing.tag': { en: '// PRICING', zh: '// 价格' },
  'home.pricing.title': { en: 'Simple pricing for landlords', zh: '为房东设计的简单定价' },
  'home.pricing.free.label': { en: 'FREE', zh: '免费' },
  'home.pricing.free.sub': { en: 'Try Stayloop on your next vacancy.', zh: '在下一次出租中试用 Stayloop。' },
  'home.pricing.free.f1': { en: '1 active listing', zh: '1 个在售房源' },
  'home.pricing.free.f2': { en: '5 AI screenings / month', zh: '每月 5 次 AI 评估' },
  'home.pricing.free.f3': { en: 'LTB record search', zh: 'LTB 记录查询' },
  'home.pricing.free.cta': { en: 'Start free', zh: '免费开始' },
  'home.pricing.pro.label': { en: 'PRO', zh: '订阅' },
  'home.pricing.pro.popular': { en: 'POPULAR', zh: '热门' },
  'home.pricing.pro.sub': { en: 'For landlords with multiple units.', zh: '适合多套房源的房东。' },
  'home.pricing.pro.f1': { en: 'Unlimited listings', zh: '无限房源' },
  'home.pricing.pro.f2': { en: 'Unlimited AI screenings', zh: '无限 AI 评估' },
  'home.pricing.pro.f3': { en: 'LTB + court record search', zh: 'LTB + 法庭记录查询' },
  'home.pricing.pro.f4': { en: 'Priority support', zh: '优先支持' },
  'home.pricing.pro.cta': { en: 'Upgrade to Pro', zh: '升级到 Pro' },
  'home.footer.copy': { en: '© 2026 Stayloop · Made for Ontario landlords', zh: '© 2026 Stayloop · 为安省房东打造' },

  // Dedicated free-screen entry card (between hero and features)
  'home.screenEntry.tag': { en: '// AVAILABLE NOW', zh: '// 现已上线' },
  'home.screenEntry.title': { en: 'Free AI Tenant Screening Report', zh: '免费 AI 租客筛查报告' },
  'home.screenEntry.subtitle': {
    en: 'Upload pay stubs, ID, bank statements and references. In about a minute you get a full risk report with CanLII court record search — at no cost.',
    zh: '上传工资单、证件、银行流水和推荐信。约一分钟后即可获得完整风控报告，并自动查询 CanLII 全部安省法庭记录 — 完全免费。',
  },
  'home.screenEntry.b1.title': { en: '5-dimension Risk Score', zh: '5 维风险评分' },
  'home.screenEntry.b1.desc': { en: 'Ability to pay, credit health, rental & legal history, identity & employer, application quality.', zh: '付款能力、信用健康、租务与司法历史、身份与雇主核实、申请完整度。' },
  'home.screenEntry.b2.title': { en: 'All Ontario CanLII Records', zh: '安省全部 CanLII 记录' },
  'home.screenEntry.b2.desc': { en: 'Searches LTB, Superior Court, Small Claims, HRT and more against the applicant name.', zh: '按申请人姓名检索 LTB、高等法院、小额法庭、人权法庭等全部安省公开数据库。' },
  'home.screenEntry.b3.title': { en: 'AI document verification', zh: 'AI 资料真实性核验' },
  'home.screenEntry.b3.desc': { en: 'Cross-checks IDs, pay stubs and bank statements for tampering and inconsistencies.', zh: '交叉核对证件、工资单与银行流水，识别伪造与不一致之处。' },
  'home.screenEntry.b4.title': { en: 'Bilingual EN / 中文 report', zh: '中英双语报告' },
  'home.screenEntry.b4.desc': { en: 'One click switches the full report between English and Chinese.', zh: '一键切换完整报告的中英文显示。' },
  'home.screenEntry.cta': { en: 'Start a free screening →', zh: '免费开始筛查 →' },
  'home.screenEntry.ctaLoggedOut': { en: 'Sign in to start →', zh: '登录后开始 →' },
  'home.screenEntry.notice': { en: 'Login required · Each report saved to your history', zh: '需要登录 · 每份报告自动保存至历史记录' },

  // =====================================================================
  // NEW MARKETING HOME — light theme, professional real-estate SaaS
  // =====================================================================

  // Nav
  'mk.nav.product': { en: 'Product', zh: '产品' },
  'mk.nav.landlords': { en: 'For Landlords', zh: '房东' },
  'mk.nav.tenants': { en: 'For Tenants', zh: '租客' },
  'mk.nav.roadmap': { en: 'Roadmap', zh: '路线图' },
  'mk.nav.pricing': { en: 'Pricing', zh: '价格' },
  'mk.nav.signin': { en: 'Sign in', zh: '登录' },
  'mk.nav.getStarted': { en: 'Start free', zh: '免费开始' },

  // Hero
  'mk.hero.eyebrow': { en: 'Ontario · PIPEDA · RTA 2006 compliant', zh: '安省 · PIPEDA · RTA 2006 合规' },
  'mk.hero.title1': { en: 'Rent smarter,', zh: '更聪明地出租，' },
  'mk.hero.title2': { en: 'protect every lease.', zh: '守护每一份租约。' },
  'mk.hero.sub': {
    en: 'Stayloop is the AI-powered rental platform built for Ontario. Screen applicants against every public court record, generate compliant reports in minutes, and help good tenants stand out — all in one place.',
    zh: 'Stayloop 是专为安省打造的 AI 租赁平台。对照每一份公开法庭记录筛查申请人，几分钟内生成合规报告，并让优质租客脱颖而出 —— 一站式解决。',
  },
  'mk.hero.ctaPrimary': { en: 'Run a free screening →', zh: '免费开始筛查 →' },
  'mk.hero.ctaTenant': { en: "I'm a tenant", zh: '我是租客' },
  'mk.hero.trust1': { en: 'Free to start', zh: '免费试用' },
  'mk.hero.trust2': { en: 'No credit card', zh: '无需信用卡' },
  'mk.hero.trust3': { en: 'Bilingual 中 / EN', zh: '中英双语' },

  // Preview widget inside hero
  'mk.preview.header': { en: 'Applicant report · preview', zh: '申请人报告 · 示例' },
  'mk.preview.name': { en: 'Jamie Chen', zh: '陈家明' },
  'mk.preview.subtitle': { en: 'Ontario · 4 documents · scored in 58 s', zh: '安省 · 4 份文件 · 58 秒评分' },
  'mk.preview.score': { en: 'Overall score', zh: '综合评分' },
  'mk.preview.tier': { en: 'Recommendation', zh: '建议' },
  'mk.preview.tier.val': { en: 'Approve', zh: '通过' },
  'mk.preview.ratio': { en: 'Income / Rent', zh: '收入 / 租金' },
  'mk.preview.ltb': { en: 'LTB hits', zh: 'LTB 命中' },
  'mk.preview.ltb.val': { en: '0 in 10 yrs', zh: '10 年 0 条' },
  'mk.preview.dim1': { en: 'Ability to pay', zh: '付款能力' },
  'mk.preview.dim2': { en: 'Credit health', zh: '信用健康' },
  'mk.preview.dim3': { en: 'Rental history', zh: '租务历史' },
  'mk.preview.dim4': { en: 'Identity & employer', zh: '身份与雇主' },
  'mk.preview.note': { en: 'Stable tech employee. Income covers rent 3.4×. No flags across all Ontario CanLII databases.', zh: '稳定科技行业员工。收入覆盖租金 3.4 倍。安省 CanLII 全库无命中。' },

  // Trust bar
  'mk.trust.heading': { en: 'Built on a real, auditable tech stack', zh: '构建于真实、可审计的技术栈之上' },
  'mk.trust.claude': { en: 'Claude Sonnet 4.5', zh: 'Claude Sonnet 4.5' },
  'mk.trust.canlii': { en: 'CanLII court records', zh: 'CanLII 法庭数据' },
  'mk.trust.supabase': { en: 'Supabase · Postgres', zh: 'Supabase · Postgres' },
  'mk.trust.cloudflare': { en: 'Cloudflare edge', zh: 'Cloudflare 边缘' },
  'mk.trust.pipeda': { en: 'PIPEDA-aligned', zh: 'PIPEDA 对齐' },
  'mk.trust.ohrc': { en: 'Ontario HRC safe', zh: '安省人权法安全' },

  // Dual audience
  'mk.dual.eyebrow': { en: '// FOR EVERYONE IN THE LEASE', zh: '// 为租约每一方服务' },
  'mk.dual.title': { en: 'One platform. Both sides of the key.', zh: '一个平台，房东与租客同在。' },
  'mk.dual.sub': { en: 'Renting should be transparent for everyone. Stayloop gives landlords the decision data they need, and gives applicants a fair, private way to show they are the right fit.', zh: '租赁应当对各方都透明。Stayloop 为房东提供做决定所需的关键数据，也为租客提供公平、隐私安全的展示方式。' },

  'mk.dual.landlord.tag': { en: 'LANDLORDS', zh: '房东' },
  'mk.dual.landlord.title': { en: 'Screen smarter, not harder', zh: '更聪明地筛查，而非更辛苦' },
  'mk.dual.landlord.desc': { en: 'Move from gut-feel to a 5-dimension AI score in under two minutes, backed by every Ontario public court record.', zh: '两分钟内从凭感觉判断升级为基于安省全部公开法庭记录的 5 维 AI 评分。' },
  'mk.dual.landlord.b1': { en: 'Full Ontario CanLII search — LTB, Superior Court, Small Claims, HRT', zh: '安省 CanLII 全库检索 — LTB、高等法院、小额法庭、人权法庭' },
  'mk.dual.landlord.b2': { en: 'AI document authenticity — catches tampered pay stubs & IDs', zh: 'AI 资料真实性核验 — 识别伪造工资单与证件' },
  'mk.dual.landlord.b3': { en: 'RTA 2006 + Human Rights Code compliant language in every report', zh: '每份报告均采用 RTA 2006 与人权法合规措辞' },
  'mk.dual.landlord.cta': { en: 'Start screening free →', zh: '免费开始筛查 →' },

  'mk.dual.tenant.tag': { en: 'TENANTS', zh: '租客' },
  'mk.dual.tenant.title': { en: 'Show up as the strongest applicant', zh: '成为最具竞争力的申请人' },
  'mk.dual.tenant.desc': { en: 'Control your own story. Upload once, share a verified profile, and stop sending the same documents to every landlord.', zh: '掌握自己的故事。一次上传，分享经核实的档案，不再为每位房东重复发送同一份材料。' },
  'mk.dual.tenant.b1': { en: 'Verified tenant profile you own and share on your terms', zh: '完全由你掌控并自主分享的认证租客档案' },
  'mk.dual.tenant.b2': { en: 'Privacy-first: no selling your data, ever', zh: '隐私优先：绝不出售你的数据' },
  'mk.dual.tenant.b3': { en: 'Transparent scoring — you see exactly what landlords see', zh: '透明评分 — 你看到的与房东看到的完全一致' },
  'mk.dual.tenant.cta': { en: 'Get notified when live', zh: '上线后通知我' },
  'mk.dual.tenant.soon': { en: 'Coming Q3 2026', zh: '2026 年 Q3 上线' },

  // Featured screening product
  'mk.screening.eyebrow': { en: '// AVAILABLE NOW · FREE', zh: '// 现已上线 · 免费' },
  'mk.screening.title': { en: 'AI Tenant Screening — the best first hire you can make', zh: 'AI 租客筛查 — 你能做的最佳第一步' },
  'mk.screening.sub': { en: 'Upload the application pack. In about a minute you get a 5-dimension risk score, a plain-English reasoning trail, and a complete Ontario CanLII search — all under your account history so you can reopen it anytime.', zh: '上传申请材料包。约一分钟即可获得 5 维风险评分、通俗易懂的判断依据，以及安省 CanLII 完整检索结果 —— 全部保存在你的账户历史中，随时可再次查看。' },
  'mk.screening.f1.title': { en: '5-dimension risk score', zh: '5 维风险评分' },
  'mk.screening.f1.desc': { en: 'Ability to pay · Credit health · Rental history · Verification · Communication. Not a black box — each sub-score has evidence coverage dots.', zh: '付款能力 · 信用健康 · 租务历史 · 身份核实 · 沟通完整度。非黑箱 — 每个子项都有证据覆盖度标识。' },
  'mk.screening.f2.title': { en: 'Every Ontario CanLII database', zh: '安省 CanLII 全部数据库' },
  'mk.screening.f2.desc': { en: 'LTB, Superior Court (ONSC), Small Claims, Court of Appeal, Human Rights Tribunal. Searched by exact name, 2015–present.', zh: 'LTB、高等法院、小额法庭、上诉法院、人权法庭。按全名检索，覆盖 2015 年至今。' },
  'mk.screening.f3.title': { en: 'Document authenticity check', zh: '资料真实性核验' },
  'mk.screening.f3.desc': { en: 'Cross-checks IDs, pay stubs, bank statements for tampering, inconsistencies, and phantom employers.', zh: '交叉核对证件、工资单与银行流水，识别伪造、不一致与虚构雇主。' },
  'mk.screening.f4.title': { en: 'Compliance-first reporting', zh: '合规优先的报告' },
  'mk.screening.f4.desc': { en: 'Every report ends with an RTA + Human Rights Code disclaimer. Protected grounds are never used as scoring signals.', zh: '每份报告末尾附 RTA 与人权法免责声明。受保护群体属性绝不作为评分依据。' },
  'mk.screening.f5.title': { en: 'Saved history, one-click reopen', zh: '历史记录，一键重开' },
  'mk.screening.f5.desc': { en: 'Every completed report is stored under your account and can be reopened without re-running the AI.', zh: '每份完成的报告均保存在你的账户下，无需再次调用 AI 即可重新打开。' },
  'mk.screening.f6.title': { en: 'Bilingual EN / 中文 output', zh: '中英双语输出' },
  'mk.screening.f6.desc': { en: 'Switch the whole report between English and Chinese with one click. Great for multilingual rentals.', zh: '一键切换报告中英文。适配多语种租赁场景。' },
  'mk.screening.cta': { en: 'Try the free screening now →', zh: '立即免费试用 →' },

  // How it works
  'mk.how.eyebrow': { en: '// HOW IT WORKS', zh: '// 工作流程' },
  'mk.how.title': { en: 'From application pack to decision in under 2 minutes', zh: '从申请材料到决策，不到两分钟' },
  'mk.how.1.n': { en: '01', zh: '01' },
  'mk.how.1.title': { en: 'Upload the application pack', zh: '上传申请材料包' },
  'mk.how.1.desc': { en: 'Drop in pay stubs, ID, bank statements, references. Any format — PDF, image, doc.', zh: '拖入工资单、证件、银行流水、推荐信。支持 PDF、图片、文档等任意格式。' },
  'mk.how.2.n': { en: '02', zh: '02' },
  'mk.how.2.title': { en: 'AI extracts & verifies', zh: 'AI 提取并核实' },
  'mk.how.2.desc': { en: 'Claude reads every document, matches identity across files, and flags anything that looks off.', zh: 'Claude 通读每份文件，跨文件匹配身份，并标记任何异常。' },
  'mk.how.3.n': { en: '03', zh: '03' },
  'mk.how.3.title': { en: 'Ontario CanLII sweep', zh: '安省 CanLII 扫描' },
  'mk.how.3.desc': { en: 'We fan out to every Ontario CanLII database in parallel and surface every hit with a citation link.', zh: '并行扫描安省 CanLII 全部数据库，每一条命中均附引用链接。' },
  'mk.how.4.n': { en: '04', zh: '04' },
  'mk.how.4.title': { en: 'Decide with confidence', zh: '自信做出决策' },
  'mk.how.4.desc': { en: 'Read the 5-dimension score, reasoning trail, and compliance notice. Your decision, backed by evidence.', zh: '查阅 5 维评分、推理依据与合规说明。由证据支撑，你自己做决定。' },

  // Roadmap
  'mk.roadmap.eyebrow': { en: '// PRODUCT ROADMAP', zh: '// 产品路线图' },
  'mk.roadmap.title': { en: "What's coming to Stayloop", zh: 'Stayloop 即将上线' },
  'mk.roadmap.sub': { en: 'Screening is step one. Here is what we are building next — the full rental lifecycle, for Ontario.', zh: '筛查只是第一步。以下是我们正在构建的内容 — 完整的安省租赁全流程。' },
  'mk.roadmap.status.live': { en: 'Live now', zh: '已上线' },
  'mk.roadmap.status.beta': { en: 'In beta', zh: '测试中' },
  'mk.roadmap.status.soon': { en: 'Coming soon', zh: '即将上线' },
  'mk.roadmap.status.planned': { en: 'Planned', zh: '规划中' },
  'mk.roadmap.1.title': { en: 'AI Tenant Screening', zh: 'AI 租客筛查' },
  'mk.roadmap.1.desc': { en: 'Full 5-dimension risk report with Ontario CanLII sweep. Free to use.', zh: '安省 CanLII 全库扫描 + 5 维风险报告。完全免费。' },
  'mk.roadmap.2.title': { en: 'Listings & application inbox', zh: '房源与申请收件箱' },
  'mk.roadmap.2.desc': { en: 'Publish a listing, get a unique link, receive applications and documents in one place.', zh: '发布房源，获取专属链接，在同一处接收申请与材料。' },
  'mk.roadmap.3.title': { en: 'Ontario Standard Lease generator', zh: '安省标准租约生成器' },
  'mk.roadmap.3.desc': { en: 'Generate a compliant Form 2229 lease prefilled from the application, ready to e-sign.', zh: '基于申请材料预填的合规 Form 2229 租约，可直接电子签署。' },
  'mk.roadmap.4.title': { en: 'Rent collection & reminders', zh: '收租与提醒' },
  'mk.roadmap.4.desc': { en: 'Automated monthly reminders, Interac e-Transfer reconciliation, late-payment workflow.', zh: '自动化月度提醒、Interac e-Transfer 对账、逾期处理流程。' },
  'mk.roadmap.5.title': { en: 'LTB N-notice assistant', zh: 'LTB N 系列通知助手' },
  'mk.roadmap.5.desc': { en: 'Draft N4, N5, N12 notices correctly the first time, with statute references.', zh: '一次性准确起草 N4、N5、N12 通知，附法条引用。' },
  'mk.roadmap.6.title': { en: 'Verified Tenant Profile', zh: '认证租客档案' },
  'mk.roadmap.6.desc': { en: 'Tenants own a portable profile they can share with any landlord — no more re-uploading documents.', zh: '租客拥有一份可携带的档案，可分享给任何房东 — 无需重复上传材料。' },

  // Compliance & security
  'mk.sec.eyebrow': { en: '// TRUST & COMPLIANCE', zh: '// 信任与合规' },
  'mk.sec.title': { en: 'Built for Ontario — and built to be defensible', zh: '为安省打造 — 亦可经得起推敲' },
  'mk.sec.sub': { en: 'We designed Stayloop with the specific regulations that govern rental decisions in Ontario. Protected grounds are never used as scoring signals, and every report carries a plain-English disclaimer.', zh: 'Stayloop 针对安省租赁决策相关法规专门设计。受保护群体属性永远不会作为评分依据，每份报告都附有通俗易懂的免责声明。' },
  'mk.sec.1.title': { en: 'PIPEDA-aligned data handling', zh: 'PIPEDA 合规的数据处理' },
  'mk.sec.1.desc': { en: 'Data minimization, purpose limitation, and consent — every upload is scoped to a single screening.', zh: '数据最小化、目的限定、用户同意 — 每次上传仅限于单次筛查使用。' },
  'mk.sec.2.title': { en: 'Ontario Human Rights Code aware', zh: '遵循安省人权法' },
  'mk.sec.2.desc': { en: 'We explicitly exclude age, family status, disability, citizenship, and other protected grounds from scoring.', zh: '评分时明确排除年龄、家庭状态、残障、公民身份等受保护属性。' },
  'mk.sec.3.title': { en: 'RTA 2006 aware reporting', zh: '符合 RTA 2006 的报告' },
  'mk.sec.3.desc': { en: 'Reports never recommend action that would breach the Residential Tenancies Act — reviewer notes when a case touches grey areas.', zh: '报告绝不建议任何可能违反《居住租赁法》的操作 — 涉及灰色地带时自动添加审阅备注。' },
  'mk.sec.4.title': { en: 'Encryption in transit & at rest', zh: '传输与存储全程加密' },
  'mk.sec.4.desc': { en: 'Supabase Postgres with row-level security, Cloudflare edge TLS, and private storage buckets by default.', zh: 'Supabase Postgres 行级安全、Cloudflare 边缘 TLS、默认私有存储。' },

  // Pricing
  'mk.pricing.eyebrow': { en: '// PRICING', zh: '// 价格' },
  'mk.pricing.title': { en: 'Start free. Upgrade when you scale.', zh: '免费开始。需要时再升级。' },
  'mk.pricing.sub': { en: 'No credit card to start. No hidden fees. Cancel anytime.', zh: '无需信用卡即可开始。无隐藏费用。随时可取消。' },
  'mk.pricing.free.label': { en: 'FREE', zh: '免费' },
  'mk.pricing.free.price': { en: '$0', zh: '$0' },
  'mk.pricing.free.unit': { en: '/ forever', zh: '/ 永久' },
  'mk.pricing.free.sub': { en: 'Perfect for a landlord screening one or two applicants a month.', zh: '适合每月筛查 1–2 位申请人的房东。' },
  'mk.pricing.free.f1': { en: '5 AI screenings / month', zh: '每月 5 次 AI 筛查' },
  'mk.pricing.free.f2': { en: 'Full Ontario CanLII search', zh: '安省 CanLII 全库检索' },
  'mk.pricing.free.f3': { en: 'Document authenticity checks', zh: '资料真实性核验' },
  'mk.pricing.free.f4': { en: 'Bilingual EN / 中文 reports', zh: '中英双语报告' },
  'mk.pricing.free.f5': { en: 'Saved screening history', zh: '筛查历史记录保存' },
  'mk.pricing.free.cta': { en: 'Start free', zh: '免费开始' },
  'mk.pricing.pro.label': { en: 'PRO', zh: '订阅版' },
  'mk.pricing.pro.price': { en: '$29', zh: '$29' },
  'mk.pricing.pro.unit': { en: '/ month', zh: '/ 月' },
  'mk.pricing.pro.sub': { en: 'For landlords and property managers with multiple units.', zh: '适合多套房源的房东与物业经理。' },
  'mk.pricing.pro.f1': { en: 'Unlimited AI screenings', zh: '无限 AI 筛查' },
  'mk.pricing.pro.f2': { en: 'Priority Ontario Courts portal lookup', zh: '优先 Ontario Courts 检索' },
  'mk.pricing.pro.f3': { en: 'Bulk reports & team seats', zh: '批量报告与团队席位' },
  'mk.pricing.pro.f4': { en: 'Early access to Listings & Lease generator', zh: '抢先体验房源管理与租约生成器' },
  'mk.pricing.pro.f5': { en: 'Priority email support', zh: '优先邮件支持' },
  'mk.pricing.pro.cta': { en: 'Upgrade to Pro', zh: '升级到 Pro' },
  'mk.pricing.pro.tag': { en: 'POPULAR', zh: '热门' },

  // FAQ
  'mk.faq.eyebrow': { en: '// FAQ', zh: '// 常见问题' },
  'mk.faq.title': { en: 'Answers before you sign up', zh: '注册前的常见问题' },
  'mk.faq.q1': { en: 'Is the free screening really free?', zh: '免费筛查真的完全免费吗？' },
  'mk.faq.a1': { en: 'Yes. You can run up to 5 full screenings every month on the free plan, including the Ontario CanLII sweep, at no cost. No credit card required.', zh: '是的。免费版每月最多 5 次完整筛查，包含安省 CanLII 全库扫描，完全免费。无需信用卡。' },
  'mk.faq.q2': { en: 'Does Stayloop pull a credit score from Equifax or TransUnion?', zh: 'Stayloop 会从 Equifax 或 TransUnion 拉取信用分吗？' },
  'mk.faq.a2': { en: 'Not today. The free plan works with the credit documents the applicant provides (bank statements, pay stubs, self-ordered credit reports). Direct bureau integration is on our roadmap.', zh: '目前尚不支持。免费版基于申请人提供的信用文件（银行流水、工资单、自主拉取的信用报告）进行分析。直接对接信用局已在路线图中。' },
  'mk.faq.q3': { en: 'How does Stayloop stay compliant with the Ontario Human Rights Code?', zh: 'Stayloop 如何遵守安省人权法？' },
  'mk.faq.a3': { en: 'We explicitly exclude protected grounds — age, family status, disability, citizenship, receipt of public assistance, and others — from scoring signals. Every report also adds a reviewer note when a case touches grey areas.', zh: '我们明确将年龄、家庭状态、残障、公民身份、社会救助等受保护属性排除在评分依据之外。每份报告在涉及灰色地带时也会自动添加审阅备注。' },
  'mk.faq.q4': { en: 'Who owns the uploaded documents?', zh: '上传的文件归谁所有？' },
  'mk.faq.a4': { en: 'You do. Files are stored in your private bucket with row-level security. We never sell your data, and you can delete a screening (and all its files) from your account at any time.', zh: '由你拥有。文件存储于具有行级安全的私有存储桶中。我们绝不出售你的数据，且你可随时从账户中删除某次筛查及其全部文件。' },
  'mk.faq.q5': { en: 'Is Stayloop available outside Ontario?', zh: 'Stayloop 在安省以外可用吗？' },
  'mk.faq.a5': { en: "Right now we're Ontario-first because CanLII coverage, LTB rules, and RTA 2006 are the tightest match for what we built. Other provinces are planned.", zh: '目前我们优先支持安省，因为 CanLII 覆盖范围、LTB 规则与 RTA 2006 与我们的产品最契合。其他省份已在规划中。' },
  'mk.faq.q6': { en: 'Can a tenant use Stayloop too?', zh: '租客也能使用 Stayloop 吗？' },
  'mk.faq.a6': { en: 'Verified Tenant Profile is coming in Q3 2026. Tenants will be able to build one profile and share it with any landlord, instead of sending the same pay stubs over and over.', zh: '认证租客档案将在 2026 年 Q3 上线。届时租客可创建一份档案并分享给任何房东，而无需重复发送工资单。' },

  // Final CTA
  'mk.finalcta.title': { en: 'Ready to screen your next applicant?', zh: '准备好筛查下一位申请人了吗？' },
  'mk.finalcta.sub': { en: 'A full AI screening takes about a minute. Free to start.', zh: '一次完整的 AI 筛查大约一分钟。免费开始。' },
  'mk.finalcta.primary': { en: 'Start screening free →', zh: '免费开始筛查 →' },
  'mk.finalcta.secondary': { en: 'See pricing', zh: '查看价格' },

  // Footer
  'mk.footer.tagline': { en: 'The AI rental platform for Ontario.', zh: '为安省打造的 AI 租赁平台。' },
  'mk.footer.product': { en: 'Product', zh: '产品' },
  'mk.footer.company': { en: 'Company', zh: '公司' },
  'mk.footer.legal': { en: 'Legal', zh: '法律' },
  'mk.footer.resources': { en: 'Resources', zh: '资源' },
  'mk.footer.screen': { en: 'Tenant Screening', zh: '租客筛查' },
  'mk.footer.roadmap': { en: 'Roadmap', zh: '路线图' },
  'mk.footer.pricing': { en: 'Pricing', zh: '价格' },
  'mk.footer.about': { en: 'About', zh: '关于' },
  'mk.footer.contact': { en: 'Contact', zh: '联系' },
  'mk.footer.privacy': { en: 'Privacy', zh: '隐私政策' },
  'mk.footer.terms': { en: 'Terms', zh: '服务条款' },
  'mk.footer.security': { en: 'Security', zh: '安全' },
  'mk.footer.docs': { en: 'Documentation', zh: '文档' },
  'mk.footer.status': { en: 'System status', zh: '系统状态' },
  'mk.footer.copy': { en: '© 2026 Stayloop Inc. · Built in Ontario 🇨🇦', zh: '© 2026 Stayloop Inc. · 安省出品 🇨🇦' },
  'mk.footer.compliance': { en: 'PIPEDA · RTA 2006 · Ontario HRC aware', zh: 'PIPEDA · RTA 2006 · 安省人权法对齐' },

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
    en: 'All leasing decisions must comply with the Ontario Human Rights Code and the Residential Tenancies Act, 2006. It is prohibited to refuse an applicant on the basis of any protected ground (including but not limited to race, ancestry, place of origin, colour, ethnic origin, citizenship, creed, sex, sexual orientation, gender identity, gender expression, age, marital status, family status, disability, or receipt of public assistance).',
    zh: '所有租赁决定必须符合《安大略人权法典》和《2006 住宅租赁法》的规定。严禁基于任何受保护特征拒绝申请人，包括但不限于：种族、血统、出生地、肤色、族裔、公民身份、信仰、性别、性取向、性别认同、性别表达、年龄、婚姻状况、家庭状况、残疾，或是否接受公共援助。'
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
  'screen.result.court.pro': { en: 'PRO full query', zh: 'PRO 全量查询' },
  'screen.result.court.free': { en: 'FREE basic query', zh: 'FREE 基础查询' },
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
  'screen.result.flags': { en: '🚩 Flags & Recommendations', zh: '🚩 风险标记 & 建议' },
  'screen.result.weights': { en: '⚙️ Scoring Weights', zh: '⚙️ 评分权重说明' },
  'screen.result.footer.notice': {
    en: 'This report is for decision support only. Final leasing decisions must comply with the Ontario RTA / Human Rights Code.',
    zh: '本报告仅供决策参考。最终租赁决定应遵守 Ontario RTA / Human Rights Code。',
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

  // Dashboard
  'dash.tagline': { en: 'dashboard', zh: '控制台' },
  'dash.screenTenant': { en: '⚡ Screen tenant', zh: '⚡ 评估租客' },
  'dash.upgrade': { en: 'Upgrade', zh: '升级' },
  'dash.manageBilling': { en: 'Manage billing', zh: '账单管理' },
  'dash.opening': { en: 'Opening…', zh: '打开中…' },
  'dash.signOut': { en: 'Sign out', zh: '退出' },
  'dash.overview': { en: '// OVERVIEW', zh: '// 概览' },
  'dash.title': { en: 'Dashboard', zh: '控制台' },
  'dash.newListing': { en: '+ New listing', zh: '+ 新建房源' },
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
  'newListing.create': { en: 'Create listing →', zh: '创建房源 →' },
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
  'apply.consent.body': { en: 'By submitting, you authorize the landlord and Stayloop to verify your information, contact references, search publicly available LTB and Ontario court records, and obtain a credit report. Data retained 90 days then deleted. Compliant with the Ontario Human Rights Code.', zh: '提交即表示您授权房东和 Stayloop 核实您的信息、联系推荐人、查询公开的 LTB 及安省法庭记录，并获取信用报告。数据保留 90 天后删除，符合《安省人权法典》。' },
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
  'login.badge': { en: '// LANDLORD ACCESS', zh: '// 房东入口' },
  'login.title': { en: 'Sign in to Stayloop', zh: '登录 Stayloop' },
  'login.sub': { en: "Enter your email — we'll send a one-time link. No password.", zh: '输入邮箱 — 我们会发送一次性登录链接。无需密码。' },
  'login.email': { en: 'EMAIL ADDRESS', zh: '邮箱地址' },
  'login.send': { en: 'Send magic link →', zh: '发送登录链接 →' },
  'login.sent': { en: 'Check your inbox for the magic link.', zh: '请查收邮箱中的登录链接。' },
  'login.footer': { en: 'Encrypted · PIPEDA compliant · Built in Ontario', zh: '加密 · PIPEDA 合规 · 安省出品' },
  'login.emailLabel': { en: 'Email address', zh: '邮箱地址' },
  'login.sending': { en: 'Sending magic link...', zh: '发送中...' },
  'login.checkInbox': { en: 'Check your inbox', zh: '请查收邮箱' },
  'login.sentDetail': { en: 'We sent a magic link to {email}. Click it to sign in.', zh: '我们已向 {email} 发送登录链接，点击即可登录。' },

  // Language toggle
  'lang.switch': { en: '中文', zh: 'EN' },
} as const

export type DictKey = keyof typeof DICT

// ─── Context ───────────────────────────────────────────────────

interface I18nCtx {
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: DictKey, vars?: Record<string, string | number>) => string
}

const Ctx = createContext<I18nCtx | null>(null)

function format(str: string, vars?: Record<string, string | number>) {
  if (!vars) return str
  return str.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : `{${k}}`))
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('zh')

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? (localStorage.getItem('stayloop_lang') as Lang | null) : null
    if (stored === 'en' || stored === 'zh') {
      setLangState(stored)
    } else if (typeof navigator !== 'undefined') {
      const browser = navigator.language || ''
      setLangState(browser.toLowerCase().startsWith('zh') ? 'zh' : 'en')
    }
  }, [])

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'
    }
  }, [lang])

  const setLang = (l: Lang) => {
    setLangState(l)
    if (typeof window !== 'undefined') localStorage.setItem('stayloop_lang', l)
  }

  const t = (key: DictKey, vars?: Record<string, string | number>) => {
    const entry = DICT[key]
    if (!entry) return String(key)
    return format(entry[lang] ?? entry.en, vars)
  }

  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>
}

export function useT() {
  const ctx = useContext(Ctx)
  if (!ctx) {
    // Safe fallback so non-wrapped contexts still render English
    const t = (key: DictKey, vars?: Record<string, string | number>) => {
      const entry = DICT[key]
      return entry ? format(entry.en, vars) : String(key)
    }
    return { lang: 'en' as Lang, setLang: (_: Lang) => {}, t }
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
        gap: 6,
        padding: '6px 12px',
        borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.12)',
        background: 'rgba(255,255,255,0.03)',
        color: '#94a3b8',
        fontSize: 12,
        cursor: 'pointer',
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
