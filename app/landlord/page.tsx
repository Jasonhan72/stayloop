'use client'

import RoleLanding, { RoleLandingConfig } from '@/components/RoleLanding'

const CFG: RoleLandingConfig = {
  role: 'landlord',
  eyebrow: 'LANDLORD · 房东 · AI 助理',
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
    { zh: '申请按待筛查 / 待决定 / 已决定分组', en: 'Applications grouped: to screen / to decide / decided' },
    { zh: '四项评分 + 每条结论标出处', en: 'Four scored areas, every conclusion sourced' },
    { zh: 'RTA 雷区,当场拦下', en: 'RTA landmines flagged live' },
    { zh: '安省标准租约 · 电子签', en: 'Ontario standard lease · e-sign' },
  ],
  demo: {
    ask: { zh: '把 King West 的一居挂出去,新申请帮我看看。', en: 'List my King West 1-bed, and look over the new applications.' },
    reply: {
      zh: '房源草稿已生成,你核对后发布。3 份新申请:2 份材料齐全,可在申请人页一键筛查;1 份还缺工资单,可以在申请对话里请 TA 补。录取谁由你决定。',
      en: 'Your listing draft is ready to review and publish. 3 new applications: 2 have complete documents and can be screened in one click from the applicant page; 1 is missing a paystub — you can ask for it in the application thread. Who to accept is your call.',
    },
    task: { zh: '房源草稿 · 材料清点 · 一键筛查 · 申请对话', en: 'Listing draft · document check · one-click screening · application thread' },
    note: { zh: '每一步留痕可审,决定只属于你。', en: 'Every step audited — the decision is only yours.' },
  },
  journey: [
    { h: { zh: '一句话挂牌', en: 'List in one sentence' }, b: { zh: '贴 Realtor.ca 链接或说一句话,AI 生成房源草稿;你核对后发布,Stayloop 审核后上线。', en: 'Paste a Realtor.ca link or say one sentence — AI drafts the listing; you review and publish, and it goes live after Stayloop checks it.' } },
    { h: { zh: '申请按阶段整理', en: 'Applications, sorted by stage' }, b: { zh: '按待筛查 / 待决定 / 已决定分组,缺什么材料一眼看到;在申请对话里请 TA 补。', en: 'Grouped into to screen / to decide / decided, with missing documents visible at a glance; ask for them in the application thread.' } },
    { h: { zh: '一键筛查', en: 'One-click screening' }, b: { zh: '四项评分:付款能力、信用、租务与司法历史、核验;文件取证、LTB 判令与法院记录逐条标出处。', en: 'Four scored areas: ability to pay, credit, tenancy & court history, verification; document forensics, LTB orders and court records, each sourced.' } },
    { h: { zh: '你来决定', en: 'You decide' }, b: { zh: '不排名、不设收入倍数截止线(OHRC);录取或婉拒由你决定,通知信先给你预览再发。', en: 'No ranking, no income-multiple cut-off (OHRC); you accept or decline, and the notice is shown to you before it is sent.' } },
    { h: { zh: '租约到续约', en: 'Lease to renewal' }, b: { zh: '安省标准租约与电子签;双签后成为在管租约,报修、租金记录、续约 90 / 60 / 30 天提醒都在这里。', en: 'Ontario standard lease and e-sign; once both sign it becomes a managed tenancy, with repairs, the rent record and 90 / 60 / 30-day renewal reminders in one place.' } },
  ],
  story: [
    {
      file: 'sarah-01-vacancy.jpg',
      fallback: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=700&q=80&fit=crop&auto=format',
      label: { zh: '之前 · 空置在烧钱', en: 'Before · vacancy burns' },
      text: { zh: '房子空着,一叠申请不知道信谁,还要提防 RTA 合规雷区。', en: 'An empty unit, a stack of applications she couldn\'t trust, RTA landmines everywhere.' },
    },
    {
      file: 'sarah-02-logic.jpg',
      fallback: 'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=700&q=80&fit=crop&auto=format',
      label: { zh: 'AI 助理接管', en: 'The AI Agent takes over' },
      text: { zh: 'AI 生成房源草稿,「不养宠」雷区当场拦下;每份申请按材料整理,一键筛查出四项评分,每条结论标出处。', en: 'AI drafted the listing and flagged the "no pets" landmine on the spot; applications were organised by their documents, and one-click screening gave four scored areas with every conclusion sourced.' },
    },
    {
      file: 'sarah-03-decide.jpg',
      fallback: 'https://images.unsplash.com/photo-1567496898669-ee935f5f647a?w=700&q=80&fit=crop&auto=format',
      label: { zh: '她来决定', en: 'She decides' },
      text: { zh: '她读完报告,自己选了租客;安省标准租约起草好,她预览后点了发送。报修和到期前 90 天的续约提醒,都在同一个工作台。', en: 'She read the reports and chose her tenant herself; the Ontario standard lease was drafted, and she previewed it before pressing send. Repairs and the renewal reminder 90 days out sit in the same workspace.' },
    },
  ],
  scenario: {
    name: 'Sarah Wang',
    meta: { zh: '41 · 会计师 · 2 套投资公寓', en: '41 · Accountant · 2 investment condos' },
    quote: { zh: '做决定前要查、要比,还怕踩 RTA 的雷。', en: 'Before deciding I have to check, compare, and worry about tripping an RTA landmine.' },
    before: { zh: '房子空着,一叠申请不知道信谁,深夜还被报修电话吵醒。', en: 'An empty unit, a stack of applications she couldn\'t trust, and late-night maintenance calls.' },
    after: { zh: 'AI 生成房源草稿、按材料整理申请、一键出筛查报告;录取谁由她自己决定。报修和续约提醒,也在同一个工作台。', en: 'AI drafted the listing, organised the applications by their documents and produced the screening reports in one click; who to accept was her own call. Repairs and renewal reminders live in the same workspace.' },
    delta: { zh: '决定权始终在你', en: 'The decision stays yours' },
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
