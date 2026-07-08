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
  stats: [
    { k: { zh: '每份申请,读懂再排序', en: 'every application read & ranked' }, v: { zh: '它替你把关', en: 'It screens for you' } },
    { k: { zh: 'RTA / OHRC 自动合规', en: 'RTA / OHRC on autopilot' }, v: { zh: '零踩雷', en: 'Zero missteps' } },
    { k: { zh: '租金一分不抽', en: 'no cut of your rent' }, v: { zh: '0% 抽成', en: '0% commission' } },
  ],
}

export default function LandlordLanding() {
  return <RoleLanding cfg={CFG} />
}
