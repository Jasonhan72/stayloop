// The /agent/clients CRM roster.
//
// Extracted from the page so the invariant that matters can actually be
// tested: a client whose commission is settled in agentBook must not still be
// shown as shopping. Four of them were — David Z. sat at "awaiting landlord
// reply" on the very date his Distillery 1207 fee was booked.
export interface CrmClient {
  name: string
  tier: number
  budget: string
  area: string
  stage: 'searching' | 'showing' | 'applied' | 'leased'
  silent: number
  next: { zh: string; en: string }
  last: { zh: string; en: string }
}

export const CLIENTS = (aiName: string): CrmClient[] => [
  {
    name: 'Mia Chen',
    tier: 3,
    budget: '$3,800–$4,500',
    area: 'King West',
    stage: 'showing',
    silent: 0,
    next: { zh: '今天 11:00 · Unit 1207 · King West', en: 'Today 11:00 · Unit 1207 · King West' },
    last: { zh: `昨晚和 ${aiName} 聊了 30 min`, en: `Chatted with ${aiName} 30 min last night` },
  },
  {
    name: 'Anna L.',
    tier: 3,
    budget: '$3,800–$4,500',
    area: 'The Annex / Forest Hill',
    stage: 'leased',
    silent: 0,
    next: { zh: '432 Brunswick · 待入住', en: '432 Brunswick · moving in' },
    last: { zh: '4/4 首签 · 佣金已结算', en: 'First signing 4/4 · commission settled' },
  },
  {
    name: 'Jason H.',
    tier: 2,
    budget: '$3,200–$3,600',
    area: 'King West / Liberty Village',
    stage: 'searching',
    silent: 5,
    next: { zh: `${aiName} 在筛选 5 套备选`, en: `${aiName} shortlisting 5 options` },
    last: { zh: '5/4 给了 brief 包', en: 'Brief pack delivered 5/4' },
  },
  {
    name: 'Lisa W.',
    tier: 4,
    budget: '$4,500+',
    area: 'Yorkville',
    stage: 'leased',
    silent: 2,
    next: { zh: 'CityPlace 4502 · 已入住', en: 'CityPlace 4502 · moved in' },
    last: { zh: '4/14 成交 · 佣金已结算', en: 'Closed 4/14 · commission settled' },
  },
  {
    name: 'Kevin Tran',
    tier: 2,
    budget: '$2,800–$3,000',
    area: 'Liberty Village',
    stage: 'leased',
    silent: 1,
    next: { zh: '续约草稿 5/12 完成', en: 'Renewal draft due 5/12' },
    last: { zh: '已盖 2/4 枚章 · 12 个月按时', en: '2/4 stamps · 12 months on time' },
  },
  {
    name: 'David Z.',
    tier: 3,
    budget: '$3,400',
    area: 'Distillery District',
    stage: 'leased',
    silent: 3,
    next: { zh: 'Distillery 1207 · 6/1 起租', en: 'Distillery 1207 · starts 6/1' },
    last: { zh: '5/3 成交 · 佣金已结算', en: 'Closed 5/3 · commission settled' },
  },
  {
    name: 'Priya S.',
    tier: 2,
    budget: '$2,400',
    area: 'Cabbagetown',
    stage: 'searching',
    silent: 4,
    next: { zh: `${aiName} 在配对小户型`, en: `${aiName} matching small units` },
    last: { zh: '5/2 加入', en: 'Joined 5/2' },
  },
  {
    name: 'Marcus T.',
    tier: 3,
    budget: '$3,600',
    area: 'Leslieville',
    stage: 'leased',
    silent: 3,
    next: { zh: 'Leslieville Stack · 已入住', en: 'Leslieville Stack · moved in' },
    last: { zh: '4/22 成交 · 佣金已结算', en: 'Closed 4/22 · commission settled' },
  },
  {
    name: 'Sophie B.',
    tier: 1,
    budget: '$1,800',
    area: 'Bachelor / Cabbagetown',
    stage: 'searching',
    silent: 4,
    next: { zh: '提示她盖上收入章', en: 'Prompt her to earn the income stamp' },
    last: { zh: '4/30 加入', en: 'Joined 4/30' },
  },
  {
    name: 'Eric K.',
    tier: 4,
    budget: '$5,200',
    area: 'Yorkville',
    stage: 'showing',
    silent: 3,
    next: { zh: '5/13 三套连看', en: 'Three back-to-back viewings 5/13' },
    last: { zh: '只看高门槛房源', en: 'Only views high-threshold listings' },
  },
  {
    name: 'Yuki M.',
    tier: 2,
    budget: '$2,950',
    area: 'King West',
    stage: 'leased',
    silent: 1,
    next: { zh: '5/8 成交 · 租约到期 2027-05', en: 'Closed 5/8 · lease ends 2027-05' },
    last: { zh: '4/28 银行透明度通过', en: 'Bank transparency passed 4/28' },
  },
]
