'use client'

// V5.3 homepage — "为 AI 时代而生的租房方式".
// Faithful to V5.3/landing.html: AI-native hero + Luna chat demo + trust strip
// + why-AI-native pillars + three agents + real scenarios + journey +
// 8-dimension Stayloop Score + products + CTA.
import Link from 'next/link'
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
        <div className="mx-auto grid max-w-[1240px] items-center gap-10 px-5 pb-16 pt-16 sm:px-7 lg:grid-cols-[1.05fr_0.95fr] lg:px-12 lg:pt-20">
          <div>
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
                <>别人还在刷房源、填表格、传 PDF。你只要说出想要的生活 —— 你的专属 AI 助手就替你
                找房、尽调、申请、约看,一路办到签约入住。<b className="text-body">每个关键决定,依然由你拍板。</b></>
              ) : (
                <>Others are still scrolling listings, filling forms, and uploading PDFs. Just describe the life you want — your personal AI agent
                finds homes, runs diligence, applies and books viewings, all the way to signing and move-in. <b className="text-body">Every key decision is still yours to make.</b></>
              )}
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link href="/listings" className="sl-btn-primary !px-6 !py-[14px] !text-[15px]">
                {zh ? '浏览房源 · 无需登录 →' : 'Browse listings · no login →'}
              </Link>
              <Link href="/tenant/agent" className="text-[14px] font-semibold text-brand underline-offset-4 hover:underline">
                {zh ? 'AI 助理 →' : 'AI assistant →'}
              </Link>
            </div>
            <p className="mt-5 font-mono text-[11.5px] leading-relaxed text-body-3">
              {zh ? '创建账号后:给你的 AI 助手起个名字 → 90 秒验证身份 → 开始找房' : 'After sign-up: name your AI agent → verify your identity in 90s → start searching'}
            </p>
          </div>

          <HeroVisual />
        </div>
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

      {/* ===== 01 · WHY AI-NATIVE ===== */}
      <Section n="01" kicker={zh ? '为什么是 AI-NATIVE' : 'WHY AI-NATIVE'} title={zh ? <>现在开始,租房的事,<br />交给你的 AI agent 来处理。</> : <>From now on, leave the<br />renting to your AI agent.</>}
        lead={zh ? '你不用研究怎么用这个平台。每个人都有自己的 AI agent —— 租客的 Luna、房东的 Logic。把要的告诉它,找房、尽调、申请、起草租约,它从头跟到尾;你只在关键处拍板。' : 'You don’t have to learn how to use this platform. Everyone gets their own AI agent — Luna for tenants, Logic for landlords. Tell it what you want, and it searches, runs diligence, applies and drafts the lease end to end — you only make the calls that matter.'}>
        <div className="grid items-start gap-10 lg:grid-cols-[1fr_minmax(380px,440px)] lg:items-center">
          {/* Left — pillars as a vertical numbered list (matches V5.3 design) */}
          <div className="space-y-6">
            {PILLARS.map((p) => (
              <div key={p.n} className="flex gap-4">
                <div className="font-mono text-[13px] font-bold text-brand">{p.n}</div>
                <div>
                  <h4 className="text-[16px] font-bold leading-snug">{p.h[lang]}</h4>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-body-2">{p.b[lang]}</p>
                </div>
              </div>
            ))}
          </div>
          {/* Right — Luna chat demo (dark panel, matches V5.3 design) */}
          <LunaChatDemo />
        </div>
      </Section>

      {/* ===== 02 · WHAT IS STAYLOOP ===== */}
      <Section n="02" kicker={zh ? 'STAYLOOP 是什么' : 'WHAT IS STAYLOOP'} title={zh ? <>一个端到端的<br />租住操作系统。</> : <>An end-to-end<br />rental operating system.</>}
        lead={zh ? '不是又一个房源网站,也不只是一次信用查询。Stayloop 把找房、申请、尽调、签约、入住、维修、续约、退租,串成一条 AI 全程陪你走完的链路。' : 'Not just another listings site, and not just a one-off credit check. Stayloop links search, application, diligence, signing, move-in, maintenance, renewal and move-out into one chain that AI walks with you end to end.'} tint>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FeatureCard h={zh ? '一处办完一整段租住' : 'A whole tenancy, done in one place'} b={zh ? '找房、申请、尽调、签约、入住、续约、退租、纠纷,全在一个地方。不用再在十个平台之间来回跳。' : 'Search, apply, diligence, sign, move in, renew, move out and disputes — all in one place. No more jumping between ten platforms.'} />
          <FeatureCard h={zh ? '三种角色 · 三个 AI' : 'Three roles · three AIs'} b={zh ? '租客 Luna · 房东 Logic · 经纪 Brief。每个 AI 只为你一个人工作,记得你的全部上下文。' : 'Luna for tenants · Logic for landlords · Brief for agents. Each AI works for you alone and remembers your full context.'} />
          <FeatureCard h={zh ? '看得见来源的评分' : 'A score you can trace'} b={zh ? 'Stayloop Score 不是黑箱风险分,而是由真实证据加权算出的可信度。每一分都能点开看到它从哪来。' : 'The Stayloop Score isn’t a black-box risk number — it’s trust weighted from real evidence. Open any point and see exactly where it came from.'} />
          <FeatureCard h={zh ? '合规 · 可审计' : 'Compliant · auditable'} b={zh ? '符合本地法律 · 软查不影响信用 · 每次查询链上留痕 · 每一个决定都能回溯到原始证据。' : 'Compliant with local law · soft checks never touch your credit · every query logged on-chain · every decision traceable to its source evidence.'} />
        </div>
      </Section>

      {/* ===== 03 · THREE AGENTS ===== */}
      <Section n="03" kicker={zh ? '三个 AI 助手' : 'THREE AI ASSISTANTS'} title={zh ? <>每个角色,<br />都有自己的 Agent。</> : <>Every role<br />has its own agent.</>}
        lead={zh ? '同一套信任引擎,三种人格。它们之间会对话、会交接,但各自只忠于自己的那个人。' : 'One trust engine, three personalities. They talk to each other and hand off work — but each is loyal to only one person.'}>
        <div className="grid gap-[18px] lg:grid-cols-3">
          {AGENTS.map((a) => (
            <div key={a.name} className="sl-card flex flex-col overflow-hidden p-0">
              {/* photo with role tag + gradient squircle avatar */}
              <div
                className="relative h-[178px] w-full"
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
                  className="absolute bottom-[-22px] left-[22px] z-[2] h-[52px] w-[52px] rounded-[14px] border-[3px] border-white"
                  style={{ background: a.av }}
                />
              </div>
              <div className="flex flex-1 flex-col px-6 pb-[26px] pt-[34px]">
                <div className="flex items-baseline">
                  <span className="text-[21px] font-extrabold tracking-tight">{a.name}</span>
                  <span className="ml-1.5 text-[14px] font-semibold text-body-3">{a.sub[lang]}</span>
                </div>
                <p className="mt-2.5 text-[13.5px] leading-relaxed text-body-2">{a.desc[lang]}</p>
                <ul className="mt-4 space-y-2.5 text-[12.5px]">
                  {a.points.map((pt) => (
                    <li key={pt[lang]} className="flex items-start gap-2.5">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={a.color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="mt-[1px] flex-none"><path d="M20 6 9 17l-5-5" /></svg>
                      <span className="text-body-2">{pt[lang]}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ===== 04 · REAL SCENARIOS ===== */}
      <Section n="04" kicker={zh ? '真实场景' : 'REAL SCENARIOS'} title={zh ? <>三个人,<br />三段被 AI 改写的租住。</> : <>Three people,<br />three tenancies rewritten by AI.</>}
        lead={zh ? '同一套引擎,三种人生。把他们的故事压缩成一分钟 —— 看看 AI-native 到底改变了什么。' : 'One engine, three lives. Their stories compressed into a minute — see what AI-native actually changes.'} tint>
        <div className="grid gap-[18px] lg:grid-cols-3">
          {SCENARIOS.map((s) => (
            <div key={s.name} className="sl-card flex flex-col overflow-hidden p-0">
              {/* photo with role pill + name/meta overlaid */}
              <div
                className="relative h-[186px] w-full"
                style={{ backgroundImage: `url(${s.img})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
              >
                <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg,transparent 35%,rgba(11,11,14,0.62))' }} />
                <span
                  className="absolute left-4 top-[14px] z-[2] rounded-md px-2.5 py-[5px] font-mono text-[9.5px] font-bold uppercase tracking-eyebrow text-white"
                  style={{ background: `${s.color}eb` }}
                >
                  {s.role[lang]}
                </span>
                <div className="absolute bottom-[14px] left-[18px] right-[18px] z-[2]">
                  <div className="text-[21px] font-extrabold tracking-tight text-white">{s.name}</div>
                  <div className="mt-[3px] font-mono text-[10px] text-white/85">{s.meta[lang]}</div>
                </div>
              </div>
              <div className="flex flex-1 flex-col p-[22px]">
                <p className="text-[15px] font-semibold leading-[1.55] tracking-tight">“{s.quote[lang]}”</p>
                <div className="mt-[18px] space-y-3">
                  <div className="grid grid-cols-[42px_1fr] gap-[11px] text-[12.5px] leading-[1.55] text-body-2">
                    <span className="rounded-[5px] bg-[#F3EEE2] py-[3px] text-center font-mono text-[8.5px] font-bold text-body-3">{zh ? '之前' : 'BEFORE'}</span>
                    <span>{s.before[lang]}</span>
                  </div>
                  <div className="grid grid-cols-[42px_1fr] gap-[11px] text-[12.5px] leading-[1.55] text-body-2">
                    <span className="rounded-[5px] py-[3px] text-center font-mono text-[8.5px] font-bold" style={{ background: `${s.color}1a`, color: s.color }}>{zh ? '之后' : 'AFTER'}</span>
                    <span>{s.after[lang]}</span>
                  </div>
                </div>
                <div className="mt-auto flex items-center gap-2 border-t border-[#F0EBE0] pt-4">
                  <span className="rounded-full px-2.5 py-[5px] font-mono text-[10px] font-bold" style={{ background: `${s.color}1a`, color: s.color }}>{s.with[lang]}</span>
                  <span className="ml-auto font-mono text-[12px] font-bold text-success">{s.delta[lang]}</span>
                </div>
                <p className="mt-3.5 flex items-center gap-[7px] text-[13px] font-bold tracking-tight">
                  <span style={{ color: '#B45309' }}>✦</span>{s.punch[lang]}
                </p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ===== 05 · JOURNEY ===== */}
      <Section n="05" kicker={zh ? '端到端流程' : 'END-TO-END FLOW'} title={zh ? <>从找房到入住,<br />一条路走完。</> : <>From search to move-in,<br />one path the whole way.</>}
        lead={zh ? '不用在平台之间来回跳。AI 助手在每一步陪着你,但每个关键决定,始终是你的。' : 'No bouncing between platforms. Your AI agent is with you at every step — but every key decision is always yours.'}>
        <div className="relative">
          {/* connecting line (desktop) — purple → green progression */}
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

      {/* ===== 06 · DEEP SCREENING ===== */}
      <Section n="06" kicker={zh ? '深度尽调' : 'DEEP DILIGENCE'} title={zh ? <>不止给你一个数字,<br />而是给你完整的理由。</> : <>Not just a number,<br />but the full reasoning.</>}
        lead={zh ? '普通信用查询只丢给你一个 675。Stayloop 把它拆成 8 个独立维度,每一个都告诉你:我看了什么、得了多少分、为什么。AI 负责核查,你负责判断。' : 'An ordinary credit check just hands you a 675. Stayloop breaks it into 8 independent dimensions, each telling you what was checked, the score, and why. AI does the verification; you make the judgment.'} tint>
        <div className="grid items-center gap-10 lg:grid-cols-[1.15fr_0.85fr]">
          {/* left — 8 dimensions, 2 columns, per-dimension colored badges */}
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
          {/* right — donut score card */}
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

      {/* ===== 07 · PRODUCTS ===== */}
      <Section n="07" kicker={zh ? '一套引擎 · 三个产品' : 'ONE ENGINE · THREE PRODUCTS'} title={zh ? <>同一份信任,<br />处处可读。</> : <>One source of trust,<br />readable everywhere.</>}
        lead={zh ? '在 App 里创建的护照,能被 Console 读取、被 Trust API 调用 —— 验证一次,处处复用。' : 'A Passport created in the App can be read by the Console and called by the Trust API — verify once, reuse everywhere.'}>
        <div className="grid gap-4 md:grid-cols-3">
          {PRODUCTS.map((p) => (
            <div key={p.name} className="sl-card flex flex-col p-7">
              <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-brand">{p.tag}</div>
              <h3 className="mt-2 text-[20px] font-bold tracking-tight">{p.name}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-body-2">{p.desc[lang]}</p>
              <ul className="mt-4 space-y-2 border-t border-line-divider pt-4 text-[13px]">
                {p.points.map((pt) => (
                  <li key={pt[lang]} className="flex items-start gap-2">
                    <span className="mt-[2px] text-success">✓</span>
                    <span className="font-mono text-[12px] text-body-2">{pt[lang]}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      {/* ===== CTA ===== */}
      <section className="bg-white">
        <div className="mx-auto max-w-[1240px] px-5 py-20 text-center sm:px-7 lg:px-12">
          <h2 className="mx-auto max-w-[720px] text-[26px] font-extrabold leading-tight tracking-tight sm:text-[42px]">
            {zh ? <>给你的 AI 助手起个名字,<br />让租房这件事,从此不一样。</> : <>Name your AI agent,<br />and renting is never the same again.</>}
          </h2>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link href="/onboarding/welcome" className="sl-btn-primary !px-7 !py-[14px] !text-[15px]">{zh ? '开始 · 90 秒身份验证' : 'Start · 90s identity check'}</Link>
            <Link href="/listings" className="rounded-[10px] border border-line-strong bg-white px-6 py-[13px] text-[14px] font-semibold text-body transition hover:border-brand hover:text-brand">{zh ? '先浏览房源 →' : 'Browse listings first →'}</Link>
          </div>
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

function JourneyIcon({ step }: { step: number }) {
  // 0 Luna sphere · 1 ID · 2 house · 3 lightning · 4 green check (matches design)
  const ic = (path: React.ReactNode) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{path}</svg>
  )
  if (step === 0)
    return <span className="h-14 w-14 rounded-full ring-4 ring-[#F2EEE5]" style={{ background: 'linear-gradient(135deg,#C4B5FD,#7C3AED)' }} />
  if (step === 4)
    return (
      <span className="flex h-14 w-14 items-center justify-center rounded-full ring-4 ring-[#F2EEE5]" style={{ background: 'linear-gradient(135deg,#6EE7B7,#047857)' }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
      </span>
    )
  const icons: Record<number, React.ReactNode> = {
    1: <><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="8.5" cy="11" r="2" /><path d="M14 9h4M14 13h4M5.5 16h7" /></>,
    2: <><path d="M3 11l9-7 9 7" /><path d="M5 10v9h14v-9" /><path d="M10 19v-5h4v5" /></>,
    3: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />,
  }
  return (
    <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white ring-4 ring-[#F2EEE5] border border-line-divider">
      {ic(icons[step])}
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
      {/* header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="h-8 w-8 rounded-full" style={{ background: 'linear-gradient(135deg,#C4B5FD,#7C3AED)' }} />
          <span className="text-[14px] font-bold">Luna</span>
        </div>
        <span className="flex items-center gap-1.5 font-mono text-[10.5px]" style={{ color: '#34D399' }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: '#34D399' }} /> {zh ? '在线 · 读取你的记忆' : 'Online · reading your memory'}
        </span>
      </div>

      {/* user bubble */}
      <div className="mt-4 flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-tr-sm px-3.5 py-2.5 leading-relaxed text-white" style={{ background: '#2563EB' }}>
          {zh ? '预算 2800 以内,离 King 站走路 15 分钟,能养猫的一居。' : 'A 1-bed under $2,800, within a 15-min walk of King station, cats allowed.'}
        </div>
      </div>

      {/* luna bubble */}
      <div className="mt-3 rounded-2xl rounded-tl-sm px-3.5 py-2.5 leading-relaxed" style={{ background: '#1B2230' }}>
        {zh ? <>好的。我按你之前说的<b>采光要好</b>也一起筛了,3 套符合,都允许养宠:</> : <>Got it. I also filtered for <b>good natural light</b> like you mentioned before — 3 match, all pet-friendly:</>}
      </div>

      {/* listing cards */}
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

      {/* luna bubble */}
      <div className="mt-3 rounded-2xl rounded-tl-sm px-3.5 py-2.5 leading-relaxed" style={{ background: '#1B2230' }}>
        {zh ? <>要我帮你一键申请第一套吗?你的 Passport 已是 <b>认证 3 级</b>,无需重填资料。</> : <>Want me to one-click apply to the first one? Your Passport is already <b>Tier 3</b> — no need to re-enter anything.</>}
      </div>

      {/* user bubble */}
      <div className="mt-3 flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-tr-sm px-3.5 py-2.5 leading-relaxed text-white" style={{ background: '#2563EB' }}>
          {zh ? '第一套,帮我申请。我去开会了。' : 'Apply to the first one for me. I’m heading into a meeting.'}
        </div>
      </div>

      {/* status */}
      <div className="mt-3 rounded-xl p-3" style={{ background: '#11192563', border: '1px solid #233047' }}>
        <div className="flex items-center gap-1.5 text-[12px] font-bold" style={{ color: '#34D399' }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: '#34D399' }} /> {zh ? '已接手 · 后台持续执行' : 'On it · running in the background'}
        </div>
        <div className="mt-1.5 font-mono text-[10.5px]" style={{ color: '#94A3B8' }}>{zh ? '提交申请 · 跟进房东 · 协调看房时间' : 'Submit application · follow up with landlord · coordinate viewing'}</div>
        <div className="mt-1 text-[11.5px]" style={{ color: '#94A3B8' }}>{zh ? '有进展用「邮件 / 短信」通知你 —— 你不用守着。' : 'I’ll ping you by email / SMS on any update — no need to watch.'}</div>
      </div>
    </div>
  )
}

function FeatureCard({ h, b, tag }: { h: string; b: string; tag?: string }) {
  return (
    <div className="sl-card p-6">
      {tag && <div className="mb-2 inline-flex rounded-md bg-brand/10 px-2 py-[3px] font-mono text-[10px] font-bold text-brand">{tag}</div>}
      <h4 className="text-[16px] font-bold">{h}</h4>
      <p className="mt-2 text-[13px] leading-relaxed text-body-2">{b}</p>
    </div>
  )
}

function HeroVisual() {
  const { lang } = useT()
  const zh = lang === 'zh'
  return (
    <div className="relative">
      <div className="sl-card overflow-hidden p-5 shadow-card">
        <div className="flex items-center gap-2.5">
          <span className="orb tenant h-9 w-9" />
          <div>
            <div className="text-[14px] font-bold">{zh ? 'Luna · 你的助手' : 'Luna · your assistant'}</div>
            <div className="font-mono text-[10.5px] text-body-3">{zh ? '在线 · 读取你的记忆' : 'Online · reading your memory'}</div>
          </div>
        </div>
        <div className="mt-3 rounded-xl rounded-tl-sm bg-surface-chip p-3 text-[13px] leading-relaxed text-body-2">
          {zh ? '这套符合你的预算和通勤,要我帮你约个看房吗?' : 'This one fits your budget and commute — want me to book a viewing?'}
        </div>
        <div className="mt-3 overflow-hidden rounded-xl border border-line-divider">
          <div
            className="relative h-28 w-full"
            style={{
              backgroundImage:
                'linear-gradient(135deg,rgba(124,58,237,0.15),rgba(37,99,235,0.10)), url(https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800&q=80&fit=crop&auto=format)',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          >
            <span className="absolute left-3 top-3 rounded-md bg-white/90 px-2 py-1 font-mono text-[10px] font-bold text-tenant">{zh ? 'FOR RENT · 认证 3 级+' : 'FOR RENT · Tier 3+'}</span>
          </div>
          <div className="p-4">
            <div className="text-[13px] font-bold">{zh ? '阳光一居 · 高层景观' : 'Sunlit 1-bed · high-floor view'}</div>
            <div className="font-mono text-[11px] text-body-3">{zh ? 'UNIT 1207 · 1 BED + DEN · 即时入住' : 'UNIT 1207 · 1 BED + DEN · move-in ready'}</div>
            <div className="mt-2 flex items-center justify-between">
              <div className="text-[18px] font-extrabold">$2,850<span className="text-[12px] font-normal text-body-3">/mo</span></div>
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <div className="font-mono text-[10px] uppercase text-body-3">Stayloop Score</div>
                  <div className="font-mono text-[11px] font-bold text-success">{zh ? '7 PASS · 0 红旗' : '7 PASS · 0 red flags'}</div>
                </div>
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand/10 font-mono text-[16px] font-bold text-brand">89</span>
              </div>
            </div>
            <div className="mt-2 inline-flex rounded-md bg-tenant/10 px-2 py-[3px] font-mono text-[10px] font-bold text-tenant">{zh ? 'Rental Passport · 认证 3 级 已验证' : 'Rental Passport · Tier 3 verified'}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ===================== data ===================== */

type LS = Record<Lang, string>

const PILLARS: { n: string; h: LS; b: LS }[] = [
  { n: '01', h: { zh: 'Luna 帮你开口,把房找好', en: 'Luna speaks up and finds your home' }, b: { zh: '说一句「预算 2,800、能养猫、走路到 King 站」,Luna 就去筛房、约看、一键申请。同样的资料,不用再填第十遍。', en: 'Just say “budget $2,800, cats OK, walk to King station,” and Luna filters, books viewings and one-click applies. Same info — no filling it out a tenth time.' } },
  { n: '02', h: { zh: 'Logic 帮你读懂每份申请', en: 'Logic reads every application for you' }, b: { zh: '房东的 Logic 把每份申请压成一页:收入几倍于租金、有没有红旗、匹配多少分。30 分钟的纠结,变成 30 秒一次「同意」。', en: 'The landlord’s Logic compresses each application to one page: income-to-rent multiple, any red flags, match score. Thirty minutes of agonizing becomes a 30-second “Approve.”' } },
  { n: '03', h: { zh: 'Luna 帮你一次验明身份', en: 'Luna verifies your identity once' }, b: { zh: '直连银行与政府 ID,验一次、到处复用;对方看到的是核验过的结论,不是一叠可能 P 过的 PDF。', en: 'Connect directly to your bank and government ID — verify once, reuse everywhere. The other side sees a verified conclusion, not a stack of possibly-edited PDFs.' } },
  { n: '04', h: { zh: 'Logic 帮你守住每条合规', en: 'Logic keeps you on the right side of compliance' }, b: { zh: '「不许养宠物」这类条款可能违反 RTA,agent 会当场提醒、帮你避开雷区。软查不影响信用,每一步都留痕可查。', en: 'Terms like “no pets” may violate the RTA — the agent flags it on the spot and steers you around the landmines. Soft checks never touch your credit, and every step is logged and traceable.' } },
  { n: '05', h: { zh: '布置完就走,它在后台干到底', en: 'Assign it and walk away — it works in the background' }, b: { zh: '派给 agent 一个任务,它一直在后台工作直到完成 —— 你去忙别的。一有进展,就用邮件或短信提醒你。', en: 'Hand the agent a task and it keeps working in the background until it’s done — you go do other things. The moment there’s progress, it pings you by email or SMS.' } },
]

const AGENTS: { name: string; role: LS; sub: LS; color: string; av: string; img: string; desc: LS; points: LS[] }[] = [
  { name: 'Luna', role: { zh: 'TENANT · 租客', en: 'TENANT' }, sub: { zh: '租客助手', en: 'Tenant assistant' }, color: '#7C3AED', av: 'radial-gradient(circle at 35% 30%,#C4B5FD,#7C3AED 75%)', img: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=700&q=80&fit=crop&auto=format', desc: { zh: '验证一次,处处通行。Luna 替你找房、比价、约看、一键申请,资料只在你点头时才分享。', en: 'Verify once, go anywhere. Luna searches, compares, books viewings and one-click applies — your data is shared only when you say so.' }, points: [{ zh: '对话式找房 + 主动匹配', en: 'Conversational search + proactive matching' }, { zh: '可复用 Rental Passport', en: 'Reusable Rental Passport' }, { zh: '缴租 · 维修 · 续约全程托管', en: 'Rent, maintenance & renewal fully managed' }] },
  { name: 'Logic', role: { zh: 'LANDLORD · 房东', en: 'LANDLORD' }, sub: { zh: '房东助手', en: 'Landlord assistant' }, color: '#047857', av: 'radial-gradient(circle at 35% 30%,#6EE7B7,#047857 75%)', img: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=700&q=80&fit=crop&auto=format', desc: { zh: '是流水线,不是收件箱。Logic 替你整理申请、同步尽调、起草租约 —— 决定权始终在你手里。', en: 'A pipeline, not an inbox. Logic organizes applications, runs diligence and drafts leases — the decision is always yours.' }, points: [{ zh: '申请人 Pipeline 看板', en: 'Applicant pipeline board' }, { zh: '8 Engine 自动尽调 + 评分', en: '8-engine automated diligence + scoring' }, { zh: '合规教练 · 租约自动起草', en: 'Compliance coach · auto lease drafting' }] },
  { name: 'Brief', role: { zh: 'AGENT · 经纪', en: 'AGENT' }, sub: { zh: '经纪助手', en: 'Agent assistant' }, color: '#2563EB', av: 'radial-gradient(circle at 35% 30%,#93C5FD,#2563EB 75%)', img: 'https://images.unsplash.com/photo-1484154218962-a197022b5858?w=700&q=80&fit=crop&auto=format', desc: { zh: '把杂活交给系统,把关系留给人。Brief 替你整理客户、准备材料、安排看房和跟进。', en: 'Leave the busywork to the system, the relationships to you. Brief organizes clients, prepares materials, and schedules viewings and follow-ups.' }, points: [{ zh: '客户与房源材料整理', en: 'Client & listing material organization' }, { zh: '看房 Live · 现场记录', en: 'Live viewings · on-site notes' }, { zh: '佣金拆分 · 团队协作', en: 'Commission splits · team collaboration' }] },
]

const SCENARIOS: { name: string; role: LS; color: string; meta: LS; img: string; quote: LS; before: LS; after: LS; with: LS; delta: LS; punch: LS }[] = [
  { name: 'Mia Chen', role: { zh: '租客 · TENANT', en: 'TENANT' }, color: '#7C3AED', meta: { zh: '27 · 软件工程师 · 新移民', en: '27 · software engineer · newcomer' }, img: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=700&q=80&fit=crop&auto=format', quote: { zh: '没有加拿大信用记录,我到底该怎么租房?', en: 'With no Canadian credit history, how am I supposed to rent at all?' }, before: { zh: '信用空白,已被拒 3 次,3 天后必须退房。', en: 'No credit file, rejected 3 times, must move out in 3 days.' }, after: { zh: 'Luna 90 秒验明身份,中文读懂租约,35 分钟签约入住。', en: 'Luna verified her identity in 90s, explained the lease in Chinese, and she signed and moved in within 35 minutes.' }, with: { zh: 'Luna 陪同', en: 'with Luna' }, delta: { zh: 'Score 60 → 91', en: 'Score 60 → 91' }, punch: { zh: '第二次,比第一次更轻松。', en: 'The second time was even easier than the first.' } },
  { name: 'Sarah Wang', role: { zh: '房东 · LANDLORD', en: 'LANDLORD' }, color: '#047857', meta: { zh: '41 · 会计师 · 2 套投资公寓', en: '41 · accountant · 2 investment condos' }, img: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=700&q=80&fit=crop&auto=format', quote: { zh: '做决定前要查、要比,还怕踩 RTA 的雷。', en: 'Before deciding I have to research, compare — and worry about tripping over the RTA.' }, before: { zh: '每月空置损失 $2,900,深夜被报修打扰,合规压力大。', en: '$2,900 lost to vacancy each month, late-night maintenance calls, constant compliance pressure.' }, after: { zh: 'Logic 4 分钟重做房源、跑完尽调,关键时刻她只按「同意」。', en: 'Logic rebuilt the listing and ran full diligence in 4 minutes; at the key moment she just pressed “Approve.”' }, with: { zh: 'Logic 协同', en: 'with Logic' }, delta: { zh: '30 分钟 → 30 秒', en: '30 min → 30 sec' }, punch: { zh: '决定权,始终在你手里。', en: 'The decision is always in your hands.' } },
  { name: 'David Park', role: { zh: '经纪 · AGENT', en: 'AGENT' }, color: '#2563EB', meta: { zh: '35 · 持牌经纪 · RECO 6 年', en: '35 · licensed agent · 6 years RECO' }, img: 'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=700&q=80&fit=crop&auto=format', quote: { zh: '不是没机会,是时间被行政碎片化了。', en: 'It’s not a lack of opportunity — my time gets shredded by admin.' }, before: { zh: '70% 时间耗在行政,收入不稳,客户容易跟丢。', en: '70% of his time went to admin, income was unstable, and clients slipped away.' }, after: { zh: 'Brief 编排任务、当晚结算,他只做带看与专业判断。', en: 'Brief orchestrates tasks and settles the same night; he only handles showings and professional judgment.' }, with: { zh: 'Brief + Beacon', en: 'Brief + Beacon' }, delta: { zh: '时薪 $25 → $43', en: 'Hourly $25 → $43' }, punch: { zh: '剥离行政,放大专业。', en: 'Strip away admin, amplify expertise.' } },
]

const PRODUCTS: { name: string; tag: string; desc: LS; points: LS[] }[] = [
  { name: 'Stayloop App', tag: 'L3 · CONSUMER', desc: { zh: '面向租客。一年验证一次,一键申请,文档永远归你。', en: 'For tenants. Verify once a year, one-click apply, and your documents are always yours.' }, points: [{ zh: 'Verified Renter Passport', en: 'Verified Renter Passport' }, { zh: 'AI Concierge 找房', en: 'AI Concierge search' }, { zh: 'Credit Builder', en: 'Credit Builder' }] },
  { name: 'Stayloop Console', tag: 'L2 · WORKFLOW', desc: { zh: '面向房东与经纪。是流水线,不是收件箱。AI 起草,你做决定。', en: 'For landlords and agents. A pipeline, not an inbox. AI drafts, you decide.' }, points: [{ zh: '多平台房源同步', en: 'Multi-platform listing sync' }, { zh: 'Pipeline Kanban', en: 'Pipeline Kanban' }, { zh: 'Compliance Coach', en: 'Compliance Coach' }] },
  { name: 'Trust API', tag: 'L1 · INFRASTRUCTURE', desc: { zh: '面向 PropTech、保险与平台。身份、收入、信用,一个接口全搞定。', en: 'For PropTech, insurers and platforms. Identity, income and credit — all through one interface.' }, points: [{ zh: 'POST /v1/passports', en: 'POST /v1/passports' }, { zh: 'Webhook 事件流', en: 'Webhook event stream' }, { zh: 'PIPEDA 合规', en: 'PIPEDA compliant' }] },
]

const JOURNEY: { h: LS; b: LS }[] = [
  { h: { zh: '为 AI 起名', en: 'Name your AI' }, b: { zh: 'Luna、Mia、小鹿,任何你喜欢的名字。从这一刻起,她只为你。', en: 'Luna, Mia, Bambi — whatever name you like. From this moment, she works for you alone.' } },
  { h: { zh: '90 秒验明身份', en: 'Verify in 90 seconds' }, b: { zh: '护照加活体,一次过。安全合规 · 不影响你的信用分。', en: 'Passport plus liveness, done in one pass. Secure and compliant · never touches your credit score.' } },
  { h: { zh: '浏览房源', en: 'Browse listings' }, b: { zh: '地图加卡片,Luna 主动按你的需求筛过 · 看中就直接问。', en: 'Map plus cards, pre-filtered by Luna to your needs · see one you like and just ask.' } },
  { h: { zh: '一键申请', en: 'One-click apply' }, b: { zh: '租房护照直接复用 · AI 自动跑完尽调 · 即出 Stayloop Score。', en: 'Reuse your Rental Passport directly · AI runs full diligence · instant Stayloop Score.' } },
  { h: { zh: '入住,安心长住', en: 'Move in, settle in' }, b: { zh: '缴租、维修、续约、退租、纠纷,Luna 全程替你照看。', en: 'Rent, maintenance, renewal, move-out and disputes — Luna looks after it all.' } },
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
