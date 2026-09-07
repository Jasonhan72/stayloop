'use client'

// Candidate homepage — "the homepage is the assistant" (2026-09-06).
//
// Built from the live homepage (app/page.tsx, v8 structure + flinks palette),
// not from any earlier design file. What changes:
//   1. The hero's scripted chat demo becomes the REAL assistant: the visitor
//      picks a role and types; anonymous preview turns go through
//      /api/agent/turn exactly as on /tenant/agent (real listings, official
//      TRREB market data, per-IP hourly limit, nothing persisted).
//   2. Every "try it" chip on the page sends into that one assistant, so the
//      whole page drives a single live conversation instead of showing
//      screenshots of one.
//   3. No photos, no fabricated consoles (Mia 87 分 / $1,225 到账). The
//      "verify it" band reads its numbers from /api/public/stats at load.
//   4. Copy is the approved homepage copy wherever a section survives;
//      benefits that describe features which are not live are rewritten or
//      tagged 即将.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import AgentChat from '@/components/agent/AgentChat'
import { useAgentSession } from '@/lib/agent/useAgentSession'
import { useT, type Lang } from '@/lib/i18n'
import { GENERIC_AI_NAME, useAIName } from '@/lib/aiName'
import type { AgentRole } from '@/lib/agent/types'

type Bi = { zh: string; en: string }
const pick = (b: Bi, lang: Lang) => (lang === 'zh' ? b.zh : b.en)

const ROLE_LABEL: Record<AgentRole, Bi> = {
  tenant: { zh: '我是租客', en: 'Tenant' },
  landlord: { zh: '我是房东', en: 'Landlord' },
  agent: { zh: '我是经纪', en: 'Agent' },
}

// One source for the assistant's name everywhere on the page: the name the
// signed-in user gave it (agent_configs) or, for visitors, nothing — the
// chat header then shows the generic label and the copy says "AI". The
// marketing names (Luna / Logic / Brief) are never shown here because the
// live chat panel would contradict them.
function customName(n: string): string | null {
  const t = (n || '').trim()
  return t && t !== GENERIC_AI_NAME ? t : null
}
const NAME_TOKEN = '{ai}'
function withName(b: Bi, lang: Lang, name: string | null): string {
  return pick(b, lang).split(NAME_TOKEN).join(name ?? 'AI')
}

// Per-role sections. Copy follows the approved homepage; the landlord's
// second benefit and the agent's list are rewritten to what is live today.
const ROLES: {
  key: AgentRole
  tag: Bi
  h2: Bi
  lead: Bi
  benefits: { b: Bi; s: Bi; soon?: boolean }[]
  chips: { label: Bi; prompt: Bi }[]
  cta: Bi
  href: string
}[] = [
  {
    key: 'landlord',
    tag: { zh: '房东 × {ai}', en: 'Landlord × {ai}' },
    h2: { zh: '选对租客，按时收租，后台有支持。', en: 'Pick the right tenant, get paid on time, with a back office behind you.' },
    lead: {
      zh: '房东的难题，{ai} 接：把每份申请查完材料真伪和法庭记录，每一分写明理由，再排好序给你。',
      en: "A landlord's problems go to {ai}: it checks every application for document authenticity and court records, explains every point, then ranks them for you.",
    },
    benefits: [
      { b: { zh: '每份申请先过六维筛查', en: 'Every application goes through six-dimension screening first' }, s: { zh: '材料真伪、LTB 判令与法院记录都查过，伪造材料会被识别并拦下。', en: 'Document authenticity, LTB orders and court records are checked; forged files are flagged and stopped.' } },
      { b: { zh: '租约与续约由系统跟进', en: 'Leases and renewals are tracked by the system' }, s: { zh: '起草、电子签、到期前 120 天备好续约方案，批准就发。', en: 'Drafting, e-signing, and renewal options ready 120 days before expiry — approve and send.' } },
      { b: { zh: 'AI 后台全天候在线', en: 'An AI back office, on around the clock' }, s: { zh: '合规拦截、审计留痕、报修接待，你只需要确认。', en: 'Compliance guardrails, audit trail, repair intake — you only confirm.' } },
    ],
    chips: [
      { label: { zh: '租客筛查', en: 'Tenant screening' }, prompt: { zh: '我要筛查一位申请人：告诉我报告会查什么、需要准备哪些材料，然后带我开始。', en: 'I want to screen an applicant: tell me what the report checks, what documents I need, then take me to start.' } },
      { label: { zh: '看看新申请', en: 'Review applications' }, prompt: { zh: '帮我看看最新的申请，按质量排序并说明理由。', en: 'Review my latest applications, rank them and explain why.' } },
      { label: { zh: '续约方案', en: 'Renewal options' }, prompt: { zh: '帮我看看哪些租约快到期了，给我续约方案和合规涨幅。', en: 'Which leases are coming up? Give me renewal options with the legal increase.' } },
      { label: { zh: '合规检查', en: 'Compliance check' }, prompt: { zh: '帮我检查我的房源和租约有没有 RTA 合规风险。', en: 'Check my listings and leases for RTA compliance risks.' } },
      { label: { zh: '发布房源', en: 'List a property' }, prompt: { zh: '我要发布一个新房源，你来帮我整理信息。', en: 'I want to list a new property — help me put it together.' } },
    ],
    cta: { zh: '让 {ai} 协助管理房源 →', en: 'Let {ai} help manage your rentals →' },
    href: '/landlord',
  },
  {
    key: 'tenant',
    tag: { zh: '租客 × {ai}', en: 'Tenant × {ai}' },
    h2: { zh: '没有本地信用记录，也能建立可信的租房履历。', en: 'Build a trusted rental record, even without local credit history.' },
    lead: {
      zh: '租客的难题，{ai} 接：条件说人话，房源全是真的；四枚章盖好，申请任何房源不再重复交材料。',
      en: "A tenant's problems go to {ai}: say what you want in plain language — every listing is real; earn the four stamps once and apply anywhere without re-submitting.",
    },
    benefits: [
      { b: { zh: '真实挂牌 + 官方行情作答', en: 'Real listings + official market data' }, s: { zh: 'TRREB 官方成交对照，绝不编造；英文租约逐条讲成中文。', en: 'Checked against official TRREB transactions, never invented; English leases explained clause by clause.' } },
      { b: { zh: '验证一次，处处通行', en: 'Verify once, use it everywhere' }, s: { zh: '护照、枫叶卡、工签都支持——材料只交一次。', en: 'Passport, PR card, work permit all supported — submit documents once.' } },
      { b: { zh: '评分带理由，拒绝有依据', en: 'Scores come with reasons; rejections need grounds' }, s: { zh: '按时租金、真实记录都写进你的护照，替你说话。', en: 'On-time rent and verified records go into your Passport and speak for you.' } },
    ],
    chips: [
      { label: { zh: '帮我找房', en: 'Find me a home' }, prompt: { zh: '帮我找市中心 $2,500 以内的一居室，最好离地铁近。', en: 'Find me a downtown 1-bed under $2,500, close to the subway.' } },
      { label: { zh: '北约克两房', en: 'North York 2-bed' }, prompt: { zh: '北约克两房，预算 2800，能养猫', en: 'North York 2-bed, budget 2800, cats OK' } },
      { label: { zh: '解读租约', en: 'Explain my lease' }, prompt: { zh: '帮我逐条解释租约里最需要注意的条款。', en: 'Walk me through the lease clauses I should watch out for.' } },
      { label: { zh: '发起报修', en: 'Report a repair' }, prompt: { zh: '厨房水槽漏水，帮我整理成报修工单发给房东。', en: 'The kitchen sink is leaking — turn this into a repair ticket for my landlord.' } },
    ],
    cta: { zh: '让 {ai} 开始找 →', en: 'Let {ai} start searching →' },
    href: '/tenant',
  },
  {
    key: 'agent',
    tag: { zh: '经纪 × {ai}', en: 'Agent × {ai}' },
    h2: { zh: '行政事务交给 AI，时间留给专业工作。', en: 'Hand the admin to AI, keep your time for the work that closes.' },
    lead: {
      zh: '经纪的难题，{ai} 接：替客户把关、记住每位客户的偏好、把报告直接送到房东手上。',
      en: "An agent's problems go to {ai}: vouch for clients with evidence, remember every client's preferences, and put the report straight in the landlord's hands.",
    },
    benefits: [
      { b: { zh: '替客户下单筛查，报告直接分享给房东', en: 'Order a screening for a client, share the report with the landlord' }, s: { zh: '你、客户、房东看到的是同一份报告。', en: 'You, your client and the landlord read the same report.' } },
      { b: { zh: '{ai} 记住每位客户', en: '{ai} remembers every client' }, s: { zh: '预算、区域、偏好只说一次；下次开口它就接上。', en: 'Budget, area, preferences said once; next time it picks up where you left off.' } },
      { b: { zh: '带看日程、反馈归档、佣金结算', en: 'Showing schedules, feedback filing, commission settlement' }, s: { zh: '上线前不进首页数字。', en: 'Not counted on this page until it ships.' }, soon: true },
    ],
    chips: [
      { label: { zh: '客户跟进', en: 'Client follow-ups' }, prompt: { zh: '哪些客户需要跟进？帮我列出来并起草跟进消息。', en: 'Which clients need follow-ups? List them and draft the messages.' } },
      { label: { zh: 'RECO 边界', en: 'RECO boundaries' }, prompt: { zh: '下一场带看，哪些问题我被授权回答、哪些不能答？', en: 'For my next showing, what am I authorized to answer — and what not?' } },
      { label: { zh: '替客户筛查', en: 'Screen for a client' }, prompt: { zh: '我有一位客户要申请房源，帮我准备一次租客筛查需要哪些材料。', en: 'A client is applying for a unit — what do I need to run a tenant screening for them?' } },
    ],
    cta: { zh: '让 {ai} 安排工作 →', en: 'Let {ai} run your day →' },
    href: '/agent',
  },
]

const STEPS: { h: Bi; p: Bi }[] = [
  { h: { zh: '说一句', en: 'Say it' }, p: { zh: '「多大附近、能养猫、4000 以内」——地标、预算、偏好都能理解。', en: '"Near UofT, cats OK, under 4000" — landmarks, budgets and preferences all understood.' } },
  { h: { zh: 'Agent 去办', en: 'The agent does it' }, p: { zh: '查真实挂牌、对官方行情、备好材料——例行工作自动完成，睡觉时也在盯。', en: 'Searches real listings, checks official market data, prepares documents — routine work done, even while you sleep.' } },
  { h: { zh: '你来确认', en: 'You confirm' }, p: { zh: '发送、签署、付款先变成等你批准的卡片；每一步留痕，随时回查。', en: 'Sending, signing and paying become cards awaiting your approval; every step is logged.' } },
]

type Stats = { screenings: number | null; ltbOrders: number | null; listings: number | null; trrebQuarters: number | null }

function fmt(n: number | null | undefined): string {
  if (n == null) return '—'
  return n.toLocaleString('en-CA')
}

export default function HomeNext() {
  const { lang } = useT()
  const zh = lang === 'zh'
  const [role, setRole] = useState<AgentRole>('tenant')
  const [queued, setQueued] = useState<{ role: AgentRole; prompt: string } | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const heroRef = useRef<HTMLDivElement>(null)
  const tenantName = useAIName('tenant')
  const landlordName = useAIName('landlord')
  const agentName = useAIName('agent')
  const names: Record<AgentRole, string | null> = {
    tenant: customName(tenantName),
    landlord: customName(landlordName),
    agent: customName(agentName),
  }

  useEffect(() => {
    let cancelled = false
    fetch('/api/public/stats').then((r) => r.json()).then((j) => { if (!cancelled && j?.ok) setStats(j) }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  // Any chip on the page: switch the assistant to that role, send the prompt,
  // bring the conversation into view.
  const ask = useCallback((r: AgentRole, prompt: string) => {
    setRole(r)
    setQueued({ role: r, prompt })
    heroRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  return (
    <div style={{ background: '#FFFFFF' }} className="text-body">
      <Header variant="transparent" />

      {/* ================= HERO = the assistant ================= */}
      <section style={{ background: 'linear-gradient(180deg,#E9F5FD 0%,#FFFFFF 100%)' }}>
        <div className="pb-10 pt-12 lg:pt-16">
          <div className="mx-auto max-w-[760px] px-5 text-center sm:px-7">
            <div className="font-mono text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: '#00ACE4' }}>
              AI-Native Rental OS · Toronto
            </div>
            <h1 className="mt-4 text-[34px] font-extrabold leading-[1.08] tracking-tight sm:text-[52px]">
              {zh ? <>租房路上的难题，<br />交给<em className="not-italic" style={{ color: '#00ACE4' }}>各自的 AI</em>。</> : <>The hard parts of renting,<br />handled by <em className="not-italic" style={{ color: '#00ACE4' }}>your own AI</em>.</>}
            </h1>
            <p className="mx-auto mt-4 max-w-[560px] text-[16px] leading-relaxed text-body-2 sm:text-[17px]">
              {zh
                ? <>Stayloop 为租客、房东、经纪各提供一个<b className="text-body">独立的 AI Agent</b>：你说一句，它去办，关键决定由你确认。下面这个就是——不用注册，直接说。</>
                : <>Stayloop gives tenants, landlords and agents each a <b className="text-body">dedicated AI agent</b>: say it, it gets done, you confirm the key decisions. This is it — no signup, just talk.</>}
            </p>
          </div>

          {/* role switch + live assistant */}
          {/* The assistant takes the full page width: 8px gutters on phones,
              wider on desktop, capped only so ultra-wide monitors keep the
              thread readable. */}
          <div ref={heroRef} id="assistant" className="mx-auto mt-8 w-full max-w-[1600px] scroll-mt-24 px-2 sm:px-5 lg:px-8">
            <div className="mb-3 flex flex-wrap items-center justify-center gap-2">
              {(['tenant', 'landlord', 'agent'] as AgentRole[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className="rounded-full px-4 py-2 text-[13.5px] font-bold transition"
                  style={role === r ? { background: '#1B1B3C', color: '#fff' } : { background: '#fff', color: '#1B1B3C', border: '1px solid #D3E3EF' }}
                >
                  {pick(ROLE_LABEL[r], lang)}{names[r] ? ` · ${names[r]}` : ''}
                </button>
              ))}
            </div>
            <div className="lg:h-[calc(100svh-180px)] lg:min-h-[560px] lg:max-h-[820px]">
              <AssistantPanel key={role} role={role} name={names[role]} queued={queued} onQueuedSent={() => setQueued(null)} />
            </div>
            <div className="mt-3 flex flex-col items-center justify-between gap-2 px-2 text-[12px] text-body-3 sm:flex-row">
              <span>{zh ? '免注册体验 · 每小时有次数上限 · 登录后它才会记住你' : 'Try without signing up · hourly limit · it only remembers you after you sign in'}</span>
              <span className="inline-flex items-center gap-2 rounded-full border border-line-divider bg-white px-3 py-1">
                <span className="h-2 w-2 rounded-full" style={{ background: '#00ACE4' }} />
                <b className="text-body">{zh ? 'AI 提议，你决定' : 'AI proposes, you decide'}</b>
                <span>{zh ? '对外动作先经你批准 · 全程留痕' : 'outbound actions wait for your approval · fully logged'}</span>
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ================= trust strip ================= */}
      <section className="border-y border-line-divider" style={{ background: '#F3F8FC' }}>
        <div className="mx-auto grid max-w-[1100px] grid-cols-2 gap-x-6 gap-y-3 px-5 py-4 text-[13px] text-body-3 sm:px-7 md:grid-cols-4">
          <div>{zh ? '技术' : 'Model'} <b className="text-body">Anthropic Claude</b></div>
          <div>{zh ? '行情' : 'Market'} <b className="text-body">TRREB · Realtor.ca</b></div>
          <div>{zh ? '合规' : 'Compliance'} <b className="text-body">RTA · OHRC · PIPEDA</b></div>
          <div><b className="text-body">Proudly Canadian</b> · {zh ? '数据驻加' : 'data stays in Canada'}</div>
        </div>
      </section>

      {/* ================= PAINS ================= */}
      <section className="mx-auto max-w-[1100px] px-5 py-14 sm:px-7">
        <div className="grid gap-8 md:grid-cols-3">
          <Pain who={zh ? '房东' : 'Landlord'} text={zh ? '怕租错人？每份申请先查真伪和法庭记录。' : 'Afraid of the wrong tenant? Every application is checked for authenticity and court records first.'} onTry={() => ask('landlord', zh ? '帮我看看最新的申请，按质量排序并说明理由。' : 'Review my latest applications, rank them and explain why.')} tryLabel={zh ? `对${names.landlord ? ' ' + names.landlord : '房东 AI'} 说` : `Ask ${names.landlord ?? 'the landlord AI'}`} />
          <Pain who={zh ? '租客' : 'Tenant'} text={zh ? '怕材料白填？交一次，处处通行。' : 'Tired of re-submitting documents? Submit once, use it everywhere.'} onTry={() => ask('tenant', zh ? '我现在盖了几枚章？下一枚怎么盖，能解锁什么？' : 'How many stamps do I have? How do I earn the next one, and what does it unlock?')} tryLabel={zh ? `对${names.tenant ? ' ' + names.tenant : '租客 AI'} 说` : `Ask ${names.tenant ?? 'the tenant AI'}`} />
          <Pain who={zh ? '经纪' : 'Agent'} text={zh ? '怕杂活吃掉专业？行政事务全交给 AI。' : 'Admin eating your day? Hand it to the AI.'} onTry={() => ask('agent', zh ? '哪些客户需要跟进？帮我列出来并起草跟进消息。' : 'Which clients need follow-ups? List them and draft the messages.')} tryLabel={zh ? `对${names.agent ? ' ' + names.agent : '经纪 AI'} 说` : `Ask ${names.agent ?? 'the agent AI'}`} />
        </div>
      </section>

      {/* ================= ROLES ================= */}
      <section id="roles" className="border-t border-line-divider" style={{ background: '#F3F8FC' }}>
        <div className="mx-auto max-w-[1100px] px-5 py-16 sm:px-7">
          <div className="max-w-[640px]">
            <h2 className="text-[28px] font-extrabold leading-tight tracking-tight sm:text-[36px]">{zh ? '三种角色，各自的 Agent' : 'Three roles, each with its own agent'}</h2>
            <p className="mt-2 text-[16px] text-body-2">{zh ? '不是同一个客服机器人——是三个立场不同、只对你负责的 AI。每个板块的例句都能直接发给它。' : 'Not one shared support bot — three AIs with different loyalties, each answering only to you. Every example below sends straight to it.'}</p>
          </div>
          <RoleTabs lang={lang} names={names} onAsk={ask} />
        </div>
      </section>

      {/* ================= STEPS ================= */}
      <section className="mx-auto max-w-[1100px] px-5 py-16 sm:px-7">
        <h2 className="text-[28px] font-extrabold leading-tight tracking-tight sm:text-[36px]">{zh ? '把难题交出去，只要三步' : 'Handing it over takes three steps'}</h2>
        <p className="mt-2 text-[16px] text-body-2">{zh ? '没有表单迷宫——对话就是入口。' : 'No form maze — conversation is the interface.'}</p>
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={s.h.en} className="border-t-2 border-line-divider pt-5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full font-mono text-[13px] font-bold text-white" style={{ background: '#00ACE4' }}>{i + 1}</div>
              <div className="mt-3 text-[17px] font-bold">{pick(s.h, lang)}</div>
              <p className="mt-1.5 text-[14.5px] leading-relaxed text-body-2">{pick(s.p, lang)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ================= VERIFY: live numbers ================= */}
      <section className="mx-auto max-w-[1100px] px-5 pb-16 sm:px-7">
        <div className="rounded-2xl px-7 py-12 text-white sm:px-12" style={{ background: '#1B1B3C' }}>
          <h2 className="text-[26px] font-extrabold leading-tight tracking-tight sm:text-[34px]">{zh ? '不给形容词，给可以验证的东西' : 'No adjectives — only things you can verify'}</h2>
          <p className="mt-2 text-[15px]" style={{ color: '#B7C2D6' }}>{zh ? '下面的每个数字都是此刻从线上数据库读出来的，不是写死的。' : 'Every number below is read from the production database right now, not typed in.'}</p>
          <div className="mt-9 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <Fact n={fmt(stats?.screenings)} s={zh ? <>份筛查报告已生成，<i>每条结论注明所依据的数值</i></> : <>screening reports generated, <i>every conclusion cites its numbers</i></>} />
            <Fact n={fmt(stats?.ltbOrders)} s={zh ? <>份 LTB 判令已入库可查，<i>姓名命中须地址佐证</i></> : <>LTB orders on file and searchable, <i>name hits need address corroboration</i></>} />
            <Fact n={fmt(stats?.trrebQuarters)} s={zh ? <>个季度的 TRREB 官方成交数据，<i>行情有据</i></> : <>quarters of official TRREB data, <i>market answers with sources</i></>} />
            <Fact n={fmt(stats?.listings)} s={zh ? <>套公开房源，<i>平台核验或 Realtor.ca 实时</i></> : <>public listings, <i>platform-verified or live from Realtor.ca</i></>} />
          </div>
        </div>
      </section>

      {/* ================= FINAL ================= */}
      <section className="mx-auto max-w-[1100px] px-5 pb-20 text-center sm:px-7">
        <h2 className="text-[30px] font-extrabold leading-tight tracking-tight sm:text-[40px]">{zh ? <>下一个家，<br />从一句话开始。</> : <>Your next home<br />starts with one sentence.</>}</h2>
        <p className="mx-auto mt-3 max-w-[460px] text-[15px] text-body-2">{zh ? '免注册体验——你的 Agent 现在就能开始干活。租客永远免费。' : 'Try without signing up — your agent can start right now. Free for tenants, always.'}</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button type="button" onClick={() => heroRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="sl-btn-primary">{zh ? '对它说一句 ↑' : 'Say something ↑'}</button>
          <Link href="/onboarding/name" className="sl-btn-secondary">{zh ? '注册，让它记住你' : 'Sign up so it remembers you'}</Link>
        </div>
      </section>

      <Footer />
    </div>
  )
}

// One live session per role; remounted (key=role) when the role switches.
function AssistantPanel({ role, name, queued, onQueuedSent }: { role: AgentRole; name: string | null; queued: { role: AgentRole; prompt: string } | null; onQueuedSent: () => void }) {
  const { loading, data, status, messages, sendMessage } = useAgentSession(role)
  const sentRef = useRef<string | null>(null)
  useEffect(() => {
    if (loading || !queued || queued.role !== role) return
    if (sentRef.current === queued.prompt) return
    sentRef.current = queued.prompt
    void sendMessage(queued.prompt)
    onQueuedSent()
  }, [loading, queued, role, sendMessage, onQueuedSent])

  if (loading || !data) {
    return <div className="h-full animate-pulse rounded-2xl border border-line-divider bg-white" />
  }
  return <AgentChat role={role} agentName={name ?? data.agent.agent_name} status={status} messages={messages} onSend={sendMessage} />
}

function Pain({ who, text, onTry, tryLabel }: { who: string; text: string; onTry: () => void; tryLabel: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-body-3">{who}</div>
      <div className="text-[17px] font-semibold leading-snug">{text}</div>
      <button type="button" onClick={onTry} className="mt-1 w-fit text-[13.5px] font-bold" style={{ color: '#00ACE4' }}>{tryLabel} →</button>
    </div>
  )
}

function Fact({ n, s }: { n: string; s: ReactNode }) {
  return (
    <div className="border-t pt-5" style={{ borderColor: 'rgba(255,255,255,0.18)' }}>
      <div className="font-mono text-[34px] font-bold leading-none [font-variant-numeric:tabular-nums]" style={{ color: '#33BCEA' }}>{n}</div>
      <div className="mt-3 text-[13.5px] leading-relaxed" style={{ color: '#D3E3EF' }}>{s}</div>
    </div>
  )
}

function RoleTabs({ lang, names, onAsk }: { lang: Lang; names: Record<AgentRole, string | null>; onAsk: (r: AgentRole, prompt: string) => void }) {
  const [tab, setTab] = useState<AgentRole>('landlord')
  const zh = lang === 'zh'
  const r = ROLES.find((x) => x.key === tab)!
  const nm = names[r.key]
  return (
    <div className="mt-8">
      <div className="flex flex-wrap gap-2">
        {ROLES.map((x) => (
          <button key={x.key} type="button" onClick={() => setTab(x.key)} className="rounded-full px-4 py-2 text-[13.5px] font-bold transition"
            style={tab === x.key ? { background: '#1B1B3C', color: '#fff' } : { background: '#fff', color: '#1B1B3C', border: '1px solid #D3E3EF' }}>
            {withName(x.tag, lang, names[x.key] ? names[x.key]!.toUpperCase() : null)}
          </button>
        ))}
      </div>
      <div className="mt-6 grid gap-8 rounded-2xl border border-line-divider bg-white p-6 sm:p-8 lg:grid-cols-[5fr_6fr] lg:gap-12">
        <div>
          <h3 className="text-[24px] font-extrabold leading-tight tracking-tight sm:text-[28px]">{withName(r.h2, lang, nm)}</h3>
          <p className="mt-3 text-[15px] leading-relaxed text-body-2">{withName(r.lead, lang, nm)}</p>
          <ul className="mt-6 space-y-4">
            {r.benefits.map((b) => (
              <li key={b.b.en} className="flex gap-3">
                <span className="mt-[7px] h-2 w-2 flex-none rounded-full" style={{ background: b.soon ? '#9FBBD0' : '#00ACE4' }} />
                <div>
                  <div className="text-[15px] font-bold">
                    {withName(b.b, lang, nm)}
                    {b.soon && <span className="ml-2 rounded-full px-2 py-[2px] font-mono text-[10px] font-bold" style={{ background: '#EEF0F4', color: '#6E6E8A' }}>{zh ? '即将' : 'SOON'}</span>}
                  </div>
                  <div className="mt-0.5 text-[13.5px] leading-relaxed text-body-2">{pick(b.s, lang)}</div>
                </div>
              </li>
            ))}
          </ul>
          <Link href={r.href} className="sl-btn-secondary mt-7 inline-flex">{withName(r.cta, lang, nm)}</Link>
        </div>
        <div className="rounded-xl p-5" style={{ background: '#F3F8FC' }}>
          <div className="font-mono text-[10.5px] font-bold uppercase tracking-[0.14em] text-body-3">{zh ? '对它说 · 点一下就发到上面的对话里' : 'Say it · one tap sends it to the conversation above'}</div>
          <div className="mt-3 grid gap-2">
            {r.chips.map((c) => (
              <button key={c.label.en} type="button" onClick={() => onAsk(r.key, pick(c.prompt, lang))}
                className="group flex items-center justify-between gap-3 rounded-xl border border-line-divider bg-white px-4 py-3 text-left transition hover:border-[#00ACE4]">
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-bold">{pick(c.label, lang)}</span>
                  <span className="block truncate text-[12px] text-body-3">{pick(c.prompt, lang)}</span>
                </span>
                <span className="flex-none text-[13px] font-bold" style={{ color: '#00ACE4' }}>→</span>
              </button>
            ))}
          </div>
          <div className="mt-4 text-[12px] leading-relaxed text-body-3">
            {zh ? '回答来自真实房源与官方行情；登录后它才读取你的申请、租约与记忆。' : 'Answers come from real listings and official market data; it reads your applications, leases and memory only after you sign in.'}
          </div>
        </div>
      </div>
    </div>
  )
}
