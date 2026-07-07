'use client'

import RoleLanding, { RoleLandingConfig } from '@/components/RoleLanding'

const CFG: RoleLandingConfig = {
  role: 'tenant',
  eyebrow: 'TENANT · 租客 · AI Agent',
  agentName: 'AI Agent',
  color: '#7C3AED',
  h1: {
    zh: <>说出你想要的生活,<br />AI 替你找到家。</>,
    en: <>Describe the life you want —<br />your AI finds you home.</>,
  },
  sub: {
    zh: '它记得你的每个偏好,替你翻遍全城、约看、比价、申请 —— 你睡觉时它也在工作。没有加拿大信用记录也没关系:验证一次,处处通行。每个关键决定,依然由你拍板。',
    en: "It remembers every preference, combs the whole city, books viewings, compares and applies — working even while you sleep. No Canadian credit history? No problem: verify once, go anywhere. Every key decision stays yours.",
  },
  primaryCta: { label: { zh: '唤醒你的 AI 租房助手 →', en: 'Wake up your rental AI →' }, href: '/onboarding/welcome', authedHref: '/tenant/agent' },
  secondaryCta: { label: { zh: '先浏览房源', en: 'Browse listings first' }, href: '/listings' },
  ctaNote: { zh: '租客永远免费 · 不影响信用分', en: 'Always free for tenants · never touches your credit' },
  agentPoints: [
    { zh: '对话找房,不填表', en: 'Chat to search, no forms' },
    { zh: '资料验一次,处处通行', en: 'Verify once, go anywhere' },
    { zh: '一键申请,尽调自动跑', en: 'One-tap apply, auto diligence' },
    { zh: '入住后维修续约全托管', en: 'Repairs & renewals managed' },
  ],
  demo: {
    ask: { zh: '预算 2800,能养猫,离 King 站走路 15 分钟。', en: 'Under $2,800, cats OK, 15-min walk to King station.' },
    reply: {
      zh: '找到 3 套都符合,我按你上次说的「采光要好」排了序。第一套周六下午 2 点可以看房,要我约吗?',
      en: 'Found 3 matches, sorted by the good natural light you mentioned before. The first one shows Saturday 2pm — shall I book it?',
    },
    task: { zh: '约看 · 比价 · 跟进房东 · 准备申请材料', en: 'Book viewings · compare · follow up · prep application' },
    note: { zh: '有进展用邮件/短信告诉你 —— 你不用守着。', en: "I'll ping you by email/SMS on progress — no need to watch." },
  },
  journey: [
    { h: { zh: '为 AI 起名', en: 'Name your AI' }, b: { zh: '任何你喜欢的名字。从此 TA 只为你一个人。', en: 'Any name you like. From now on it works only for you.' } },
    { h: { zh: '验证一次,处处通行', en: 'Verify once, go anywhere' }, b: { zh: '一次搞定,从此不再交一叠 PDF · 不影响信用分。', en: 'Done once — never hand over a stack of PDFs again · never touches your credit.' } },
    { h: { zh: '说需求,收房源', en: 'Say it, get matches' }, b: { zh: '一句话,AI 替你翻遍全城,按你的偏好主动筛过。', en: 'One sentence and AI combs the city, pre-filtered to your taste.' } },
    { h: { zh: '一键申请', en: 'Apply in one tap' }, b: { zh: 'Passport 直接复用,即出 Stayloop Score。', en: 'Reuse your Passport directly and get a Stayloop Score instantly.' } },
    { h: { zh: '入住,安心长住', en: 'Move in, settle in' }, b: { zh: '缴租维修续约退租,AI 全程替你照看。', en: 'Rent, repairs, renewals and move-out — AI looks after it all.' } },
  ],
  scenario: {
    name: 'Mia Chen',
    meta: { zh: '27 · 软件工程师 · 新移民', en: '27 · Software engineer · Newcomer' },
    quote: { zh: '没有加拿大信用记录,我到底该怎么租房?', en: 'With no Canadian credit history, how am I supposed to rent at all?' },
    before: { zh: '信用空白,已被拒 3 次,3 天后必须退房。每晚刷 5 个网站到深夜,同样的资料填了一遍又一遍。', en: 'No credit file, declined 3 times, 3 days to move out — grinding five listing sites every night, re-typing the same forms again and again.' },
    after: { zh: 'AI 用她已验证的 Passport 直接申请,中文逐条讲解租约,当天签约入住。第二次搬家,她只说了一句话。', en: 'Her AI applied with her verified Passport, walked her through the lease in Chinese, and got her signed the same day. Her second move took a single sentence.' },
    delta: { zh: 'Score 60 → 91', en: 'Score 60 → 91' },
  },
  stats: [
    { k: { zh: '偏好说一次,永远记得', en: 'say it once, remembered' }, v: { zh: '它认识你', en: 'It knows you' } },
    { k: { zh: '你睡觉时,它也在替你跑', en: 'works while you sleep' }, v: { zh: '24/7 在岗', en: 'On duty 24/7' } },
    { k: { zh: '资料分享,永远等你点头', en: 'sharing waits for your nod' }, v: { zh: '你说了算', en: 'You decide' } },
  ],
}

export default function TenantLanding() {
  return <RoleLanding cfg={CFG} />
}
