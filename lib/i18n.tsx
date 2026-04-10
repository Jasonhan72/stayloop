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
    en: 'Built-in consent forms, data minimization, 90-day retention, and Canadian data residency from day one.',
    zh: '内置同意书、数据最小化、90 天保留，数据自首日起即存放于加拿大境内。',
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
  'home.screenEntry.b2.desc': { en: 'Searches LTB, Superior Court, Small Claims and Court of Appeal records against the applicant name via CanLII.', zh: '通过 CanLII 按申请人姓名检索 LTB、高等法院、小额法庭与上诉法院的公开记录。' },
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
  'mk.nav.pricing': { en: 'Pricing', zh: '定价' },
  'mk.nav.signin': { en: 'Sign in', zh: '登录' },
  'mk.nav.getStarted': { en: 'Start a screening', zh: '开始背调' },

  // Hero
  'mk.hero.eyebrow': { en: 'Ontario · An AI-driven rental ecosystem · PIPEDA compliant', zh: '安省 · AI 驱动的租赁生态系统 · 符合 PIPEDA' },
  'mk.hero.title1': { en: 'The trusted, AI-driven', zh: '可信任的 AI 驱动' },
  'mk.hero.title2': { en: 'rental ecosystem.', zh: '租赁生态系统。' },
  'mk.hero.sub': {
    en: 'Stayloop connects every step of a Canadian tenancy — applicant verification, listings, leasing, rent operations and ongoing tenant relationships — on a single trusted platform. It begins today with a fully cited applicant risk report, delivered in under 60 seconds.',
    zh: 'Stayloop 把加拿大租赁的每一个环节 —— 申请人核验、房源管理、签约、租金运营以及租后关系 —— 串联在同一个可信任平台上。今日已上线的第一步：60 秒内出具一份附完整引用的申请人风险报告。',
  },
  'mk.hero.ctaPrimary': { en: 'Start a screening', zh: '开始背调' },
  'mk.hero.ctaTenant': { en: 'For tenants', zh: '租客入口' },
  'mk.hero.trust1': { en: 'No credit card required', zh: '无需信用卡' },
  'mk.hero.trust2': { en: 'PIPEDA compliant', zh: '符合 PIPEDA' },
  'mk.hero.trust3': { en: 'Every conclusion cited', zh: '每项结论可追溯' },

  // Preview widget inside hero
  'mk.preview.header': { en: 'Applicant risk report · sample', zh: '申请人风险报告 · 样例' },
  'mk.preview.name': { en: 'Jamie Chen', zh: '陈家明' },
  'mk.preview.subtitle': { en: 'Ontario · Dual-track verified · 58 s', zh: '安省 · 双轨核验 · 用时 58 秒' },
  'mk.preview.score': { en: 'Risk score', zh: '风险评分' },
  'mk.preview.tier': { en: 'Recommendation', zh: '建议' },
  'mk.preview.tier.val': { en: 'Approve', zh: '通过' },
  'mk.preview.ratio': { en: 'Income / rent ratio', zh: '收入租金比' },
  'mk.preview.ltb': { en: 'Court records', zh: '法庭记录' },
  'mk.preview.ltb.val': { en: '0 in 10 yrs', zh: '近 10 年 0 条' },
  'mk.preview.dim1': { en: 'Ability to pay', zh: '还款能力' },
  'mk.preview.dim2': { en: 'Credit health', zh: '信用状况' },
  'mk.preview.dim3': { en: 'Rental history', zh: '租赁历史' },
  'mk.preview.dim4': { en: 'Identity & employer', zh: '身份与雇主' },
  'mk.preview.note': { en: 'Employment income verified. Income/rent ratio 3.4×. No document tampering detected. No adverse records across Ontario public court archives. Full evidence trail attached.', zh: '就业收入已核验。收入租金比 3.4×。未发现文件篡改。安省公开法庭记录中无不利记录。附完整证据链。' },

  // Trust bar
  'mk.trust.heading': { en: 'A trusted, fully auditable technology stack', zh: '可信任、完全可审计的技术栈' },
  'mk.trust.claude': { en: 'Claude Sonnet 4.5', zh: 'Claude Sonnet 4.5' },
  'mk.trust.canlii': { en: 'CanLII Ontario full coverage', zh: 'CanLII 安省全库' },
  'mk.trust.supabase': { en: 'Open Banking ready', zh: '支持 Open Banking' },
  'mk.trust.cloudflare': { en: 'Cloudflare edge', zh: 'Cloudflare 边缘网络' },
  'mk.trust.pipeda': { en: 'PIPEDA compliant', zh: '符合 PIPEDA' },
  'mk.trust.ohrc': { en: 'Canadian data residency', zh: '数据存放于加拿大' },

  // Dual audience
  'mk.dual.eyebrow': { en: 'ECOSYSTEM', zh: '生态系统' },
  'mk.dual.title': { en: 'One ecosystem. Both sides of the lease.', zh: '同一个生态系统，服务租约双方。' },
  'mk.dual.sub': { en: 'Stayloop is built so landlords and tenants meet on the same trusted platform — verified, transparent, and connected end-to-end.', zh: 'Stayloop 让房东与租客在同一个可信任的平台上对接 —— 已核验、透明、全流程贯通。' },

  'mk.dual.landlord.tag': { en: 'LANDLORDS', zh: '房东' },
  'mk.dual.landlord.title': { en: 'A connected operating layer for your rentals', zh: '为您的房源打造的全流程运营层' },
  'mk.dual.landlord.desc': { en: 'From listing and verification through leasing and rent collection — every step lives on one trusted platform.', zh: '从发布房源、核验申请人，到签约和收租，每个环节都运行在同一个可信任的平台上。' },
  'mk.dual.landlord.b1': { en: 'AI-driven applicant verification with full Ontario CanLII coverage', zh: 'AI 驱动的申请人核验，安省 CanLII 全覆盖' },
  'mk.dual.landlord.b2': { en: 'Listings, applications and lease workflow on a single platform', zh: '房源、申请与签约在同一个平台中流转' },
  'mk.dual.landlord.b3': { en: 'Rent collection, reconciliation and tenant relationship tools', zh: '收租、对账与租后关系管理工具' },
  'mk.dual.landlord.cta': { en: 'Start a screening', zh: '开始背调' },

  'mk.dual.tenant.tag': { en: 'TENANTS', zh: '租客' },
  'mk.dual.tenant.title': { en: 'A verified profile you carry with you', zh: '可随身携带的认证档案' },
  'mk.dual.tenant.desc': { en: 'A reusable verification profile designed for newcomers, self-employed applicants and renters with limited credit history.', zh: '专为新移民、自雇人士及信用记录有限的租客设计的可复用核验档案。' },
  'mk.dual.tenant.b1': { en: 'Tenant-owned profile, shared on the applicant\u2019s terms', zh: '档案由租客本人持有，自主决定向谁披露' },
  'mk.dual.tenant.b2': { en: 'Verify once, reuse with multiple landlords', zh: '一次核验，可向多位房东复用' },
  'mk.dual.tenant.b3': { en: 'Same report visible to both tenant and landlord', zh: '租客与房东看到的是同一份报告' },
  'mk.dual.tenant.cta': { en: 'Request early access', zh: '申请抢先体验' },
  'mk.dual.tenant.soon': { en: 'Q3 2026', zh: '2026 年 Q3' },

  // Featured screening product
  'mk.screening.eyebrow': { en: 'LIVE TODAY', zh: '已上线' },
  'mk.screening.title': { en: 'Step one of the ecosystem: AI-driven applicant verification', zh: '生态系统的第一步：AI 驱动的申请人核验' },
  'mk.screening.sub': { en: 'A structured five-dimension risk report with full citations, delivered in under 60 seconds.', zh: '结构化五维风险报告，附完整引用，60 秒内出具。' },
  'mk.screening.f1.title': { en: 'Five-dimension risk model', zh: '五维风险模型' },
  'mk.screening.f1.desc': { en: 'Ability to pay, credit health, rental history, identity verification, and application completeness. Every report discloses the rules and warning signals that have been triggered.', zh: '还款能力、信用状况、租赁历史、身份核验、申请完整度。每份报告都会披露被触发的规则与预警信号。' },
  'mk.screening.f2.title': { en: 'Ontario court records coverage', zh: '安省法庭记录覆盖' },
  'mk.screening.f2.desc': { en: 'Parallel search across the LTB, Superior Court, Small Claims and Court of Appeal records through CanLII. Every match cites its source record.', zh: '通过 CanLII 并行检索 LTB、高等法院、小额法庭与上诉法院公开记录。每条命中均附原始记录引用。' },
  'mk.screening.f3.title': { en: 'Document forensics', zh: '文件鉴伪' },
  'mk.screening.f3.desc': { en: 'Cross-document identity matching, metadata analysis, and tamper detection on pay stubs, government IDs and bank statements.', zh: '跨文件身份比对、元数据分析，以及对工资单、政府证件与银行流水的篡改检测。' },
  'mk.screening.f4.title': { en: 'Cash-flow analysis', zh: '现金流分析' },
  'mk.screening.f4.desc': { en: 'Open Banking-ready cash-flow analysis that works without a credit bureau pull. Suitable for self-employed applicants, newcomers and renters with limited credit history.', zh: '支持 Open Banking 的现金流分析，无需查询征信局也能使用。适用于自雇人士、新移民及信用记录有限的租客。' },
  'mk.screening.f5.title': { en: 'Connected to the ecosystem', zh: '与生态系统打通' },
  'mk.screening.f5.desc': { en: 'A verified application flows directly into listings, lease generation and rent operations as those modules come online.', zh: '已核验的申请会直接流转至房源管理、租约生成与租金运营等模块（随对应模块陆续上线）。' },
  'mk.screening.f6.title': { en: 'Bilingual reports', zh: '双语报告' },
  'mk.screening.f6.desc': { en: 'Reports can be viewed in English or Simplified Chinese, switchable with one click.', zh: '报告支持中英双语，一键切换。' },
  'mk.screening.cta': { en: 'Start a screening', zh: '开始背调' },

  // How it works
  'mk.how.eyebrow': { en: 'PROCESS', zh: '流程' },
  'mk.how.title': { en: 'How a screening runs', zh: '背调流程' },
  'mk.how.1.n': { en: '01', zh: '01' },
  'mk.how.1.title': { en: 'Submit documents', zh: '提交材料' },
  'mk.how.1.desc': { en: 'Upload pay stubs, bank statements, government ID, references, and self-ordered credit reports. All common formats supported.', zh: '上传工资单、银行流水、政府证件、推荐信和租客自查的信用报告，常见格式均可。' },
  'mk.how.2.n': { en: '02', zh: '02' },
  'mk.how.2.title': { en: 'Document forensics', zh: '文件鉴伪' },
  'mk.how.2.desc': { en: 'Cross-document identity matching, metadata analysis, and tamper detection across every submitted file.', zh: '对每一份材料进行跨文件身份比对、元数据分析与篡改检测。' },
  'mk.how.3.n': { en: '03', zh: '03' },
  'mk.how.3.title': { en: 'Cash-flow & court records', zh: '现金流与法庭记录' },
  'mk.how.3.desc': { en: 'Cash-flow analysis runs in parallel with a full Ontario CanLII search. Every finding links back to its source record.', zh: '现金流分析与 CanLII 安省全库检索并行进行，每条结果都可回溯至原始记录。' },
  'mk.how.4.n': { en: '04', zh: '04' },
  'mk.how.4.title': { en: 'Report delivery', zh: '报告出具' },
  'mk.how.4.desc': { en: 'A five-dimension risk report is issued with reasoning, compliance notice and a complete citation index.', zh: '出具五维风险报告，附评分依据、合规声明与完整引用索引。' },

  // Roadmap
  'mk.roadmap.eyebrow': { en: 'ROADMAP', zh: '路线图' },
  'mk.roadmap.title': { en: 'The full ecosystem', zh: '完整生态系统' },
  'mk.roadmap.sub': { en: 'Each module connects to the next, so a verified applicant becomes a signed lease, an on-time rent payment, and a long-term tenant relationship.', zh: '每个模块都与下一个模块相连，让一份已核验的申请，顺畅衔接到签约、按时收租，再到长期的租后关系。' },
  'mk.roadmap.status.live': { en: 'Live', zh: '已上线' },
  'mk.roadmap.status.beta': { en: 'Beta', zh: '内测中' },
  'mk.roadmap.status.soon': { en: 'In development', zh: '开发中' },
  'mk.roadmap.status.planned': { en: 'Planned', zh: '规划中' },
  'mk.roadmap.1.title': { en: 'Dual-track AI screening', zh: '双轨 AI 背调' },
  'mk.roadmap.1.desc': { en: 'Cash-flow analysis, document forensics, full Ontario CanLII coverage, five-dimension risk report.', zh: '现金流分析、文件鉴伪、安省 CanLII 全覆盖、五维风险报告。' },
  'mk.roadmap.2.title': { en: 'Listings & applications', zh: '房源与申请管理' },
  'mk.roadmap.2.desc': { en: 'Centralized listing publication and applicant document collection.', zh: '统一发布房源、统一收取申请材料。' },
  'mk.roadmap.3.title': { en: 'Ontario Standard Lease generator', zh: '安省标准租约生成器' },
  'mk.roadmap.3.desc': { en: 'Form 2229 lease generated from verified application data, with e-signature.', zh: '基于已核验的申请资料生成 Form 2229 租约，支持电子签名。' },
  'mk.roadmap.4.title': { en: 'Rent collection & reconciliation', zh: '收租与对账' },
  'mk.roadmap.4.desc': { en: 'Interac e-Transfer reconciliation, scheduled reminders and a delinquency workflow.', zh: 'Interac e-Transfer 对账、定时提醒，以及逾期处理流程。' },
  'mk.roadmap.5.title': { en: 'LTB notice assistant', zh: 'LTB 通知助手' },
  'mk.roadmap.5.desc': { en: 'Drafting of N4, N5 and N12 notices with statutory citations.', zh: '起草 N4、N5、N12 通知，并附法条引用。' },
  'mk.roadmap.6.title': { en: 'Verified tenant profile', zh: '认证租客档案' },
  'mk.roadmap.6.desc': { en: 'A reusable verification credential owned by the tenant.', zh: '由租客本人持有、可重复使用的核验档案。' },
  'mk.roadmap.7.title': { en: 'Rent guarantee program', zh: '租金保障计划' },
  'mk.roadmap.7.desc': { en: 'Capital-backed default protection built on top of the screening layer.', zh: '在背调能力之上构建的资本支撑违约保障。' },

  // Compliance & security
  'mk.sec.eyebrow': { en: 'TRUST', zh: '信任' },
  'mk.sec.title': { en: 'Built on trust and data governance', zh: '建立在信任与数据治理之上' },
  'mk.sec.sub': { en: 'Privacy, residency and access controls designed for Canadian rental data.', zh: '面向加拿大租赁数据的隐私、存放地与访问控制。' },
  'mk.sec.1.title': { en: 'PIPEDA compliant', zh: '符合 PIPEDA' },
  'mk.sec.1.desc': { en: 'Data minimization, purpose limitation and express consent. Storage is scoped per screening and private by default.', zh: '遵循数据最小化、目的限定与明示同意原则；存储按背调隔离，默认私有。' },
  'mk.sec.2.title': { en: 'Canadian data residency', zh: '数据存放于加拿大' },
  'mk.sec.2.desc': { en: 'Applicant documents and reports are stored in Canadian regions and never transferred outside without express authorization.', zh: '申请人材料与报告均存放在加拿大境内的服务区域，未经明示授权不会转出境外。' },
  'mk.sec.3.title': { en: 'Tenant-controlled deletion', zh: '由用户决定删除' },
  'mk.sec.3.desc': { en: 'Account holders can delete a screening — and every file attached to it — at any time. Records expire on a defined retention schedule.', zh: '账户持有人可随时删除某次背调及其全部相关文件；记录按既定保留周期自动过期。' },
  'mk.sec.4.title': { en: 'No competitor data sharing', zh: '不共享同行数据' },
  'mk.sec.4.desc': { en: 'Stayloop never collects or shares non-public competitor rent data. Pricing decisions stay entirely with the landlord.', zh: 'Stayloop 从不收集、也从不共享非公开的同行租金数据；定价决策完全由房东自主作出。' },

  // Pricing
  'mk.pricing.eyebrow': { en: 'PRICING', zh: '定价' },
  'mk.pricing.title': { en: 'Pricing', zh: '定价方案' },
  'mk.pricing.sub': { en: 'Transparent monthly plans. Cancel anytime.', zh: '透明的月度方案，可随时取消。' },
  'mk.pricing.free.label': { en: 'STARTER', zh: '入门版' },
  'mk.pricing.free.price': { en: '$0', zh: '$0' },
  'mk.pricing.free.unit': { en: '/ month', zh: '/ 月' },
  'mk.pricing.free.sub': { en: 'For independent landlords with light monthly usage.', zh: '适合每月用量较少的独立房东。' },
  'mk.pricing.free.f1': { en: '5 screenings per month', zh: '每月 5 次背调' },
  'mk.pricing.free.f2': { en: 'Full Ontario CanLII coverage', zh: '安省 CanLII 全覆盖' },
  'mk.pricing.free.f3': { en: 'Document forensics', zh: '文件鉴伪' },
  'mk.pricing.free.f4': { en: 'Bilingual reports', zh: '中英双语报告' },
  'mk.pricing.free.f5': { en: 'Report history', zh: '报告历史记录' },
  'mk.pricing.free.cta': { en: 'Get started', zh: '立即开始' },
  'mk.pricing.pro.label': { en: 'PROFESSIONAL', zh: '专业版' },
  'mk.pricing.pro.price': { en: '$29', zh: '$29' },
  'mk.pricing.pro.unit': { en: '/ month', zh: '/ 月' },
  'mk.pricing.pro.sub': { en: 'For property managers and landlords with multiple units.', zh: '适合多套房源的物业经理与房东。' },
  'mk.pricing.pro.f1': { en: 'Unlimited screenings', zh: '无限次背调' },
  'mk.pricing.pro.f2': { en: 'Priority court records lookup', zh: '法庭记录优先处理' },
  'mk.pricing.pro.f3': { en: 'Batch reports and team seats', zh: '批量报告与团队席位' },
  'mk.pricing.pro.f4': { en: 'Early access to listings and lease modules', zh: '抢先体验房源与租约模块' },
  'mk.pricing.pro.f5': { en: 'Priority support', zh: '优先支持' },
  'mk.pricing.pro.cta': { en: 'Upgrade', zh: '升级' },
  'mk.pricing.pro.tag': { en: 'RECOMMENDED', zh: '推荐' },

  // FAQ
  'mk.faq.eyebrow': { en: 'FAQ', zh: '常见问题' },
  'mk.faq.title': { en: 'Frequently asked questions', zh: '常见问题' },
  'mk.faq.q1': { en: 'What is included in the Starter plan?', zh: '入门版包含什么？' },
  'mk.faq.a1': { en: 'Five screenings per month, with dual-track verification, full Ontario CanLII coverage and the complete five-dimension risk report. No credit card required.', zh: '每月 5 次背调，包含双轨核验、安省 CanLII 全覆盖与完整的五维风险报告。无需信用卡。' },
  'mk.faq.q2': { en: 'How does Stayloop differ from enterprise platforms such as RealPage or Yardi?', zh: 'Stayloop 与 RealPage、Yardi 等企业级平台有什么不同？' },
  'mk.faq.a2': { en: 'Stayloop is built for independent landlords and small portfolios. It only performs applicant-level screening and does not collect, share or rely on any non-public competitor rent data.', zh: 'Stayloop 专为独立房东与中小持有人打造，只针对申请人本人做背调，从不收集、共享或依赖任何非公开的同行租金数据。' },
  'mk.faq.q3': { en: 'Where is applicant data stored?', zh: '申请人数据存放在哪里？' },
  'mk.faq.a3': { en: 'All applicant documents and reports are stored in Canadian regions under PIPEDA. Account holders can delete a screening and every attached file at any time.', zh: '所有申请人材料与报告均存放在加拿大境内、遵循 PIPEDA。账户持有人可随时删除某次背调及其全部相关文件。' },
  'mk.faq.q4': { en: 'Who controls the uploaded documents?', zh: '上传的资料由谁掌握？' },
  'mk.faq.a4': { en: 'The account holder. Files are stored in private buckets with row-level security and can be deleted from the account at any time.', zh: '由账户持有人掌握。文件存储在带行级安全的私有空间，可随时从账户中删除。' },
  'mk.faq.q5': { en: 'Is Stayloop available outside Ontario?', zh: 'Stayloop 在安省以外是否可用？' },
  'mk.faq.a5': { en: 'The platform is currently Ontario-first. Other Canadian provinces are on the roadmap.', zh: '目前优先服务安省，加拿大其他省份已列入路线图。' },
  'mk.faq.q6': { en: 'Will tenants have a dedicated product?', zh: '租客会有专门的产品吗？' },
  'mk.faq.a6': { en: 'A tenant-owned verified profile is scheduled for Q3 2026, allowing renters to share verification with multiple landlords.', zh: '租客自有的认证档案计划于 2026 年 Q3 上线，可一次完成核验、向多位房东复用。' },

  // Final CTA
  'mk.finalcta.title': { en: 'Screen your next applicant with confidence.', zh: '为下一位申请人开始一次可靠的背调。' },
  'mk.finalcta.sub': { en: 'No credit card required.', zh: '无需信用卡。' },
  'mk.finalcta.primary': { en: 'Start a screening', zh: '开始背调' },
  'mk.finalcta.secondary': { en: 'View roadmap', zh: '查看路线图' },

  // Footer
  'mk.footer.tagline': { en: 'Institutional-grade tenant screening for Canadian landlords.', zh: '为加拿大房东打造的机构级租客背调平台。' },
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
  'mk.footer.compliance': { en: 'PIPEDA · RTA 2006 · Canadian data residency', zh: 'PIPEDA · RTA 2006 · 数据存放于加拿大' },

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
