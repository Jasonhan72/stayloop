'use client'

import RoleLanding, { RoleLandingConfig } from '@/components/RoleLanding'

const CFG: RoleLandingConfig = {
  role: 'landlord',
  eyebrow: 'LANDLORD · 房东 · AI Agent',
  agentName: 'AI Agent',
  color: '#047857',
  h1: {
    zh: <>空置的每一天都在烧钱。<br />让 AI 替你租得快、选得准。</>,
    en: <>Every vacant day burns money.<br />Let AI rent it faster — to the right person.</>,
  },
  sub: {
    zh: '它替你重做房源、读懂每一份申请、深挖每一个风险,再把法律雷区挡在你前面 —— 你只在关键时刻按一次「同意」。租金一分不抽,决定权始终在你手里。',
    en: "It rebuilds your listing, reads every application, digs into every risk and stands between you and the legal landmines — you just press 'Approve' at the moment that matters. Zero rent commission; the decision always stays yours.",
  },
  primaryCta: { label: { zh: '让 AI 接管出租 →', en: 'Let AI take over the rental →' }, href: '/onboarding/name?role=landlord' },
  secondaryCta: { label: { zh: '看看定价', en: 'See pricing' }, href: '/pricing' },
  ctaNote: { zh: '免费发布房源 · 租金 0 抽成', en: 'List free · 0% rent commission' },
  agentPoints: [
    { zh: '申请人流水线,一眼看清', en: 'Applicant pipeline at a glance' },
    { zh: '8 维深度尽调 + 可解释评分', en: '8-axis diligence, explainable' },
    { zh: 'RTA 雷区,当场拦下', en: 'RTA landmines flagged live' },
    { zh: '租约自动起草 · 电子签', en: 'Auto-drafted leases · e-sign' },
  ],
  demo: {
    ask: { zh: '把 King West 的一居挂出去,新申请帮我看看。', en: 'List my King West 1-bed, and look over the new applications.' },
    reply: {
      zh: '房源已就绪。3 份新申请都读完了:Mia 收入 4.2× 租金、8 维尽调无红旗,建议优先 —— 要我起草租约吗?',
      en: 'Listing is live. I read all 3 new applications: Mia earns 4.2× rent, zero red flags across 8 axes — recommend her first. Draft the lease?',
    },
    task: { zh: '尽调 · 排序 · 追材料 · 租约草稿', en: 'Diligence · rank · chase docs · lease draft' },
    note: { zh: '每一步留痕可审,决定只属于你。', en: 'Every step audited — the decision is only yours.' },
  },
  journey: [
    { h: { zh: '一句话挂牌', en: 'List in one sentence' }, b: { zh: '贴个旧链接,AI 几分钟重做出专业房源页。', en: 'Paste an old link — AI rebuilds a professional listing in minutes.' } },
    { h: { zh: '申请自动进流水线', en: 'Applications flow in' }, b: { zh: '自动去重、补全、追材料,你不用催。', en: 'Deduplicated, completed and chased automatically — no nagging needed.' } },
    { h: { zh: 'AI 读懂每个人', en: 'AI reads every applicant' }, b: { zh: '8 维尽调:收入、历史、法庭记录、文档真伪。', en: '8-axis diligence: income, history, court records, document authenticity.' } },
    { h: { zh: '30 秒拍板', en: 'Decide in 30 seconds' }, b: { zh: '每份申请压成一页结论,你只按「同意」。', en: 'Each application compressed to one page of conclusions — you just approve.' } },
    { h: { zh: '租约到收租,全托管', en: 'Lease to rent, managed' }, b: { zh: '自动起草、电子签、收租提醒、续约照看。', en: 'Auto-drafting, e-sign, rent reminders and renewals — looked after.' } },
  ],
  story: [
    {
      file: 'sarah-01-vacancy.jpg',
      fallback: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=700&q=80&fit=crop&auto=format',
      label: { zh: '之前 · 空置在烧钱', en: 'Before · vacancy burns' },
      text: { zh: '每月 $2,900 空置损失,一叠申请不知道信谁,还要提防 RTA 合规雷区。', en: '$2,900 a month lost to vacancy, a stack of applications she couldn\'t trust, RTA landmines everywhere.' },
    },
    {
      file: 'sarah-02-logic.jpg',
      fallback: 'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=700&q=80&fit=crop&auto=format',
      label: { zh: 'AI Agent 接管', en: 'The AI agent takes over' },
      text: { zh: '4 分钟重做房源、多平台同步;每份申请 8 维尽调读完排好序,「不养宠」雷区当场拦下。', en: 'Listing rebuilt and synced in 4 minutes; every application read and ranked across 8 axes, the "no pets" landmine flagged on the spot.' },
    },
    {
      file: 'sarah-03-decide.jpg',
      fallback: 'https://images.unsplash.com/photo-1567496898669-ee935f5f647a?w=700&q=80&fit=crop&auto=format',
      label: { zh: '30 秒拍板', en: 'Decide in 30 seconds' },
      text: { zh: '午休时按下「同意」,租约自动起草发出。夜间报修、Month 11 续约决策包,都有 AI Agent 盯着。', en: 'She pressed "Approve" during lunch; the lease drafted and sent itself. Night repairs and the Month-11 renewal pack are on the AI agent\'s watch.' },
    },
  ],
  scenario: {
    name: 'Sarah Wang',
    meta: { zh: '41 · 会计师 · 2 套投资公寓', en: '41 · Accountant · 2 investment condos' },
    quote: { zh: '做决定前要查、要比,还怕踩 RTA 的雷。', en: 'Before deciding I have to check, compare, and worry about tripping an RTA landmine.' },
    before: { zh: '每月空置烧掉 $2,900,一叠申请不知道信谁,深夜还被报修电话吵醒。', en: '$2,900 burned on vacancy each month, a stack of applications she couldn\'t trust, and late-night maintenance calls.' },
    after: { zh: 'AI 重做房源、读完全部申请并排好序,她在午休时按了一次「同意」。维修和续约,现在也归 AI 盯。', en: 'AI rebuilt the listing, read and ranked every application — she pressed "Approve" once, during lunch. Maintenance and renewals are now on AI\'s watch too.' },
    delta: { zh: '30 分钟 → 30 秒', en: '30 min → 30 sec' },
  },
  chips: [
    { label: { zh: '数据库驻加拿大', en: 'Database in Canada' }, href: '/privacy' },
    { label: { zh: '不收 SIN', en: 'No SIN collected' }, href: '/privacy' },
    { label: { zh: 'OHRC 租房政策口径', en: 'OHRC housing-policy scoring' }, href: '/screening' },
    { label: { zh: '不是消费者报告机构', en: 'Not a consumer reporting agency' }, href: '/screening' },
    { label: { zh: '测试期免费至 2026-10-14', en: 'Free until 2026-10-14' }, href: '/pricing' },
  ],
  benefits: [
    {
      h: { zh: '筛查：逐份读、互相对、查记录', en: 'Screening: read, cross-check, look up' },
      b: { zh: '工资单算术、征信转录、证件有效期、LTB 判令目录、安省法院门户、雇主注册状态。每条结论都标出来自哪份文件的哪一行；收入倍数只作信息，不是拒绝依据。', en: 'Paystub arithmetic, bureau transcription, ID validity, the LTB order catalogue, the Ontario courts portal, employer registry status. Every conclusion cites the file and line it came from; income ratios are information, never grounds to decline.' },
      ask: { zh: '租客筛查会看哪些文件、不看什么？', en: 'What does tenant screening look at, and what does it never look at?' },
    },
    {
      h: { zh: '租约：安省标准租约 + 电子签', en: 'Lease: Ontario standard lease + e-sign' },
      b: { zh: '按 O. Reg. 9/18 生成，押金不超过一个月租金，附表 B 只允许合法条款；双方签完自动归档到在管租约。', en: 'Generated per O. Reg. 9/18, deposit capped at one month, Schedule B limited to lawful terms; filed to your managed tenancies once both sides sign.' },
      ask: { zh: '帮我起草一份标准租约，租金 2450，11 月 1 日起。', en: 'Draft a standard lease for me: rent 2,450, starting November 1.' },
    },
    {
      h: { zh: '续约：到期前 90 / 60 / 30 天提醒你', en: 'Renewals: 90 / 60 / 30 days out' },
      b: { zh: '先给同区 TRREB 行情与 A / B 两个方案，再替你起草续约信；30 天仍无回复就提醒你直接联系。所有发送都要你点确认。', en: 'First the TRREB benchmark and an A / B rent option, then the renewal letter; at 30 days with no reply it tells you to call. Nothing is sent until you approve.' },
      ask: { zh: '我的租约明年 3 月到期，现在该做什么？', en: 'My lease ends next March — what should I be doing now?' },
    },
  ],
  proof: {
    key: 'screenings',
    label: { zh: '份筛查在 Stayloop 上完成', en: 'screenings completed on Stayloop' },
    note: { zh: '这是数据库里能直接数出来的数字。我们不展示百分比收益、客户数或评分——那些我们没有可审计的对照组。', en: 'A number counted straight from the database. We show no percentage gains, customer counts or ratings — we have no auditable control group for those.' },
  },
  faq: [
    { q: { zh: '免费能筛几次？', en: 'How many screenings are free?' }, a: { zh: '测试期（至 2026-10-14）不限次。之后免费档每月 5 次，含取证与信用分析；Pro $19/月不限次并开放深度核查。', en: 'Unlimited during the test period (until 2026-10-14). After that the free tier includes 5 a month with forensics and credit analysis; Pro at $19/month is unlimited and unlocks deep checks.' } },
    { q: { zh: '筛查看什么、不看什么？', en: 'What is checked — and what is not?' }, a: { zh: '看：收入文件算术与互证、征信转录与分析、证件有效性、LTB 判令目录、安省法院门户、雇主注册状态。不看、也不让模型推断 OHRC 受保护特征（国籍、家庭状况、收入来源类型等）。收入租金比只作信息，不设截止线。', en: 'Checked: income-document arithmetic and cross-checks, bureau transcription and analysis, ID validity, the LTB order catalogue, the Ontario courts portal, employer registry status. Never checked or inferred: OHRC protected grounds (nationality, family status, source of income and the rest). Income-to-rent is information only, with no cut-off.' } },
    { q: { zh: '申请人怎么授权？', en: 'How does the applicant authorise checks?' }, a: { zh: '你在筛查记录上生成一条链接，申请人本人签版本化同意后逐步授权身份（Veriff）、银行（Flinks）、征信（Equifax）。我们不收 SIN。', en: 'You generate a link on the screening record; the applicant signs a versioned consent and then authorises identity (Veriff), bank (Flinks) and credit (Equifax) step by step. We never collect a SIN.' } },
    { q: { zh: '我能让申请人付筛查费吗？', en: 'Can I charge the applicant for screening?' }, a: { zh: '不能。RTA s.134 禁止向租客收取申请或筛查费用。定价页与解锁流程都没有「让申请人付」的选项。', en: 'No. RTA s.134 prohibits charging tenants application or screening fees. Neither pricing nor the unlock flow has an "applicant pays" option.' } },
    { q: { zh: '报告能给申请人看吗？', en: 'Can the applicant see the report?' }, a: { zh: '可以，也应该。报告页有可打印的申请人通知信，说明参考了哪些材料、如何索取与更正（《消费者报告法》s.10(7)）。', en: 'Yes, and they should. The report page has a printable applicant notice explaining what was considered and how to request and correct it (Consumer Reporting Act s.10(7)).' } },
    { q: { zh: '数据存在哪？谁能看？', en: 'Where is the data stored and who can see it?' }, a: { zh: '数据库在 AWS 蒙特利尔（ca-central-1）。文件只有你本人与你授权的申请人链接可读；AI 服务商所在地在隐私页第 2 节如实列出。', en: 'The database is in AWS Montréal (ca-central-1). Files are readable only by you and the applicant link you authorise; AI providers and their locations are listed in section 2 of the privacy page.' } },
    { q: { zh: 'Stayloop 是消费者报告机构吗？', en: 'Is Stayloop a consumer reporting agency?' }, a: { zh: '不是。我们整理你收到的材料与公开记录，不向第三方出售报告。是否注册为报告机构正在研究，进展会写在隐私页。', en: 'No. We organise the material you received plus public records and sell no reports to third parties. Whether to register as an agency is under review; progress is posted on the privacy page.' } },
  ],
}

export default function LandlordLanding() {
  return <RoleLanding cfg={CFG} />
}
