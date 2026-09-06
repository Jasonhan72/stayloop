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
// Primary CTA points at the one product production data proves people come
// for (activation plan, 2026-08-12): screening, try-one-without-signup.
// The platform story stays — it is the secondary path, not the front door.
const HERO_CTAS: Record<Lang, { primary: string; secondary: string }> = {
  zh: { primary: '免费开始', secondary: '看房东怎么用' },
  en: { primary: 'Start free', secondary: 'See it for landlords' },
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
  cards: { t: string; pr: string; spec: string; hood: string; badge: string; note: string; img: string }[]
  mktH: string
  mktP: string
  mktSub: string
  mktNote: ReactNode
  inputPh: string
  sendLbl: string
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
    cards: [
      { t: '18 - 85 EAST LIBERTY ST', pr: '$2,750', spec: '2B · 1 浴 · 780 sqft', hood: 'Liberty Village · Toronto',
        badge: 'TIER 2', note: '◑ 平台已核验 · 可养猫 · 地铁 8 分钟', img: '/home/final-interior.jpg' },
      { t: '1204 - 55 COOPER ST', pr: '$2,690', spec: '2B · 2 浴 · 720 sqft', hood: 'Waterfront · Toronto',
        badge: 'REALTOR.CA', note: '◧ 外部房源 · Realtor.ca 实时 · 未经 Stayloop 验证', img: '/home/hero-mist.jpg' },
    ],
    mktH: 'NORTH YORK · 2 房 · 真实行情 · 样本 22 套',
    mktP: '$2,180–$3,600',
    mktSub: '中位 $2,795',
    mktNote: (
      <>
        官方基准 · TRREB C14 · 2026 Q1：2 房成交均价 <b>$2,914</b> · 224 宗成交
      </>
    ),
    inputPh: '告诉 AI Agent 你想做什么 —— 文字、语音或上传文件都行',
    sendLbl: '发送 →',
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
        b: '180+',
        s: (
          <>
            份筛查报告已生成，<i>每条结论注明所依据的数值</i>
          </>
        ),
      },
      {
        b: '4 万+',
        s: (
          <>
            份 LTB 判令已入库可查，<i>姓名命中须地址佐证</i>
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
    cards: [
      { t: '18 - 85 EAST LIBERTY ST', pr: '$2,750', spec: '2B · 1 bath · 780 sqft', hood: 'Liberty Village · Toronto',
        badge: 'TIER 2', note: '◑ Platform-verified · cats OK · 8 min to subway', img: '/home/final-interior.jpg' },
      { t: '1204 - 55 COOPER ST', pr: '$2,690', spec: '2B · 2 bath · 720 sqft', hood: 'Waterfront · Toronto',
        badge: 'REALTOR.CA', note: '◧ External listing · live from Realtor.ca · not Stayloop-verified', img: '/home/hero-mist.jpg' },
    ],
    mktH: 'NORTH YORK · 2-BED · LIVE MARKET · 22 LISTINGS',
    mktP: '$2,180–$3,600',
    mktSub: 'median $2,795',
    mktNote: (
      <>
        Official benchmark · TRREB C14 · 2026 Q1: 2-bed average <b>$2,914</b> · 224 leases
      </>
    ),
    inputPh: 'Tell AI Agent what you need — text, voice or upload a file',
    sendLbl: 'Send →',
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
        b: '180+',
        s: (
          <>
            screening reports generated, <i>every conclusion cites the value it read</i>
          </>
        ),
      },
      {
        b: '40k+',
        s: (
          <>
            LTB orders indexed and searchable, <i>name hits need address corroboration</i>
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

/* ===================== v9 styles (2026-09 redesign, blueprint design/redesign-2026-09/Main.dc.html) ===================== */
// White base, cool slate neutrals, one accent (brand purple), 10/12px radii.
// Motion: fade-up reveals only (.rv → .on), disabled under reduced motion.

const CSS = `
.v9{--acc:#1B1B3C;--acc-2:#12122B;--ink:#0f172a;--ink-2:#334155;--ink-3:#475569;--mute:#64748b;--line:#e2e8f0;--bg:#ffffff;--bg-2:#f8fafc;--ok:#047857;--ok-bg:#ecfdf5;--ok-line:#a7f3d0;
  background:var(--bg);color:var(--ink);font-family:"Inter Tight","PingFang SC","Microsoft YaHei",system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased;}
.v9 .wrap{max-width:1312px;margin:0 auto;padding:0 64px;}
.v9 .mono{font-family:"JetBrains Mono",ui-monospace,monospace;font-variant-numeric:tabular-nums;}
.v9 .btn{display:inline-flex;align-items:center;justify-content:center;height:46px;padding:0 22px;border-radius:10px;font-weight:700;font-size:15px;white-space:nowrap;text-decoration:none;transition:transform .15s,filter .15s;}
.v9 .btn:active{transform:translateY(1px);}
.v9 .btn-p{background:var(--acc);color:#fff;} .v9 .btn-p:hover{filter:brightness(1.06);}
.v9 .btn-g{background:#fff;color:var(--ink);border:1px solid #cbd5e1;} .v9 .btn-g:hover{border-color:#94a3b8;}
.v9 .card{background:#fff;border:1px solid var(--line);border-radius:12px;}
.v9 .muted{color:var(--mute);}
.v9 h1,.v9 h2,.v9 h3{margin:0;letter-spacing:-.02em;line-height:1.15;text-wrap:balance;}
.v9 .h2{font-size:34px;font-weight:800;}
.v9 .bar{height:6px;border-radius:999px;background:var(--line);overflow:hidden;}
.v9 .bar i{display:block;height:100%;background:var(--acc);border-radius:999px;}
.v9 .pill{display:inline-flex;align-items:center;height:22px;padding:0 8px;border-radius:6px;font-size:11px;font-weight:700;white-space:nowrap;}
.v9 .pill.g{background:var(--ok-bg);color:var(--ok);} .v9 .pill.n{background:#f1f5f9;color:#475569;} .v9 .pill.r{background:#fef2f2;color:#b91c1c;}
.v9 .rv{opacity:0;transform:translateY(14px);transition:opacity .5s cubic-bezier(.16,1,.3,1),transform .5s cubic-bezier(.16,1,.3,1);}
.v9 .rv.on{opacity:1;transform:none;}
.v9 .rv.d1{transition-delay:.08s}.v9 .rv.d2{transition-delay:.16s}.v9 .rv.d3{transition-delay:.24s}
@media(prefers-reduced-motion:reduce){.v9 .rv{opacity:1;transform:none;transition:none}}

/* hero */
.v9 .hero{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:56px;padding-top:64px;padding-bottom:56px;align-items:center;}
.v9 .hero h1{font-size:56px;line-height:1.06;letter-spacing:-.03em;font-weight:800;}
.v9 .hero h1 em{font-style:normal;color:#00ACE4;}
.v9 .hero .sub{font-size:19px;line-height:1.55;color:var(--ink-3);margin:22px 0 0;max-width:34ch;}
.v9 .hero .ctas{display:flex;gap:12px;align-items:center;margin-top:24px;flex-wrap:wrap;}
.v9 .preview{padding:20px;box-shadow:0 24px 60px -24px rgba(15,23,42,.25);display:flex;flex-direction:column;gap:16px;}
.v9 .preview .who{display:flex;align-items:center;justify-content:space-between;gap:12px;}
.v9 .avatar{width:36px;height:36px;border-radius:999px;background:#EEF2F6;display:grid;place-items:center;font-weight:800;color:var(--acc);font-size:13px;flex:none;}
.v9 .dims{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;}
.v9 .dims .l{font-size:11px;color:var(--mute);margin-bottom:6px;white-space:nowrap;}
.v9 .fact{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;background:var(--bg-2);border:1px solid var(--line);font-size:13px;}
.v9 .fact.ok{background:var(--ok-bg);border-color:var(--ok-line);}
.v9 .fact svg{flex:none;}

/* trust */
.v9 .trust{border-top:1px solid var(--line);border-bottom:1px solid var(--line);background:var(--bg-2);}
.v9 .trust .wrap{display:flex;justify-content:space-between;align-items:center;gap:16px;padding-top:18px;padding-bottom:18px;font-size:13px;color:var(--mute);flex-wrap:wrap;}
.v9 .trust b{color:var(--ink);}

/* roles */
.v9 .roles{padding:88px 0 40px;}
.v9 .roles .head{display:flex;flex-direction:column;gap:10px;max-width:60ch;}
.v9 .roles .ssub{font-size:17px;color:var(--mute);margin:0;line-height:1.5;}
.v9 .tabs{display:flex;gap:8px;margin:28px 0;flex-wrap:wrap;}
.v9 .tab{height:38px;padding:0 16px;border-radius:10px;font-size:14px;font-weight:700;border:1px solid #cbd5e1;background:#fff;color:var(--ink);cursor:pointer;font-family:inherit;}
.v9 .tab.on{background:var(--acc);border-color:var(--acc);color:#fff;}
.v9 .role{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,7fr);gap:48px;align-items:start;}
.v9 .role h3{font-size:28px;font-weight:800;line-height:1.2;}
.v9 .benefits{display:flex;flex-direction:column;gap:18px;margin:24px 0;}
.v9 .benefit{display:flex;gap:12px;}
.v9 .benefit .ic{width:36px;height:36px;flex:none;border-radius:10px;background:#f1f5f9;display:grid;place-items:center;}
.v9 .benefit b{display:block;font-size:15px;}
.v9 .benefit span{display:block;font-size:14px;line-height:1.5;color:var(--mute);}
.v9 .demo{padding:18px;display:flex;flex-direction:column;gap:12px;background:var(--bg-2);}
.v9 .demo .top{display:flex;justify-content:space-between;align-items:center;font-size:14px;font-weight:700;}
.v9 .demo .row{padding:14px 16px;display:flex;justify-content:space-between;align-items:center;gap:12px;}
.v9 .demo .row b{display:block;font-size:14px;}
.v9 .demo .row span.s{display:block;font-size:12.5px;color:var(--mute);}
.v9 .demo .note{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;border-radius:10px;background:#fff;border:1px dashed #cbd5e1;font-size:13px;flex-wrap:wrap;}
.v9 .demo .acts{display:flex;gap:8px;}
.v9 .demo .acts .btn{height:34px;font-size:13px;padding:0 14px;}

/* band */
.v9 .band{padding:48px 0 0;}
.v9 .band .img{position:relative;border-radius:16px;overflow:hidden;height:420px;}
.v9 .band img{width:100%;height:100%;object-fit:cover;display:block;}
.v9 .stats{position:absolute;left:24px;right:24px;bottom:24px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;}
.v9 .stat{background:rgba(255,255,255,.92);border-radius:12px;padding:16px;}
.v9 .stat .b{font-size:22px;font-weight:800;line-height:1.1;}
.v9 .stat .b.num{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:26px;font-weight:700;}
.v9 .stat .s{font-size:12.5px;line-height:1.4;color:var(--mute);margin-top:4px;}

/* steps */
.v9 .steps{padding:88px 0;}
.v9 .steps .ssub{font-size:17px;color:var(--mute);margin:10px 0 0;}
.v9 .steps-in{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px;margin-top:32px;}
.v9 .step{display:flex;flex-direction:column;gap:12px;padding-top:20px;border-top:2px solid var(--line);}
.v9 .step .n{width:32px;height:32px;border-radius:999px;display:grid;place-items:center;background:var(--acc);color:#fff;font-weight:800;font-size:14px;}
.v9 .step h3{font-size:17px;font-weight:700;}
.v9 .step p{margin:0;font-size:14.5px;line-height:1.55;color:var(--mute);}

/* final */
.v9 .final{margin:0 0 72px;}
.v9 .final .box{border-radius:16px;background:#0f172a;color:#fff;padding:56px 64px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:40px;align-items:center;}
.v9 .final h2{font-size:32px;font-weight:800;}
.v9 .final p{margin:10px 0 0;font-size:16px;color:#cbd5e1;}
.v9 .final .btn{background:#fff;color:var(--ink);}

@media(max-width:1024px){
  .v9 .wrap{padding:0 28px;}
  .v9 .hero{grid-template-columns:1fr;gap:28px;padding-top:40px;padding-bottom:32px;}
  .v9 .hero h1{font-size:40px;}
  .v9 .role{grid-template-columns:1fr;gap:28px;}
  .v9 .stats{grid-template-columns:repeat(2,minmax(0,1fr));}
  .v9 .steps-in{grid-template-columns:1fr;}
  .v9 .final .box{grid-template-columns:1fr;padding:36px 28px;}
}
@media(max-width:640px){
  .v9 .wrap{padding:0 20px;}
  .v9 .hero h1{font-size:34px;}
  .v9 .hero .sub{font-size:16px;}
  .v9 .hero .ctas .btn{width:100%;}
  .v9 .h2{font-size:26px;}
  .v9 .dims .l{display:none;}
  .v9 .trust .wrap{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 16px;}
  .v9 .band .img{height:240px;}
  .v9 .stats{left:12px;right:12px;bottom:12px;gap:8px;}
  .v9 .stat{padding:10px 12px;} .v9 .stat .b{font-size:18px;} .v9 .stat .b.num{font-size:20px;} .v9 .stat .s{font-size:11px;}
  .v9 .stat:nth-child(n+3){display:none;}
  .v9 .tabs{overflow-x:auto;flex-wrap:nowrap;margin-left:-20px;margin-right:-20px;padding:0 20px;}
  .v9 .demo .row{flex-wrap:wrap;}
}
`

/* Hero product preview — a real mini screening report (sample data, same cast as the role panels). */
const PREVIEW: Record<Lang, { title: string; sub: string; verdict: string; dims: string[]; facts: [string, string, string] }> = {
  zh: {
    title: 'Mia Chen · 筛查报告', sub: '1207 King West · $2,800/月', verdict: '综合 · 建议面谈',
    dims: ['支付能力', '信用健康', '租史', '核验', '沟通'],
    facts: ['已核验事实 · 身份 Veriff 通过 · 银行入账 ≈ $6,240/月（Flinks 直连）', '文件取证 · 3 份文件 · PDF 结构一致 · 无修改痕迹', 'LTB 判令目录 + 安省法院门户 · 已按姓名检索 · 0 条'],
  },
  en: {
    title: 'Mia Chen · Screening report', sub: '1207 King West · $2,800/mo', verdict: 'Overall · Interview',
    dims: ['Ability to pay', 'Credit', 'Rental history', 'Verification', 'Communication'],
    facts: ['Verified facts · Veriff identity approved · bank deposits ≈ $6,240/mo (Flinks)', 'Document forensics · 3 files · PDF structure consistent · no edit trail', 'LTB Order Catalogue + Ontario Courts portal · searched by name · 0 records'],
  },
}

const ROLE_ICONS = [
  <svg key="a" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0f172a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>,
  <svg key="b" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0f172a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg>,
  <svg key="c" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0f172a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>,
]

const CheckIcon = ({ color }: { color: string }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
)

/* ===================== page ===================== */

export default function HomePage() {
  const { lang } = useI18n()
  const c = COPY[lang] ?? COPY.zh
  const heroCtas = HERO_CTAS[lang] ?? HERO_CTAS.zh
  const pv = PREVIEW[lang] ?? PREVIEW.zh
  const [tab, setTab] = useState(0)
  const role = c.roles[tab]

  // Auth-aware CTAs: a signed-in user clicking 免费开始 must land in their own
  // workspace, never on /register.
  const { user, role: authRole } = useAuth()
  const startHref = user ? (authRole ? ROLE_HOME[authRole] : '/dashboard') : '/register'
  // Hero primary → screening (activation plan, 2026-08-12): signed-in users
  // land in the app, visitors on the public landing that explains first.
  const heroHref = user ? '/screening/app' : '/screening'
  const finalHref = user ? startHref : promptHref(c.chatU)

  useEffect(() => {
    document.title = lang === 'zh' ? 'Stayloop — 租房的 AI 操作系统 · Toronto' : 'Stayloop — The AI-native rental OS for Toronto'
  }, [lang])

  // Scroll reveal (.rv → .on); reduced motion shows everything immediately.
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced || !('IntersectionObserver' in window)) {
      document.querySelectorAll('.rv').forEach((el) => el.classList.add('on'))
      return
    }
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('on'); io.unobserve(e.target) } }), { threshold: 0.12 })
    document.querySelectorAll('.rv').forEach((el) => io.observe(el))
    const catchUp = () => document.querySelectorAll('.rv:not(.on)').forEach((el) => { if (el.getBoundingClientRect().top < window.innerHeight) el.classList.add('on') })
    window.addEventListener('load', catchUp)
    catchUp()
    return () => { io.disconnect(); window.removeEventListener('load', catchUp) }
  }, [])

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <Header />
      <div className="v9">
        {/* ================= HERO ================= */}
        <header className="wrap hero">
          <div>
            <h1>{c.heroH1}</h1>
            <p className="sub">{c.sub}</p>
            <div className="ctas">
              <Link className="btn btn-p" href={heroHref}>{heroCtas.primary}</Link>
              <a className="btn btn-g" href="#roles">{heroCtas.secondary}</a>
            </div>
          </div>
          <div className="card preview" aria-label={pv.title}>
            <div className="who">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="avatar">MC</div>
                <div><div style={{ fontWeight: 700, fontSize: 15 }}>{pv.title}</div><div className="muted" style={{ fontSize: 12 }}>{pv.sub}</div></div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="mono" style={{ fontSize: 30, fontWeight: 700, color: 'var(--ok)', lineHeight: 1 }}>87</div>
                <div className="muted" style={{ fontSize: 11 }}>{pv.verdict}</div>
              </div>
            </div>
            <div className="dims">
              {[90, 84, 88, 92, 80].map((w, i) => (
                <div key={i}><div className="l">{pv.dims[i]}</div><div className="bar"><i style={{ width: `${w}%` }} /></div></div>
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="fact ok"><CheckIcon color="#047857" /><div><b>{pv.facts[0].split(' · ')[0]}</b>{pv.facts[0].slice(pv.facts[0].indexOf(' · '))}</div></div>
              <div className="fact"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="9" /></svg><div><b>{pv.facts[1].split(' · ')[0]}</b>{pv.facts[1].slice(pv.facts[1].indexOf(' · '))}</div></div>
              <div className="fact"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18M5 21V7l7-4 7 4v14" /><path d="M9 21v-6h6v6" /></svg><div><b>{pv.facts[2].split(' · ')[0]}</b>{pv.facts[2].slice(pv.facts[2].indexOf(' · '))}</div></div>
            </div>
          </div>
        </header>

        {/* ================= trust strip ================= */}
        <section className="trust">
          <div className="wrap">{c.trust.map((t, i) => <div key={i}>{t}</div>)}</div>
        </section>

        {/* ================= ROLES ================= */}
        <section className="roles" id="roles">
          <div className="wrap">
            <div className="head">
              <h2 className="h2">{c.rolesH2}</h2>
              <p className="ssub">{c.rolesSub}</p>
            </div>
            <div className="tabs" role="tablist">
              {c.roles.map((r, i) => (
                <button key={i} type="button" role="tab" aria-selected={tab === i} className={tab === i ? 'tab on' : 'tab'} onClick={() => setTab(i)}>{r.tag}</button>
              ))}
            </div>
            <div className="role" key={`${lang}-${tab}`}>
              <div>
                <h3>{role.h2}</h3>
                <div className="benefits">
                  {role.benefits.map((b, i) => (
                    <div className="benefit" key={i}><div className="ic">{ROLE_ICONS[i % 3]}</div><div><b>{b.b}</b><span>{b.s}</span></div></div>
                  ))}
                </div>
                <Link className="btn btn-p" href={user ? ROLE_HREFS[tab] : '/register'}>{role.cta}</Link>
              </div>
              <div className="card demo">
                <div className="top"><span>{role.demoName}</span><span className="muted mono" style={{ fontSize: 11, fontWeight: 500 }}>{role.tm}</span></div>
                {role.rows.map((r, i) => (
                  <div className="card row" key={i}><div><b>{r.b}</b><span className="s">{r.s}</span></div><span className={`pill ${r.pillCls}`}>{r.pill}</span></div>
                ))}
                <div className="note">
                  <div>{role.note}</div>
                  <div className="acts"><span className="btn btn-p">{role.act1}</span>{role.act2 && <span className="btn btn-g">{role.act2}</span>}</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ================= PHOTO BAND + STATS ================= */}
        <section className="band">
          <div className="wrap">
            <div className="img">
              <img src="/home/hero-mist.jpg" alt={c.heroAlt} loading="lazy" />
              <div className="stats">
                {c.stats.map((s, i) => (
                  <div className={i ? `stat rv d${i}` : 'stat rv'} key={i}><div className={s.num ? 'b num' : 'b'}>{s.b}</div><div className="s">{s.s}</div></div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ================= STEPS ================= */}
        <section className="steps">
          <div className="wrap">
            <h2 className="h2">{c.stepsH2}</h2>
            <p className="ssub">{c.stepsSub}</p>
            <div className="steps-in">
              {c.steps.map((s, i) => (
                <div className={i ? `step rv d${i}` : 'step rv'} key={i}><span className="n">{i + 1}</span><h3>{s.h}</h3><p>{s.p}</p></div>
              ))}
            </div>
          </div>
        </section>

        {/* ================= FINAL ================= */}
        <section className="final">
          <div className="wrap">
            <div className="box">
              <div><h2>{c.finalH2}</h2><p>{c.note}</p></div>
              <Link className="btn" href={finalHref}>{c.finalCta}</Link>
            </div>
          </div>
        </section>
      </div>
      <Footer />
    </>
  )
}
