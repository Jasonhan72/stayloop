'use client'

// V5.3 homepage — "为 AI 时代而生的租房方式".
// Faithful to V5.3/landing.html: AI-native hero + Luna chat demo + trust strip
// + why-AI-native pillars + three agents + real scenarios + journey +
// 8-dimension Stayloop Score + products + CTA.
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

const GRAD = 'linear-gradient(135deg,#7C3AED,#2563EB)'

export default function HomePage() {
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
            <Eyebrow>为 AI 时代而生 · 多伦多租住操作系统</Eyebrow>
            <h1 className="mt-4 text-[40px] font-extrabold leading-[1.05] tracking-tightest sm:text-[52px] lg:text-[58px]">
              在 AI 时代,
              <br />
              <span style={{ background: GRAD, WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                不一样
              </span>
              的租房故事。
            </h1>
            <p className="mt-5 max-w-[560px] text-[17px] leading-relaxed text-body-2">
              别人还在刷房源、填表格、传 PDF。你只要说出想要的生活 —— 你的专属 AI 助手就替你
              找房、尽调、申请、约看,一路办到签约入住。<b className="text-body">每个关键决定,依然由你拍板。</b>
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link href="/listings" className="sl-btn-primary !px-6 !py-[14px] !text-[15px]">
                浏览房源 · 无需登录 →
              </Link>
              <Link href="/onboarding/welcome" className="text-[14px] font-semibold text-brand underline-offset-4 hover:underline">
                看看它怎么工作
              </Link>
            </div>
            <p className="mt-5 font-mono text-[11.5px] leading-relaxed text-body-3">
              创建账号后:给你的 AI 助手起个名字 → 90 秒验证身份 → 开始找房
            </p>
          </div>

          <HeroVisual />
        </div>
      </section>

      {/* ===== TRUST STRIP ===== */}
      <section className="border-y border-line-divider bg-white">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-center gap-x-8 gap-y-3 px-5 py-5 sm:px-7 lg:px-12">
          <span className="font-mono text-[11px] font-bold uppercase tracking-eyebrow text-body-3">
            构建于可信的加拿大基础设施
          </span>
          {['Persona', 'Flinks', 'Equifax', 'Stripe', 'Supabase'].map((b) => (
            <span key={b} className="text-[14px] font-bold text-body-2">{b}</span>
          ))}
        </div>
      </section>

      {/* ===== 01 · WHY AI-NATIVE ===== */}
      <Section n="01" kicker="为什么是 AI-NATIVE" title={<>现在开始,租房的事,<br />交给你的 AI agent 来处理。</>}
        lead="你不用研究怎么用这个平台。每个人都有自己的 AI agent —— 租客的 Luna、房东的 Logic。把要的告诉它,找房、尽调、申请、起草租约,它从头跟到尾;你只在关键处拍板。">
        <div className="grid items-start gap-10 lg:grid-cols-[1fr_minmax(380px,440px)]">
          {/* Left — pillars as a vertical numbered list (matches V5.3 design) */}
          <div className="space-y-6">
            {PILLARS.map((p) => (
              <div key={p.n} className="flex gap-4">
                <div className="font-mono text-[13px] font-bold text-brand">{p.n}</div>
                <div>
                  <h4 className="text-[16px] font-bold leading-snug">{p.h}</h4>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-body-2">{p.b}</p>
                </div>
              </div>
            ))}
          </div>
          {/* Right — Luna chat demo (dark panel, matches V5.3 design) */}
          <LunaChatDemo />
        </div>
      </Section>

      {/* ===== 02 · WHAT IS STAYLOOP ===== */}
      <Section n="02" kicker="STAYLOOP 是什么" title={<>一个端到端的<br />租住操作系统。</>}
        lead="不是又一个房源网站,也不只是一次信用查询。Stayloop 把找房、申请、尽调、签约、入住、维修、续约、退租,串成一条 AI 全程陪你走完的链路。" tint>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FeatureCard h="一处办完一整段租住" b="找房、申请、尽调、签约、入住、续约、退租、纠纷,全在一个地方。不用再在十个平台之间来回跳。" />
          <FeatureCard h="三种角色 · 三个 AI" b="租客 Luna · 房东 Logic · 经纪 Brief。每个 AI 只为你一个人工作,记得你的全部上下文。" />
          <FeatureCard h="看得见来源的评分" b="Stayloop Score 不是黑箱风险分,而是由真实证据加权算出的可信度。每一分都能点开看到它从哪来。" />
          <FeatureCard h="合规 · 可审计" b="符合本地法律 · 软查不影响信用 · 每次查询链上留痕 · 每一个决定都能回溯到原始证据。" />
        </div>
      </Section>

      {/* ===== 03 · THREE AGENTS ===== */}
      <Section n="03" kicker="三个 AI 助手" title={<>每个角色,<br />都有自己的 Agent。</>}
        lead="同一套信任引擎,三种人格。它们之间会对话、会交接,但各自只忠于自己的那个人。">
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
                  {a.role}
                </span>
                <span
                  className="absolute bottom-[-22px] left-[22px] z-[2] h-[52px] w-[52px] rounded-[14px] border-[3px] border-white"
                  style={{ background: a.av }}
                />
              </div>
              <div className="flex flex-1 flex-col px-6 pb-[26px] pt-[34px]">
                <div className="flex items-baseline">
                  <span className="text-[21px] font-extrabold tracking-tight">{a.name}</span>
                  <span className="ml-1.5 text-[14px] font-semibold text-body-3">{a.sub}</span>
                </div>
                <p className="mt-2.5 text-[13.5px] leading-relaxed text-body-2">{a.desc}</p>
                <ul className="mt-4 space-y-2.5 text-[12.5px]">
                  {a.points.map((pt) => (
                    <li key={pt} className="flex items-start gap-2.5">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={a.color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="mt-[1px] flex-none"><path d="M20 6 9 17l-5-5" /></svg>
                      <span className="text-body-2">{pt}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ===== 04 · REAL SCENARIOS ===== */}
      <Section n="04" kicker="真实场景" title={<>三个人,<br />三段被 AI 改写的租住。</>}
        lead="同一套引擎,三种人生。把他们的故事压缩成一分钟 —— 看看 AI-native 到底改变了什么。" tint>
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
                  {s.role}
                </span>
                <div className="absolute bottom-[14px] left-[18px] right-[18px] z-[2]">
                  <div className="text-[21px] font-extrabold tracking-tight text-white">{s.name}</div>
                  <div className="mt-[3px] font-mono text-[10px] text-white/85">{s.meta}</div>
                </div>
              </div>
              <div className="flex flex-1 flex-col p-[22px]">
                <p className="text-[15px] font-semibold leading-[1.55] tracking-tight">“{s.quote}”</p>
                <div className="mt-[18px] space-y-3">
                  <div className="grid grid-cols-[42px_1fr] gap-[11px] text-[12.5px] leading-[1.55] text-body-2">
                    <span className="rounded-[5px] bg-[#F3EEE2] py-[3px] text-center font-mono text-[8.5px] font-bold text-body-3">之前</span>
                    <span>{s.before}</span>
                  </div>
                  <div className="grid grid-cols-[42px_1fr] gap-[11px] text-[12.5px] leading-[1.55] text-body-2">
                    <span className="rounded-[5px] py-[3px] text-center font-mono text-[8.5px] font-bold" style={{ background: `${s.color}1a`, color: s.color }}>之后</span>
                    <span>{s.after}</span>
                  </div>
                </div>
                <div className="mt-auto flex items-center gap-2 border-t border-[#F0EBE0] pt-4">
                  <span className="rounded-full px-2.5 py-[5px] font-mono text-[10px] font-bold" style={{ background: `${s.color}1a`, color: s.color }}>{s.with}</span>
                  <span className="ml-auto font-mono text-[12px] font-bold text-success">{s.delta}</span>
                </div>
                <p className="mt-3.5 flex items-center gap-[7px] text-[13px] font-bold tracking-tight">
                  <span style={{ color: '#B45309' }}>✦</span>{s.punch}
                </p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ===== 05 · JOURNEY ===== */}
      <Section n="05" kicker="端到端流程" title={<>从找房到入住,<br />一条路走完。</>}
        lead="不用在平台之间来回跳。AI 助手在每一步陪着你,但每个关键决定,始终是你的。">
        <div className="relative">
          {/* connecting line (desktop) — purple → green progression */}
          <div className="absolute left-[10%] right-[10%] top-7 hidden h-[2px] lg:block" style={{ background: 'linear-gradient(90deg,#7C3AED,#94A3B8 55%,#047857)' }} />
          <div className="relative grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
            {JOURNEY.map((j, i) => (
              <div key={j.h} className="flex flex-col items-center text-center lg:items-start lg:text-left">
                <JourneyIcon step={i} />
                <div className="mt-3 font-mono text-[10.5px] font-bold uppercase tracking-eyebrow text-brand">STEP 0{i + 1}</div>
                <h4 className="mt-1.5 text-[14.5px] font-bold leading-snug">{j.h}</h4>
                <p className="mt-1.5 text-[12px] leading-relaxed text-body-3">{j.b}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ===== 06 · DEEP SCREENING ===== */}
      <Section n="06" kicker="深度尽调" title={<>不止给你一个数字,<br />而是给你完整的理由。</>}
        lead="普通信用查询只丢给你一个 675。Stayloop 把它拆成 8 个独立维度,每一个都告诉你:我看了什么、得了多少分、为什么。AI 负责核查,你负责判断。" tint>
        <div className="grid items-center gap-10 lg:grid-cols-[1.15fr_0.85fr]">
          {/* left — 8 dimensions, 2 columns, per-dimension colored badges */}
          <div className="grid gap-2.5 sm:grid-cols-2">
            {DIMS.map((d) => (
              <div key={d.k} className="flex items-center gap-3 rounded-[10px] border border-line-divider bg-white px-[15px] py-[13px]">
                <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg font-mono text-[13px] font-extrabold" style={{ background: d.bg, color: d.fg }}>{d.k}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-bold leading-tight">{d.name}</div>
                  <div className="font-mono text-[10.5px] text-body-3">{d.ev}</div>
                </div>
                <span className="font-mono text-[18px] font-bold" style={{ color: d.amber ? '#B45309' : '#047857' }}>{d.score}</span>
              </div>
            ))}
          </div>
          {/* right — donut score card */}
          <div className="rounded-2xl border p-[34px] px-[30px] text-center" style={{ background: 'linear-gradient(180deg,#fff,#FBF8EE)', borderColor: '#047857' }}>
            <div className="font-mono text-[10px] font-bold uppercase tracking-eyebrowLg text-success">STAYLOOP SCORE · 综合</div>
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
              <span className="h-1.5 w-1.5 rounded-full bg-success" />PROCEED · 高置信度
            </div>
            <div className="mt-[15px] font-mono text-[10px] leading-relaxed text-body-3">
              7 PASS · 1 INFO · 0 红旗<br />504/504 dp · 链上可审 0xa481…3c92
            </div>
          </div>
        </div>
      </Section>

      {/* ===== 07 · PRODUCTS ===== */}
      <Section n="07" kicker="一套引擎 · 三个产品" title={<>同一份信任,<br />处处可读。</>}
        lead="在 App 里创建的护照,能被 Console 读取、被 Trust API 调用 —— 验证一次,处处复用。">
        <div className="grid gap-4 md:grid-cols-3">
          {PRODUCTS.map((p) => (
            <div key={p.name} className="sl-card flex flex-col p-7">
              <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-brand">{p.tag}</div>
              <h3 className="mt-2 text-[20px] font-bold tracking-tight">{p.name}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-body-2">{p.desc}</p>
              <ul className="mt-4 space-y-2 border-t border-line-divider pt-4 text-[13px]">
                {p.points.map((pt) => (
                  <li key={pt} className="flex items-start gap-2">
                    <span className="mt-[2px] text-success">✓</span>
                    <span className="font-mono text-[12px] text-body-2">{pt}</span>
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
          <h2 className="mx-auto max-w-[720px] text-[32px] font-extrabold leading-tight tracking-tight sm:text-[42px]">
            给你的 AI 助手起个名字,<br />让租房这件事,从此不一样。
          </h2>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link href="/onboarding/welcome" className="sl-btn-primary !px-7 !py-[14px] !text-[15px]">开始 · 90 秒身份验证</Link>
            <Link href="/listings" className="rounded-[10px] border border-line-strong bg-white px-6 py-[13px] text-[14px] font-semibold text-body transition hover:border-brand hover:text-brand">先浏览房源 →</Link>
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
  const LISTINGS = [
    { name: '阳光一居 · 高层景观', meta: 'King 站步行 9 min · 允许养猫', match: 92, price: '$2,750', img: 'https://images.unsplash.com/photo-1554995207-c18c203602cb?w=400&q=80&fit=crop&auto=format' },
    { name: '复式 LOFT · 温哥街', meta: 'King 站步行 12 min · 允许养猫', match: 88, price: '$2,800', img: 'https://images.unsplash.com/photo-1484154218962-a197022b5858?w=400&q=80&fit=crop&auto=format' },
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
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: '#34D399' }} /> 在线 · 读取你的记忆
        </span>
      </div>

      {/* user bubble */}
      <div className="mt-4 flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-tr-sm px-3.5 py-2.5 leading-relaxed text-white" style={{ background: '#2563EB' }}>
          预算 2800 以内,离 King 站走路 15 分钟,能养猫的一居。
        </div>
      </div>

      {/* luna bubble */}
      <div className="mt-3 rounded-2xl rounded-tl-sm px-3.5 py-2.5 leading-relaxed" style={{ background: '#1B2230' }}>
        好的。我按你之前说的<b>采光要好</b>也一起筛了,3 套符合,都允许养宠:
      </div>

      {/* listing cards */}
      <div className="mt-3 space-y-2.5">
        {LISTINGS.map((l) => (
          <div key={l.name} className="flex items-center gap-3 rounded-xl p-2.5" style={{ background: '#161D2B' }}>
            <div className="h-14 w-16 flex-shrink-0 rounded-lg" style={{ backgroundImage: `url(${l.img})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12.5px] font-bold text-white">{l.name}</div>
              <div className="font-mono text-[10.5px]" style={{ color: '#94A3B8' }}>{l.meta}</div>
              <div className="mt-0.5 font-mono text-[10.5px]" style={{ color: '#A78BFA' }}>▶ {l.match}% 匹配你的偏好</div>
            </div>
            <div className="flex-shrink-0 font-mono text-[14px] font-bold text-white">{l.price}</div>
          </div>
        ))}
      </div>

      {/* luna bubble */}
      <div className="mt-3 rounded-2xl rounded-tl-sm px-3.5 py-2.5 leading-relaxed" style={{ background: '#1B2230' }}>
        要我帮你一键申请第一套吗?你的 Passport 已是 <b>认证 3 级</b>,无需重填资料。
      </div>

      {/* user bubble */}
      <div className="mt-3 flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-tr-sm px-3.5 py-2.5 leading-relaxed text-white" style={{ background: '#2563EB' }}>
          第一套,帮我申请。我去开会了。
        </div>
      </div>

      {/* status */}
      <div className="mt-3 rounded-xl p-3" style={{ background: '#11192563', border: '1px solid #233047' }}>
        <div className="flex items-center gap-1.5 text-[12px] font-bold" style={{ color: '#34D399' }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: '#34D399' }} /> 已接手 · 后台持续执行
        </div>
        <div className="mt-1.5 font-mono text-[10.5px]" style={{ color: '#94A3B8' }}>提交申请 · 跟进房东 · 协调看房时间</div>
        <div className="mt-1 text-[11.5px]" style={{ color: '#94A3B8' }}>有进展用「邮件 / 短信」通知你 —— 你不用守着。</div>
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
  return (
    <div className="relative">
      <div className="sl-card overflow-hidden p-5 shadow-card">
        <div className="flex items-center gap-2.5">
          <span className="orb tenant h-9 w-9" />
          <div>
            <div className="text-[14px] font-bold">Luna · 你的助手</div>
            <div className="font-mono text-[10.5px] text-body-3">在线 · 读取你的记忆</div>
          </div>
        </div>
        <div className="mt-3 rounded-xl rounded-tl-sm bg-surface-chip p-3 text-[13px] leading-relaxed text-body-2">
          这套符合你的预算和通勤,要我帮你约个看房吗?
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
            <span className="absolute left-3 top-3 rounded-md bg-white/90 px-2 py-1 font-mono text-[10px] font-bold text-tenant">FOR RENT · 认证 3 级+</span>
          </div>
          <div className="p-4">
            <div className="text-[13px] font-bold">阳光一居 · 高层景观</div>
            <div className="font-mono text-[11px] text-body-3">UNIT 1207 · 1 BED + DEN · 即时入住</div>
            <div className="mt-2 flex items-center justify-between">
              <div className="text-[18px] font-extrabold">$2,850<span className="text-[12px] font-normal text-body-3">/mo</span></div>
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <div className="font-mono text-[10px] uppercase text-body-3">Stayloop Score</div>
                  <div className="font-mono text-[11px] font-bold text-success">7 PASS · 0 红旗</div>
                </div>
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand/10 font-mono text-[16px] font-bold text-brand">89</span>
              </div>
            </div>
            <div className="mt-2 inline-flex rounded-md bg-tenant/10 px-2 py-[3px] font-mono text-[10px] font-bold text-tenant">Rental Passport · 认证 3 级 已验证</div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ===================== data ===================== */

const PILLARS = [
  { n: '01', h: 'Luna 帮你开口,把房找好', b: '说一句「预算 2,800、能养猫、走路到 King 站」,Luna 就去筛房、约看、一键申请。同样的资料,不用再填第十遍。' },
  { n: '02', h: 'Logic 帮你读懂每份申请', b: '房东的 Logic 把每份申请压成一页:收入几倍于租金、有没有红旗、匹配多少分。30 分钟的纠结,变成 30 秒一次「同意」。' },
  { n: '03', h: 'Luna 帮你一次验明身份', b: '直连银行与政府 ID,验一次、到处复用;对方看到的是核验过的结论,不是一叠可能 P 过的 PDF。' },
  { n: '04', h: 'Logic 帮你守住每条合规', b: '「不许养宠物」这类条款可能违反 RTA,agent 会当场提醒、帮你避开雷区。软查不影响信用,每一步都留痕可查。' },
  { n: '05', h: '布置完就走,它在后台干到底', b: '派给 agent 一个任务,它一直在后台工作直到完成 —— 你去忙别的。一有进展,就用邮件或短信提醒你。' },
]

const AGENTS = [
  { name: 'Luna', role: 'TENANT · 租客', sub: '租客助手', color: '#7C3AED', av: 'radial-gradient(circle at 35% 30%,#C4B5FD,#7C3AED 75%)', img: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=700&q=80&fit=crop&auto=format', desc: '验证一次,处处通行。Luna 替你找房、比价、约看、一键申请,资料只在你点头时才分享。', points: ['对话式找房 + 主动匹配', '可复用 Rental Passport', '缴租 · 维修 · 续约全程托管'] },
  { name: 'Logic', role: 'LANDLORD · 房东', sub: '房东助手', color: '#047857', av: 'radial-gradient(circle at 35% 30%,#6EE7B7,#047857 75%)', img: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=700&q=80&fit=crop&auto=format', desc: '是流水线,不是收件箱。Logic 替你整理申请、同步尽调、起草租约 —— 决定权始终在你手里。', points: ['申请人 Pipeline 看板', '8 Engine 自动尽调 + 评分', '合规教练 · 租约自动起草'] },
  { name: 'Brief', role: 'AGENT · 经纪', sub: '经纪助手', color: '#2563EB', av: 'radial-gradient(circle at 35% 30%,#93C5FD,#2563EB 75%)', img: 'https://images.unsplash.com/photo-1484154218962-a197022b5858?w=700&q=80&fit=crop&auto=format', desc: '把杂活交给系统,把关系留给人。Brief 替你整理客户、准备材料、安排看房和跟进。', points: ['客户与房源材料整理', '看房 Live · 现场记录', '佣金拆分 · 团队协作'] },
]

const SCENARIOS = [
  { name: 'Mia Chen', role: '租客 · TENANT', color: '#7C3AED', meta: '27 · 软件工程师 · 新移民', img: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=700&q=80&fit=crop&auto=format', quote: '没有加拿大信用记录,我到底该怎么租房?', before: '信用空白,已被拒 3 次,3 天后必须退房。', after: 'Luna 90 秒验明身份,中文读懂租约,35 分钟签约入住。', with: 'Luna 陪同', delta: 'Score 60 → 91', punch: '第二次,比第一次更轻松。' },
  { name: 'Sarah Wang', role: '房东 · LANDLORD', color: '#047857', meta: '41 · 会计师 · 2 套投资公寓', img: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=700&q=80&fit=crop&auto=format', quote: '做决定前要查、要比,还怕踩 RTA 的雷。', before: '每月空置损失 $2,900,深夜被报修打扰,合规压力大。', after: 'Logic 4 分钟重做房源、跑完尽调,关键时刻她只按「同意」。', with: 'Logic 协同', delta: '30 分钟 → 30 秒', punch: '决定权,始终在你手里。' },
  { name: 'David Park', role: '经纪 · AGENT', color: '#2563EB', meta: '35 · 持牌经纪 · RECO 6 年', img: 'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=700&q=80&fit=crop&auto=format', quote: '不是没机会,是时间被行政碎片化了。', before: '70% 时间耗在行政,收入不稳,客户容易跟丢。', after: 'Brief 编排任务、当晚结算,他只做带看与专业判断。', with: 'Brief + Beacon', delta: '时薪 $25 → $43', punch: '剥离行政,放大专业。' },
]

const PRODUCTS = [
  { name: 'Stayloop App', tag: 'L3 · CONSUMER', desc: '面向租客。一年验证一次,一键申请,文档永远归你。', points: ['Verified Renter Passport', 'AI Concierge 找房', 'Credit Builder'] },
  { name: 'Stayloop Console', tag: 'L2 · WORKFLOW', desc: '面向房东与经纪。是流水线,不是收件箱。AI 起草,你做决定。', points: ['多平台房源同步', 'Pipeline Kanban', 'Compliance Coach'] },
  { name: 'Trust API', tag: 'L1 · INFRASTRUCTURE', desc: '面向 PropTech、保险与平台。身份、收入、信用,一个接口全搞定。', points: ['POST /v1/passports', 'Webhook 事件流', 'PIPEDA 合规'] },
]

const JOURNEY = [
  { h: '为 AI 起名', b: 'Luna、Mia、小鹿,任何你喜欢的名字。从这一刻起,她只为你。' },
  { h: '90 秒验明身份', b: '护照加活体,一次过。安全合规 · 不影响你的信用分。' },
  { h: '浏览房源', b: '地图加卡片,Luna 主动按你的需求筛过 · 看中就直接问。' },
  { h: '一键申请', b: '租房护照直接复用 · AI 自动跑完尽调 · 即出 Stayloop Score。' },
  { h: '入住,安心长住', b: '缴租、维修、续约、退租、纠纷,Luna 全程替你照看。' },
]

const DIMS = [
  { k: 'ID', name: 'Identity · 身份核验', ev: '护照 · 活体 · 设备 · 32 dp', score: 99, bg: 'rgba(33,150,243,0.10)', fg: '#1E88E5' },
  { k: '$', name: 'Income · 收入流水', ev: '工资单 · 银行 · T4 · 48 dp', score: 92, bg: 'rgba(76,175,80,0.10)', fg: '#2E7D32' },
  { k: 'H', name: 'History · 租住历史', ev: '推荐信 · 反向核 · 52 dp', score: 96, bg: 'rgba(156,39,176,0.10)', fg: '#7B1FA2' },
  { k: 'F', name: 'Fraud · 文档反欺诈', ev: '字体 · PDF 编辑器 · 64 dp', score: 94, bg: 'rgba(255,152,0,0.10)', fg: '#E65100' },
  { k: 'B', name: 'Behavior · 行为信号', ev: '完整度 · 一致性 · 26 dp', score: 88, bg: 'rgba(96,125,139,0.10)', fg: '#455A64' },
  { k: 'X', name: 'X-Ref · 双征信', ev: 'Equifax + TransUnion · 76 dp', score: 90, bg: 'rgba(121,85,72,0.10)', fg: '#5D4037' },
  { k: '⚖', name: 'LTB / Court · 法庭裁定', ev: '14 trib · CanLII · OSB · 122 dp', score: 100, bg: 'rgba(124,58,237,0.10)', fg: '#7C3AED' },
  { k: '⛓', name: 'Relations · 关联图谱', ev: '5 一度 · 14 二度 · 84 dp', score: 82, bg: 'rgba(124,58,237,0.10)', fg: '#7C3AED', amber: true },
]
