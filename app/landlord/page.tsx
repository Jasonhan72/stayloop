'use client'

import RoleLanding, { RoleLandingConfig } from '@/components/RoleLanding'

const CFG: RoleLandingConfig = {
  role: 'landlord',
  eyebrow: 'LANDLORD · 房东 · Logic',
  agentName: 'Logic',
  color: '#047857',
  h1: <>是流水线,不是收件箱。<br />Logic 替你读懂每份申请。</>,
  sub: 'Logic 替你整理申请、同步尽调、起草租约 —— 把 30 分钟的纠结压成 30 秒一次「同意」。决定权,始终在你手里。',
  primaryCta: { label: '免费发布房源 →', href: '/dashboard/listings/new' },
  secondaryCta: { label: '看看定价', href: '/pricing' },
  agentPoints: [
    '申请人 Pipeline 看板 —— 一眼看清每份申请',
    '8 Engine 自动尽调 + 可解释评分',
    '合规教练 —— 当场提醒 RTA 雷区',
    '一页式决策包 · 租约自动起草 (OREA 兼容)',
  ],
  journey: [
    { h: '发布 / 迁入房源', b: 'Logic 4 分钟从旧平台迁入并重做房源。' },
    { h: '收到申请', b: '申请落进 Pipeline,自动去重、补全。' },
    { h: '多维核查 + 排序', b: '8 维尽调,收入/红旗/匹配分一目了然。' },
    { h: '一页式决策', b: '把每份申请压成一页,你只按「同意」。' },
    { h: '起草租约 + 签署', b: '基于你的模板自动起草,电子签署。' },
  ],
  scenario: {
    name: 'Sarah Wang', meta: '41 · 会计师 · 2 套投资公寓',
    quote: '做决定前要查、要比,还怕踩 RTA 的雷。',
    before: '每月空置损失 $2,900,深夜被报修打扰,合规压力大。',
    after: 'Logic 4 分钟重做房源、跑完尽调,关键时刻她只按「同意」。',
    delta: '30 分钟 → 30 秒',
  },
  stats: [
    { k: '决策', v: '30 秒' },
    { k: '租金抽成', v: '0%' },
    { k: 'RTA 踩雷', v: '0 次' },
  ],
}

export default function LandlordLanding() {
  return <RoleLanding cfg={CFG} />
}
