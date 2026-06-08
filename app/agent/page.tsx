'use client'

import RoleLanding, { RoleLandingConfig } from '@/components/RoleLanding'

const CFG: RoleLandingConfig = {
  role: 'agent',
  eyebrow: 'AGENT · 经纪 · Brief',
  agentName: 'Brief',
  color: '#2563EB',
  h1: <>把杂活交给系统,<br />把关系留给人。</>,
  sub: 'Brief 替你整理客户、准备房源材料、安排看房与跟进申请,让你专注线下服务、谈判和信任关系。',
  primaryCta: { label: '加入经纪网络 →', href: '/agent/onboarding' },
  secondaryCta: { label: '看看定价', href: '/pricing' },
  agentPoints: [
    '客户与房源材料一键整理',
    '看房 Live · 现场记录与留痕',
    '任务编排 · 当晚 Stripe 结算',
    '佣金拆分 · 团队协作',
  ],
  journey: [
    { h: '接收转介', b: '接收 Stayloop 验证后的合格租客转介。' },
    { h: '任务收件箱', b: 'Brief 按你的日历排程带看与跟进。' },
    { h: '带看 / 拍照 / 留痕', b: '现场记录,授权范围清晰、不踩线。' },
    { h: '跟进申请', b: '客户记忆复用,进展自动提醒。' },
    { h: '成交分成结算', b: '成交后 25% 分成,Stripe 自动结算。' },
  ],
  scenario: {
    name: 'David Park', meta: '35 · 持牌经纪 · RECO 6 年',
    quote: '不是没机会,是时间被行政碎片化了。',
    before: '70% 时间耗在行政,收入不稳,客户容易跟丢。',
    after: 'Brief 编排任务、当晚结算,他只做带看与专业判断。',
    delta: '时薪 $25 → $43',
  },
  stats: [
    { k: '时薪', v: '$25→$43' },
    { k: '行政时间', v: '↓ 70%' },
    { k: '结算', v: '当晚' },
  ],
}

export default function AgentLanding() {
  return <RoleLanding cfg={CFG} />
}
