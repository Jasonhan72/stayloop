'use client'

// v7 homepage — built strictly to design/v7-homepage.html (the definitive
// blueprint). The blueprint's <style> block is kept below, minus the
// nav/footer sections (we render the real <Header/> / <Footer/> components
// instead) and three documented adaptations:
//   1. Scoping — every selector is prefixed with .v7-page so the page CSS
//      cannot leak into Header/Footer (which share class names like .orb);
//      the blueprint's :root variables move onto .v7-page. body keeps only
//      margin/background/overflow-x (overflow-x must live on body so the
//      hero::before glow doesn't cause horizontal scroll and position:sticky
//      on the real Header keeps working); typography moves to .v7-page.
//   2. .hero top padding 96px → 84px — the blueprint's sticky nav is ~53px
//      tall, the real sticky Header occupies 66px of flow; 84px keeps the
//      same visual distance from the top of the viewport.
//   3. .trybar .go is rendered as a <Link> (deep-links into
//      /tenant/agent?prompt=…), so an anchor-flex rule is appended.
// All class names are unchanged from the blueprint. Copy is bilingual: the
// blueprint's zh strings are kept verbatim in COPY.zh; COPY.en is the English
// rendering, selected at runtime via useI18n().lang (SSR/first frame renders
// zh — the provider default — then hydrates to the stored/browser language).
import Link from 'next/link'
import { ReactNode, useEffect, useState } from 'react'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { useI18n, type Lang } from '@/lib/i18n'

/* Typewriter lines — zh verbatim from the blueprint script. */
const TRY_LINES: Record<Lang, string[]> = {
  zh: [
    '北约克两房，预算 2800，能养猫',
    '1207 的三份申请，帮我看一下',
    '明天的带看都排好',
    '这份租约的第 8 条什么意思？',
  ],
  en: [
    '2-bed in North York, $2,800 budget, cat-friendly',
    'Review the three applications for unit 1207',
    "Schedule all of tomorrow's showings",
    'What does clause 8 of this lease mean?',
  ],
}

const promptHref = (line: string) => `/tenant/agent?prompt=${encodeURIComponent(line)}`

/* ===================== bilingual copy ===================== */

interface RoleCopy {
  tag: string
  h2: ReactNode
  lead: string
  benefits: { b: string; s: string }[]
  quote: string
  who: string
  avatar: string
  cta: string
  demoName: string
  demoSt: string
  rows: { b: string; s: string; pill: string; pillCls: 'g' | 'n' | 'r' }[]
  note: ReactNode
  act1: string
  act2?: string
  tm: string
}

interface HomeCopy {
  tag: string
  heroH1: ReactNode
  sub: ReactNode
  pains: ReactNode[]
  tryCta: string
  note: string
  chatName: string
  chatSt: string
  chatU: string
  chatA1: ReactNode
  miniT: string
  miniPr: string
  miniM2: ReactNode
  chatA2: ReactNode
  chatBp: string
  chatBs: string
  chatFr: string
  floatB: string
  floatS: string
  trust: ReactNode[]
  heroAlt: string
  cap: string
  stats: { b: string; s: string; num?: boolean }[]
  rolesH2: string
  rolesSub: string
  roles: [RoleCopy, RoleCopy, RoleCopy]
  stepsH2: string
  stepsSub: string
  steps: { h: string; p: ReactNode }[]
  darkH2: string
  darkSub: string
  facts: { b: string; s: ReactNode }[]
  finalAlt: string
  finalH2: ReactNode
  finalP: string
  finalCta: string
  finalNote: string
}

const COPY: Record<Lang, HomeCopy> = {
  /* ---------- zh — verbatim from the blueprint ---------- */
  zh: {
    tag: 'AI-Native Rental OS · Toronto',
    heroH1: (
      <>
        租房路上的难题，
        <br />
        交给<em>各自的 AI</em>。
      </>
    ),
    sub: (
      <>
        Stayloop 为租客、房东、经纪各提供一个<b>独立的 AI Agent</b>：日常事务由它处理，关键决定由你确认。
      </>
    ),
    pains: [
      <>
        <b>房东</b>——筛租客、收租金、日常事务，后台有支持
      </>,
      <>
        <b>租客</b>——材料交一次，没有本地信用也能开始
      </>,
      <>
        <b>经纪</b>——行政事务交给 AI，时间留给专业
      </>,
    ],
    tryCta: '试一句 →',
    note: '由 Anthropic Claude 驱动 · 免注册体验 · 真实挂牌 + TRREB 官方行情作答',
    chatName: 'LUNA · 你的租房 Agent',
    chatSt: '● 在线',
    chatU: '北约克两房，预算 2800，能养猫',
    chatA1: (
      <>
        North York 两房中位 <b>$2,795</b>（TRREB 官方 C14：$2,914 · 224 宗成交）——预算合理。<b>3 套可养猫</b>的已挑好：
      </>
    ),
    miniT: 'Liberty Village 2B',
    miniPr: '$2,750/月',
    miniM2: (
      <>
        <span className="okt">✓ 可养猫</span> · 地铁 8 分钟 · 平台已核验
      </>
    ),
    chatA2: (
      <>
        你的护照已盖 <b>3/4 枚章</b>——材料一份不用再传，我直接替你递交。
      </>
    ),
    chatBp: '用护照一键申请',
    chatBs: '先约看',
    chatFr: '免费 · 永远',
    floatB: 'AI 提议，你决定',
    floatS: '对外动作先经你批准 · 全程留痕',
    trust: [
      <>
        技术 <b>Anthropic Claude</b>
      </>,
      <>
        行情 <b>TRREB · Realtor.ca 官方数据</b>
      </>,
      <>
        合规 <b>RTA · OHRC · PIPEDA</b>
      </>,
      <>
        🍁 <b>Proudly Canadian</b> · 数据驻加
      </>,
    ],
    heroAlt: '晨雾中的多伦多 CN 塔',
    cap: '多伦多 · 我们的主场',
    stats: [
      { b: '$0', s: '租客永远免费，隐私不是商品', num: true },
      { b: '验证一次', s: '四枚章盖好，申请不再重复交材料' },
      { b: '29 个季度', s: 'TRREB 官方成交数据入库，行情有据', num: true },
      { b: '全程留痕', s: '每一步可追问、可回查、可审计' },
    ],
    rolesH2: '三种角色，各自的 Agent',
    rolesSub: '不是同一个客服机器人——是三个立场不同、只对你负责的 AI。',
    roles: [
      {
        tag: '房东 × LOGIC',
        h2: (
          <>
            选对租客，按时收租，
            <br />
            后台有支持。
          </>
        ),
        lead: 'Logic 把每份申请查完材料真伪和法庭记录，每一分写明理由，再排好序给你。',
        benefits: [
          { b: '每份申请先过六维尽调', s: '材料真伪、法庭记录都查过，伪造材料会被识别并拦下。' },
          { b: '租金回收由系统跟进', s: '在线收租、月末自动提醒；续约提前 120 天备好方案。' },
          { b: 'AI 后台全天候在线', s: '夜间报修接待、合规拦截、审计留痕——你只需要确认。' },
        ],
        quote: '“空置一个月，$2,900 就没了。工资单是真是假？我不知道该信谁。”',
        who: 'Sarah Wang · 会计师 · 2 套投资公寓',
        avatar: 'SW',
        cta: '让 Logic 协助管理房源 →',
        demoName: 'LOGIC · 房东 Agent',
        demoSt: '● 后台运行中',
        rows: [
          { b: '① Mia Chen · 87 分', s: '六维全过 · 法庭记录 0 条', pill: '建议面谈', pillCls: 'g' },
          { b: '② Kevin Tran · 74 分', s: '稳定性 62', pill: '可备选', pillCls: 'n' },
          { b: '③ 申请人 C', s: '工资单 CRA 扣缴对不上', pill: '已拦下', pillCls: 'r' },
        ],
        note: (
          <>
            <b>Thompson 的租约 92 天后到期</b>——续约方案 A（不涨）/ B（+2.5%）已拟好，批准就发。
          </>
        ),
        act1: '批准并发送 →',
        act2: '改一改',
        tm: '02:14 自动生成',
      },
      {
        tag: '租客 × LUNA',
        h2: (
          <>
            没有本地信用记录，
            <br />
            也能建立可信的租房履历。
          </>
        ),
        lead: '条件说人话，房源全是真的；四枚章盖好，申请任何房源不再重复交材料。',
        benefits: [
          { b: '真实挂牌 + 官方行情作答', s: 'TRREB 官方成交对照，绝不编造；英文租约逐条讲成中文。' },
          { b: '验证一次，处处通行', s: '护照、枫叶卡、工签都支持——材料只交一次。' },
          { b: '评分带理由，拒绝有依据', s: '按时租金、真实记录都写进你的护照，替你说话。' },
        ],
        quote: '“信用空白，被拒 3 次。同样的资料填了一遍又一遍。”',
        who: 'Mia Chen · 软件工程师 · 新移民',
        avatar: 'MC',
        cta: '让 Luna 开始找 →',
        demoName: 'LUNA · 租客 Agent',
        demoSt: '● 在线',
        rows: [
          { b: 'Liberty Village 1B · $2,250', s: '地铁 8 分钟', pill: '✓ 可养猫', pillCls: 'g' },
          { b: 'King West Studio+ · $2,180', s: '平台已核验', pill: '✓ 可养猫', pillCls: 'g' },
          { b: 'Fort York 1B · $2,290', s: '带家具', pill: '需快申', pillCls: 'n' },
        ],
        note: (
          <>
            你的护照已盖 <b>3/4 枚章</b>——选中哪套，材料一份不用再传。
          </>
        ),
        act1: '用护照一键申请 →',
        act2: '先约看',
        tm: '免费 · 永远',
      },
      {
        tag: '经纪 × BRIEF',
        h2: (
          <>
            行政事务交给 AI，
            <br />
            时间留给专业工作。
          </>
        ),
        lead: '确认到场、发提醒、收反馈、算佣金——这些吃掉半天的事，Brief 全部接走。',
        benefits: [
          { b: '日程自动编排', s: '租客到场自动确认，材料包与授权问答清单提前备好。' },
          { b: '反馈自动收集归档', s: '看房意见整理好直达房东，每个客户的进度都有人盯。' },
          { b: '佣金结算透明', s: '转介分成在线到账，每一笔流水可查，RECO 合规留痕。' },
        ],
        quote: '“不是没机会，是时间被行政碎片化了。”',
        who: 'David Park · 持牌经纪 · RECO 6 年',
        avatar: 'DP',
        cta: '让 Brief 安排日程 →',
        demoName: 'BRIEF · 经纪 Agent',
        demoSt: '● 编排中',
        rows: [
          { b: '11:00 · Liberty Village 2B', s: 'Kevin 已确认 · 材料包好', pill: '✓ 就绪', pillCls: 'g' },
          { b: '14:00 · Unit 1207 King West', s: '授权问答清单已生成', pill: '✓ 就绪', pillCls: 'g' },
          { b: '16:30 · 反馈汇总 → Sarah', s: '自动整理，无需动手', pill: '待办', pillCls: 'n' },
        ],
        note: (
          <>
            上周转介佣金 <b>$1,225 已到账</b>——流水在结算页随时可查。
          </>
        ),
        act1: '看今日日程 →',
        tm: '07:30 编排完成',
      },
    ],
    stepsH2: '怎么开始',
    stepsSub: '没有表单迷宫——对话就是入口。',
    steps: [
      {
        h: '说一句',
        p: (
          <>
            “多大附近、能养猫、4000 以内”——<b>地标、预算、偏好</b>都能理解。
          </>
        ),
      },
      {
        h: 'Agent 去办',
        p: (
          <>
            查真实挂牌、对官方行情、备好材料——<b>例行工作自动完成</b>，睡觉时也在盯。
          </>
        ),
      },
      {
        h: '你来确认',
        p: (
          <>
            发送、签署、付款先变成<b>等你批准的卡片</b>；每一步留痕，随时回查。
          </>
        ),
      },
    ],
    darkH2: '不给形容词，给可以验证的东西',
    darkSub: '页面上的每个数字，都来自线上正在运行的系统。',
    facts: [
      {
        b: '6 维',
        s: (
          <>
            AI 尽调评分，<i>每一分写明理由</i>
          </>
        ),
      },
      {
        b: '4 枚章',
        s: (
          <>
            租客护照，<i>验证一次处处通行</i>
          </>
        ),
      },
      {
        b: '29 季',
        s: (
          <>
            TRREB 官方成交数据，<i>2019 年至今全量入库</i>
          </>
        ),
      },
      {
        b: '$0',
        s: (
          <>
            租客全程免费，<i>数据驻加拿大、绝不出售</i>
          </>
        ),
      },
    ],
    finalAlt: '明亮的公寓客厅',
    finalH2: (
      <>
        下一个家，
        <br />
        从一句话开始。
      </>
    ),
    finalP: '免注册体验——你的 Agent 现在就能开始干活。',
    finalCta: '开始 →',
    finalNote: '免注册即可体验，随时开始。',
  },

  /* ---------- en ---------- */
  en: {
    tag: 'AI-Native Rental OS · Toronto',
    heroH1: (
      <>
        The hard parts of renting,
        <br />
        handled by <em>your own AI</em>.
      </>
    ),
    sub: (
      <>
        Stayloop gives tenants, landlords and agents each a <b>dedicated AI agent</b>: it handles the routine work; you confirm the key decisions.
      </>
    ),
    pains: [
      <>
        <b>Landlords</b> — screening, rent collection, day-to-day tasks, with a back office behind you
      </>,
      <>
        <b>Tenants</b> — submit documents once; start even without local credit
      </>,
      <>
        <b>Agents</b> — admin goes to the AI, your time goes to the real work
      </>,
    ],
    tryCta: 'Try it →',
    note: 'Powered by Anthropic Claude · Try without signing up · Answers from real listings + official TRREB market data',
    chatName: 'LUNA · Your rental Agent',
    chatSt: '● Online',
    chatU: '2-bed in North York, $2,800 budget, cat-friendly',
    chatA1: (
      <>
        The North York two-bed median is <b>$2,795</b> (official TRREB C14: $2,914 · 224 leases) — your budget works. <b>3 cat-friendly picks</b> are ready:
      </>
    ),
    miniT: 'Liberty Village 2B',
    miniPr: '$2,750/mo',
    miniM2: (
      <>
        <span className="okt">✓ Cats OK</span> · 8 min to subway · platform-verified
      </>
    ),
    chatA2: (
      <>
        Your passport has <b>3 of 4 stamps</b> — nothing to re-upload, I&rsquo;ll submit for you.
      </>
    ),
    chatBp: 'Apply with your Passport',
    chatBs: 'Book a viewing',
    chatFr: 'Free · forever',
    floatB: 'AI proposes, you decide',
    floatS: 'Outbound actions need your approval · fully logged',
    trust: [
      <>
        Powered by <b>Anthropic Claude</b>
      </>,
      <>
        Market data <b>Official TRREB · Realtor.ca</b>
      </>,
      <>
        Compliance <b>RTA · OHRC · PIPEDA</b>
      </>,
      <>
        🍁 <b>Proudly Canadian</b> · data stays in Canada
      </>,
    ],
    heroAlt: 'The Toronto CN Tower in morning mist',
    cap: 'Toronto · Our home turf',
    stats: [
      { b: '$0', s: 'Tenants free forever — privacy is not a product', num: true },
      { b: 'Verify once', s: 'Earn the four stamps once — no more re-submitting documents' },
      { b: '29 quarters', s: 'Official TRREB transaction data on file — market answers with sources', num: true },
      { b: 'Fully logged', s: 'Every step can be questioned, reviewed and audited' },
    ],
    rolesH2: 'Three roles, each with its own agent',
    rolesSub: 'Not one shared support bot — three AIs with different loyalties, each answering only to you.',
    roles: [
      {
        tag: 'Landlord × LOGIC',
        h2: (
          <>
            The right tenant, rent on time,
            <br />
            and a back office behind you.
          </>
        ),
        lead: 'Logic checks every application for document authenticity and court records, explains every point, then ranks them for you.',
        benefits: [
          {
            b: 'Every application goes through six-dimension screening first',
            s: 'Document authenticity and court records are checked; forged documents are flagged and blocked.',
          },
          {
            b: 'Rent collection is tracked by the system',
            s: 'Online rent and automatic month-end reminders; renewal options prepared 120 days ahead.',
          },
          {
            b: 'An AI back office, on around the clock',
            s: 'Overnight maintenance intake, compliance blocking, audit trails — you only confirm.',
          },
        ],
        quote: '“One month vacant is $2,900 gone. Are the pay stubs real? I don’t know who to trust.”',
        who: 'Sarah Wang · Accountant · 2 investment condos',
        avatar: 'SW',
        cta: 'Let Logic help manage your rentals →',
        demoName: 'LOGIC · Landlord Agent',
        demoSt: '● Running',
        rows: [
          { b: '① Mia Chen · 87', s: 'All six passed · 0 court records', pill: 'Interview suggested', pillCls: 'g' },
          { b: '② Kevin Tran · 74', s: 'Stability 62', pill: 'Backup option', pillCls: 'n' },
          { b: '③ Applicant C', s: 'Pay stub CRA withholding mismatch', pill: 'Blocked', pillCls: 'r' },
        ],
        note: (
          <>
            <b>Thompson&rsquo;s lease expires in 92 days</b> — renewal options A (no increase) / B (+2.5%) are drafted; approve and they go out.
          </>
        ),
        act1: 'Approve & send →',
        act2: 'Edit',
        tm: 'Auto-generated 02:14',
      },
      {
        tag: 'Tenant × LUNA',
        h2: (
          <>
            Build a trusted rental record,
            <br />
            even without local credit history.
          </>
        ),
        lead: 'Say what you want in plain language — every listing is real; earn the four stamps once and apply anywhere without re-submitting documents.',
        benefits: [
          {
            b: 'Real listings + official market data',
            s: 'Cross-checked against official TRREB transactions, never invented; English leases explained clause by clause in Chinese.',
          },
          {
            b: 'Verify once, use it everywhere',
            s: 'Passport, PR card or work permit all supported — documents submitted only once.',
          },
          {
            b: 'Scores come with reasons; rejections need grounds',
            s: 'On-time rent and verified history go into your Tenant Passport and speak for you.',
          },
        ],
        quote: '“No credit file, rejected three times. The same documents filled in again and again.”',
        who: 'Mia Chen · Software engineer · Newcomer',
        avatar: 'MC',
        cta: 'Let Luna start searching →',
        demoName: 'LUNA · Tenant Agent',
        demoSt: '● Online',
        rows: [
          { b: 'Liberty Village 1B · $2,250', s: '8 min to subway', pill: '✓ Cats OK', pillCls: 'g' },
          { b: 'King West Studio+ · $2,180', s: 'Platform-verified', pill: '✓ Cats OK', pillCls: 'g' },
          { b: 'Fort York 1B · $2,290', s: 'Furnished', pill: 'Apply fast', pillCls: 'n' },
        ],
        note: (
          <>
            Your passport has <b>3 of 4 stamps</b> — pick one, and nothing needs re-uploading.
          </>
        ),
        act1: 'Apply with your Passport →',
        act2: 'Book a viewing',
        tm: 'Free · forever',
      },
      {
        tag: 'Agent × BRIEF',
        h2: (
          <>
            Admin goes to the AI,
            <br />
            your time goes to the real work.
          </>
        ),
        lead: 'Confirming attendance, sending reminders, collecting feedback, settling commissions — the tasks that eat half a day, Brief takes them all.',
        benefits: [
          {
            b: 'Schedules orchestrated automatically',
            s: 'Tenant attendance auto-confirmed; showing briefs and the authorized Q&A list prepared ahead.',
          },
          {
            b: 'Feedback collected and filed automatically',
            s: 'Viewing feedback goes straight to the landlord, and every client’s progress is watched.',
          },
          {
            b: 'Commission settlement is transparent',
            s: 'Referral splits paid online, every transaction traceable, with a RECO-compliant audit trail.',
          },
        ],
        quote: '“It’s not a lack of opportunities — my time gets shredded by admin.”',
        who: 'David Park · Licensed agent · RECO 6 yrs',
        avatar: 'DP',
        cta: 'Let Brief run your schedule →',
        demoName: 'BRIEF · Realtor Agent',
        demoSt: '● Orchestrating',
        rows: [
          { b: '11:00 · Liberty Village 2B', s: 'Kevin confirmed · brief ready', pill: '✓ Ready', pillCls: 'g' },
          { b: '14:00 · Unit 1207 King West', s: 'Authorized Q&A list generated', pill: '✓ Ready', pillCls: 'g' },
          { b: '16:30 · Feedback digest → Sarah', s: 'Auto-compiled, nothing to do', pill: 'To do', pillCls: 'n' },
        ],
        note: (
          <>
            Last week&rsquo;s referral commission of <b>$1,225 has landed</b> — the transaction is on your settlement page anytime.
          </>
        ),
        act1: 'See today’s schedule →',
        tm: 'Orchestrated 07:30',
      },
    ],
    stepsH2: 'How to start',
    stepsSub: 'No form maze — conversation is the interface.',
    steps: [
      {
        h: 'Say it',
        p: (
          <>
            &ldquo;Near U of T, cat-friendly, under $4,000&rdquo; — <b>landmarks, budgets and preferences</b> are all understood.
          </>
        ),
      },
      {
        h: 'The agent does it',
        p: (
          <>
            Checks real listings, cross-references official market data, preps documents — <b>routine work runs itself</b>, watching even while you sleep.
          </>
        ),
      },
      {
        h: 'You confirm',
        p: (
          <>
            Sending, signing and paying first become <b>cards awaiting your approval</b>; every step is logged and reviewable anytime.
          </>
        ),
      },
    ],
    darkH2: 'No adjectives — only things you can verify',
    darkSub: 'Every number on this page comes from the system running in production.',
    facts: [
      {
        b: '6 dims',
        s: (
          <>
            AI screening score, <i>every point comes with a reason</i>
          </>
        ),
      },
      {
        b: '4 stamps',
        s: (
          <>
            Tenant Passport — <i>verify once, use it everywhere</i>
          </>
        ),
      },
      {
        b: '29 qtrs',
        s: (
          <>
            Official TRREB transaction data, <i>fully on file since 2019</i>
          </>
        ),
      },
      {
        b: '$0',
        s: (
          <>
            Tenants free throughout — <i>data stays in Canada, never sold</i>
          </>
        ),
      },
    ],
    finalAlt: 'A bright apartment living room',
    finalH2: (
      <>
        Your next home
        <br />
        starts with a sentence.
      </>
    ),
    finalP: 'Try without signing up — your agent can start working right now.',
    finalCta: 'Start →',
    finalNote: 'No sign-up needed — start anytime.',
  },
}

/* ===================== blueprint <style> (nav/footer sections removed, selectors scoped to .v7-page) ===================== */

const CSS = `
  html { scroll-behavior: smooth; }
  @media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
  body { margin: 0; background: #FBFBF9; overflow-x: hidden; }
  .v7-page {
    --bg: #FBFBF9; --surface: #FFFFFF; --wash: #F6F5F1;
    --ink: #18181B; --ink-2: #52525B; --ink-3: #71717A;
    --line: #E8E6E1; --line-2: #D6D3CC;
    --brand: #7C3AED; --brand-deep: #5B21B6; --brand-soft: #F4F0FD; --brand-light: #C4B5FD;
    --ok: #16A34A; --ok-soft: #EAF6EE;
    --lord: #047857; --agnt: #2563EB;
    --dark: #131118; --dark-ink: #EFEBF6; --dark-muted: #9A93AC;
    --r-ctl: 12px; --r-card: 16px; --r-photo: 24px;
    --sh-sm: 0 1px 2px rgba(24,24,27,.05), 0 1px 6px rgba(24,24,27,.04);
    --sh-md: 0 12px 32px -16px rgba(24,24,27,.18);
    --sh-lg: 0 32px 64px -32px rgba(24,24,27,.28);
    color: var(--ink);
    font-family: -apple-system, "PingFang SC", "Noto Sans SC", "Microsoft YaHei", system-ui, sans-serif;
    font-size: 16px; line-height: 1.75; -webkit-font-smoothing: antialiased;
  }
  .v7-page, .v7-page * { box-sizing: border-box; }
  .v7-page .mono { font-family: ui-monospace, "SF Mono", Menlo, monospace; }
  .v7-page .num { font-variant-numeric: tabular-nums; }
  .v7-page .wrap { max-width: 1180px; margin: 0 auto; padding: 0 32px; }
  .v7-page button { font-family: inherit; cursor: pointer; }
  .v7-page h1, .v7-page h2, .v7-page h3 { text-wrap: balance; margin: 0; }
  .v7-page img { display: block; max-width: 100%; }
  .v7-page .rv { opacity: 0; transform: translateY(16px); transition: opacity .6s ease, transform .6s ease; }
  .v7-page .rv.in { opacity: 1; transform: none; }
  @media (prefers-reduced-motion: reduce) { .v7-page .rv { opacity: 1; transform: none; transition: none; } }

  /* —— 组件规范 —— */
  .v7-page .btn-p { display: inline-flex; align-items: center; gap: 6px; background: var(--brand); color: #fff;
    border: none; border-radius: var(--r-ctl); padding: 13px 24px; font-size: 15px; font-weight: 600;
    text-decoration: none; box-shadow: var(--sh-sm); transition: background .15s ease; }
  .v7-page .btn-p:hover { background: var(--brand-deep); }
  .v7-page .btn-s { display: inline-flex; align-items: center; gap: 6px; background: var(--surface); color: var(--ink);
    border: 1px solid var(--line-2); border-radius: var(--r-ctl); padding: 12px 22px; font-size: 15px;
    font-weight: 600; text-decoration: none; }
  .v7-page .card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-card); box-shadow: var(--sh-sm); }
  .v7-page .tag { display: inline-flex; align-items: center; gap: 7px; font-size: 13px; font-weight: 600; color: var(--ink-2);
    background: var(--surface); border: 1px solid var(--line); border-radius: 999px; padding: 5px 13px; }
  .v7-page .tag .d { width: 7px; height: 7px; border-radius: 999px; background: var(--brand); }
  .v7-page .sec { padding: 112px 0 0; }
  .v7-page .sec-head { text-align: center; max-width: 640px; margin: 0 auto 56px; }
  .v7-page .sec-head h2 { font-size: clamp(30px, 3.6vw, 40px); font-weight: 800; letter-spacing: -.01em; line-height: 1.3; }
  .v7-page .sec-head p { color: var(--ink-2); margin: 14px 0 0; font-size: 16px; }

  /* ============ HERO ============ */
  /* top padding 96px → 84px: the blueprint's sticky nav is ~53px tall, the
     real sticky Header occupies 66px of flow — 84px keeps the same visual
     distance from the top of the viewport. */
  .v7-page .hero { position: relative; padding: 84px 0 0; }
  .v7-page .hero::before { content: ""; position: absolute; top: -80px; right: -10%; width: 720px; height: 720px;
    background: radial-gradient(circle, rgba(124,58,237,.07), transparent 62%); pointer-events: none; }
  .v7-page .hero-in { display: grid; grid-template-columns: 1.02fr .98fr; gap: 72px; align-items: center; }
  @media (max-width: 980px) { .v7-page .hero-in { grid-template-columns: 1fr; } }
  .v7-page .hero h1 { font-size: clamp(40px, 5vw, 62px); font-weight: 800; letter-spacing: -.02em; line-height: 1.16; }
  .v7-page .hero h1 em { font-style: normal; color: var(--brand); }
  .v7-page .hero .sub { color: var(--ink-2); font-size: 18px; margin: 22px 0 0; max-width: 30em; }
  .v7-page .hero .sub b { color: var(--ink); font-weight: 600; }
  .v7-page .painline { margin: 26px 0 0; display: flex; flex-direction: column; gap: 10px; font-size: 15px; color: var(--ink-2); }
  .v7-page .painline div { display: flex; gap: 10px; align-items: baseline; }
  .v7-page .painline b { color: var(--ink); font-weight: 600; flex: none; }
  .v7-page .painline .ck { color: var(--brand); font-weight: 700; flex: none; }
  .v7-page .trybar { margin-top: 32px; display: flex; background: var(--surface); border: 1px solid var(--line-2);
    border-radius: 14px; overflow: hidden; max-width: 520px; box-shadow: var(--sh-md); }
  .v7-page .trybar:focus-within { border-color: var(--brand); }
  .v7-page .trybar .q { flex: 1; padding: 17px 20px; font-size: 15px; color: var(--ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .v7-page .trybar .q .caret { display: inline-block; width: 2px; height: 1em; background: var(--brand); vertical-align: -2px; margin-left: 2px; }
  @media (prefers-reduced-motion: no-preference) { .v7-page .trybar .q .caret { animation: blink 1s steps(1) infinite; } @keyframes blink { 50% { opacity: 0; } } }
  .v7-page .trybar .go { background: var(--brand); color: #fff; border: none; padding: 0 26px; font-size: 15px; font-weight: 600; }
  .v7-page .trybar .go:hover { background: var(--brand-deep); }
  /* adaptation: the trybar CTA is a Link (anchor) instead of a button */
  .v7-page .trybar a.go { display: inline-flex; align-items: center; text-decoration: none; white-space: nowrap; }
  .v7-page .hero .note { margin-top: 14px; font-size: 13px; color: var(--ink-3); }

  /* hero 右：产品组合 */
  .v7-page .stage { position: relative; }
  .v7-page .stage .panel { background: linear-gradient(160deg, var(--brand-soft), #EFF3FD 70%, var(--wash));
    border-radius: var(--r-photo); padding: 40px 36px 44px; }
  .v7-page .chat { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-card);
    box-shadow: var(--sh-lg); padding: 18px; max-width: 430px; margin: 0 auto; }
  .v7-page .chat-h { display: flex; align-items: center; gap: 10px; padding-bottom: 12px; border-bottom: 1px solid var(--line); }
  .v7-page .orb { width: 26px; height: 26px; border-radius: 999px; background: radial-gradient(circle at 32% 28%, var(--brand-light), var(--brand)); flex: none; }
  @media (prefers-reduced-motion: no-preference) { .v7-page .chat-h .orb { animation: breathe 4s ease-in-out infinite; }
    @keyframes breathe { 50% { transform: scale(1.08); } } }
  .v7-page .chat-h b { font-size: 13.5px; }
  .v7-page .chat-h .st { margin-left: auto; font-size: 11px; font-weight: 600; color: var(--ok); }
  .v7-page .msgs { display: flex; flex-direction: column; gap: 10px; padding-top: 14px; }
  .v7-page .m-u { align-self: flex-end; background: var(--brand); color: #fff; border-radius: 12px 12px 4px 12px; padding: 9px 14px; font-size: 13.5px; max-width: 85%; }
  .v7-page .m-a { align-self: flex-start; background: var(--wash); border-radius: 12px 12px 12px 4px; padding: 9px 14px; font-size: 13.5px; color: var(--ink-2); max-width: 92%; }
  .v7-page .m-a b { color: var(--ink); font-weight: 600; }
  .v7-page .mini { border: 1px solid var(--line); border-radius: 12px; padding: 11px 14px; }
  .v7-page .mini .t { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
  .v7-page .mini .t b { font-size: 13.5px; }
  .v7-page .mini .t .pr { font-weight: 700; font-size: 14px; color: var(--brand-deep); }
  .v7-page .mini .m2 { font-size: 12px; color: var(--ink-3); margin-top: 3px; }
  .v7-page .mini .m2 .okt { color: var(--ok); font-weight: 600; }
  .v7-page .chat .act { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 2px; align-items: center; }
  .v7-page .chat .act .bp { background: var(--brand); border: none; color: #fff; border-radius: 9px; padding: 8px 15px; font-size: 12.5px; font-weight: 600; }
  .v7-page .chat .act .bs { background: #fff; border: 1px solid var(--line-2); color: var(--ink-2); border-radius: 9px; padding: 8px 13px; font-size: 12.5px; font-weight: 600; }
  .v7-page .chat .act .fr { margin-left: auto; font-size: 11px; color: var(--ink-3); }
  .v7-page .float-note { position: absolute; right: 18px; bottom: -18px; background: var(--surface); border: 1px solid var(--line);
    border-radius: 12px; padding: 10px 16px; box-shadow: var(--sh-md); display: flex; align-items: center; gap: 10px; }
  .v7-page .float-note .ck2 { width: 24px; height: 24px; border-radius: 999px; background: var(--ok); color: #fff; font-size: 12px;
    font-weight: 800; display: flex; align-items: center; justify-content: center; flex: none; }
  .v7-page .float-note b { display: block; font-size: 12.5px; line-height: 1.4; }
  .v7-page .float-note span { display: block; font-size: 11px; color: var(--ink-3); }

  /* ============ 信任行 ============ */
  .v7-page .trust { margin-top: 72px; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); background: var(--surface); }
  .v7-page .trust-in { max-width: 1180px; margin: 0 auto; padding: 18px 32px; display: flex; align-items: center;
    justify-content: center; gap: 12px 40px; flex-wrap: wrap; font-size: 13px; color: var(--ink-3); }
  .v7-page .trust-in b { color: var(--ink-2); font-weight: 600; }

  /* ============ 照片数据带 ============ */
  .v7-page .photoband { padding-top: 112px; }
  .v7-page .photoband .ph { position: relative; border-radius: var(--r-photo); overflow: hidden; box-shadow: var(--sh-lg); }
  .v7-page .photoband img { width: 100%; height: 400px; object-fit: cover; object-position: center 58%; filter: saturate(.85); }
  .v7-page .photoband .cap { position: absolute; top: 20px; left: 24px; font-size: 12px; font-weight: 600; color: rgba(255,255,255,.95);
    background: rgba(19,17,24,.4); backdrop-filter: blur(8px); border-radius: 999px; padding: 6px 14px; }
  .v7-page .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-top: -44px; position: relative; padding: 0 40px; }
  @media (max-width: 900px) { .v7-page .stats { grid-template-columns: repeat(2, 1fr); padding: 0 16px; } }
  .v7-page .stat { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-card);
    box-shadow: var(--sh-md); padding: 22px 24px; }
  .v7-page .stat b { display: block; font-size: 22px; font-weight: 800; letter-spacing: -.01em; }
  .v7-page .stat span { display: block; font-size: 13px; color: var(--ink-2); margin-top: 4px; line-height: 1.6; }

  /* ============ 三角色 ============ */
  .v7-page .role { padding: 96px 0 0; }
  .v7-page .role-in { display: grid; grid-template-columns: .94fr 1.06fr; gap: 72px; align-items: center; }
  .v7-page .role.flip .role-in { grid-template-columns: 1.06fr .94fr; }
  .v7-page .role.flip .role-copy { order: 2; }
  @media (max-width: 980px) { .v7-page .role-in, .v7-page .role.flip .role-in { grid-template-columns: 1fr; }
    .v7-page .role.flip .role-copy { order: 0; } }
  .v7-page .role-copy h2 { font-size: clamp(28px, 3.2vw, 36px); font-weight: 800; letter-spacing: -.015em; line-height: 1.32; margin-top: 18px; }
  .v7-page .role-copy .lead { color: var(--ink-2); font-size: 16px; margin: 16px 0 0; max-width: 28em; }
  .v7-page .benefits { margin: 26px 0 0; display: flex; flex-direction: column; gap: 14px; }
  .v7-page .bene { display: flex; gap: 12px; }
  .v7-page .bene .ic { width: 22px; height: 22px; border-radius: 7px; background: var(--brand-soft); color: var(--brand-deep);
    font-size: 12px; font-weight: 800; display: flex; align-items: center; justify-content: center; flex: none; margin-top: 3px; }
  .v7-page .bene b { display: block; font-size: 15px; font-weight: 600; }
  .v7-page .bene span { display: block; font-size: 13.5px; color: var(--ink-2); margin-top: 1px; line-height: 1.65; }
  .v7-page .quoterow { margin-top: 26px; display: flex; gap: 12px; align-items: flex-start; border-top: 1px solid var(--line); padding-top: 20px; }
  .v7-page .avatar { width: 36px; height: 36px; border-radius: 999px; background: var(--wash); border: 1px solid var(--line);
    color: var(--ink-2); font-size: 12px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex: none; }
  .v7-page .quoterow p { margin: 0; font-size: 14px; color: var(--ink-2); font-style: italic; line-height: 1.7; }
  .v7-page .quoterow .who { display: block; font-style: normal; font-size: 12px; color: var(--ink-3); margin-top: 5px; }
  .v7-page .role-cta { margin-top: 24px; }

  /* 角色演示卡（统一白卡 · 角色色只做点缀） */
  .v7-page .demo { position: relative; }
  .v7-page .demo .backwash { position: absolute; inset: 8% -6% -6% 8%; border-radius: var(--r-photo); background: var(--wash); z-index: -1; }
  .v7-page .demo-card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-card);
    box-shadow: var(--sh-lg); padding: 20px; }
  .v7-page .demo-h { display: flex; align-items: center; gap: 10px; padding-bottom: 13px; border-bottom: 1px solid var(--line); }
  .v7-page .demo-h .o2 { width: 24px; height: 24px; border-radius: 999px; flex: none; }
  .v7-page .demo-h b { font-size: 13.5px; }
  .v7-page .demo-h .st2 { margin-left: auto; font-size: 11px; font-weight: 600; white-space: nowrap; }
  .v7-page .demo[data-r="l"] .o2 { background: radial-gradient(circle at 32% 28%, #6EE7B7, var(--lord)); }
  .v7-page .demo[data-r="l"] .st2 { color: var(--lord); }
  .v7-page .demo[data-r="t"] .o2 { background: radial-gradient(circle at 32% 28%, var(--brand-light), var(--brand)); }
  .v7-page .demo[data-r="t"] .st2 { color: var(--brand); }
  .v7-page .demo[data-r="a"] .o2 { background: radial-gradient(circle at 32% 28%, #93C5FD, var(--agnt)); }
  .v7-page .demo[data-r="a"] .st2 { color: var(--agnt); }
  .v7-page .rows { padding-top: 8px; }
  .v7-page .row { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px 2px;
    border-bottom: 1px solid var(--line); font-size: 14px; }
  .v7-page .row:last-child { border-bottom: none; }
  .v7-page .row .l b { display: block; font-size: 14px; font-weight: 600; }
  .v7-page .row .l span { display: block; font-size: 12.5px; color: var(--ink-3); margin-top: 1px; }
  .v7-page .pill { font-size: 12px; font-weight: 600; border-radius: 999px; padding: 4px 12px; white-space: nowrap; }
  .v7-page .pill.g { background: var(--ok-soft); color: var(--ok); }
  .v7-page .pill.n { background: var(--wash); color: var(--ink-2); }
  .v7-page .pill.r { background: #FCEBEA; color: #DC2626; }
  .v7-page .demo-note { margin-top: 14px; background: var(--wash); border-radius: 12px; padding: 12px 16px; font-size: 13px; color: var(--ink-2); }
  .v7-page .demo-note b { color: var(--ink); font-weight: 600; }
  .v7-page .demo-act { display: flex; gap: 8px; margin-top: 14px; align-items: center; }
  .v7-page .demo-act .bp2 { border: none; color: #fff; border-radius: 10px; padding: 10px 18px; font-size: 13px; font-weight: 600; }
  .v7-page .demo[data-r="l"] .bp2 { background: var(--lord); }
  .v7-page .demo[data-r="t"] .bp2 { background: var(--brand); }
  .v7-page .demo[data-r="a"] .bp2 { background: var(--agnt); }
  .v7-page .demo-act .bs2 { background: #fff; border: 1px solid var(--line-2); color: var(--ink-2); border-radius: 10px; padding: 10px 15px; font-size: 13px; font-weight: 600; }
  .v7-page .demo-act .tm { margin-left: auto; font-size: 11.5px; color: var(--ink-3); }
  /* adaptation: demo-card / chat "buttons" are decorative spans (aria-hidden demos) — no pointer affordance */
  .v7-page .chat .act .bp, .v7-page .chat .act .bs,
  .v7-page .demo-act .bp2, .v7-page .demo-act .bs2 { cursor: default; }

  /* ============ 三步 ============ */
  .v7-page .steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
  @media (max-width: 900px) { .v7-page .steps { grid-template-columns: 1fr; } }
  .v7-page .step { padding: 32px 28px; }
  .v7-page .step .n { width: 40px; height: 40px; border-radius: 12px; background: var(--brand-soft); color: var(--brand-deep);
    font-size: 16px; font-weight: 800; display: flex; align-items: center; justify-content: center; }
  .v7-page .step h3 { font-size: 19px; font-weight: 700; margin-top: 18px; }
  .v7-page .step p { font-size: 14px; color: var(--ink-2); margin: 8px 0 0; line-height: 1.7; }
  .v7-page .step p b { color: var(--ink); font-weight: 600; }

  /* ============ 深色数据带 ============ */
  .v7-page .darkband { margin-top: 112px; background: var(--dark); color: var(--dark-ink); padding: 88px 0; }
  .v7-page .darkband h2 { font-size: clamp(28px, 3.4vw, 38px); font-weight: 800; letter-spacing: -.01em; text-align: center; }
  .v7-page .darkband .sub { color: var(--dark-muted); text-align: center; margin: 14px auto 0; max-width: 36em; font-size: 15px; }
  .v7-page .facts { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0; margin-top: 56px; border-left: 1px solid rgba(255,255,255,.1); }
  @media (max-width: 900px) { .v7-page .facts { grid-template-columns: repeat(2, 1fr); } }
  .v7-page .fact { border-right: 1px solid rgba(255,255,255,.1); padding: 8px 28px; }
  .v7-page .fact b { display: block; font-size: clamp(28px, 3vw, 36px); font-weight: 800; letter-spacing: -.02em; }
  .v7-page .fact span { display: block; font-size: 13px; color: var(--dark-muted); margin-top: 6px; line-height: 1.7; }
  .v7-page .fact span i { font-style: normal; color: var(--dark-ink); }

  /* ============ 终幕 ============ */
  .v7-page .final { padding: 112px 0; }
  .v7-page .final-in { position: relative; border-radius: var(--r-photo); overflow: hidden; box-shadow: var(--sh-lg); }
  .v7-page .final-in img { width: 100%; height: 480px; object-fit: cover; }
  .v7-page .final-in .veil { position: absolute; inset: 0; background: linear-gradient(90deg, rgba(19,17,24,.55) 0%, rgba(19,17,24,.15) 60%, transparent); }
  .v7-page .final-copy { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: center; padding: 0 64px; max-width: 560px; }
  @media (max-width: 700px) { .v7-page .final-copy { padding: 0 28px; } }
  .v7-page .final-copy h2 { color: #fff; font-size: clamp(30px, 3.8vw, 44px); font-weight: 800; letter-spacing: -.015em; line-height: 1.25; }
  .v7-page .final-copy p { color: rgba(255,255,255,.9); font-size: 15.5px; margin: 14px 0 0; }
  .v7-page .final-copy .trybar { box-shadow: 0 24px 56px -20px rgba(0,0,0,.5); }
  .v7-page .final-copy .fnote { color: rgba(255,255,255,.75); font-size: 12.5px; margin-top: 12px; }
`

/* ===================== page ===================== */

export default function HomePage() {
  const { lang } = useI18n()
  const c = COPY[lang] ?? COPY.zh
  const tryLines = TRY_LINES[lang] ?? TRY_LINES.zh

  // 静态 metadata 是双语合排；hydration 后按当前语言收窄标签页标题。
  useEffect(() => {
    document.title =
      lang === 'zh'
        ? 'Stayloop — 租房的 AI 操作系统 · Toronto'
        : 'Stayloop — The AI-native rental OS for Toronto'
  }, [lang])

  // Scroll reveal — blueprint behavior: IO adds .in at threshold .08;
  // reduced motion shows everything immediately.
  // 瞬时跳转（锚点/instant scroll）会让 IO 停留在 false→false 永不触发，
  // 兜底在 scroll/load 时逐帧检查 top < innerHeight 补 .in（.in 幂等，安全）。
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced || !('IntersectionObserver' in window)) {
      document.querySelectorAll('.rv').forEach((el) => el.classList.add('in'))
      return
    }
    const io = new IntersectionObserver(
      (es) =>
        es.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in')
            io.unobserve(e.target)
          }
        }),
      { threshold: 0.08 },
    )
    document.querySelectorAll('.rv').forEach((el) => io.observe(el))
    const catchUp = () =>
      document.querySelectorAll('.rv:not(.in)').forEach((el) => {
        if (el.getBoundingClientRect().top < window.innerHeight) el.classList.add('in')
      })
    window.addEventListener('scroll', catchUp, { passive: true })
    window.addEventListener('load', catchUp)
    return () => {
      io.disconnect()
      window.removeEventListener('scroll', catchUp)
      window.removeEventListener('load', catchUp)
    }
  }, [])

  const roleMeta = [
    { r: 'l', id: 'l', flip: false, href: '/landlord/agent', dot: 'var(--lord)' },
    { r: 't', id: 't', flip: true, href: '/tenant/agent', dot: undefined },
    { r: 'a', id: 'a', flip: false, href: '/agent/agent', dot: 'var(--agnt)' },
  ] as const

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <Header />
      <div className="v7-page">
        {/* ================= HERO ================= */}
        <header className="hero">
          <div className="wrap hero-in">
            <div>
              <span className="tag">
                <span className="d" />
                {c.tag}
              </span>
              <h1 style={{ marginTop: 22 }}>{c.heroH1}</h1>
              <p className="sub">{c.sub}</p>
              <div className="painline">
                {c.pains.map((p, i) => (
                  <div key={i}>
                    <span className="ck">✓</span>
                    <span>{p}</span>
                  </div>
                ))}
              </div>
              <HeroTryBar key={lang} lines={tryLines} cta={c.tryCta} />
              <p className="note">{c.note}</p>
            </div>
            <div className="stage rv">
              <div className="panel">
                <div className="chat" aria-hidden="true">
                  <div className="chat-h">
                    <span className="orb" />
                    <b>{c.chatName}</b>
                    <span className="st">{c.chatSt}</span>
                  </div>
                  <div className="msgs">
                    <div className="m-u">{c.chatU}</div>
                    <div className="m-a">{c.chatA1}</div>
                    <div className="mini">
                      <div className="t">
                        <b>{c.miniT}</b>
                        <span className="pr num">{c.miniPr}</span>
                      </div>
                      <div className="m2">{c.miniM2}</div>
                    </div>
                    <div className="m-a">{c.chatA2}</div>
                    <div className="act">
                      <span className="bp">{c.chatBp}</span>
                      <span className="bs">{c.chatBs}</span>
                      <span className="fr">{c.chatFr}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="float-note">
                <span className="ck2">✓</span>
                <div>
                  <b>{c.floatB}</b>
                  <span>{c.floatS}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="trust rv">
            <div className="trust-in">
              {c.trust.map((t, i) => (
                <span key={i}>{t}</span>
              ))}
            </div>
          </div>
        </header>

        {/* ================= 照片数据带 ================= */}
        <section className="photoband">
          <div className="wrap rv">
            <div className="ph">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/home/hero-mist.jpg" alt={c.heroAlt} loading="lazy" decoding="async" />
              <span className="cap">{c.cap}</span>
            </div>
            <div className="stats">
              {c.stats.map((s, i) => (
                <div className="stat" key={i}>
                  <b className={s.num ? 'num' : undefined}>{s.b}</b>
                  <span>{s.s}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ================= 三角色 ================= */}
        <section className="sec">
          <div className="wrap">
            <div className="sec-head rv">
              <h2>{c.rolesH2}</h2>
              <p>{c.rolesSub}</p>
            </div>

            {roleMeta.map((m, i) => {
              const r = c.roles[i]
              return (
                <div
                  className={m.flip ? 'role flip rv' : 'role rv'}
                  id={m.id}
                  key={m.id}
                  style={i === 0 ? { paddingTop: 0 } : undefined}
                >
                  <div className="role-in">
                    <div className="role-copy">
                      <span className="tag">
                        <span className="d" style={m.dot ? { background: m.dot } : undefined} />
                        {r.tag}
                      </span>
                      <h2>{r.h2}</h2>
                      <p className="lead">{r.lead}</p>
                      <div className="benefits">
                        {r.benefits.map((b, j) => (
                          <div className="bene" key={j}>
                            <span className="ic">✓</span>
                            <div>
                              <b>{b.b}</b>
                              <span>{b.s}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="quoterow">
                        <span className="avatar">{r.avatar}</span>
                        <p>
                          {r.quote}
                          <span className="who">{r.who}</span>
                        </p>
                      </div>
                      <div className="role-cta">
                        <Link className="btn-p" href={m.href}>
                          {r.cta}
                        </Link>
                      </div>
                    </div>
                    <div className="demo" data-r={m.r}>
                      <div className="backwash" />
                      <div className="demo-card" aria-hidden="true">
                        <div className="demo-h">
                          <span className="o2" />
                          <b>{r.demoName}</b>
                          <span className="st2">{r.demoSt}</span>
                        </div>
                        <div className="rows">
                          {r.rows.map((row, j) => (
                            <div className="row" key={j}>
                              <div className="l">
                                <b>{row.b}</b>
                                <span>{row.s}</span>
                              </div>
                              <span className={`pill ${row.pillCls}`}>{row.pill}</span>
                            </div>
                          ))}
                        </div>
                        <div className="demo-note">{r.note}</div>
                        <div className="demo-act">
                          <span className="bp2">{r.act1}</span>
                          {r.act2 && <span className="bs2">{r.act2}</span>}
                          <span className="tm">{r.tm}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* ================= 三步 ================= */}
        <section className="sec">
          <div className="wrap">
            <div className="sec-head rv">
              <h2>{c.stepsH2}</h2>
              <p>{c.stepsSub}</p>
            </div>
            <div className="steps rv">
              {c.steps.map((s, i) => (
                <div className="step card" key={i}>
                  <span className="n">{i + 1}</span>
                  <h3>{s.h}</h3>
                  <p>{s.p}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ================= 深色数据带 ================= */}
        <section className="darkband rv">
          <div className="wrap">
            <h2>{c.darkH2}</h2>
            <p className="sub">{c.darkSub}</p>
            <div className="facts">
              {c.facts.map((f, i) => (
                <div className="fact" key={i}>
                  <b className="num">{f.b}</b>
                  <span>{f.s}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ================= 终幕 ================= */}
        <section className="final">
          <div className="wrap rv">
            <div className="final-in">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/home/final-interior.jpg" alt={c.finalAlt} loading="lazy" decoding="async" />
              <div className="veil" />
              <div className="final-copy">
                <h2>{c.finalH2}</h2>
                <p>{c.finalP}</p>
                <div className="trybar" style={{ marginTop: 24 }}>
                  <span className="q">
                    {tryLines[0]}
                    <span className="caret" aria-hidden="true" />
                  </span>
                  <Link className="go" href={promptHref(tryLines[0])}>
                    {c.finalCta}
                  </Link>
                </div>
                <p className="fnote">{c.finalNote}</p>
              </div>
            </div>
          </div>
        </section>
      </div>
      <Footer />
    </>
  )
}

/* ===================== hero trybar：打字机轮播 ===================== */

function HeroTryBar({ lines, cta }: { lines: string[]; cta: string }) {
  // Blueprint timing: 1600ms initial delay, 65ms/char, 2600ms hold per line.
  // SSR/initial state shows line 0 in full (as in the blueprint markup);
  // prefers-reduced-motion keeps it static (caret blink is CSS-gated too).
  // Keyed by lang in the parent, so a language switch remounts cleanly.
  const [li, setLi] = useState(0)
  const [chars, setChars] = useState(lines[0].length)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let line = 0
    let i = 0
    let timer: ReturnType<typeof setTimeout>
    const type = () => {
      i++
      setLi(line)
      setChars(i)
      timer = i >= lines[line].length ? setTimeout(next, 2600) : setTimeout(type, 65)
    }
    const next = () => {
      line = (line + 1) % lines.length
      i = 0
      type()
    }
    timer = setTimeout(() => {
      i = 0
      type()
    }, 1600)
    return () => clearTimeout(timer)
  }, [lines])

  const full = lines[li]
  return (
    <div className="trybar">
      <span className="q">
        {full.slice(0, chars)}
        <span className="caret" aria-hidden="true" />
      </span>
      <Link className="go" href={promptHref(full)}>
        {cta}
      </Link>
    </div>
  )
}
