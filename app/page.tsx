'use client'

// v8 homepage — built strictly to design/v8-homepage.html (the v8b blueprint).
// The blueprint's <style> block is kept below, minus the nav/footer sections
// (we render the real <Header/> / <Footer/> components instead) and these
// documented adaptations:
//   1. Scoping — every selector is prefixed with .v8-page so the page CSS
//      cannot leak into Header/Footer; the blueprint's :root variables move
//      onto .v8-page (which also carries the body typography/background).
//      body keeps only overflow-x handling (so the hero atmosphere glows
//      don't cause horizontal scroll). The blueprint's @font-face is dropped
//      — globals.css already loads Inter Tight. Keyframes are renamed
//      (pulse → v8-pulse, swap → v8-swap) because @keyframes cannot be
//      scoped and "pulse" would collide with Tailwind's.
//   2. The .btn / .btn-p / .btn-g rules live in the blueprint's nav section
//      but are used by hero/roles/final — they are kept (scoped).
//   3. Photos use the local copies: /home/hero-mist.jpg (.band) and
//      /home/final-interior.jpg (.mini-ph, .final).
//   4. Links — hero primary CTA "免费开始" → /register (same target as the
//      Header's 开始使用); hero secondary anchors to #roles; the chat card's
//      "用护照一键申请" chip and the final "开始 →" CTA deep-link to
//      /tenant/agent?prompt=<chatU> via promptHref (the v7 no-signup entry,
//      preserved). Role-panel CTAs keep the v7 hrefs (/landlord/agent,
//      /tenant/agent, /agent/agent). Anchor-rendered chips get a small
//      display rule appended; decorative demo chips get cursor:default.
//   5. Pains — COPY[lang].pains embeds the role label in the copy
//      (<b>房东</b>——…), so the blueprint's separate .who pill is not
//      rendered; the pain <p> shows the COPY node verbatim (COPY is kept
//      word-for-word from v7 and stays authoritative).
// All other class names are unchanged from the blueprint. Copy is bilingual:
// the blueprint's zh strings are kept verbatim in COPY.zh; COPY.en is the
// English rendering, selected at runtime via useI18n().lang (SSR/first frame
// renders zh — the provider default — then hydrates to the stored/browser
// language).
import Link from 'next/link'
import { ReactNode, useEffect, useState } from 'react'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { useI18n, type Lang } from '@/lib/i18n'
import { useAuth } from '@/lib/useAuth'
import { ROLE_HOME } from '@/lib/useOnboarding'

const promptHref = (line: string) => `/tenant/agent?prompt=${encodeURIComponent(line)}`

/* Hero CTA labels — zh verbatim from the blueprint (not part of the carried-over COPY shape). */
const HERO_CTAS: Record<Lang, { primary: string; secondary: string }> = {
  zh: { primary: '免费开始', secondary: '看看它怎么工作' },
  en: { primary: 'Start free', secondary: 'See how it works' },
}

/* Role-panel CTA targets — carried over unchanged from the v7 page (blueprint tab order: 房东 / 租客 / 经纪). */
const ROLE_HREFS = ['/landlord/agent', '/tenant/agent', '/agent/agent'] as const

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
        Stayloop 为租客、房东、经纪各提供一个<b>独立的 AI Agent</b>：你说一句，它去办，关键决定由你确认。
      </>
    ),
    pains: [
      <>
        <b>房东</b>——怕租错人？每份申请先查真伪和法庭记录
      </>,
      <>
        <b>租客</b>——怕材料白填？交一次，处处通行
      </>,
      <>
        <b>经纪</b>——怕杂活吃掉专业？行政事务全交给 AI
      </>,
    ],
    tryCta: '试一句 →',
    note: '由 Anthropic Claude 驱动 · 免注册体验 · 真实挂牌 + TRREB 官方行情作答',
    chatName: 'AI Agent',
    chatSt: '在线 · 读取你的记忆',
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
        lead: '房东的难题，Logic 接：把每份申请查完材料真伪和法庭记录，每一分写明理由，再排好序给你。',
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
        lead: '租客的难题，Luna 接：条件说人话，房源全是真的；四枚章盖好，申请任何房源不再重复交材料。',
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
        lead: '经纪的难题，Brief 接：确认到场、发提醒、收反馈、算佣金——这些吃掉半天的事全部接走。',
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
    stepsH2: '把难题交出去，只要三步',
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
        Stayloop gives tenants, landlords and agents each a <b>dedicated AI agent</b>: say it, it gets done, and you confirm the key decisions.
      </>
    ),
    pains: [
      <>
        <b>Landlords</b> — worried about the wrong tenant? Every application is verified first
      </>,
      <>
        <b>Tenants</b> — tired of re-submitting documents? Verify once, use everywhere
      </>,
      <>
        <b>Agents</b> — admin eating your day? Hand it all to the AI
      </>,
    ],
    tryCta: 'Try it →',
    note: 'Powered by Anthropic Claude · Try without signing up · Answers from real listings + official TRREB market data',
    chatName: 'AI Agent',
    chatSt: 'Online · reading your memory',
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
        lead: "A landlord's problems go to Logic: it checks every application for document authenticity and court records, explains every point, then ranks them for you.",
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
        lead: "A tenant's problems go to Luna: say what you want in plain language — every listing is real; earn the four stamps once and apply anywhere without re-submitting.",
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
        lead: "An agent's problems go to Brief: confirmations, reminders, feedback, commissions — the tasks that eat half a day, taken over so your time goes to closing.",
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
    stepsH2: 'Handing it over takes three steps',
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

/* ===================== blueprint <style> (nav/footer sections removed, selectors scoped to .v8-page) ===================== */

const CSS = `
  html { scroll-behavior: smooth; }
  @media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
  body { overflow-x: hidden; }
  .v8-page {
    --brand:#7C3AED; --brand-2:#6D28D9; --brand-soft:#F3EEFB;
    --ink:#18181B; --ink-2:#52525B; --ink-3:#A1A1AA;
    --line:#E5E1D4; --line-soft:#EEEAe0;
    --bg:#FDFBF6; --bg-2:#F6F3EA; --nav:#FAF7EE; --dark:#131316;
    --ok:#6AB344; --bad:#DC2626;
    --r-card:16px;
    font-family:'Inter Tight','PingFang SC','Microsoft YaHei',system-ui,-apple-system,sans-serif;
    color:var(--ink);background:var(--bg);line-height:1.6;font-size:16px;
    -webkit-font-smoothing:antialiased;
  }
  .v8-page, .v8-page *{margin:0;padding:0;box-sizing:border-box}
  .v8-page img{max-width:100%;display:block}
  .v8-page a{color:inherit;text-decoration:none}
  .v8-page .wrap{max-width:1180px;margin:0 auto;padding:0 32px;width:100%}
  @media(max-width:640px){.v8-page .wrap{padding:0 20px}}
  .v8-page .rv{opacity:0;transform:translateY(20px);transition:opacity .65s ease,transform .65s ease}
  .v8-page .rv.on{opacity:1;transform:none}
  .v8-page .d1{transition-delay:.08s}.v8-page .d2{transition-delay:.16s}.v8-page .d3{transition-delay:.24s}
  @media(prefers-reduced-motion:reduce){.v8-page .rv{opacity:1;transform:none;transition:none}}

  /* .btn set — lives in the blueprint's nav block but is used page-wide, so it is kept */
  .v8-page .btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;white-space:nowrap;
       border-radius:999px;font-weight:600;font-size:14.5px;padding:10px 22px;cursor:pointer;
       transition:transform .15s ease,box-shadow .2s ease,background .15s ease;border:none;font-family:inherit}
  .v8-page .btn:active{transform:translateY(1px) scale(.98)}
  .v8-page .btn-p{background:var(--brand);color:#fff;box-shadow:0 1px 2px rgba(124,58,237,.35)}
  .v8-page .btn-p:hover{background:var(--brand-2);box-shadow:0 6px 20px -6px rgba(124,58,237,.5)}
  .v8-page .btn-g{background:#fff;color:var(--ink);border:1px solid var(--line)}
  .v8-page .btn-g:hover{border-color:var(--ink-3)}

  /* ============ hero: atmosphere + asymmetric split ============ */
  .v8-page .hero{position:relative;padding:60px 0 84px;overflow:hidden;background:linear-gradient(180deg,var(--nav) 0%,var(--bg) 34%)}
  .v8-page .hero .atmo{position:absolute;inset:0;pointer-events:none}
  .v8-page .hero .atmo::before{content:"";position:absolute;top:-220px;right:-180px;width:760px;height:760px;
      background:radial-gradient(closest-side,rgba(124,58,237,.10),transparent 68%)}
  .v8-page .hero .atmo::after{content:"";position:absolute;bottom:-260px;left:-200px;width:640px;height:640px;
      background:radial-gradient(closest-side,rgba(59,130,246,.06),transparent 70%)}
  .v8-page .hero .grid-tex{position:absolute;inset:0;
      background-image:linear-gradient(rgba(24,24,27,.028) 1px,transparent 1px),
                       linear-gradient(90deg,rgba(24,24,27,.028) 1px,transparent 1px);
      background-size:56px 56px;
      -webkit-mask-image:radial-gradient(ellipse 75% 65% at 50% 0%,#000 30%,transparent 75%);
              mask-image:radial-gradient(ellipse 75% 65% at 50% 0%,#000 30%,transparent 75%)}
  .v8-page .hero-in{position:relative;display:grid;grid-template-columns:1.08fr .92fr;gap:72px;align-items:center}
  @media(max-width:980px){.v8-page .hero-in{grid-template-columns:1fr;gap:52px}}
  .v8-page .tag{display:inline-flex;align-items:center;gap:9px;font-size:12px;letter-spacing:.15em;
       text-transform:uppercase;color:var(--brand);font-weight:700}
  .v8-page .tag::before{content:"";width:24px;height:1.5px;background:var(--brand)}
  .v8-page .hero h1{font-size:clamp(38px,4.5vw,54px);font-weight:800;letter-spacing:-.026em;line-height:1.13;margin-top:18px}
  .v8-page .hero h1 em{font-style:normal;color:var(--brand);position:relative}
  .v8-page .hero h1 em::after{content:"";position:absolute;left:0;right:0;bottom:4px;height:10px;
      background:var(--brand-soft);z-index:-1;border-radius:3px}
  .v8-page .hero .sub{color:var(--ink-2);font-size:17px;margin-top:18px;max-width:29em}
  .v8-page .hero .sub b{color:var(--ink);font-weight:600}
  .v8-page .hero .ctas{display:flex;gap:12px;margin-top:26px;flex-wrap:wrap}
  .v8-page .hero .ctas .btn{padding:12px 28px;font-size:15px}
  .v8-page .hero .note{margin-top:16px;font-size:13px;color:var(--ink-3)}

  /* hero right: chat + overlapping approval card */
  /* Reserve room for the floating approval card BELOW the chat so it never
     covers the action chips (the taller live-style bubbles pushed it up). */
  .v8-page .stage{position:relative;padding-bottom:106px}
  .v8-page .chat{background:#fff;border:1px solid var(--line);border-radius:var(--r-card);overflow:hidden;
        box-shadow:0 1px 2px rgba(24,24,27,.04),0 32px 72px -28px rgba(76,29,149,.22)}
  .v8-page .chat-h{display:flex;align-items:center;gap:10px;padding:14px 18px;border-bottom:1px solid var(--line-soft)}
  /* Avatar = the live chat's role orb (ROLE_THEME.tenant.avatarGradient). */
  .v8-page .chat-av{width:36px;height:36px;border-radius:50%;flex:none;
           background:linear-gradient(135deg,#C4B5FD,#7C3AED)}
  .v8-page .chat-nm{font-size:15px;font-weight:700;letter-spacing:-.01em}
  /* Status line matches the live header: mono, uppercase, green dot. */
  .v8-page .chat-st{display:flex;align-items:center;gap:6px;font-size:10.5px;
           letter-spacing:.1em;text-transform:uppercase;color:var(--ink-3);
           font-family:'JetBrains Mono',ui-monospace,monospace}
  .v8-page .chat-st::before{content:"";width:6px;height:6px;border-radius:50%;background:#34D399}
  .v8-page .chat-b{padding:18px;display:flex;flex-direction:column;gap:12px;background:var(--bg-2)}
  .v8-page .m{max-width:88%;padding:11px 15px;border-radius:16px;font-size:14px;line-height:1.6}
  /* Agent turns carry the small orb, as in the live thread. */
  .v8-page .m-row{display:flex;align-items:flex-start;gap:8px;align-self:flex-start;max-width:96%}
  .v8-page .m-orb{width:28px;height:28px;border-radius:50%;flex:none;margin-top:2px;
           background:linear-gradient(135deg,#C4B5FD,#7C3AED)}
  .v8-page .m-u{align-self:flex-end;background:#7C3AED;color:#fff;border-top-right-radius:4px}
  .v8-page .m-a{align-self:flex-start;background:#F6F3EA;color:var(--ink);border-top-left-radius:4px}
  .v8-page .m-a b{color:var(--brand)}
  .v8-page .mini{align-self:flex-start;width:90%;background:#fff;border:1px solid var(--line);border-radius:12px;
        padding:12px 14px;display:flex;gap:12px;align-items:center;
        box-shadow:0 4px 14px -6px rgba(24,24,27,.08)}
  .v8-page .mini-ph{width:54px;height:54px;border-radius:9px;flex:none;
           background:url('/home/final-interior.jpg') center/cover}
  .v8-page .mini-t{font-size:13px;font-weight:700}
  .v8-page .mini-pr{font-size:13px;color:var(--brand);font-weight:700;margin-left:auto;flex:none}
  .v8-page .mini-m{font-size:12px;color:var(--ink-2)}
  .v8-page .okt{color:var(--ok);font-weight:600}
  .v8-page .chat-acts{display:flex;gap:8px;align-items:center;padding:14px 18px;background:var(--bg-2);
             border-top:1px solid var(--line-soft)}
  .v8-page .chip{border-radius:999px;font-size:12.5px;font-weight:600;padding:8px 15px;cursor:pointer;border:none;font-family:inherit}
  .v8-page .chip-p{background:var(--brand);color:#fff}
  .v8-page .chip-g{background:#fff;border:1px solid var(--line);color:var(--ink)}
  .v8-page .chat-fr{margin-left:auto;font-size:12px;color:var(--ink-3)}
  .v8-page .float{position:absolute;right:-14px;bottom:0;display:flex;gap:10px;align-items:center;
         padding:13px 18px;background:#fff;border:1px solid var(--line);border-radius:13px;
         box-shadow:0 18px 44px -16px rgba(24,24,27,.22)}
  @media(max-width:640px){.v8-page .float{right:0}}
  .v8-page .float-dot{width:8px;height:8px;border-radius:50%;background:var(--brand);flex:none;
             animation:v8-pulse 2.4s ease-in-out infinite}
  @keyframes v8-pulse{0%,100%{opacity:1}50%{opacity:.3}}
  @media(prefers-reduced-motion:reduce){.v8-page .float-dot{animation:none}}
  .v8-page .float b{font-size:13.5px;display:block}
  .v8-page .float span{font-size:12.5px;color:var(--ink-2)}
  /* adaptation: the chat's primary chip is a Link (anchor); decorative chips get no pointer affordance */
  .v8-page a.chip{display:inline-flex;align-items:center;justify-content:center}
  .v8-page .chat-acts .chip-g, .v8-page .demo-acts .chip{cursor:default}

  /* trust strip */
  .v8-page .trust{border-top:1px solid var(--line-soft);border-bottom:1px solid var(--line-soft);background:var(--bg-2)}
  .v8-page .trust-in{display:grid;grid-template-columns:repeat(4,1fr)}
  .v8-page .trust-in>div{padding:20px;font-size:13.5px;color:var(--ink-2);text-align:center}
  .v8-page .trust-in>div+div{border-left:1px solid var(--line-soft)}
  .v8-page .trust-in b{color:var(--ink);font-weight:600}
  @media(max-width:900px){.v8-page .trust-in{grid-template-columns:1fr 1fr}
    .v8-page .trust-in>div:nth-child(3){border-left:none;border-top:1px solid var(--line-soft)}
    .v8-page .trust-in>div:nth-child(4){border-top:1px solid var(--line-soft)}}

  /* ============ pains: editorial rows with ghost numerals ============ */
  .v8-page .pains{padding:104px 0}
  .v8-page .pains-in{display:grid;grid-template-columns:repeat(3,1fr);gap:0;border-top:1px solid var(--line)}
  @media(max-width:900px){.v8-page .pains-in{grid-template-columns:1fr}}
  .v8-page .pain{position:relative;padding:34px 34px 40px 0;overflow:hidden}
  .v8-page .pain+.pain{padding-left:34px;border-left:1px solid var(--line-soft)}
  @media(max-width:900px){.v8-page .pain+.pain{padding-left:0;border-left:none;border-top:1px solid var(--line-soft)}}
  .v8-page .pain .gn{position:absolute;top:10px;right:6px;font-size:96px;font-weight:800;line-height:1;
            color:var(--ink);opacity:.045;letter-spacing:-.04em;pointer-events:none}
  .v8-page .pain .who{display:inline-flex;font-size:12px;font-weight:800;letter-spacing:.08em;color:var(--brand);
             background:var(--brand-soft);border-radius:999px;padding:4px 12px}
  .v8-page .pain p{margin-top:14px;font-size:17px;line-height:1.65}
  .v8-page .pain p b{font-weight:700}

  /* ============ photo band: full-bleed + glass stat strip ============ */
  .v8-page .band{position:relative;min-height:560px;display:flex;align-items:flex-end;
        background:url('/home/hero-mist.jpg') center/cover}
  .v8-page .band::before{content:"";position:absolute;inset:0;
        background:linear-gradient(180deg,rgba(19,19,22,.05) 30%,rgba(19,19,22,.52) 100%)}
  .v8-page .band-cap{position:absolute;top:28px;left:50%;transform:translateX(-50%);font-size:12.5px;color:#fff;
            background:rgba(19,19,22,.4);backdrop-filter:blur(8px);padding:7px 16px;border-radius:999px;
            border:1px solid rgba(255,255,255,.16)}
  .v8-page .band .wrap{position:relative;z-index:1;padding-bottom:40px}
  .v8-page .gstats{display:grid;grid-template-columns:repeat(4,1fr);border-radius:var(--r-card);overflow:hidden;
          background:rgba(255,255,255,.12);backdrop-filter:blur(18px);
          border:1px solid rgba(255,255,255,.22);
          box-shadow:inset 0 1px 0 rgba(255,255,255,.18),0 24px 60px -24px rgba(19,19,22,.5)}
  @media(max-width:900px){.v8-page .gstats{grid-template-columns:1fr 1fr}}
  .v8-page .gstat{padding:26px 26px;color:#fff}
  .v8-page .gstat+.gstat{border-left:1px solid rgba(255,255,255,.16)}
  @media(max-width:900px){.v8-page .gstat:nth-child(3){border-left:none}
    .v8-page .gstat:nth-child(n+3){border-top:1px solid rgba(255,255,255,.16)}}
  .v8-page .gstat .b{font-size:27px;font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
  .v8-page .gstat .s{font-size:13px;color:rgba(255,255,255,.82);margin-top:4px;line-height:1.5}

  /* ============ roles: tabs + rich panel ============ */
  .v8-page .roles{padding:112px 0 0}
  .v8-page .roles-head{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;flex-wrap:wrap}
  .v8-page .eyebrow{font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:var(--brand);font-weight:700}
  .v8-page .roles h2{font-size:clamp(30px,3.4vw,42px);font-weight:800;letter-spacing:-.022em;margin-top:12px}
  .v8-page .roles .rsub{color:var(--ink-2);margin-top:12px;max-width:34em}
  .v8-page .rtabs{display:flex;gap:8px;flex-wrap:wrap}
  .v8-page .rtab{border-radius:999px;border:1px solid var(--line);background:#fff;padding:11px 22px;font-size:14px;
        font-weight:700;cursor:pointer;color:var(--ink-2);transition:all .18s ease;font-family:inherit}
  .v8-page .rtab:hover{border-color:var(--ink-3);transform:translateY(-1px)}
  .v8-page .rtab.on{background:var(--ink);border-color:var(--ink);color:#fff;box-shadow:0 8px 20px -8px rgba(24,24,27,.4)}
  .v8-page .rpanel{margin-top:36px;display:grid;grid-template-columns:1fr 1fr;border:1px solid var(--line);
          border-radius:var(--r-card);overflow:hidden;background:#fff;
          box-shadow:0 32px 72px -36px rgba(24,24,27,.16)}
  @media(max-width:900px){.v8-page .rpanel{grid-template-columns:1fr}}
  .v8-page .rp-l{padding:44px 48px;display:flex;flex-direction:column}
  @media(max-width:640px){.v8-page .rp-l{padding:30px 24px}}
  .v8-page .rp-tag{display:inline-flex;align-self:flex-start;font-size:11.5px;font-weight:800;letter-spacing:.1em;
          color:var(--brand);background:var(--brand-soft);border-radius:999px;padding:5px 13px}
  .v8-page .rp-l h3{font-size:clamp(23px,2.5vw,29px);font-weight:800;letter-spacing:-.016em;line-height:1.3;margin-top:18px}
  .v8-page .rp-l .lead{color:var(--ink-2);font-size:15px;margin-top:14px}
  .v8-page .rp-bens{margin-top:26px;display:flex;flex-direction:column;gap:16px}
  .v8-page .rp-ben{display:flex;gap:14px;align-items:flex-start}
  .v8-page .rp-ben .bn{flex:none;width:24px;height:24px;border-radius:50%;background:var(--brand-soft);color:var(--brand);
              font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center;margin-top:1px}
  .v8-page .rp-ben .bb{font-size:14.5px;font-weight:700}
  .v8-page .rp-ben .bs{font-size:13.5px;color:var(--ink-2);margin-top:2px}
  .v8-page .rp-quote{margin-top:auto;padding-top:26px;border-top:1px solid var(--line-soft)}
  .v8-page .rp-quote p{font-size:14px;color:var(--ink-2);line-height:1.65}
  .v8-page .rp-quote .who{display:flex;gap:10px;align-items:center;margin-top:12px}
  .v8-page .rp-quote .av{width:32px;height:32px;border-radius:50%;background:var(--brand-soft);color:var(--brand);
                font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center}
  .v8-page .rp-quote .wn{font-size:12.5px;color:var(--ink-3)}
  .v8-page .rp-cta{margin-top:24px}
  .v8-page .rp-r{position:relative;background:linear-gradient(150deg,#F7F4FC 0%,var(--bg-2) 60%);
        border-left:1px solid var(--line-soft);padding:40px 36px;display:flex;flex-direction:column;
        justify-content:center;overflow:hidden}
  .v8-page .rp-r::before{content:"";position:absolute;top:-120px;right:-120px;width:340px;height:340px;
        background:radial-gradient(closest-side,rgba(124,58,237,.09),transparent 70%)}
  @media(max-width:900px){.v8-page .rp-r{border-left:none;border-top:1px solid var(--line-soft)}}
  .v8-page .demo{position:relative;background:#fff;border:1px solid var(--line);border-radius:14px;overflow:hidden;
        box-shadow:0 24px 56px -24px rgba(76,29,149,.24)}
  .v8-page .demo-h{display:flex;align-items:center;gap:8px;padding:13px 17px;border-bottom:1px solid var(--line-soft);
          font-size:12.5px;font-weight:700}
  .v8-page .demo-h .st{margin-left:auto;font-weight:600;color:var(--ok)}
  .v8-page .demo-row{display:flex;align-items:center;gap:12px;padding:14px 17px}
  .v8-page .demo-row+.demo-row{border-top:1px solid var(--line-soft)}
  .v8-page .demo-row .rb{font-size:13.5px;font-weight:700}
  .v8-page .demo-row .rs{font-size:12px;color:var(--ink-2);margin-top:1px}
  .v8-page .pill{margin-left:auto;flex:none;font-size:11.5px;font-weight:700;border-radius:999px;padding:4px 11px}
  .v8-page .pill.g{background:#F0F7EC;color:#4C8A2E}
  .v8-page .pill.n{background:var(--line-soft);color:var(--ink-2)}
  .v8-page .pill.r{background:#FDECEC;color:var(--bad)}
  .v8-page .demo-note{padding:14px 17px;border-top:1px solid var(--line-soft);font-size:13px;color:var(--ink-2);
             background:var(--bg-2)}
  .v8-page .demo-note b{color:var(--ink)}
  .v8-page .demo-acts{display:flex;gap:8px;align-items:center;padding:13px 17px;border-top:1px solid var(--line-soft)}
  .v8-page .demo-tm{margin-left:auto;font-size:11.5px;color:var(--ink-3)}
  .v8-page .rpanel.swap .rp-l,.v8-page .rpanel.swap .rp-r{animation:v8-swap .4s ease}
  @keyframes v8-swap{from{opacity:.35;transform:translateY(10px)}to{opacity:1;transform:none}}
  @media(prefers-reduced-motion:reduce){.v8-page .rpanel.swap .rp-l,.v8-page .rpanel.swap .rp-r{animation:none}}

  /* ============ steps: ghost numerals + timeline ============ */
  .v8-page .steps{padding:112px 0}
  .v8-page .steps h2{font-size:clamp(30px,3.4vw,42px);font-weight:800;letter-spacing:-.022em}
  .v8-page .steps .ssub{color:var(--ink-2);margin-top:12px}
  .v8-page .steps-in{display:grid;grid-template-columns:repeat(3,1fr);gap:44px;margin-top:52px;position:relative}
  .v8-page .steps-in::before{content:"";position:absolute;top:21px;left:calc(16.66% + 24px);right:calc(16.66% + 24px);
                    height:1px;background:linear-gradient(90deg,var(--line),var(--brand-soft),var(--line))}
  @media(max-width:900px){.v8-page .steps-in{grid-template-columns:1fr;gap:36px}.v8-page .steps-in::before{display:none}}
  .v8-page .step{position:relative;overflow:hidden;padding-top:2px}
  .v8-page .step .gn{position:absolute;top:-18px;right:0;font-size:120px;font-weight:800;line-height:1;
            color:var(--brand);opacity:.05;letter-spacing:-.05em;pointer-events:none}
  .v8-page .step .n{width:42px;height:42px;border-radius:50%;background:#fff;border:1.5px solid var(--brand);
           color:var(--brand);font-weight:800;font-size:16px;display:flex;align-items:center;
           justify-content:center;position:relative;z-index:1;box-shadow:0 0 0 6px #fff}
  .v8-page .step h3{font-size:19px;font-weight:800;margin-top:18px}
  .v8-page .step p{font-size:14.5px;color:var(--ink-2);margin-top:9px}
  .v8-page .step p b{color:var(--ink);font-weight:600}

  /* ============ dark facts band ============ */
  .v8-page .dark{position:relative;background:var(--dark);color:#fff;padding:88px 0;overflow:hidden}
  .v8-page .dark::before{content:"";position:absolute;top:-200px;left:50%;transform:translateX(-50%);
      width:900px;height:480px;background:radial-gradient(closest-side,rgba(124,58,237,.16),transparent 70%)}
  .v8-page .dark .wrap{position:relative}
  .v8-page .dark .eyebrow{color:#B79CF0}
  .v8-page .dark h2{font-size:clamp(28px,3.2vw,38px);font-weight:800;letter-spacing:-.022em;margin-top:12px}
  .v8-page .dark .dsub{color:rgba(255,255,255,.55);margin-top:12px;font-size:15px}
  .v8-page .facts{display:grid;grid-template-columns:repeat(4,1fr);margin-top:54px;border-top:1px solid rgba(255,255,255,.13)}
  @media(max-width:900px){.v8-page .facts{grid-template-columns:1fr 1fr}}
  .v8-page .fact{padding:30px 26px 0}
  .v8-page .fact+.fact{border-left:1px solid rgba(255,255,255,.13)}
  @media(max-width:900px){.v8-page .fact:nth-child(3){border-left:none}}
  .v8-page .fact .b{font-size:clamp(36px,3.8vw,48px);font-weight:800;letter-spacing:-.03em;
           font-variant-numeric:tabular-nums;
           background:linear-gradient(180deg,#fff 55%,#B79CF0 130%);
           -webkit-background-clip:text;background-clip:text;color:transparent}
  .v8-page .fact .s{font-size:13.5px;color:rgba(255,255,255,.6);margin-top:9px;line-height:1.55}
  .v8-page .fact .s i{font-style:normal;color:rgba(255,255,255,.85)}

  /* ============ final CTA ============ */
  .v8-page .final{position:relative;min-height:540px;display:flex;align-items:center;
         background:url('/home/final-interior.jpg') center/cover}
  .v8-page .final::before{content:"";position:absolute;inset:0;
      background:linear-gradient(90deg,rgba(19,19,22,.74) 0%,rgba(19,19,22,.4) 58%,rgba(19,19,22,.12) 100%)}
  .v8-page .final .wrap{position:relative;z-index:1;color:#fff;padding-top:96px;padding-bottom:96px}
  .v8-page .final h2{font-size:clamp(36px,4.2vw,54px);font-weight:800;letter-spacing:-.026em;line-height:1.16}
  .v8-page .final p{margin-top:18px;font-size:16.5px;color:rgba(255,255,255,.85);max-width:26em}
  .v8-page .final .btn-p{margin-top:30px;padding:14px 36px;font-size:15.5px}
  .v8-page .final .fnote{margin-top:14px;font-size:13px;color:rgba(255,255,255,.6)}
`

/* ===================== page ===================== */

export default function HomePage() {
  const { lang } = useI18n()
  const c = COPY[lang] ?? COPY.zh
  const heroCtas = HERO_CTAS[lang] ?? HERO_CTAS.zh
  const [tab, setTab] = useState(0)
  const role = c.roles[tab]

  // Auth-aware CTAs: a signed-in user clicking 免费开始/开始 must land in
  // their own workspace, never on /register (login/register already bounce
  // authed visitors, but the homepage shouldn't send them there at all).
  const { user, role: authRole } = useAuth()
  const startHref = user ? (authRole ? ROLE_HOME[authRole] : '/dashboard') : '/register'
  const finalHref = user ? startHref : promptHref(c.chatU)

  // 静态 metadata 是双语合排；hydration 后按当前语言收窄标签页标题。
  useEffect(() => {
    document.title =
      lang === 'zh'
        ? 'Stayloop — 租房的 AI 操作系统 · Toronto'
        : 'Stayloop — The AI-native rental OS for Toronto'
  }, [lang])

  // Scroll reveal — blueprint behavior: IO adds .on at threshold .12;
  // reduced motion shows everything immediately.
  // 瞬时跳转（锚点/instant scroll）会让 IO 停留在 false→false 永不触发，
  // 兜底在 scroll/load 时逐帧检查 top < innerHeight 补 .on（.on 幂等，安全）。
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced || !('IntersectionObserver' in window)) {
      document.querySelectorAll('.rv').forEach((el) => el.classList.add('on'))
      return
    }
    const io = new IntersectionObserver(
      (es) =>
        es.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('on')
            io.unobserve(e.target)
          }
        }),
      { threshold: 0.12 },
    )
    document.querySelectorAll('.rv').forEach((el) => io.observe(el))
    const catchUp = () =>
      document.querySelectorAll('.rv:not(.on)').forEach((el) => {
        if (el.getBoundingClientRect().top < window.innerHeight) el.classList.add('on')
      })
    window.addEventListener('scroll', catchUp, { passive: true })
    window.addEventListener('load', catchUp)
    return () => {
      io.disconnect()
      window.removeEventListener('scroll', catchUp)
      window.removeEventListener('load', catchUp)
    }
  }, [])

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <Header />
      <div className="v8-page">
        {/* ================= HERO ================= */}
        <header className="hero">
          <div className="atmo" />
          <div className="grid-tex" />
          <div className="wrap hero-in">
            <div>
              <span className="tag">{c.tag}</span>
              <h1>{c.heroH1}</h1>
              <p className="sub">{c.sub}</p>
              <div className="ctas">
                <Link className="btn btn-p" href={startHref}>
                  {heroCtas.primary}
                </Link>
                <a className="btn btn-g" href="#roles">
                  {heroCtas.secondary}
                </a>
              </div>
              <p className="note">{c.note}</p>
            </div>
            <div className="stage rv on">
              <div className="chat">
                <div className="chat-h">
                  <span className="chat-av" />
                  <div>
                    <div className="chat-nm">{c.chatName}</div>
                    <div className="chat-st">{c.chatSt}</div>
                  </div>
                </div>
                <div className="chat-b" aria-hidden="true">
                  <ChatUserTypewriter text={c.chatU} key={lang} />
                  <div className="m-row">
                    <span className="m-orb" />
                    <div className="m m-a">{c.chatA1}</div>
                  </div>
                  <div className="mini">
                    <div className="mini-ph" />
                    <div>
                      <div className="mini-t">{c.miniT}</div>
                      <div className="mini-m">{c.miniM2}</div>
                    </div>
                    <div className="mini-pr">{c.miniPr}</div>
                  </div>
                  <div className="m-row">
                    <span className="m-orb" />
                    <div className="m m-a">{c.chatA2}</div>
                  </div>
                </div>
                <div className="chat-acts">
                  <Link className="chip chip-p" href={promptHref(c.chatU)}>
                    {c.chatBp}
                  </Link>
                  <span className="chip chip-g">{c.chatBs}</span>
                  <span className="chat-fr">{c.chatFr}</span>
                </div>
              </div>
              <div className="float">
                <span className="float-dot" />
                <div>
                  <b>{c.floatB}</b>
                  <span>{c.floatS}</span>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* ================= trust strip ================= */}
        <div className="trust">
          <div className="wrap trust-in">
            {c.trust.map((t, i) => (
              <div key={i}>{t}</div>
            ))}
          </div>
        </div>

        {/* ================= PAINS ================= */}
        <section className="pains">
          <div className="wrap pains-in">
            {c.pains.map((p, i) => (
              <div className={i ? `pain rv d${i}` : 'pain rv'} key={i}>
                <span className="gn">0{i + 1}</span>
                <p>{p}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ================= PHOTO BAND: full-bleed + glass stats ================= */}
        <section className="band">
          <span className="band-cap">{c.cap}</span>
          <div className="wrap">
            <div className="gstats rv">
              {c.stats.map((s, i) => (
                <div className="gstat" key={i}>
                  <div className="b">{s.b}</div>
                  <div className="s">{s.s}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ================= ROLES ================= */}
        <section className="roles" id="roles">
          <div className="wrap">
            <div className="roles-head">
              <div>
                <span className="eyebrow">Three Agents</span>
                <h2>{c.rolesH2}</h2>
                <p className="rsub">{c.rolesSub}</p>
              </div>
              <div className="rtabs" role="tablist">
                {c.roles.map((r, i) => (
                  <button
                    className={i === tab ? 'rtab on' : 'rtab'}
                    key={i}
                    role="tab"
                    aria-selected={i === tab}
                    onClick={() => setTab(i)}
                  >
                    {r.tag}
                  </button>
                ))}
              </div>
            </div>
            {/* .swap stays on; the keyed children remount on tab change, replaying the swap animation */}
            <div className="rpanel rv swap">
              <div className="rp-l" key={`l-${tab}`}>
                <span className="rp-tag">{role.tag}</span>
                <h3>{role.h2}</h3>
                <p className="lead">{role.lead}</p>
                <div className="rp-bens">
                  {role.benefits.map((b, j) => (
                    <div className="rp-ben" key={j}>
                      <span className="bn">{j + 1}</span>
                      <div>
                        <div className="bb">{b.b}</div>
                        <div className="bs">{b.s}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="rp-quote">
                  <p>{role.quote}</p>
                  <div className="who">
                    <span className="av">{role.avatar}</span>
                    <span className="wn">{role.who}</span>
                  </div>
                </div>
                <div className="rp-cta">
                  <Link className="btn btn-p" href={ROLE_HREFS[tab]}>
                    {role.cta}
                  </Link>
                </div>
              </div>
              <div className="rp-r" key={`r-${tab}`}>
                <div className="demo" aria-hidden="true">
                  <div className="demo-h">
                    {role.demoName}
                    <span className="st">{role.demoSt}</span>
                  </div>
                  <div>
                    {role.rows.map((row, j) => (
                      <div className="demo-row" key={j}>
                        <div>
                          <div className="rb">{row.b}</div>
                          <div className="rs">{row.s}</div>
                        </div>
                        <span className={`pill ${row.pillCls}`}>{row.pill}</span>
                      </div>
                    ))}
                  </div>
                  <div className="demo-note">{role.note}</div>
                  <div className="demo-acts">
                    <span className="chip chip-p">{role.act1}</span>
                    {role.act2 && <span className="chip chip-g">{role.act2}</span>}
                    <span className="demo-tm">{role.tm}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ================= STEPS ================= */}
        <section className="steps">
          <div className="wrap">
            <h2>{c.stepsH2}</h2>
            <p className="ssub">{c.stepsSub}</p>
            <div className="steps-in">
              {c.steps.map((s, i) => (
                <div className={i ? `step rv d${i}` : 'step rv'} key={i}>
                  <span className="gn">0{i + 1}</span>
                  <span className="n">{i + 1}</span>
                  <h3>{s.h}</h3>
                  <p>{s.p}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ================= DARK FACTS ================= */}
        <section className="dark">
          <div className="wrap">
            <span className="eyebrow">Verifiable</span>
            <h2>{c.darkH2}</h2>
            <p className="dsub">{c.darkSub}</p>
            <div className="facts">
              {c.facts.map((f, i) => (
                <div className={i ? `fact rv d${i}` : 'fact rv'} key={i}>
                  <div className="b">{f.b}</div>
                  <div className="s">{f.s}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ================= FINAL ================= */}
        <section className="final">
          <div className="wrap">
            <h2>{c.finalH2}</h2>
            <p>{c.finalP}</p>
            <Link className="btn btn-p" href={finalHref}>
              {c.finalCta}
            </Link>
            <p className="fnote">{c.finalNote}</p>
          </div>
        </section>
      </div>
      <Footer />
    </>
  )
}

/* ===================== hero chat：用户消息打字机 ===================== */

function ChatUserTypewriter({ text }: { text: string }) {
  // Blueprint timing: 55ms/char, types COPY[lang].chatU once (no loop).
  // SSR/initial state shows the full line (as in the blueprint markup);
  // prefers-reduced-motion keeps it static. Keyed by lang in the parent,
  // so a language switch remounts cleanly.
  const [chars, setChars] = useState(text.length)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let i = 0
    setChars(0)
    const t = setInterval(() => {
      i++
      setChars(i)
      if (i >= text.length) clearInterval(t)
    }, 55)
    return () => clearInterval(t)
  }, [text])

  return <div className="m m-u">{text.slice(0, chars)}</div>
}
