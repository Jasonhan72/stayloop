'use client'

import RoleLanding, { RoleLandingConfig } from '@/components/RoleLanding'

const CFG: RoleLandingConfig = {
  role: 'tenant',
  eyebrow: 'TENANT · 租客 · AI 助理',
  agentName: 'AI Agent',
  color: '#00ACE4',
  h1: {
    zh: <>说出你想要的生活,<br />AI 替你找到家。</>,
    en: <>Describe the life you want —<br />your AI finds you home.</>,
  },
  sub: {
    zh: '说出你想要的家,它从真实房源里替你找、替你比;看房、提问、申请、签约都在一处,英文租约逐条讲成中文。每个关键决定,依然由你拍板。',
    en: 'Say what home you want and it searches and compares real listings for you; viewings, questions, applications and signing live in one place, and the lease is explained clause by clause. Every key decision stays yours.',
  },
  primaryCta: { label: { zh: '唤醒你的 AI 助理 →', en: 'Wake up your AI Agent →' }, href: '/onboarding/name?role=tenant', authedHref: '/tenant/agent' },
  secondaryCta: { label: { zh: '先浏览房源', en: 'Browse listings first' }, href: '/listings' },
  ctaNote: { zh: '租客永远免费 · 是否授权查询征信由你决定', en: 'Always free for tenants · you decide whether to authorise a credit check' },
  agentPoints: [
    { zh: '对话找房,不填表', en: 'Chat to search, no forms' },
    { zh: '看房提问,直达房东', en: 'Viewings and questions go straight to the landlord' },
    { zh: '申请进度,一步步看得到', en: 'Follow your application step by step' },
    { zh: '报修续约,有人跟进', en: 'Repairs and renewals followed up' },
  ],
  demo: {
    ask: { zh: '预算 2800,能养猫,离 King 站走路 15 分钟。', en: 'Under $2,800, cats OK, 15-min walk to King station.' },
    reply: {
      zh: '找到 3 套都符合,我按你上次说的「采光要好」排了序。第一套周六下午 2 点可以看房,要我约吗?',
      en: 'Found 3 matches, sorted by the good natural light you mentioned before. The first one shows Saturday 2pm — shall I book it?',
    },
    task: { zh: '约看 · 比价 · 跟进房东 · 准备申请材料', en: 'Book viewings · compare · follow up · prep application' },
    note: { zh: '有进展用邮件告诉你 —— 你不用守着。', en: "I'll email you on progress — no need to watch." },
  },
  journey: [
    { h: { zh: '为 AI 起名', en: 'Name your AI' }, b: { zh: '任何你喜欢的名字。从此 TA 只为你一个人。', en: 'Any name you like. From now on it works only for you.' } },
    { h: { zh: '说需求,收房源', en: 'Say it, get matches' }, b: { zh: '一句话,它从 Stayloop 核验房源和 Realtor.ca 实时挂牌里替你筛,配 TRREB 官方行情。', en: 'One sentence and it filters Stayloop-verified listings and live Realtor.ca listings for you, with the official TRREB benchmark.' } },
    { h: { zh: '看房与申请', en: 'View and apply' }, b: { zh: '在房源页预约看房、向房东提问、提交申请;每一步进度都看得到。', en: 'Request a viewing, ask the landlord and apply from the listing page; you can see each step as it moves.' } },
    { h: { zh: '签约', en: 'Sign' }, b: { zh: '安省标准租约电子签,签之前逐条讲给你听。', en: 'E-sign the Ontario standard lease, explained clause by clause before you sign.' } },
    { h: { zh: '入住之后', en: 'After you move in' }, b: { zh: '报修可附照片、续约方案提前送到,都在你和房东共享的在管租约里。', en: 'Repairs with photos and renewal options ahead of time, all in the managed tenancy you share with your landlord.' } },
  ],
  story: [
    {
      file: 'mia-01-anxious.jpg',
      fallback: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=700&q=80&fit=crop&auto=format',
      label: { zh: '之前 · 深夜的申请表', en: 'Before · forms at midnight' },
      text: { zh: '信用空白、连续被拒 3 次。旧住处纸箱堆满,Mia 对着申请表,3 天后必须退房。', en: 'No credit file, three rejections. Boxes everywhere, an application form in hand, three days left to move out.' },
    },
    {
      file: 'mia-02-luna.jpg',
      fallback: 'https://images.unsplash.com/photo-1554995207-c18c203602cb?w=700&q=80&fit=crop&auto=format',
      label: { zh: 'AI 助理接手', en: 'The AI Agent takes over' },
      text: { zh: '一句话说清需求:市中心、一居、能养猫。AI 助理找房、比价、中文讲解租约,替她起草给房东的消息。', en: 'One sentence: downtown, 1-bed, cats OK. The AI Agent searches, compares, explains the lease in Chinese and drafts her messages to the landlord.' },
    },
    {
      file: 'mia-03-home.jpg',
      fallback: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=700&q=80&fit=crop&auto=format',
      label: { zh: '安心入住', en: 'Settled in' },
      text: { zh: '当天电子签约。入住后报修附上照片,房东那边马上收到;续约前,方案已经在她的在管租约里。', en: 'E-signed the same day. After move-in, a repair request with photos reached the landlord at once; before renewal, the options were already in her managed tenancy.' },
    },
  ],
  scenario: {
    name: 'Mia Chen',
    meta: { zh: '27 · 软件工程师 · 新移民', en: '27 · Software engineer · Newcomer' },
    quote: { zh: '没有加拿大信用记录,我到底该怎么租房?', en: 'With no Canadian credit history, how am I supposed to rent at all?' },
    before: { zh: '信用空白,已被拒 3 次,3 天后必须退房。每晚刷 5 个网站到深夜,同样的资料填了一遍又一遍。', en: 'No credit file, declined 3 times, 3 days to move out — grinding five listing sites every night, re-typing the same forms again and again.' },
    after: { zh: '她说一句需求,AI 找到能养猫的房源;看房请求一键发给房东,租约逐条讲成中文,当天电子签约。', en: 'One sentence, and her AI found cat-friendly listings; the viewing request reached the landlord in one tap, the lease was explained in Chinese, and she e-signed the same day.' },
    delta: { zh: '当天签约', en: 'Signed the same day' },
  },
  valueBand: {
    eyebrow: { zh: 'RENTAL PASSPORT · 你的护照能做什么', en: 'RENTAL PASSPORT · WHAT IT DOES' },
    h2: { zh: '在 Stayloop 租过的房,记录跟着你走。', en: 'Rent through Stayloop, and the record goes with you.' },
    items: [
      {
        icon: '🛂',
        h: { zh: '一个只读分享链接', en: 'One read-only share link' },
        b: {
          zh: '发给下一个房东:显示姓名缩写和按时付租记录(只看是否按时,没有金额),不含证件、证件号与联系方式。',
          en: 'Send it to your next landlord: your initials and on-time rent record (on time or not, no amounts), never documents, ID numbers or contact details.',
        },
      },
      {
        icon: '🆓',
        h: { zh: '对租客永久免费', en: 'Free for tenants, always' },
        b: {
          zh: '不按报告收费,也没有订阅;找房、申请、签约、分享都不花钱。',
          en: 'No per-report fees, no subscription; searching, applying, signing and sharing cost nothing.',
        },
      },
      {
        icon: '🧳',
        h: { zh: '只认双方确认的租约', en: 'Only confirmed leases count' },
        b: {
          zh: '付租记录只取自双方都确认过的在管租约、或双方电子签的租约;你自己导入、对方没确认的不算。',
          en: 'Rent records come only from a tenancy both sides confirmed or a lease both sides e-signed; a lease you imported that the other side never confirmed does not count.',
        },
      },
      {
        icon: '🔐',
        h: { zh: '隐私和征信,都由你决定', en: 'Privacy and credit checks: your call' },
        b: {
          zh: '共享哪几项,你逐项说了算,随时撤销;是否授权查询征信,也由你自己决定。',
          en: 'You decide field by field what to share, revocable any time — and you decide whether to authorise a credit check.',
        },
      },
    ],
    cta: { label: { zh: '打开我的护照 →', en: 'Open my Passport →' }, href: '/tenant/passport' },
  },
  chips: [
    { label: { zh: '租客永远免费', en: 'Always free for tenants' }, href: '/pricing' },
    { label: { zh: '房东不得向你收筛查费 · RTA s.134', en: 'Landlords may not charge you screening fees · RTA s.134' }, href: '/screening' },
    { label: { zh: '数据库驻加拿大', en: 'Database in Canada' }, href: '/privacy' },
    { label: { zh: '不收 SIN', en: 'No SIN collected' }, href: '/privacy' },
    { label: { zh: '真实房源：Stayloop 核验 + Realtor.ca', en: 'Real listings: Stayloop-verified + Realtor.ca' }, href: '/listings' },
  ],
  benefits: [
    {
      h: { zh: '找房：说一句，它去翻', en: 'Search: say it once, it combs the city' },
      b: { zh: '预算、区域、房型、宠物、通勤——对话里说清，它查 Stayloop 核验房源与 Realtor.ca 实时挂牌，配 TRREB 官方行情，一次给 6 套、可以「换一批」。', en: 'Budget, area, layout, pets, commute — say it in the chat and it searches Stayloop-verified listings plus live Realtor.ca, with the official TRREB benchmark, six at a time with "show me more".' },
      ask: { zh: '预算 2800，能养猫，离 King 站走路 15 分钟，帮我找 6 套。', en: 'Under $2,800, cats OK, 15-minute walk to King station — find me six.' },
    },
    {
      h: { zh: '看房与提问：房东一张卡片就收到', en: 'Viewings & questions: one card to the landlord' },
      b: { zh: '房源页的「预约看房」「向房东提问」直接进房东 AI 助理的待办，房东批准后你收到带联系方式的邮件。要带经纪也可以自选一位 RECO 已核的。', en: '"Request a viewing" and "Ask the landlord" on a listing go straight to the landlord\'s AI Agent to-do list; once approved you get an email with their contact. Want an agent along? Pick a RECO-checked one.' },
      ask: { zh: '看房时我可以问什么、房东不能问我什么？', en: 'What can I ask at a viewing, and what may the landlord not ask me?' },
    },
    {
      h: { zh: '租约与入住后：它读条款、盯日期', en: 'Lease & after: it reads the terms and watches the dates' },
      b: { zh: '安省标准租约逐条解释、押金上限与利息、N9 搬离通知、报修与续约。导入已签租约后，它替你记住到期日。', en: 'The Ontario standard lease explained clause by clause, deposit cap and interest, N9 move-out notice, repairs and renewals. Import a signed lease and it remembers the dates for you.' },
      ask: { zh: '房东要两个月押金加清洁费，合法吗？', en: 'My landlord wants two months\' deposit plus a cleaning fee — is that legal?' },
    },
  ],
  proof: {
    key: 'listings',
    label: { zh: '套公开房源可搜（平台核验或 Realtor.ca 实时）', en: 'public listings searchable (platform-verified or live from Realtor.ca)' },
    note: { zh: '这是此刻数据库里对外可见的房源数，不含任何演示数据。TRREB 季度行情与 LTB 判令目录的数量在首页的数据带里。', en: 'The number of listings publicly visible in the database right now — no demo rows. TRREB quarters and LTB order counts are on the homepage data band.' },
  },
  faq: [
    { q: { zh: 'AI 助理找的房源来自哪里？', en: 'Where do the listings come from?' }, a: { zh: 'Stayloop 上经人工核验的房源，加上 Realtor.ca 的实时挂牌抓取（示范阶段，TRREB 数据库尚未接入）。行情线来自 TRREB 季度租赁市场报告。', en: 'Stayloop listings verified by hand, plus live Realtor.ca listings (demonstration stage — the TRREB feed is not yet connected). The benchmark line comes from the TRREB quarterly rental market report.' } },
    { q: { zh: '我的资料谁能看？', en: 'Who can see my information?' }, a: { zh: '你在申请或核验里提交的材料只有那位房东能读；你和 AI 助理的对话不会分享给任何人。数据库在 AWS 蒙特利尔，我们不收 SIN。', en: 'Material you submit in an application or verification is readable only by that landlord; your AI Agent conversation is shared with no one. The database is in AWS Montréal and we never collect a SIN.' } },
    { q: { zh: '房东用 Stayloop 筛查了我，我能看报告吗？', en: 'A landlord screened me on Stayloop — can I see the report?' }, a: { zh: '可以。按《消费者报告法》s.10(7)，你可以在 60 天内要求房东说明参考了哪些信息及来源；报告自带申请人通知信。争议请写 privacy@stayloop.ai。', en: 'Yes. Under Consumer Reporting Act s.10(7) you can ask the landlord within 60 days what information was used and where it came from; the report includes an applicant notice. Disputes: privacy@stayloop.ai.' } },
    { q: { zh: '房东可以向我收申请费或筛查费吗？', en: 'Can a landlord charge me an application or screening fee?' }, a: { zh: '不可以（RTA s.134）。也不能收宠物押金、清洁押金或超过一个月租金的押金（s.106）。房源页的「入住前费用一览」会列出合法的三项。', en: 'No (RTA s.134). Nor pet deposits, cleaning deposits or a rent deposit above one month (s.106). The "Move-in costs" card on each listing lists the only lawful items.' } },
    { q: { zh: '为什么没有「在线交租」？', en: 'Why is there no online rent payment?' }, a: { zh: '因为还没做。工作台里标着样例的页面都挂了琥珀色说明，按钮不会扣款。租金记录目前是在管租约里的自述「标记已付」。', en: 'Because it is not built yet. Sample pages in the workspace carry an amber notice and no button moves money. Rent records today are self-reported "mark as paid" entries in a managed tenancy.' } },
    { q: { zh: '商业场地也能找吗？', en: 'Can it search commercial space too?' }, a: { zh: '可以。说清面积、净高、用途和区域，它会在 Realtor.ca 上按区域扇出检索并给对比表；商业租约不受 RTA 保护，用途要向市府书面确认。', en: 'Yes. State size, clear height, use and area; it fans out across Realtor.ca by area and returns a comparison table. Commercial leases are outside the RTA and zoning must be confirmed in writing with the municipality.' } },
  ],
}

export default function TenantLanding() {
  return <RoleLanding cfg={CFG} />
}
