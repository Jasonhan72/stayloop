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
    zh: '你的时间应该花在带看、谈判和赢得信任上。剩下的 —— 整理客户、准备材料、排程、跟进、催款 —— 交给一个不睡觉的后台。纯 SaaS 工具,不抽你一分佣金。',
    en: "Your hours belong to showings, negotiation and earning trust. Everything else — organizing clients, prepping materials, scheduling, follow-ups, chasing payments — goes to a back office that never sleeps. Pure SaaS: we never touch your commission.",
  },
  primaryCta: { label: { zh: '把杂活交给 AI →', en: 'Hand the busywork to AI →' }, href: '/onboarding/name?role=agent', authedHref: '/agent/agent' },
  secondaryCta: { label: { zh: '看看定价', en: 'See pricing' }, href: '/pricing' },
  ctaNote: { zh: '纯 SaaS · 不抽佣金 · RECO 合规内建', en: 'Pure SaaS · zero commission cut · RECO compliance built in' },
  agentPoints: [
    { zh: '客户与材料,一键就绪', en: 'Clients & materials, one click' },
    { zh: '日历排程 · 路线规划', en: 'Calendar & route planning' },
    { zh: '跟进催款,全自动', en: 'Follow-ups & collections, automated' },
    { zh: 'RECO 合规提醒 · 留痕', en: 'RECO reminders · audit trail' },
    { zh: '替客户下单租客筛查,几分钟出报告', en: 'Order tenant screening for clients — report in minutes' },
    { zh: '筛查报告 · 认证护照,一键转发房东', en: 'Screening report & verified passport, one click to the landlord' },
  ],
  demo: {
    ask: { zh: '明天 3 个带看,资料帮我备好。', en: 'Three showings tomorrow — prep everything for me.' },
    reply: {
      zh: '3 份带看包已生成:业主披露、社区数据、比价表。路线已按日历排好,客户提醒短信今晚 8 点自动发。',
      en: 'Three showing packs ready: owner disclosures, neighbourhood data, comps. Route is on your calendar; client reminder texts go out at 8pm tonight.',
    },
    task: { zh: '材料包 · 路线 · 客户提醒 · 看房记录', en: 'Packs · route · reminders · showing notes' },
    note: { zh: '带看结束,记录自动归档留痕。', en: 'After each showing, notes are filed and audited automatically.' },
  },
  journey: [
    { h: { zh: '接收合格转介', en: 'Qualified referrals in' }, b: { zh: '客户来时已验证、已画像,不用从零聊。', en: 'Clients arrive verified and profiled — no starting from zero.' } },
    { h: { zh: '杂活进收件箱', en: 'Busywork hits the inbox' }, b: { zh: 'AI 按你的日历接单、排程、备材料。', en: 'AI takes the tasks, schedules them around your calendar and preps the materials.' } },
    { h: { zh: '你只管带看', en: 'You just show up' }, b: { zh: '现场记录、授权清晰,专业的部分归你。', en: 'On-site notes, clear authorization — the professional part stays yours.' } },
    { h: { zh: '跟进它来盯', en: 'It runs the follow-ups' }, b: { zh: '客户记忆复用,进展自动提醒,不再跟丢。', en: 'Client memory is reused and progress auto-flagged — no one slips away.' } },
    { h: { zh: '当晚结算', en: 'Settled the same night' }, b: { zh: 'Stripe 自动收款、RECO 合规、审计留痕。', en: 'Stripe auto-collection, RECO compliance, audit trail.' } },
  ],
  story: [
    {
      file: 'david-01-task.jpg',
      fallback: 'https://images.unsplash.com/photo-1484154218962-a197022b5858?w=700&q=80&fit=crop&auto=format',
      label: { zh: '接到任务', en: 'Task lands' },
      text: { zh: 'RECO 验证 30 秒通过。新任务推送:时间、地点、租客画像与授权问答清单,AI Agent 备好材料包。', en: 'RECO verified in 30 seconds. A task arrives: time, place, tenant profile and the authorized Q&A list — the AI agent preps the full pack.' },
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
      label: { zh: '当晚结算', en: 'Settled that night' },
      text: { zh: '带看记录当晚自动归档留痕。月度回顾:带看 32 次、保留率 94%、Toronto West 区域 Top 8%。', en: 'Showing notes filed and audited the same night. Monthly review: 32 showings, 94% retention, top 8% in Toronto West.' },
    },
  ],
  scenario: {
    name: 'David Park',
    meta: { zh: '35 · 持牌经纪 · RECO 6 年', en: '35 · Licensed agent · 6 years with RECO' },
    quote: { zh: '不是没机会,是时间被行政碎片化了。', en: "It's not that there's no opportunity — my time is fragmented by admin." },
    before: { zh: '70% 的时间耗在整理材料、排时间、催跟进上;收入不稳,客户一忙就跟丢。', en: '70% of his time went to prepping materials, juggling schedules and chasing follow-ups; income swung, and busy weeks meant lost clients.' },
    after: { zh: 'AI 编排一切、当晚结算,他只做带看与专业判断 —— 同样的一周,接得下两倍的客户。', en: 'AI orchestrates everything and settles the same night; he only does showings and judgment — the same week now fits twice the clients.' },
    delta: { zh: '时薪 $25 → $43', en: 'Hourly $25 → $43' },
  },
  stats: [
    { k: { zh: '行政时间还给你', en: 'admin hours handed back' }, v: { zh: '↓ 70%', en: '↓ 70%' } },
    { k: { zh: '专注带看与谈判', en: 'focus on showings & deals' }, v: { zh: '时薪 ×1.7', en: 'Hourly ×1.7' } },
    { k: { zh: '纯工具,不碰你的佣金', en: 'pure SaaS, zero commission cut' }, v: { zh: '0 抽佣', en: '0% cut' } },
  ],
}

export default function AgentLanding() {
  return <RoleLanding cfg={CFG} />
}
