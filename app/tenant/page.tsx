'use client'

import RoleLanding, { RoleLandingConfig } from '@/components/RoleLanding'

const CFG: RoleLandingConfig = {
  role: 'tenant',
  eyebrow: 'TENANT · 租客 · Luna',
  agentName: 'Luna',
  color: '#7C3AED',
  h1: <>说出你想要的家,<br />Luna 替你办到签约。</>,
  sub: '验证一次,处处通行。Luna 替你找房、比价、约看、一键申请,资料只在你点头时才分享。每个关键决定,依然由你拍板。',
  primaryCta: { label: '90 秒身份验证 →', href: '/onboarding/welcome' },
  secondaryCta: { label: '先浏览房源', href: '/listings' },
  agentPoints: [
    '对话式找房 + 主动匹配 —— 说需求,不填表',
    '可复用 Rental Passport —— 资料只填一次',
    '一键申请 · AI 自动跑完尽调',
    '缴租 · 维修 · 续约 · 退租全程托管',
  ],
  journey: [
    { h: '为 AI 起名', b: 'Luna、小鹿,任何你喜欢的名字。从此她只为你。' },
    { h: '90 秒验明身份', b: '护照加活体,一次过。不影响你的信用分。' },
    { h: '浏览房源', b: '地图加卡片,Luna 主动按你的需求筛过。' },
    { h: '一键申请', b: 'Passport 直接复用,即出 Stayloop Score。' },
    { h: '入住安心长住', b: '缴租维修续约退租,Luna 全程替你照看。' },
  ],
  scenario: {
    name: 'Mia Chen', meta: '27 · 软件工程师 · 新移民',
    quote: '没有加拿大信用记录,我到底该怎么租房?',
    before: '信用空白,已被拒 3 次,3 天后必须退房。',
    after: 'Luna 90 秒验明身份,中文读懂租约,35 分钟签约入住。',
    delta: 'Score 60 → 91',
  },
  stats: [
    { k: '验证', v: '90 秒' },
    { k: '签约', v: '35 分钟' },
    { k: '交易费', v: '$0' },
  ],
}

export default function TenantLanding() {
  return <RoleLanding cfg={CFG} />
}
