'use client'

import RoleLanding, { RoleLandingConfig } from '@/components/RoleLanding'

const CFG: RoleLandingConfig = {
  role: 'agent',
  eyebrow: 'AGENT · 经纪 · Brief',
  agentName: 'Brief',
  color: '#2563EB',
  h1: {
    zh: <>把杂活交给系统,<br />把关系留给人。</>,
    en: <>Hand the busywork to the system,<br />keep the relationships for yourself.</>,
  },
  sub: {
    zh: 'Brief 替你整理客户、准备房源材料、安排看房与跟进申请,让你专注线下服务、谈判和信任关系。',
    en: 'Brief organizes your clients, prepares listing materials, schedules showings and follows up on applications — so you can focus on in-person service, negotiation and trust.',
  },
  primaryCta: { label: { zh: '加入经纪网络 →', en: 'Join the agent network →' }, href: '/agent/onboarding' },
  secondaryCta: { label: { zh: '看看定价', en: 'See pricing' }, href: '/pricing' },
  agentPoints: [
    { zh: '客户与房源材料一键整理', en: 'One-click organization of clients and listing materials' },
    { zh: '看房 Live · 现场记录与留痕', en: 'Live showings · on-site notes and audit trail' },
    { zh: '任务编排 · 当晚 Stripe 结算', en: 'Task orchestration · same-night Stripe settlement' },
    { zh: '佣金拆分 · 团队协作', en: 'Commission splits · team collaboration' },
  ],
  journey: [
    { h: { zh: '接收转介', en: 'Receive referrals' }, b: { zh: '接收 Stayloop 验证后的合格租客转介。', en: 'Receive qualified tenant referrals verified by Stayloop.' } },
    { h: { zh: '任务收件箱', en: 'Task inbox' }, b: { zh: 'Brief 按你的日历排程带看与跟进。', en: 'Brief schedules showings and follow-ups around your calendar.' } },
    { h: { zh: '带看 / 拍照 / 留痕', en: 'Show / photograph / log' }, b: { zh: '现场记录,授权范围清晰、不踩线。', en: 'On-site records with a clear authorization scope — no overstepping.' } },
    { h: { zh: '跟进申请', en: 'Follow up on applications' }, b: { zh: '客户记忆复用,进展自动提醒。', en: 'Client memory is reused and progress is flagged automatically.' } },
    { h: { zh: '成交分成结算', en: 'Closing & commission settlement' }, b: { zh: '成交后 25% 分成,Stripe 自动结算。', en: 'A 25% split on close, settled automatically through Stripe.' } },
  ],
  scenario: {
    name: 'David Park',
    meta: { zh: '35 · 持牌经纪 · RECO 6 年', en: '35 · Licensed agent · 6 years with RECO' },
    quote: { zh: '不是没机会,是时间被行政碎片化了。', en: "It's not that there's no opportunity — my time is fragmented by admin." },
    before: { zh: '70% 时间耗在行政,收入不稳,客户容易跟丢。', en: '70% of his time lost to admin, unstable income, clients slipping through the cracks.' },
    after: { zh: 'Brief 编排任务、当晚结算,他只做带看与专业判断。', en: 'Brief orchestrates the tasks and settles the same night; he just does showings and professional judgment.' },
    delta: { zh: '时薪 $25 → $43', en: 'Hourly $25 → $43' },
  },
  stats: [
    { k: { zh: '时薪', en: 'Hourly rate' }, v: { zh: '$25→$43', en: '$25→$43' } },
    { k: { zh: '行政时间', en: 'Admin time' }, v: { zh: '↓ 70%', en: '↓ 70%' } },
    { k: { zh: '结算', en: 'Settlement' }, v: { zh: '当晚', en: 'Same night' } },
  ],
}

export default function AgentLanding() {
  return <RoleLanding cfg={CFG} />
}
