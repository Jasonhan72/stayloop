'use client'

import RoleLanding, { RoleLandingConfig } from '@/components/RoleLanding'

const CFG: RoleLandingConfig = {
  role: 'tenant',
  eyebrow: 'TENANT · 租客 · Luna',
  agentName: 'Luna',
  color: '#7C3AED',
  h1: {
    zh: <>说出你想要的家,<br />Luna 替你办到签约。</>,
    en: <>Describe the home you want,<br />Luna gets you to signing.</>,
  },
  sub: {
    zh: '验证一次,处处通行。Luna 替你找房、比价、约看、一键申请,资料只在你点头时才分享。每个关键决定,依然由你拍板。',
    en: 'Verify once, apply everywhere. Luna finds listings, compares prices, books showings and applies in one tap — your data is shared only when you say yes. Every key decision stays with you.',
  },
  primaryCta: { label: { zh: '90 秒身份验证 →', en: '90-second ID check →' }, href: '/onboarding/welcome' },
  secondaryCta: { label: { zh: '先浏览房源', en: 'Browse listings first' }, href: '/listings' },
  agentPoints: [
    { zh: '对话式找房 + 主动匹配 —— 说需求,不填表', en: 'Conversational search + proactive matching — say what you need, skip the forms' },
    { zh: '可复用 Rental Passport —— 资料只填一次', en: 'A reusable Rental Passport — fill in your details once' },
    { zh: '一键申请 · AI 自动跑完尽调', en: 'One-tap apply · AI runs the due diligence for you' },
    { zh: '缴租 · 维修 · 续约 · 退租全程托管', en: 'Rent, repairs, renewals and move-out — fully managed end to end' },
  ],
  journey: [
    { h: { zh: '为 AI 起名', en: 'Name your AI' }, b: { zh: 'Luna、小鹿,任何你喜欢的名字。从此她只为你。', en: 'Luna, or any name you like. From now on she works only for you.' } },
    { h: { zh: '90 秒验明身份', en: 'Verify your ID in 90 seconds' }, b: { zh: '护照加活体,一次过。不影响你的信用分。', en: 'Passport plus a liveness check, done in one pass. No impact on your credit score.' } },
    { h: { zh: '浏览房源', en: 'Browse listings' }, b: { zh: '地图加卡片,Luna 主动按你的需求筛过。', en: 'Map and cards, pre-filtered by Luna to match what you want.' } },
    { h: { zh: '一键申请', en: 'Apply in one tap' }, b: { zh: 'Passport 直接复用,即出 Stayloop Score。', en: 'Reuse your Passport directly and get a Stayloop Score instantly.' } },
    { h: { zh: '入住安心长住', en: 'Settle in for the long term' }, b: { zh: '缴租维修续约退租,Luna 全程替你照看。', en: 'Rent, repairs, renewals and move-out — Luna looks after it all.' } },
  ],
  scenario: {
    name: 'Mia Chen',
    meta: { zh: '27 · 软件工程师 · 新移民', en: '27 · Software engineer · Newcomer' },
    quote: { zh: '没有加拿大信用记录,我到底该怎么租房?', en: 'With no Canadian credit history, how am I supposed to rent at all?' },
    before: { zh: '信用空白,已被拒 3 次,3 天后必须退房。', en: 'No credit file, declined 3 times, and 3 days to move out.' },
    after: { zh: 'Luna 90 秒验明身份,中文读懂租约,35 分钟签约入住。', en: 'Luna verified her ID in 90 seconds, explained the lease in Chinese, and got her signed in 35 minutes.' },
    delta: { zh: 'Score 60 → 91', en: 'Score 60 → 91' },
  },
  stats: [
    { k: { zh: '验证', en: 'Verification' }, v: { zh: '90 秒', en: '90 sec' } },
    { k: { zh: '签约', en: 'Signing' }, v: { zh: '35 分钟', en: '35 min' } },
    { k: { zh: '交易费', en: 'Transaction fee' }, v: { zh: '$0', en: '$0' } },
  ],
}

export default function TenantLanding() {
  return <RoleLanding cfg={CFG} />
}
