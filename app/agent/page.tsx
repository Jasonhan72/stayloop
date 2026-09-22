'use client'

import RoleLanding, { RoleLandingConfig } from '@/components/RoleLanding'

const CFG: RoleLandingConfig = {
  role: 'agent',
  eyebrow: 'AGENT · 经纪 · AI Agent',
  agentName: 'AI Agent',
  color: '#2563EB',
  h1: {
    zh: <>把杂活交给 AI,<br />把佣金和关系留给自己。</>,
    en: <>Hand the busywork to AI —<br />keep the commission and the relationships.</>,
  },
  sub: {
    zh: '你的时间应该花在带看、谈判和赢得信任上。剩下的 —— 整理客户、准备材料、排程、跟进 —— 交给一个不睡觉的后台。纯 SaaS 工具,不抽你一分佣金。',
    en: "Your hours belong to showings, negotiation and earning trust. Everything else — organizing clients, prepping materials, scheduling, follow-ups — goes to a back office that never sleeps. Pure SaaS: we never touch your commission.",
  },
  primaryCta: { label: { zh: '把杂活交给 AI →', en: 'Hand the busywork to AI →' }, href: '/onboarding/name?role=agent', authedHref: '/agent/agent' },
  secondaryCta: { label: { zh: '看看定价', en: 'See pricing' }, href: '/pricing' },
  ctaNote: { zh: '纯 SaaS · 不抽佣金 · RECO 合规内建', en: 'Pure SaaS · zero commission cut · RECO compliance built in' },
  agentPoints: [
    { zh: '客户与材料,一键就绪', en: 'Clients & materials, one click' },
    { zh: '日历排程 · 路线规划', en: 'Calendar & route planning' },
    { zh: '跟进清单,AI 帮你整理', en: 'Follow-up lists, organised by AI' },
    { zh: 'RECO 合规提醒 · 留痕', en: 'RECO reminders · audit trail' },
    { zh: '替客户下单租客筛查,几分钟出报告', en: 'Order tenant screening for clients — report in minutes' },
    { zh: '筛查报告 · 认证护照,一键转发房东', en: 'Screening report & verified passport, one click to the landlord' },
  ],
  demo: {
    ask: { zh: '明天 3 个带看,资料帮我备好。', en: 'Three showings tomorrow — prep everything for me.' },
    reply: {
      zh: '3 份带看包已生成:业主披露、社区数据、比价表。路线已按日历排好,跟进清单也列好了。',
      en: 'Three showing packs ready: owner disclosures, neighbourhood data, comps. Route is on your calendar, and the follow-up list is drafted.',
    },
    task: { zh: '材料包 · 路线 · 跟进清单 · 看房记录', en: 'Packs · route · follow-up list · showing notes' },
    note: { zh: '带看结束,记录自动归档留痕。', en: 'After each showing, notes are filed and audited automatically.' },
  },
  journey: [
    { h: { zh: '租客主动找你', en: 'Tenants come to you' }, b: { zh: '认证后进入房源页的经纪目录，租客自选联系；来时已验证、已画像。', en: 'Once verified you appear in the listing-page directory; tenants pick and contact you, already verified and profiled.' } },
    { h: { zh: '杂活进收件箱', en: 'Busywork hits the inbox' }, b: { zh: 'AI 按你的日历接单、排程、备材料。', en: 'AI takes the tasks, schedules them around your calendar and preps the materials.' } },
    { h: { zh: '你只管带看', en: 'You just show up' }, b: { zh: '现场记录、授权清晰,专业的部分归你。', en: 'On-site notes, clear authorization — the professional part stays yours.' } },
    { h: { zh: '跟进它来盯', en: 'It runs the follow-ups' }, b: { zh: '客户记忆复用,进展自动提醒,不再跟丢。', en: 'Client memory is reused and progress auto-flagged — no one slips away.' } },
    { h: { zh: '当晚归档', en: 'Filed the same night' }, b: { zh: '带看记录自动归档、RECO 合规提醒、审计留痕。佣金与你的经纪公司之间结算，Stayloop 不经手。', en: 'Showing notes filed, RECO reminders, audit trail. Commission settles between you and your brokerage — Stayloop never touches it.' } },
  ],
  story: [
    {
      file: 'david-01-task.jpg',
      fallback: 'https://images.unsplash.com/photo-1484154218962-a197022b5858?w=700&q=80&fit=crop&auto=format',
      label: { zh: '接到任务', en: 'Task lands' },
      text: { zh: '提交 RECO 注册信息，人工核验后获得「RECO 注册已核」标记，进入租客可选的经纪目录。租客找上门：时间、地点、租客画像与授权问答清单，AI Agent 备好材料包。', en: 'Submit your RECO registration; once checked by hand you carry the “RECO verified” mark and appear in the tenant-facing directory. A tenant reaches out: time, place, profile and the authorized Q&A list — the AI agent preps the pack.' },
    },
    {
      file: 'david-02-showing.jpg',
      fallback: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=700&q=80&fit=crop&auto=format',
      label: { zh: '专业带看', en: 'The showing, done right' },
      text: { zh: '现场清单模式推进,可答/不可答边界清晰 —— 他只做专业的部分,记录自动归档留痕。', en: 'On-site checklist mode, clear can/can\'t-answer boundaries — he does only the professional part; notes file themselves.' },
    },
    {
      file: 'david-03-payout.jpg',
      fallback: 'https://images.unsplash.com/photo-1554995207-c18c203602cb?w=700&q=80&fit=crop&auto=format',
      label: { zh: '当晚归档', en: 'Filed that night' },
      text: { zh: '带看记录当晚自动归档留痕。月度回顾:带看 32 次、保留率 94%、Toronto West 区域 Top 8%。', en: 'Showing notes filed and audited the same night. Monthly review: 32 showings, 94% retention, top 8% in Toronto West.' },
    },
  ],
  scenario: {
    name: 'David Park',
    meta: { zh: '35 · 持牌经纪 · RECO 6 年', en: '35 · Licensed agent · 6 years with RECO' },
    quote: { zh: '不是没机会,是时间被行政碎片化了。', en: "It's not that there's no opportunity — my time is fragmented by admin." },
    before: { zh: '70% 的时间耗在整理材料、排时间、催跟进上;收入不稳,客户一忙就跟丢。', en: '70% of his time went to prepping materials, juggling schedules and chasing follow-ups; income swung, and busy weeks meant lost clients.' },
    after: { zh: 'AI 编排杂活、记录当晚归档,他只做带看与专业判断 —— 同样的一周,接得下两倍的客户。', en: 'AI orchestrates the busywork and files the notes the same night; he only does showings and judgment — the same week now fits twice the clients.' },
    delta: { zh: '时薪 $25 → $43', en: 'Hourly $25 → $43' },
  },
  chips: [
    { label: { zh: 'RECO 注册人工核验 · 不传证件', en: 'RECO registration checked by hand · no ID upload' }, href: '/agent/verify' },
    { label: { zh: 'Stayloop 不收费、不抽佣', en: 'Stayloop charges nothing, takes no commission' }, href: '/pricing' },
    { label: { zh: '筛查费不得转嫁申请人 · RTA s.134', en: 'Screening cost never passed to applicants · RTA s.134' }, href: '/screening' },
    { label: { zh: 'TRESA s.32 披露有记录', en: 'TRESA s.32 disclosure recorded' }, href: '/agent/verify' },
    { label: { zh: '数据库驻加拿大', en: 'Database in Canada' }, href: '/privacy' },
  ],
  benefits: [
    {
      h: { zh: '租客筛查：替房东客户下单，几分钟出报告', en: 'Tenant screening: order for your landlord client, report in minutes' },
      b: { zh: '与房东有书面代表协议、申请人书面同意（OREA Form 410）后上传材料；报告逐条引用文件行，录取与否由房东本人决定并发通知。', en: 'With a written representation agreement and the applicant\'s written consent (OREA Form 410), upload the file; the report cites every line, and the landlord makes and communicates the decision.' },
      ask: { zh: '替房东做租客筛查前，我需要哪三样东西？', en: 'What three things do I need before screening a tenant for a landlord?' },
    },
    {
      h: { zh: '挂牌定价：同区同户型的挂牌中位数', en: 'Pricing a listing: same-area, same-layout median' },
      b: { zh: '同一条 Stayloop → Realtor.ca → TRREB 管线，给你挂牌中位数与官方季度基准，按房源条件调整。', en: 'The same Stayloop → Realtor.ca → TRREB pipeline gives the asking-rent median and the official quarterly benchmark, adjusted for the unit.' },
      ask: { zh: 'Liberty Village 一居带车位，现在挂多少合适？', en: 'A one-bed with parking in Liberty Village — what should it list at now?' },
    },
    {
      h: { zh: '租约与押金：只引用事实，不扩写', en: 'Leases & deposits: facts only, no embellishment' },
      b: { zh: 'O. Reg. 9/18 标准租约强制而 OREA Form 400 只是要约；押金一个月只抵最后一月（RTA s.106）；21 天内交副本（s.12）；Information Guide 与多重代表披露先行。', en: 'O. Reg. 9/18 standard lease is mandatory while OREA Form 400 is only an offer; deposit one month applied to the last month (RTA s.106); copy within 21 days (s.12); Information Guide and multiple-representation disclosure first.' },
      ask: { zh: '房东要求押金两个月、附表 B 写禁宠，我该怎么跟房东说？', en: 'The landlord wants two months\' deposit and a no-pets clause in Schedule B — what do I tell them?' },
    },
  ],
  proof: {
    key: 'ltbOrders',
    label: { zh: '份 LTB 判令已入库可查（安省开放数据）', en: 'LTB orders indexed and searchable (Ontario open data)' },
    note: { zh: '筛查报告的 LTB 一行查的就是这个目录：按姓名与地址佐证实查，目录只覆盖安省已发布的窗口，「未查到」不等于「从未涉诉」。', en: 'The LTB line in every screening report searches this catalogue: matched by name with address corroboration. It covers only the window Ontario has published — "not found" is not "never involved".' },
  },
  faq: [
    { q: { zh: '认证要什么？', en: 'What does verification need?' }, a: { zh: '注册姓名、7 位 RECO 注册号、类别、经纪公司注册名、到期日与业务联系方式。不传证件、不收 SIN。管理员手动对照 RECO 公开注册库后标记「RECO 注册已核」。', en: 'Registered name, 7-digit RECO number, category, brokerage registered name, expiry and business contact. No ID upload, no SIN. An administrator checks the public RECO register by hand and marks you "RECO verified".' } },
    { q: { zh: 'Stayloop 收不收费？', en: 'Does Stayloop charge agents?' }, a: { zh: '不收。经纪档的付费功能标「即将推出」；筛查在测试期内免费，之后由经纪或房东承担，永远不得向申请人收取（RTA s.134）。', en: 'No. Paid agent tiers are marked "coming soon"; screening is free during the test period and afterwards paid by the agent or landlord — never the applicant (RTA s.134).' } },
    { q: { zh: '转介佣金怎么算？', en: 'How are referral commissions handled?' }, a: { zh: '不经手。转介佣金引擎已冻结、等待律师意见；佣金在你与经纪公司之间结算，Stayloop 不参与交易。', en: 'Not through us. The referral-commission engine is frozen pending legal advice; commission settles between you and your brokerage, and Stayloop takes no part in the trade.' } },
    { q: { zh: '租客怎么找到我？', en: 'How do tenants find me?' }, a: { zh: '认证后你出现在房源页的「找认证经纪」目录里，租客自选并直接联系你（邮件 / 电话）。Stayloop 不派单。', en: 'Once verified you appear in the "find a verified agent" directory on listing pages; tenants pick and contact you directly by email or phone. Stayloop does not dispatch.' } },
    { q: { zh: 'TRESA s.32 披露怎么做？', en: 'How is the TRESA s.32 disclosure done?' }, a: { zh: '你以房东身份发布房源或以租客身份申请时，系统弹出预填注册名 / RECO 号 / 经纪公司的通知文本，你送达并勾选「已保留书面确认」，Stayloop 只记录、不代送达。', en: 'When you publish as a landlord or apply as a tenant, a notice pre-filled with your registered name, RECO number and brokerage appears; you deliver it and tick "written confirmation kept". Stayloop records it and does not deliver on your behalf.' } },
    { q: { zh: '能替客户跑筛查吗？', en: 'Can I run screening on a client\'s behalf?' }, a: { zh: '可以下单，前提是与房东有书面代表协议、申请人书面同意核查，且录取 / 拒绝由房东本人决定并发出通知。报告不能作为拒绝的唯一依据。', en: 'You can order it, provided there is a written representation agreement with the landlord, the applicant\'s written consent, and the landlord personally makes and sends the decision. The report is never the sole ground to decline.' } },
  ],
}

export default function AgentLanding() {
  return <RoleLanding cfg={CFG} />
}
