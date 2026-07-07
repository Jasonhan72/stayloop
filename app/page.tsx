'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { useT, type Lang } from '@/lib/i18n'

const GRAD = 'linear-gradient(135deg,#7C3AED,#2563EB)'

export default function HomePage() {
  const { lang } = useT()
  const zh = lang === 'zh'
  return (
    <div style={{ background: '#FAF7EE', color: '#171717' }}>
      <Header variant="transparent" />

      {/* ===== HERO ===== */}
      <section
        style={{ background: 'linear-gradient(180deg,#F2EEE5 0%,#E4EEE3 100%)' }}
        className="overflow-hidden"
      >
        <div className="mx-auto grid max-w-[1240px] items-center gap-10 px-5 pb-8 pt-16 sm:px-7 lg:grid-cols-[1.05fr_0.95fr] lg:px-12 lg:pt-20">
          <div className="min-w-0">
            <Eyebrow>{zh ? '为 AI 时代而生 · 多伦多租住操作系统' : 'Built for the AI era · Toronto rental OS'}</Eyebrow>
            <h1 className="mt-4 text-[30px] font-extrabold leading-[1.05] tracking-tightest sm:text-[52px] lg:text-[58px]">
              {zh ? (
                <>
                  在 AI 时代,
                  <br />
                  <span style={{ background: GRAD, WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                    不一样
                  </span>
                  的租房故事。
                </>
              ) : (
                <>
                  In the AI era,
                  <br />
                  a{' '}
                  <span style={{ background: GRAD, WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                    different
                  </span>
                  {' '}rental story.
                </>
              )}
            </h1>
            <p className="mt-5 max-w-[560px] text-[17px] leading-relaxed text-body-2">
              {zh ? (
                <>说出你想要的生活,AI 助手替你找房、尽调、申请、约看 —— 一路办到签约入住。<b className="text-body">每个关键决定,依然由你拍板。</b></>
              ) : (
                <>Describe the life you want — your AI agent finds homes, runs diligence, applies and books viewings, all the way to signing. <b className="text-body">Every key decision is still yours.</b></>
              )}
            </p>
            <div className="mt-6 flex flex-wrap gap-2.5">
              {PROMISES.map((m) => (
                <div key={m.h.en} className="flex items-center gap-2.5 rounded-lg border border-line-divider bg-white/80 px-3.5 py-2">
                  <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: GRAD }} />
                  <span className="text-[13px] font-bold tracking-tight">{m.h[lang]}</span>
                  <span className="hidden text-[12px] text-body-3 sm:inline">{m.l[lang]}</span>
                </div>
              ))}
            </div>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link href="/onboarding/welcome" className="sl-btn-primary !px-6 !py-[14px] !text-[15px]">
                {zh ? '和你的 AI 助手开始 →' : 'Start with your AI agent →'}
              </Link>
              <Link href="/listings" className="text-[14px] font-semibold text-body-2 underline-offset-4 hover:text-body hover:underline">
                {zh ? '先浏览房源' : 'Browse listings first'}
              </Link>
            </div>
          </div>
          <div className="min-w-0"><LunaChatDemo /></div>
        </div>
        <ChatInputBar />
      </section>

      {/* ===== TRUST STRIP ===== */}
      <section className="border-y border-line-divider bg-white">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-center gap-x-8 gap-y-3 px-5 py-5 sm:px-7 lg:px-12">
          <span className="font-mono text-[11px] font-bold uppercase tracking-eyebrow text-body-3">
            {zh ? '构建于可信的加拿大基础设施' : 'Built on trusted Canadian infrastructure'}
          </span>
          {['Persona', 'Flinks', 'Equifax', 'Stripe', 'Supabase'].map((b) => (
            <span key={b} className="text-[14px] font-bold text-body-2">{b}</span>
          ))}
        </div>
      </section>

      {/* ===== 01 · HOW IT WORKS ===== */}
      <Section
        n="01"
        kicker={zh ? '端到端流程' : 'END-TO-END FLOW'}
        title={zh ? <>从找房到入住,<br />一条路走完。</> : <>From search to move-in,<br />one path the whole way.</>}
        lead={zh ? '不用在平台之间来回跳。AI 助手在每一步陪着你,但每个关键决定,始终是你的。' : 'No bouncing between platforms. Your AI agent is with you at every step — but every key decision is always yours.'}
      >
        <div className="relative">
          <div className="absolute left-[10%] right-[10%] top-7 hidden h-[2px] lg:block" style={{ background: 'linear-gradient(90deg,#7C3AED,#94A3B8 55%,#047857)' }} />
          <div className="relative grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
            {JOURNEY.map((j, i) => (
              <div key={j.h.zh} className="flex flex-col items-center text-center lg:items-start lg:text-left">
                <JourneyIcon step={i} />
                <div className="mt-3 font-mono text-[10.5px] font-bold uppercase tracking-eyebrow text-brand">STEP 0{i + 1}</div>
                <h4 className="mt-1.5 text-[14.5px] font-bold leading-snug">{j.h[lang]}</h4>
                <p className="mt-1.5 text-[12px] leading-relaxed text-body-3">{j.b[lang]}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ===== 02 · WHY AI-NATIVE ===== */}
      <Section
        n="02"
        kicker={zh ? '为什么是 AI-NATIVE' : 'WHY AI-NATIVE'}
        title={zh ? <>交给你的 AI agent,<br />它从头跟到尾。</> : <>Hand it to your AI agent —<br />it follows through end to end.</>}
        lead={zh ? '你不用研究怎么用这个平台。把要的告诉 AI agent,找房、尽调、申请、起草租约,它从头跟到尾;你只在关键处拍板。' : "You don't have to learn how to use this platform. Tell the AI agent what you want — it searches, runs diligence, applies and drafts the lease end to end. You only make the calls that matter."}
        tint
      >
        <div className="grid gap-5 lg:grid-cols-3">
          {PILLARS.map((p) => (
            <div key={p.h.en} className="flex flex-col rounded-2xl border border-line-divider bg-white p-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl text-[18px] text-white" style={{ background: GRAD }}>
                {p.icon}
              </div>
              <h4 className="mt-4 text-[19px] font-extrabold tracking-tight">{p.h[lang]}</h4>
              <p className="mt-2 text-[13.5px] leading-relaxed text-body-2">{p.b[lang]}</p>
              <ul className="mt-4 space-y-2 border-t border-line-divider pt-4 text-[12.5px]">
                {p.proofs.map((pr) => (
                  <li key={pr.en} className="flex items-start gap-2">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="mt-[2px] flex-none"><path d="M20 6 9 17l-5-5" /></svg>
                    <span className="text-body-2">{pr[lang]}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      {/* ===== 03 · THREE ROLES ===== */}
      <RolesSection lang={lang} zh={zh} />

      {/* ===== 04 · DEEP SCREENING ===== */}
      <Section
        n="04"
        kicker={zh ? '深度尽调' : 'DEEP DILIGENCE'}
        title={zh ? <>不止给你一个数字,<br />而是给你完整的理由。</> : <>Not just a number,<br />but the full reasoning.</>}
        lead={zh ? '普通信用查询只丢给你一个 675。Stayloop 把它拆成 8 个独立维度,每一个都告诉你:我看了什么、得了多少分、为什么。' : "An ordinary credit check just hands you a 675. Stayloop breaks it into 8 independent dimensions, each telling you what was checked, the score, and why."}
        tint
      >
        <div className="grid items-center gap-10 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="grid gap-2.5 sm:grid-cols-2">
            {DIMS.map((d) => (
              <div key={d.k} className="flex items-center gap-3 rounded-[10px] border border-line-divider bg-white px-[15px] py-[13px]">
                <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg font-mono text-[13px] font-extrabold" style={{ background: d.bg, color: d.fg }}>{d.k}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-bold leading-tight">{d.name[lang]}</div>
                  <div className="font-mono text-[10.5px] text-body-3">{d.ev[lang]}</div>
                </div>
                <span className="font-mono text-[18px] font-bold" style={{ color: d.amber ? '#B45309' : '#047857' }}>{d.score}</span>
              </div>
            ))}
          </div>
          <div className="rounded-2xl border p-[34px] px-[30px] text-center" style={{ background: 'linear-gradient(180deg,#fff,#FBF8EE)', borderColor: '#047857' }}>
            <div className="font-mono text-[10px] font-bold uppercase tracking-eyebrowLg text-success">{zh ? 'STAYLOOP SCORE · 综合' : 'STAYLOOP SCORE · OVERALL'}</div>
            <div className="relative mx-auto my-5 h-[184px] w-[184px]">
              <svg viewBox="0 0 184 184" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
                <defs>
                  <linearGradient id="slgrd" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#10B981" />
                    <stop offset="1" stopColor="#047857" />
                  </linearGradient>
                </defs>
                <circle cx="92" cy="92" r="76" fill="none" stroke="#EFE9D8" strokeWidth="12" />
                <circle cx="92" cy="92" r="76" fill="none" stroke="url(#slgrd)" strokeWidth="12" strokeLinecap="round" strokeDasharray="477.5" strokeDashoffset="52.5" style={{ filter: 'drop-shadow(0 0 6px rgba(4,120,87,0.30))' }} />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
                <b className="font-mono text-[56px] font-bold tracking-tightest">89</b>
                <span className="mt-1.5 font-mono text-[10px] text-body-3">/ 100</span>
              </div>
            </div>
            <div className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-bold text-success" style={{ background: 'rgba(4,120,87,0.10)' }}>
              <span className="h-1.5 w-1.5 rounded-full bg-success" />{zh ? 'PROCEED · 高置信度' : 'PROCEED · high confidence'}
            </div>
            <div className="mt-[15px] font-mono text-[10px] leading-relaxed text-body-3">
              {zh ? '7 PASS · 1 INFO · 0 红旗' : '7 PASS · 1 INFO · 0 red flags'}<br />{zh ? '504/504 dp · 链上可审 0xa481…3c92' : '504/504 dp · on-chain audit 0xa481…3c92'}
            </div>
          </div>
        </div>
      </Section>

      {/* ===== CTA ===== */}
      <section className="bg-white">
        <div className="mx-auto max-w-[1240px] px-5 py-20 text-center sm:px-7 lg:px-12">
          <h2 className="mx-auto max-w-[720px] text-[26px] font-extrabold leading-tight tracking-tight sm:text-[42px]">
            {zh ? <>给你的 AI 助手起个名字,<br />让租房这件事,从此不一样。</> : <>Name your AI agent,<br />and renting is never the same again.</>}
          </h2>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link href="/onboarding/welcome" className="sl-btn-primary !px-7 !py-[14px] !text-[15px]">{zh ? '唤醒你的 AI 助手 →' : 'Wake up your AI agent →'}</Link>
            <Link href="/listings" className="rounded-[10px] border border-line-strong bg-white px-6 py-[13px] text-[14px] font-semibold text-body transition hover:border-brand hover:text-brand">{zh ? '先浏览房源 →' : 'Browse listings first →'}</Link>
          </div>
          <p className="mt-4 font-mono text-[11px] uppercase tracking-eyebrow text-body-3">
            {zh ? '免费开始 · 租客永远 $0 · 不影响信用分' : 'Free to start · always $0 for tenants · never touches your credit'}
          </p>
        </div>
      </section>

      <Footer />
    </div>
  )
}

/* ===================== building blocks ===================== */

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-body-3">{children}</div>
}

function Section({ n, kicker, title, lead, children, tint }: {
  n: string; kicker: string; title: React.ReactNode; lead: string; children: React.ReactNode; tint?: boolean
}) {
  return (
    <section style={tint ? { background: '#F2EEE5' } : undefined}>
      <div className="mx-auto max-w-[1240px] px-5 py-20 sm:px-7 lg:px-12">
        <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-brand">/ {n} · {kicker}</div>
        <h2 className="mt-3 text-[30px] font-extrabold leading-tight tracking-tight sm:text-[38px]">{title}</h2>
        <p className="mt-4 max-w-[820px] text-[15px] leading-relaxed text-body-2">{lead}</p>
        <div className="mt-9">{children}</div>
      </div>
    </section>
  )
}

function ChatInputBar() {
  const { lang } = useT()
  const zh = lang === 'zh'
  const prompts = zh
    ? ['预算 2800, 能养猫, 走路到 King 站...', '市中心一居, 有阳台, 即刻入住...', '安静两居, 离 UofT 步行 10 分钟...']
    : ['Budget $2,800, cats OK, walk to King...', 'Downtown 1-bed with balcony, move-in ready...', 'Quiet 2-bed, 10 min walk to UofT...']
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => setIdx((i) => (i + 1) % prompts.length), 3000)
    return () => clearInterval(timer)
  }, [prompts.length])

  return (
    <div className="mx-auto max-w-[720px] px-5 pb-12 sm:px-7 lg:px-12">
      <Link
        href="/onboarding/welcome"
        className="flex items-center gap-3 rounded-xl border border-line bg-white px-4 py-3.5 shadow-sm transition hover:border-brand hover:shadow-md"
      >
        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full" style={{ background: GRAD }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </span>
        <span className="flex-1 text-[14px] text-body-3 transition-opacity">
          {prompts[idx]}
          <span className="ml-0.5 inline-block h-[16px] w-[2px] animate-pulse align-text-bottom" style={{ background: '#7C3AED' }} />
        </span>
        <span className="rounded-lg bg-ink px-4 py-1.5 text-[13px] font-bold text-white">
          {zh ? '开始 →' : 'Start →'}
        </span>
      </Link>
    </div>
  )
}

function RolesSection({ lang, zh }: { lang: Lang; zh: boolean }) {
  const [active, setActive] = useState(0)
  const a = AGENTS[active]
  const s = SCENARIOS[active]

  return (
    <Section
      n="03"
      kicker={zh ? '三种角色' : 'THREE ROLES'}
      title={zh ? <>每个角色,<br />都有自己的 Agent。</> : <>Every role<br />has its own agent.</>}
      lead={zh ? '同一套信任引擎,三种人格。它们之间会对话、会交接,但各自只忠于自己的那个人。' : 'One trust engine, three personalities. They talk to each other and hand off work — but each is loyal to only one person.'}
    >
      <div className="mb-8 flex flex-wrap gap-2">
        {AGENTS.map((ag, i) => (
          <button
            key={ag.role.en}
            onClick={() => setActive(i)}
            className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-bold transition"
            style={
              i === active
                ? { background: '#fff', border: `1.5px solid ${ag.color}`, color: ag.color, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }
                : { background: 'transparent', border: '1.5px solid transparent', color: '#71717A' }
            }
          >
            <span className="h-2 w-2 rounded-full" style={{ background: ag.color }} />
            {ag.role[lang]}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Agent card */}
        <div className="sl-card flex flex-col overflow-hidden p-0">
          <div
            className="relative h-[160px] w-full"
            style={{ backgroundImage: `url(${a.img})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
          >
            <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg,transparent 30%,rgba(11,11,14,0.55))' }} />
            <span
              className="absolute left-[18px] top-4 z-[2] rounded-md px-2.5 py-[5px] font-mono text-[10px] font-bold uppercase tracking-eyebrow text-white"
              style={{ background: 'rgba(11,11,14,0.55)', backdropFilter: 'blur(4px)' }}
            >
              {a.role[lang]}
            </span>
            <span
              className="absolute bottom-[-18px] left-5 z-[2] h-[44px] w-[44px] rounded-[12px] border-[3px] border-white"
              style={{ background: a.av }}
            />
          </div>
          <div className="flex flex-1 flex-col px-6 pb-6 pt-7">
            <div className="flex items-baseline">
              <span className="text-[19px] font-extrabold tracking-tight">{a.name}</span>
              <span className="ml-1.5 text-[13px] font-semibold text-body-3">{a.sub[lang]}</span>
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-body-2">{a.desc[lang]}</p>
            <ul className="mt-4 space-y-2 text-[12.5px]">
              {a.points.map((pt) => (
                <li key={pt[lang]} className="flex items-start gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={a.color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="mt-[1px] flex-none"><path d="M20 6 9 17l-5-5" /></svg>
                  <span className="text-body-2">{pt[lang]}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Scenario card */}
        <div className="sl-card flex flex-col p-6">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 flex-shrink-0 rounded-full" style={{ backgroundImage: `url(${s.img})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
            <div>
              <div className="text-[17px] font-extrabold tracking-tight">{s.name}</div>
              <div className="font-mono text-[10.5px] text-body-3">{s.meta[lang]}</div>
            </div>
          </div>
          <p className="mt-4 text-[15px] font-semibold leading-[1.55] tracking-tight">"{s.quote[lang]}"</p>
          <div className="mt-5 space-y-3">
            <div className="grid grid-cols-[42px_1fr] gap-3 text-[12.5px] leading-[1.55] text-body-2">
              <span className="rounded-[5px] bg-[#F3EEE2] py-[3px] text-center font-mono text-[8.5px] font-bold text-body-3">{zh ? '之前' : 'BEFORE'}</span>
              <span>{s.before[lang]}</span>
            </div>
            <div className="grid grid-cols-[42px_1fr] gap-3 text-[12.5px] leading-[1.55] text-body-2">
              <span className="rounded-[5px] py-[3px] text-center font-mono text-[8.5px] font-bold" style={{ background: `${s.color}1a`, color: s.color }}>{zh ? '之后' : 'AFTER'}</span>
              <span>{s.after[lang]}</span>
            </div>
          </div>
          <div className="mt-auto flex items-center gap-2 border-t border-[#F0EBE0] pt-4">
            <span className="rounded-full px-2.5 py-1 font-mono text-[10px] font-bold" style={{ background: `${s.color}1a`, color: s.color }}>{s.with[lang]}</span>
            <span className="ml-auto font-mono text-[12px] font-bold text-success">{s.delta[lang]}</span>
          </div>
          <p className="mt-3 flex items-center gap-[7px] text-[13px] font-bold tracking-tight">
            <span style={{ color: '#B45309' }}>✦</span>{s.punch[lang]}
          </p>
        </div>
      </div>
    </Section>
  )
}

function JourneyIcon({ step }: { step: number }) {
  // Uniform treatment: white circle + ring; the stroke color walks the same
  // purple→green gradient as the connecting line, so the five steps read as
  // one system instead of three different icon styles.
  const COLORS = ['#7C3AED', '#6D51C6', '#5A6B9E', '#2F8A6B', '#047857']
  const icons: Record<number, React.ReactNode> = {
    0: <><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" /><circle cx="12" cy="12" r="4" /></>,
    1: <><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="8.5" cy="11" r="2" /><path d="M14 9h4M14 13h4M5.5 16h7" /></>,
    2: <><path d="M3 11l9-7 9 7" /><path d="M5 10v9h14v-9" /><path d="M10 19v-5h4v5" /></>,
    3: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />,
    4: <path d="M20 6 9 17l-5-5" />,
  }
  return (
    <span className="flex h-14 w-14 items-center justify-center rounded-full border border-line-divider bg-white ring-4 ring-[#F2EEE5]">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={COLORS[step]} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{icons[step]}</svg>
    </span>
  )
}

function LunaChatDemo() {
  const { lang } = useT()
  const zh = lang === 'zh'
  const LISTINGS = [
    { name: zh ? '阳光一居 · 高层景观' : 'Sunlit 1-bed · high-floor view', meta: zh ? 'King 站步行 9 min · 允许养猫' : '9 min walk to King · cats OK', match: 92, price: '$2,750', img: 'https://images.unsplash.com/photo-1554995207-c18c203602cb?w=400&q=80&fit=crop&auto=format' },
    { name: zh ? '复式 LOFT · 温哥街' : 'Duplex LOFT · Wellington St', meta: zh ? 'King 站步行 12 min · 允许养猫' : '12 min walk to King · cats OK', match: 88, price: '$2,800', img: 'https://images.unsplash.com/photo-1484154218962-a197022b5858?w=400&q=80&fit=crop&auto=format' },
  ]
  return (
    <div className="rounded-2xl p-5 text-[13px] shadow-card" style={{ background: '#0E1320', color: '#E5E7EB' }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="h-8 w-8 rounded-full" style={{ background: 'linear-gradient(135deg,#C4B5FD,#7C3AED)' }} />
          <span className="text-[14px] font-bold">AI Agent</span>
        </div>
        <span className="flex items-center gap-1.5 font-mono text-[10.5px]" style={{ color: '#34D399' }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: '#34D399' }} /> {zh ? '在线 · 读取你的记忆' : 'Online · reading your memory'}
        </span>
      </div>
      <div className="mt-4 flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-tr-sm px-3.5 py-2.5 leading-relaxed text-white" style={{ background: '#2563EB' }}>
          {zh ? '预算 2800 以内,离 King 站走路 15 分钟,能养猫的一居。' : 'A 1-bed under $2,800, within a 15-min walk of King station, cats allowed.'}
        </div>
      </div>
      <div className="mt-3 rounded-2xl rounded-tl-sm px-3.5 py-2.5 leading-relaxed" style={{ background: '#1B2230' }}>
        {zh ? <>好的。我按你之前说的<b>采光要好</b>也一起筛了,3 套符合,都允许养宠:</> : <>Got it. I also filtered for <b>good natural light</b> like you mentioned before — 3 match, all pet-friendly:</>}
      </div>
      <div className="mt-3 space-y-2.5">
        {LISTINGS.map((l) => (
          <div key={l.name} className="flex items-center gap-3 rounded-xl p-2.5" style={{ background: '#161D2B' }}>
            <div className="h-14 w-16 flex-shrink-0 rounded-lg" style={{ backgroundImage: `url(${l.img})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12.5px] font-bold text-white">{l.name}</div>
              <div className="font-mono text-[10.5px]" style={{ color: '#94A3B8' }}>{l.meta}</div>
              <div className="mt-0.5 font-mono text-[10.5px]" style={{ color: '#A78BFA' }}>▶ {l.match}{zh ? '% 匹配你的偏好' : '% match to your preferences'}</div>
            </div>
            <div className="flex-shrink-0 font-mono text-[14px] font-bold text-white">{l.price}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-2xl rounded-tl-sm px-3.5 py-2.5 leading-relaxed" style={{ background: '#1B2230' }}>
        {zh ? <>要我帮你一键申请第一套吗?你的 Passport 已是 <b>认证 3 级</b>,无需重填资料。</> : <>Want me to one-click apply to the first one? Your Passport is already <b>Tier 3</b> — no need to re-enter anything.</>}
      </div>
      <div className="mt-3 flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-tr-sm px-3.5 py-2.5 leading-relaxed text-white" style={{ background: '#2563EB' }}>
          {zh ? '第一套,帮我申请。我去开会了。' : "Apply to the first one for me. I'm heading into a meeting."}
        </div>
      </div>
      <div className="mt-3 rounded-xl p-3" style={{ background: '#11192563', border: '1px solid #233047' }}>
        <div className="flex items-center gap-1.5 text-[12px] font-bold" style={{ color: '#34D399' }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: '#34D399' }} /> {zh ? '已接手 · 后台持续执行' : 'On it · running in the background'}
        </div>
        <div className="mt-1.5 font-mono text-[10.5px]" style={{ color: '#94A3B8' }}>{zh ? '提交申请 · 跟进房东 · 协调看房时间' : 'Submit application · follow up with landlord · coordinate viewing'}</div>
        <div className="mt-1 text-[11.5px]" style={{ color: '#94A3B8' }}>{zh ? '有进展用「邮件 / 短信」通知你 —— 你不用守着。' : "I'll ping you by email / SMS on any update — no need to watch."}</div>
      </div>
    </div>
  )
}

/* ===================== data ===================== */

type LS = Record<Lang, string>

const PROMISES: { h: LS; l: LS }[] = [
  { h: { zh: '它记得你', en: 'It remembers you' }, l: { zh: '偏好说一次,永远记得', en: 'say it once, remembered forever' } },
  { h: { zh: '它替你跑', en: 'It runs for you' }, l: { zh: '你睡觉时,它在工作', en: 'it works while you sleep' } },
  { h: { zh: '你只拍板', en: 'You make the calls' }, l: { zh: '关键决定,永远归你', en: 'every key decision stays yours' } },
]

const PILLARS: { icon: React.ReactNode; h: LS; b: LS; proofs: LS[] }[] = [
  {
    icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a5 5 0 0 1 5 5c0 1.5-.5 2.5-1.5 3.5S14 14 14 16h-4c0-2-.5-3.5-1.5-4.5S7 9.5 7 8a5 5 0 0 1 5-5z" /><path d="M10 20h4M11 23h2" /></svg>,
    h: { zh: '它认识你', en: 'It knows you' },
    b: { zh: '偏好只说一次:预算、猫、采光、通勤 —— 它都记住,下次开口不用从头解释。', en: 'Say your preferences once — budget, cats, light, commute. It remembers, so you never explain from scratch again.' },
    proofs: [
      { zh: '对话找房,不用填表', en: 'Chat to search — no forms' },
      { zh: '资料验一次,处处复用', en: 'Verify once, reuse everywhere' },
    ],
  },
  {
    icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" /></svg>,
    h: { zh: '它替你跑', en: 'It runs for you' },
    b: { zh: '布置完就走:筛房、尽调、申请、跟进,它在后台干到底,有进展才来找你。', en: 'Assign it and walk away: it filters, screens, applies and follows up in the background — and only pings you on progress.' },
    proofs: [
      { zh: '30 分钟的纠结,变成 30 秒的「同意」', en: '30 minutes of agonizing becomes a 30-second "Approve"' },
      { zh: '你睡觉时,它还在工作', en: 'It keeps working while you sleep' },
    ],
  },
  {
    icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></svg>,
    h: { zh: '你只拍板', en: 'You make the calls' },
    b: { zh: '它提案,你决定。对外分享资料、提交申请、签约 —— 每个关键动作都先经你点头,且留痕可审。', en: 'It proposes, you decide. Sharing data, submitting, signing — every key action waits for your nod, and every step is logged.' },
    proofs: [
      { zh: 'RTA / OHRC 合规自动把关', en: 'RTA / OHRC compliance on autopilot' },
      { zh: '每一步留痕,随时可查', en: 'Every step audited, reviewable anytime' },
    ],
  },
]

const AGENTS: { name: string; role: LS; sub: LS; color: string; av: string; img: string; desc: LS; points: LS[] }[] = [
  { name: 'AI Agent', role: { zh: 'TENANT · 租客', en: 'TENANT' }, sub: { zh: '租客助手', en: 'Tenant assistant' }, color: '#7C3AED', av: 'radial-gradient(circle at 35% 30%,#C4B5FD,#7C3AED 75%)', img: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=700&q=80&fit=crop&auto=format', desc: { zh: '验证一次,处处通行。替你找房、比价、约看、一键申请,资料只在你点头时才分享。', en: 'Verify once, go anywhere. Searches, compares, books viewings and one-click applies — your data is shared only when you say so.' }, points: [{ zh: '对话式找房 + 主动匹配', en: 'Conversational search + proactive matching' }, { zh: '可复用 Rental Passport', en: 'Reusable Rental Passport' }, { zh: '缴租 · 维修 · 续约全程托管', en: 'Rent, maintenance & renewal fully managed' }] },
  { name: 'AI Agent', role: { zh: 'LANDLORD · 房东', en: 'LANDLORD' }, sub: { zh: '房东助手', en: 'Landlord assistant' }, color: '#047857', av: 'radial-gradient(circle at 35% 30%,#6EE7B7,#047857 75%)', img: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=700&q=80&fit=crop&auto=format', desc: { zh: '是流水线,不是收件箱。替你整理申请、同步尽调、起草租约 —— 决定权始终在你手里。', en: 'A pipeline, not an inbox. Organizes applications, runs diligence and drafts leases — the decision is always yours.' }, points: [{ zh: '申请人 Pipeline 看板', en: 'Applicant pipeline board' }, { zh: '8 Engine 自动尽调 + 评分', en: '8-engine automated diligence + scoring' }, { zh: '合规教练 · 租约自动起草', en: 'Compliance coach · auto lease drafting' }] },
  { name: 'AI Agent', role: { zh: 'AGENT · 经纪', en: 'AGENT' }, sub: { zh: '经纪助手', en: 'Agent assistant' }, color: '#2563EB', av: 'radial-gradient(circle at 35% 30%,#93C5FD,#2563EB 75%)', img: 'https://images.unsplash.com/photo-1484154218962-a197022b5858?w=700&q=80&fit=crop&auto=format', desc: { zh: '把杂活交给系统,把关系留给人。替你整理客户、准备材料、安排看房和跟进。', en: 'Leave the busywork to the system, the relationships to you. Organizes clients, prepares materials, and schedules viewings and follow-ups.' }, points: [{ zh: '客户与房源材料整理', en: 'Client & listing material organization' }, { zh: '看房 Live · 现场记录', en: 'Live viewings · on-site notes' }, { zh: '佣金拆分 · 团队协作', en: 'Commission splits · team collaboration' }] },
]

const SCENARIOS: { name: string; role: LS; color: string; meta: LS; img: string; quote: LS; before: LS; after: LS; with: LS; delta: LS; punch: LS }[] = [
  { name: 'Mia Chen', role: { zh: '租客 · TENANT', en: 'TENANT' }, color: '#7C3AED', meta: { zh: '27 · 软件工程师 · 新移民', en: '27 · software engineer · newcomer' }, img: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=700&q=80&fit=crop&auto=format', quote: { zh: '没有加拿大信用记录,我到底该怎么租房?', en: 'With no Canadian credit history, how am I supposed to rent at all?' }, before: { zh: '信用空白,已被拒 3 次,3 天后必须退房。', en: 'No credit file, rejected 3 times, must move out in 3 days.' }, after: { zh: '90 秒验明身份,中文读懂租约,35 分钟签约入住。', en: 'Verified identity in 90s, explained the lease in Chinese, signed and moved in within 35 minutes.' }, with: { zh: 'AI Agent 陪同', en: 'with AI Agent' }, delta: { zh: 'Score 60 → 91', en: 'Score 60 → 91' }, punch: { zh: '第二次,比第一次更轻松。', en: 'The second time was even easier than the first.' } },
  { name: 'Sarah Wang', role: { zh: '房东 · LANDLORD', en: 'LANDLORD' }, color: '#047857', meta: { zh: '41 · 会计师 · 2 套投资公寓', en: '41 · accountant · 2 investment condos' }, img: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=700&q=80&fit=crop&auto=format', quote: { zh: '做决定前要查、要比,还怕踩 RTA 的雷。', en: "Before deciding I have to research, compare — and worry about tripping over the RTA." }, before: { zh: '每月空置损失 $2,900,深夜被报修打扰,合规压力大。', en: '$2,900 lost to vacancy each month, late-night maintenance calls, constant compliance pressure.' }, after: { zh: '4 分钟重做房源、跑完尽调,关键时刻只按「同意」。', en: 'Rebuilt the listing and ran full diligence in 4 minutes; at the key moment she just pressed "Approve."' }, with: { zh: 'AI Agent 协同', en: 'with AI Agent' }, delta: { zh: '30 分钟 → 30 秒', en: '30 min → 30 sec' }, punch: { zh: '决定权,始终在你手里。', en: 'The decision is always in your hands.' } },
  { name: 'David Park', role: { zh: '经纪 · AGENT', en: 'AGENT' }, color: '#2563EB', meta: { zh: '35 · 持牌经纪 · RECO 6 年', en: '35 · licensed agent · 6 years RECO' }, img: 'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=700&q=80&fit=crop&auto=format', quote: { zh: '不是没机会,是时间被行政碎片化了。', en: "It's not a lack of opportunity — my time gets shredded by admin." }, before: { zh: '70% 时间耗在行政,收入不稳,客户容易跟丢。', en: '70% of his time went to admin, income was unstable, and clients slipped away.' }, after: { zh: '编排任务、当晚结算,他只做带看与专业判断。', en: 'Tasks orchestrated and settled same night; he only handles showings and professional judgment.' }, with: { zh: 'AI Agent + Beacon', en: 'AI Agent + Beacon' }, delta: { zh: '时薪 $25 → $43', en: 'Hourly $25 → $43' }, punch: { zh: '剥离行政,放大专业。', en: 'Strip away admin, amplify expertise.' } },
]

const JOURNEY: { h: LS; b: LS }[] = [
  { h: { zh: '为 AI 起名', en: 'Name your AI' }, b: { zh: '起任何你喜欢的名字。从这一刻起,它只为你一个人。', en: 'Whatever name you like. From this moment, it works for you alone.' } },
  { h: { zh: '验证一次,处处通行', en: 'Verify once, go anywhere' }, b: { zh: '护照加活体一次过,从此不再交一叠 PDF · 不影响信用分。', en: 'Passport plus liveness in one pass — never hand over a stack of PDFs again · never touches your credit.' } },
  { h: { zh: '浏览房源', en: 'Browse listings' }, b: { zh: '地图加卡片,AI 主动按你的需求筛过 · 看中就直接问。', en: 'Map plus cards, pre-filtered by AI to your needs · see one you like and just ask.' } },
  { h: { zh: '一键申请', en: 'One-click apply' }, b: { zh: '租房护照直接复用 · AI 自动跑完尽调 · 即出 Stayloop Score。', en: 'Reuse your Rental Passport directly · AI runs full diligence · instant Stayloop Score.' } },
  { h: { zh: '入住,安心长住', en: 'Move in, settle in' }, b: { zh: '缴租、维修、续约、退租,AI 全程替你照看。', en: 'Rent, maintenance, renewal and move-out — AI looks after it all.' } },
]

const DIMS: { k: string; name: LS; ev: LS; score: number; bg: string; fg: string; amber?: boolean }[] = [
  { k: 'ID', name: { zh: 'Identity · 身份核验', en: 'Identity · identity verification' }, ev: { zh: '护照 · 活体 · 设备 · 32 dp', en: 'Passport · liveness · device · 32 dp' }, score: 99, bg: 'rgba(33,150,243,0.10)', fg: '#1E88E5' },
  { k: '$', name: { zh: 'Income · 收入流水', en: 'Income · cash flow' }, ev: { zh: '工资单 · 银行 · T4 · 48 dp', en: 'Pay stubs · bank · T4 · 48 dp' }, score: 92, bg: 'rgba(76,175,80,0.10)', fg: '#2E7D32' },
  { k: 'H', name: { zh: 'History · 租住历史', en: 'History · rental history' }, ev: { zh: '推荐信 · 反向核 · 52 dp', en: 'References · reverse-check · 52 dp' }, score: 96, bg: 'rgba(156,39,176,0.10)', fg: '#7B1FA2' },
  { k: 'F', name: { zh: 'Fraud · 文档反欺诈', en: 'Fraud · document anti-fraud' }, ev: { zh: '字体 · PDF 编辑器 · 64 dp', en: 'Fonts · PDF editors · 64 dp' }, score: 94, bg: 'rgba(255,152,0,0.10)', fg: '#E65100' },
  { k: 'B', name: { zh: 'Behavior · 行为信号', en: 'Behavior · behavioral signals' }, ev: { zh: '完整度 · 一致性 · 26 dp', en: 'Completeness · consistency · 26 dp' }, score: 88, bg: 'rgba(96,125,139,0.10)', fg: '#455A64' },
  { k: 'X', name: { zh: 'X-Ref · 双征信', en: 'X-Ref · dual credit bureaus' }, ev: { zh: 'Equifax + TransUnion · 76 dp', en: 'Equifax + TransUnion · 76 dp' }, score: 90, bg: 'rgba(121,85,72,0.10)', fg: '#5D4037' },
  { k: '⚖', name: { zh: 'LTB / Court · 法庭裁定', en: 'LTB / Court · court rulings' }, ev: { zh: '14 trib · CanLII · OSB · 122 dp', en: '14 trib · CanLII · OSB · 122 dp' }, score: 100, bg: 'rgba(124,58,237,0.10)', fg: '#7C3AED' },
  { k: '⛓', name: { zh: 'Relations · 关联图谱', en: 'Relations · relationship graph' }, ev: { zh: '5 一度 · 14 二度 · 84 dp', en: '5 first-degree · 14 second-degree · 84 dp' }, score: 82, bg: 'rgba(124,58,237,0.10)', fg: '#7C3AED', amber: true },
]
