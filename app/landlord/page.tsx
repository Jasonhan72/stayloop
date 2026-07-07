'use client'

import RoleLanding, { RoleLandingConfig } from '@/components/RoleLanding'

const CFG: RoleLandingConfig = {
  role: 'landlord',
  eyebrow: 'LANDLORD · 房东 · AI Agent',
  agentName: 'AI Agent',
  color: '#047857',
  h1: {
    zh: <>是流水线,不是收件箱。<br />AI Agent 替你读懂每份申请。</>,
    en: <>A pipeline, not an inbox.<br />AI Agent reads every application for you.</>,
  },
  sub: {
    zh: 'AI Agent 替你整理申请、同步尽调、起草租约 —— 把 30 分钟的纠结压成 30 秒一次「同意」。决定权,始终在你手里。',
    en: 'AI Agent organizes applications, runs due diligence and drafts leases — compressing 30 minutes of deliberation into a single 30-second "approve." The decision always stays in your hands.',
  },
  primaryCta: { label: { zh: '免费发布房源 →', en: 'List a property free →' }, href: '/onboarding/name?role=landlord' },
  secondaryCta: { label: { zh: '看看定价', en: 'See pricing' }, href: '/pricing' },
  agentPoints: [
    { zh: '申请人 Pipeline 看板 —— 一眼看清每份申请', en: 'Applicant pipeline board — see every application at a glance' },
    { zh: '8 Engine 自动尽调 + 可解释评分', en: '8-engine automated due diligence + explainable scoring' },
    { zh: '合规教练 —— 当场提醒 RTA 雷区', en: 'Compliance coach — flags RTA pitfalls on the spot' },
    { zh: '一页式决策包 · 租约自动起草 (OREA 兼容)', en: 'One-page decision pack · auto-drafted leases (OREA compatible)' },
  ],
  journey: [
    { h: { zh: '发布 / 迁入房源', en: 'List or import a property' }, b: { zh: 'AI Agent 4 分钟从旧平台迁入并重做房源。', en: 'AI Agent imports and rebuilds your listing from old platforms in 4 minutes.' } },
    { h: { zh: '收到申请', en: 'Receive applications' }, b: { zh: '申请落进 Pipeline,自动去重、补全。', en: 'Applications land in the pipeline, deduplicated and completed automatically.' } },
    { h: { zh: '多维核查 + 排序', en: 'Multi-axis check + ranking' }, b: { zh: '8 维尽调,收入/红旗/匹配分一目了然。', en: '8-axis due diligence — income, red flags and match score at a glance.' } },
    { h: { zh: '一页式决策', en: 'One-page decision' }, b: { zh: '把每份申请压成一页,你只按「同意」。', en: 'Every application compressed to a single page; you just hit "approve."' } },
    { h: { zh: '起草租约 + 签署', en: 'Draft lease + sign' }, b: { zh: '基于你的模板自动起草,电子签署。', en: 'Auto-drafted from your template, signed electronically.' } },
  ],
  scenario: {
    name: 'Sarah Wang',
    meta: { zh: '41 · 会计师 · 2 套投资公寓', en: '41 · Accountant · 2 investment condos' },
    quote: { zh: '做决定前要查、要比,还怕踩 RTA 的雷。', en: 'Before deciding I have to check, compare, and worry about tripping an RTA landmine.' },
    before: { zh: '每月空置损失 $2,900,深夜被报修打扰,合规压力大。', en: '$2,900 in monthly vacancy losses, late-night maintenance calls, and constant compliance pressure.' },
    after: { zh: 'AI Agent 4 分钟重做房源、跑完尽调,关键时刻她只按「同意」。', en: 'AI Agent rebuilt the listing and ran due diligence in 4 minutes; at the key moment she just hits "approve."' },
    delta: { zh: '30 分钟 → 30 秒', en: '30 min → 30 sec' },
  },
  stats: [
    { k: { zh: '决策', en: 'Decision' }, v: { zh: '30 秒', en: '30 sec' } },
    { k: { zh: '租金抽成', en: 'Rent commission' }, v: { zh: '0%', en: '0%' } },
    { k: { zh: 'RTA 踩雷', en: 'RTA missteps' }, v: { zh: '0 次', en: '0' } },
  ],
}

export default function LandlordLanding() {
  return <RoleLanding cfg={CFG} />
}
