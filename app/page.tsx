'use client'

// v5.4 homepage — built strictly to design/v54-homepage.html (eleven acts).
// Header/Footer are the real shared components; everything between them
// reproduces the blueprint's layout, copy and interactions in Next/Tailwind.
import Link from 'next/link'
import { useEffect, useState } from 'react'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { useT, type Lang } from '@/lib/i18n'
import { ROLE_THEME, type RoleKey } from '@/lib/roleTheme'
import { useOnboarded, ROLE_HOME } from '@/lib/useOnboarding'

/* ===================== palette (from the blueprint :root) ===================== */

const BG = '#FAF9F6'
const INK = '#17161B'
const INK2 = '#56524A'
const INK3 = '#8A857A'
const LINE = '#E8E4DC'
const DARK = '#131118'
const DARK2 = '#1B1824'
const DARK_INK = '#EFEBF6'
const DARK_MUTED = '#9A93AC'
const DARK_LINE = 'rgba(255,255,255,.10)'
const GOLD = '#B45309'
const GRAD = 'linear-gradient(90deg,#7C3AED,#2563EB)'
const GRAD_TEXT: React.CSSProperties = {
  background: GRAD,
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  color: 'transparent',
}
const SOFT: Record<RoleKey, string> = { tenant: '#F3EEFB', landlord: '#EBF4F0', agent: '#EBF1FD' }
const ROLE_ORB = (r: RoleKey) =>
  `radial-gradient(circle at 32% 28%, ${ROLE_THEME[r].light}, ${ROLE_THEME[r].accent})`

type LS = Record<Lang, React.ReactNode>
type LSS = Record<Lang, string>

/* ===================== page ===================== */

export default function HomePage() {
  const { lang } = useT()
  const zh = lang === 'zh'

  // Scroll reveal: IO reveals on intersection change; the scroll catch-up
  // fallback covers elements skipped by anchor / instant jumps (IO only fires
  // on false→true transitions — a block jumped past never intersects and
  // would stay invisible; `.in` is idempotent so the fallback is safe).
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const els = Array.from(document.querySelectorAll<HTMLElement>('.hp-rv'))
    if (reduced || !('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('in'))
      return
    }
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in')
            io.unobserve(e.target)
          }
        }),
      { threshold: 0.05 },
    )
    els.forEach((el) => io.observe(el))
    const catchUp = () =>
      document.querySelectorAll<HTMLElement>('.hp-rv:not(.in)').forEach((el) => {
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

  return (
    <div style={{ background: BG, color: INK }}>
      <PageStyles />
      <Header variant="transparent" />

      {/* ============ ACT 0 · HERO ============ */}
      <div className="mx-auto max-w-[1180px] px-5 sm:px-8">
        <div className="grid items-center gap-10 pb-6 pt-14 lg:grid-cols-[1.02fr_0.98fr] lg:gap-14 lg:pt-[76px]">
          <div className="min-w-0">
            <Eyebrow color={ROLE_THEME.landlord.accent}>
              {zh ? '为 AI 时代而生 · 租房的信任基础设施' : 'BUILT FOR THE AI ERA · TRUST INFRASTRUCTURE FOR RENTING'}
            </Eyebrow>
            <h1
              className="mt-[18px] font-extrabold"
              style={{ fontSize: 'clamp(34px,4.6vw,56px)', lineHeight: 1.16, letterSpacing: '-.02em', textWrap: 'balance' }}
            >
              {zh ? (
                <>
                  说出你想要的生活，
                  <br />
                  <span style={GRAD_TEXT}>AI 替你办到入住</span>。
                </>
              ) : (
                <>
                  Say the life you want —
                  <br />
                  <span style={GRAD_TEXT}>AI gets you moved in</span>.
                </>
              )}
            </h1>
            <p className="mt-[18px] max-w-[30em] text-[17px]" style={{ color: INK2 }}>
              {zh ? (
                <>
                  每个人都有自己的 Agent：找房、尽调、申请、签约、续约，它来跑 ——{' '}
                  <b style={{ color: INK }}>每个关键决定，依然由你拍板。</b>全程可审计，官方数据背书。
                </>
              ) : (
                <>
                  Everyone gets their own agent: it runs the search, diligence, applications, signing and renewals —{' '}
                  <b style={{ color: INK }}>every key decision is still yours.</b> Fully auditable, backed by official
                  data.
                </>
              )}
            </p>
            <TryBar animate buttonLabel={zh ? '试一句 →' : 'Try it →'} />
            <p className="mt-3 text-[12.5px]" style={{ color: INK3 }}>
              {zh
                ? '租客永远免费 · 不影响信用分 · 90 秒完成首次验证'
                : 'Tenants free forever · never touches your credit · first verification in 90 seconds'}
            </p>
            <div className="mt-[26px] text-[13px]" style={{ color: INK3 }}>
              {zh ? '你是 —' : 'You are —'}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2.5">
              {(['tenant', 'landlord', 'agent'] as RoleKey[]).map((r) => (
                <a
                  key={r}
                  href="#roles"
                  className="inline-flex items-center gap-[7px] rounded-full bg-white px-4 py-[7px] text-[13px] font-bold"
                  style={{ border: `1.5px solid ${LINE}`, color: INK2, textDecoration: 'none' }}
                >
                  <span className="h-[7px] w-[7px] rounded-full" style={{ background: ROLE_THEME[r].accent }} />
                  {r === 'tenant' ? (zh ? '租客' : 'Tenant') : r === 'landlord' ? (zh ? '房东' : 'Landlord') : zh ? '经纪' : 'Agent'}
                </a>
              ))}
            </div>
          </div>

          <HeroDemoCard zh={zh} />
        </div>
      </div>

      {/* ============ ACT 1 · TRUST BAND ============ */}
      <div className="mt-14 bg-white" style={{ borderTop: `1px solid ${LINE}`, borderBottom: `1px solid ${LINE}` }}>
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-center gap-x-[34px] gap-y-3.5 px-5 py-[22px] sm:px-8">
          <span className="font-mono text-[10px]" style={{ letterSpacing: '.16em', color: INK3 }}>
            POWERED BY
          </span>
          {['Persona', 'Flinks', 'Equifax', 'TransUnion', 'Stripe', zh ? 'TRREB 数据' : 'TRREB Data'].map((b) => (
            <span key={b} className="text-[15px] font-extrabold grayscale" style={{ color: '#B4AFA5', letterSpacing: '-.01em' }}>
              {b}
            </span>
          ))}
          <span
            className="rounded-full px-3 py-1 font-mono text-[10.5px]"
            style={{ color: GOLD, border: `1px solid ${LINE}`, background: BG, letterSpacing: '.1em' }}
          >
            🍁 PROUDLY CANADIAN · {zh ? '安省合规' : 'ONTARIO COMPLIANT'}
          </span>
        </div>
      </div>

      {/* ============ ACT 2 · SIX FACTS ============ */}
      <div className="hp-rv mx-auto max-w-[1180px] px-5 pb-2 pt-[84px] text-center sm:px-8">
        <h2 className="font-extrabold" style={{ fontSize: 'clamp(24px,3.4vw,34px)', letterSpacing: '-.015em', textWrap: 'balance' }}>
          {zh ? 'Stayloop 给你的六样东西' : 'Six things Stayloop gives you'}
        </h2>
        <p className="mx-auto mt-2.5 max-w-[40em] text-[15px]" style={{ color: INK2 }}>
          {zh
            ? '不是营销数字 —— 每一格都是产品今天就在交付的事实。'
            : 'Not marketing numbers — every tile is something the product delivers today.'}
        </p>
        <div className="mt-[38px] grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {FACTS.map((f) => (
            <div key={f.key} className="rounded-2xl bg-white px-5 pb-6 pt-7" style={{ border: `1px solid ${LINE}` }}>
              <div
                className="hp-num font-mono font-extrabold"
                style={{ fontSize: 'clamp(30px,3.6vw,40px)', letterSpacing: '-.03em', lineHeight: 1, color: f.color }}
              >
                {f.big[lang]}
              </div>
              <p className="mt-2.5 text-[13px]" style={{ color: INK2, lineHeight: 1.55 }}>
                {f.p[lang]}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ============ ACT 3 · ERA + THREE ROLES ============ */}
      <div id="roles" className="mx-auto max-w-[1180px] px-5 pb-[30px] pt-[100px] sm:px-8" style={{ scrollMarginTop: 70 }}>
        <div className="hp-rv mx-auto max-w-[880px] text-center">
          <Eyebrow color={ROLE_THEME.landlord.accent}>
            {zh ? '/ 三种角色 · 每人一个 AGENT' : '/ THREE ROLES · ONE AGENT EACH'}
          </Eyebrow>
          <h2
            className="mt-[18px] font-extrabold"
            style={{ fontSize: 'clamp(30px,4.8vw,48px)', lineHeight: 1.22, letterSpacing: '-.015em', textWrap: 'balance' }}
          >
            {zh ? '每个角色，都有自己的 Agent。' : 'Every role gets its own agent.'}
            <br />
            <span className="font-bold" style={{ color: INK3 }}>
              {zh ? '三种身份，就此升级。' : 'Three identities, upgraded.'}
            </span>
          </h2>
          <p className="mt-4 font-extrabold" style={{ fontSize: 'clamp(19px,2.8vw,26px)' }}>
            {zh ? (
              <>
                有了自己的 AI Agent 之后，他们各自成为了<em className="not-italic" style={GRAD_TEXT}>更自由的人</em>。
              </>
            ) : (
              <>
                With an agent of their own, each became <em className="not-italic" style={GRAD_TEXT}>a freer person</em>.
              </>
            )}
          </p>
        </div>

        <div className="hp-rv mb-14 mt-12 grid gap-3.5 md:grid-cols-3">
          {SHIFTS.map((s) => (
            <div key={s.who} className="rounded-2xl bg-white px-6 py-[22px] text-center" style={{ border: `1px solid ${LINE}` }}>
              <div className="font-mono text-[10.5px] font-bold" style={{ letterSpacing: '.16em', color: ROLE_THEME[s.role].accent }}>
                {s.who}
              </div>
              <div className="mt-2.5 text-[14.5px]" style={{ color: INK3 }}>
                {s.from[lang]}
              </div>
              <p className="m-0" style={{ color: INK3 }}>
                ↓
              </p>
              <div className="text-[20px] font-extrabold" style={{ color: ROLE_THEME[s.role].deep }}>
                {s.to[lang]}
              </div>
            </div>
          ))}
        </div>

        <RoleTabs lang={lang} zh={zh} />
      </div>

      {/* ============ ACT 4 · DARK EVIDENCE BENTO ============ */}
      <div className="mt-[100px] pb-24 pt-[92px]" style={{ background: DARK, color: DARK_INK }}>
        <div className="mx-auto max-w-[1180px] px-5 sm:px-8">
          <div className="hp-rv">
            <Eyebrow color={ROLE_THEME.landlord.light}>
              {zh ? '/ 凭什么信 · 证据全部可点开' : '/ WHY TRUST US · EVERY PROOF CLICKS OPEN'}
            </Eyebrow>
            <h2 className="mb-2 mt-4 font-extrabold" style={{ fontSize: 'clamp(28px,4vw,42px)', letterSpacing: '-.015em', textWrap: 'balance' }}>
              {zh ? (
                <>
                  不给你形容词，
                  <br />
                  给你数据、理由和留痕。
                </>
              ) : (
                <>
                  No adjectives —
                  <br />
                  just data, reasons and an audit trail.
                </>
              )}
            </h2>
            <p className="m-0 max-w-[42em] text-[15.5px]" style={{ color: DARK_MUTED }}>
              {zh
                ? '下面每一块都是真实产品组件的实时输出 —— 不是宣传图。'
                : 'Every block below is live output from a real product component — not a marketing mock.'}
            </p>
          </div>

          <div className="mt-11 grid grid-cols-1 gap-4 lg:grid-cols-12">
            {/* b1 · score ring */}
            <BentoCell span={5}>
              <CellLab>{zh ? 'STAYLOOP SCORE · 可解释评分' : 'STAYLOOP SCORE · EXPLAINABLE'}</CellLab>
              <CellH3>{zh ? '8 个维度，每一分都有理由' : '8 dimensions, a reason behind every point'}</CellH3>
              <CellD>
                {zh ? (
                  <>
                    普通信用查询丢给你一个 675。我们把它拆成 <b style={{ color: DARK_INK }}>8 个独立维度 · 504 个数据点</b>
                    ，每一个都告诉你：看了什么、得了多少、为什么。
                  </>
                ) : (
                  <>
                    An ordinary credit pull hands you a 675. We split it into{' '}
                    <b style={{ color: DARK_INK }}>8 independent dimensions · 504 data points</b> — each tells you what
                    was checked, what it scored, and why.
                  </>
                )}
              </CellD>
              <div className="flex flex-wrap items-center gap-6">
                <svg width="120" height="120" viewBox="0 0 120 120" role="img" aria-label={zh ? '综合评分 89' : 'Overall score 89'}>
                  <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="9" />
                  <circle
                    cx="60"
                    cy="60"
                    r="50"
                    fill="none"
                    stroke="#6EE7B7"
                    strokeWidth="9"
                    strokeLinecap="round"
                    strokeDasharray="279.6 314.2"
                    transform="rotate(-90 60 60)"
                  />
                  <text x="60" y="66" textAnchor="middle" fontSize="30" fontWeight="800" fill={DARK_INK} fontFamily="ui-monospace, monospace">
                    89
                  </text>
                  <text x="60" y="82" textAnchor="middle" fontSize="8.5" fill={DARK_MUTED} fontFamily="ui-monospace, monospace">
                    / 100
                  </text>
                </svg>
                <div className="grid min-w-[190px] flex-1 gap-[7px]">
                  {DIMS.map((d) => (
                    <div key={d.zh} className="grid items-center gap-2.5 text-[11px]" style={{ gridTemplateColumns: '84px 1fr 26px', color: DARK_MUTED }}>
                      <span>{zh ? d.zh : d.en}</span>
                      <span className="relative h-1 rounded-full" style={{ background: 'rgba(255,255,255,.09)' }}>
                        <i className="absolute bottom-0 left-0 top-0 rounded-full" style={{ width: `${d.v}%`, background: ROLE_THEME.landlord.light }} />
                      </span>
                      <b className="hp-num text-right font-mono" style={{ color: DARK_INK }}>
                        {d.v}
                      </b>
                    </div>
                  ))}
                </div>
              </div>
            </BentoCell>

            {/* b2 · market card, big TRREB sparkline */}
            <BentoCell span={7}>
              <CellLab>{zh ? '市场行情 · 双数据源' : 'MARKET DATA · TWO SOURCES'}</CellLab>
              <CellH3>{zh ? '实时挂牌 + 官方成交，一张卡看全' : 'Live listings + official leases, one card'}</CellH3>
              <CellD>
                {zh ? (
                  <>
                    Realtor.ca 实时挂牌告诉你<b style={{ color: DARK_INK }}>现在要价多少</b>，TRREB 季度成交（我们入库了{' '}
                    <b style={{ color: DARK_INK }}>2019 年以来 6,401 行官方数据</b>）告诉你
                    <b style={{ color: DARK_INK }}>实际成交多少</b> —— 议价的两个锚点都给你。
                  </>
                ) : (
                  <>
                    Realtor.ca live listings tell you <b style={{ color: DARK_INK }}>what is being asked now</b>; TRREB
                    quarterly leases (<b style={{ color: DARK_INK }}>6,401 official rows since 2019</b> in our database)
                    tell you <b style={{ color: DARK_INK }}>what actually closed</b> — both anchors for your negotiation.
                  </>
                )}
              </CellD>
              <div className="rounded-xl px-3.5 py-3" style={{ background: 'rgba(255,255,255,.04)', border: `1px solid ${DARK_LINE}` }}>
                <div className="font-mono text-[9px]" style={{ letterSpacing: '.14em', color: DARK_MUTED }}>
                  {zh ? '📊 NORTH YORK · 2 房+ · 样本 12 套' : '📊 NORTH YORK · 2BED+ · SAMPLE 12'}
                </div>
                <div className="mt-1 flex items-baseline gap-2.5">
                  <span className="hp-num text-[24px] font-extrabold" style={{ letterSpacing: '-.01em' }}>
                    $2,300–$4,500
                  </span>
                  <span className="text-[11px]" style={{ color: DARK_MUTED }}>
                    {zh ? '中位' : 'median'}{' '}
                    <b className="hp-num" style={{ color: DARK_INK }}>
                      $2,820
                    </b>
                  </span>
                </div>
                <Gauge />
                <div className="mt-2.5 pt-[9px] text-[10.5px]" style={{ borderTop: `1px dashed ${DARK_LINE}`, color: DARK_MUTED }}>
                  {zh ? '官方基准 · TRREB Toronto C14 · 2026 Q1：' : 'Official benchmark · TRREB Toronto C14 · 2026 Q1: '}
                  <b className="hp-num" style={{ color: DARK_INK }}>
                    $2,914
                  </b>{' '}
                  {zh ? '· 224 宗 · 同比 −4.6%' : '· 224 leases · −4.6% YoY'}
                  <svg className="mt-1.5 block w-full" viewBox="0 0 560 76" role="img" aria-label={zh ? 'TRREB 两年趋势' : 'TRREB 2-year trend'}>
                    <line x1="8" y1="20" x2="552" y2="20" stroke="rgba(255,255,255,.09)" />
                    <line x1="8" y1="44" x2="552" y2="44" stroke="rgba(255,255,255,.09)" />
                    <line x1="8" y1="68" x2="552" y2="68" stroke="rgba(255,255,255,.09)" />
                    <polyline
                      fill="none"
                      stroke="#C4B5FD"
                      strokeWidth="2.4"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      points="20,30 96,18 172,29 248,40 324,44 400,39 476,42 544,60"
                    />
                    <circle cx="544" cy="60" r="4" fill="#C4B5FD" stroke={DARK2} strokeWidth="2" />
                    <text x="540" y="48" textAnchor="end" fontSize="11" fontWeight="700" fill={DARK_INK} fontFamily="ui-monospace, monospace">
                      $2,914
                    </text>
                    <text x="20" y="74" fontSize="8.5" fill={DARK_MUTED} fontFamily="ui-monospace, monospace">
                      24Q2
                    </text>
                    <text x="544" y="74" textAnchor="end" fontSize="8.5" fill={DARK_MUTED} fontFamily="ui-monospace, monospace">
                      26Q1
                    </text>
                  </svg>
                </div>
              </div>
            </BentoCell>

            {/* b3 · guardrail */}
            <BentoCell span={7}>
              <CellLab>{zh ? 'COMPLIANCE GUARDRAIL · 拦截实录' : 'COMPLIANCE GUARDRAIL · A REAL BLOCK'}</CellLab>
              <CellH3>{zh ? '违规操作，AI 直接拦下' : 'Illegal moves, blocked by the AI'}</CellH3>
              <CellD>
                {zh ? (
                  <>
                    安省《住宅租赁法》和《人权法》写进了引擎。歧视性拒绝、非法条款、超限涨租 ——{' '}
                    <b style={{ color: DARK_INK }}>在发出去之前就被拦截</b>，而不是收到投诉之后。
                  </>
                ) : (
                  <>
                    Ontario&apos;s RTA and Human Rights Code are written into the engine. Discriminatory rejections,
                    illegal clauses, over-limit rent hikes — <b style={{ color: DARK_INK }}>blocked before they go out</b>
                    , not after the complaint.
                  </>
                )}
              </CellD>
              <div className="rounded-xl px-4 py-3 text-[12.5px]" style={{ background: 'rgba(185,28,28,.12)', border: '1px solid rgba(248,113,113,.3)' }}>
                <div className="font-mono text-[9.5px] font-bold" style={{ letterSpacing: '.12em', color: '#F87171' }}>
                  ■ BLOCKED · {zh ? 'OHRC 保护性事由' : 'OHRC PROTECTED GROUND'}
                </div>
                {zh
                  ? '「拒绝理由：家里有小孩」—— 家庭状况为受保护事由，已阻止发送并向房东说明合规拒绝方式。'
                  : '"Rejection reason: they have kids" — family status is a protected ground. Sending was blocked and the landlord was shown a compliant way to decline.'}
              </div>
              <div className="mt-3 font-mono text-[10.5px]" style={{ color: DARK_MUTED, lineHeight: 1.9 }}>
                <b style={{ color: ROLE_THEME.landlord.light }}>audit</b> 2026-07-09 14:02 · guardrail_blocked ·
                actor=landlord_agent · {zh ? '链上可查' : 'on-chain verifiable'}
                <br />
                <b style={{ color: ROLE_THEME.landlord.light }}>audit</b> 2026-07-09 14:05 · application_declined ·
                reason=&quot;{zh ? '收入未达标准' : 'income below threshold'}&quot; · ✓ {zh ? '合规' : 'compliant'}
              </div>
            </BentoCell>

            {/* b4 · passport */}
            <BentoCell span={5}>
              <CellLab>RENTAL PASSPORT</CellLab>
              <CellH3>{zh ? '验证一次，处处通行' : 'Verify once, go anywhere'}</CellH3>
              <CellD>
                {zh ? (
                  <>
                    身份、收入、信用授权封装成一本<b style={{ color: DARK_INK }}>可携带的通行证</b>
                    。每次分享给谁、分享哪些字段，都由你逐次点头 —— 隐私不是商品。
                  </>
                ) : (
                  <>
                    Identity, income and credit authorization packed into{' '}
                    <b style={{ color: DARK_INK }}>a portable passport</b>. Who sees it and which fields — you approve
                    each time. Privacy is not a commodity.
                  </>
                )}
              </CellD>
              <div
                className="mb-3.5 flex items-center gap-3.5 rounded-[14px] px-[18px] py-4"
                style={{ background: 'rgba(255,255,255,.04)', border: '1.5px solid rgba(196,181,253,.5)' }}
              >
                <div className="flex h-[42px] w-[42px] items-center justify-center rounded-[10px] text-[19px] text-white" style={{ background: ROLE_ORB('tenant') }}>
                  🛂
                </div>
                <div>
                  <b className="block text-[14.5px]" style={{ color: DARK_INK }}>
                    Mia Chen · {zh ? '已盖 3/4 枚章' : '3/4 stamps collected'}
                  </b>
                  <span className="text-[12px]" style={{ color: DARK_MUTED }}>
                    {zh ? '身份 ✓ 收入 ✓ 信用 ✓ · 90 秒完成' : 'Identity ✓ Income ✓ Credit ✓ · done in 90s'}
                  </span>
                </div>
              </div>
              <p className="m-0 text-[13px]" style={{ color: DARK_MUTED }}>
                {zh ? (
                  <>
                    已复用 <b style={{ color: DARK_INK }}>7 次</b> · 0 次重复提交材料
                  </>
                ) : (
                  <>
                    Reused <b style={{ color: DARK_INK }}>7 times</b> · 0 documents re-submitted
                  </>
                )}
              </p>
            </BentoCell>
          </div>
        </div>
      </div>

      {/* ============ ACT 5 · PASSPORT ============ */}
      <div className="hp-rv mx-auto max-w-[1180px] px-5 pb-5 pt-[100px] sm:px-8">
        <div className="mx-auto max-w-[880px] text-center">
          <Eyebrow color={ROLE_THEME.tenant.accent}>
            {zh ? '/ RENTAL PASSPORT · 你的通行证' : '/ RENTAL PASSPORT · YOUR PASS'}
          </Eyebrow>
          <h2 className="mt-4 font-extrabold" style={{ fontSize: 'clamp(26px,3.8vw,40px)', letterSpacing: '-.015em' }}>
            {zh ? (
              <>
                验证一次，<span className="font-bold" style={{ color: INK3 }}>处处通行。</span>
              </>
            ) : (
              <>
                Verify once, <span className="font-bold" style={{ color: INK3 }}>go anywhere.</span>
              </>
            )}
          </h2>
        </div>
        <div className="mx-auto mt-10 max-w-[640px]">
          <div className="rounded-2xl px-7 py-[26px]" style={{ background: SOFT.tenant, border: `1px solid ${ROLE_THEME.tenant.light}` }}>
            <h3 className="mb-3.5 mt-0 font-mono text-[12px]" style={{ letterSpacing: '.14em', color: ROLE_THEME.tenant.deep }}>
              {zh ? 'STAYLOOP · 一本通行证' : 'STAYLOOP · ONE PASSPORT'}
            </h3>
            <div
              className="mb-3.5 flex items-center gap-3.5 rounded-[14px] bg-white px-[18px] py-4"
              style={{ border: `1.5px solid ${ROLE_THEME.tenant.accent}` }}
            >
              <div className="flex h-[42px] w-[42px] items-center justify-center rounded-[10px] text-[19px] text-white" style={{ background: ROLE_ORB('tenant') }}>
                🛂
              </div>
              <div>
                <b className="block text-[14.5px]">Rental Passport · {zh ? '已盖 3/4 枚章' : '3/4 stamps collected'}</b>
                <span className="text-[12px]" style={{ color: INK3 }}>
                  {zh ? '身份 / 收入 / 信用已验证 · 90 秒完成' : 'identity / income / credit verified · done in 90s'}
                </span>
              </div>
            </div>
            <p className="m-0 text-[13.5px]" style={{ color: INK2 }}>
              {zh ? (
                <>
                  之后每次申请：<b style={{ color: ROLE_THEME.tenant.deep }}>一键授权</b>，指定分享范围，房东只看到验证结果 ——{' '}
                  <b style={{ color: ROLE_THEME.tenant.deep }}>原件永不离开你</b>
                  。每次分享留有记录，随时可撤。没有加拿大信用记录也没关系：8 维评分用收入流水、稳定性、行为信号替你说话。
                </>
              ) : (
                <>
                  Every later application: <b style={{ color: ROLE_THEME.tenant.deep }}>one-tap authorization</b>, you
                  set the sharing scope, the landlord sees only verified results —{' '}
                  <b style={{ color: ROLE_THEME.tenant.deep }}>your originals never leave you</b>. Every share is logged
                  and revocable. No Canadian credit history? The 8-dimension score speaks for you with cash flow,
                  stability and behavior signals.
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* ============ ACT 6 · TRI-AGENT ============ */}
      <div className="hp-rv mx-auto max-w-[1180px] px-5 pb-[30px] pt-24 text-center sm:px-8">
        <div className="mx-auto max-w-[880px]">
          <Eyebrow color={ROLE_THEME.agent.accent}>
            {zh ? '/ 全市场独有 · 三方 AGENT 互通' : '/ ONLY ON STAYLOOP · TRI-AGENT INTEROP'}
          </Eyebrow>
          <h2 className="mt-4 font-extrabold" style={{ fontSize: 'clamp(26px,3.8vw,40px)', letterSpacing: '-.015em' }}>
            {zh ? '你的 Agent，会和对面的 Agent 谈。' : 'Your agent talks to the agent across the table.'}
          </h2>
        </div>
        <div className="mx-auto mt-11 flex max-w-[640px] items-center justify-between">
          <TriNode role="tenant" name={zh ? 'LUNA · 租客' : 'LUNA · TENANT'} />
          <div
            className="hp-trilink mx-2 mb-[26px] h-[2px] flex-1"
            style={{ background: `linear-gradient(90deg, ${ROLE_THEME.tenant.light}, ${ROLE_THEME.agent.light})` }}
          />
          <TriNode role="agent" name={zh ? 'BRIEF · 经纪' : 'BRIEF · AGENT'} />
          <div
            className="hp-trilink mx-2 mb-[26px] h-[2px] flex-1"
            style={{ background: `linear-gradient(90deg, ${ROLE_THEME.agent.light}, ${ROLE_THEME.landlord.light})` }}
          />
          <TriNode role="landlord" name={zh ? 'LOGIC · 房东' : 'LOGIC · LANDLORD'} />
        </div>
        <p className="mx-auto mt-[26px] max-w-[40em] text-[15px]" style={{ color: INK2 }}>
          {zh ? (
            <>
              同一套信任引擎，三种人格。它们之间会对话、会交接 —— 约看、议价、材料授权在 Agent 之间完成，
              <b style={{ color: INK }}>但各自只忠于自己的那个人</b>。
            </>
          ) : (
            <>
              One trust engine, three personalities. They converse and hand off — viewings, negotiation and document
              authorization happen agent-to-agent, <b style={{ color: INK }}>yet each is loyal only to its own person</b>.
            </>
          )}
        </p>
      </div>

      {/* ============ ACT 7 · CHECKLIST ============ */}
      <div className="hp-rv mx-auto max-w-[1180px] px-5 pb-5 pt-24 sm:px-8">
        <div className="mx-auto max-w-[880px] text-center">
          <Eyebrow color={ROLE_THEME.tenant.accent}>
            {zh ? '/ 你的租房清单 · 逐项有人管' : '/ YOUR RENTAL CHECKLIST · EVERY ITEM COVERED'}
          </Eyebrow>
          <h2 className="mt-4 font-extrabold" style={{ fontSize: 'clamp(26px,3.8vw,40px)', letterSpacing: '-.015em' }}>
            {zh ? (
              <>
                四件事，<span className="font-bold" style={{ color: INK3 }}>件件有人替你办。</span>
              </>
            ) : (
              <>
                Four jobs, <span className="font-bold" style={{ color: INK3 }}>each with someone on it.</span>
              </>
            )}
          </h2>
        </div>
        <div className="mt-10 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          {CHECKLIST.map((c) => (
            <div key={c.noKey} className="flex flex-col rounded-2xl bg-white px-[22px] pb-[18px] pt-[22px]" style={{ border: `1px solid ${LINE}` }}>
              <div className="font-mono text-[10px]" style={{ letterSpacing: '.16em', color: INK3 }}>
                {c.no[lang]}
              </div>
              <h3 className="mb-2.5 mt-2 text-[17.5px] font-extrabold" style={{ letterSpacing: '-.01em' }}>
                {c.h[lang]}
              </h3>
              <p className="mb-3.5 mt-0 flex-1 text-[13.5px]" style={{ color: INK2 }}>
                {c.p[lang]}
              </p>
              <span
                className="inline-flex items-center gap-[7px] self-start rounded-full px-[11px] py-[5px] font-mono text-[9.5px] font-bold"
                style={{ letterSpacing: '.1em', background: SOFT[c.chipRole], color: ROLE_THEME[c.chipRole].deep }}
              >
                <span className="h-3 w-3 rounded-full" style={{ background: ROLE_ORB(c.chipRole) }} />
                {c.chip[lang]}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ============ ACT 8 · CREED + PRICING ============ */}
      <div className="hp-rv mt-24" style={{ background: SOFT.landlord, borderTop: `1px solid ${LINE}`, borderBottom: `1px solid ${LINE}` }}>
        <div className="mx-auto max-w-[900px] px-5 py-[72px] text-center sm:px-8">
          <h2 className="m-0 font-extrabold" style={{ fontSize: 'clamp(24px,3.6vw,36px)', letterSpacing: '-.015em', textWrap: 'balance' }}>
            {zh ? '租客永远免费。' : 'Tenants are free forever.'}
            <br />
            <b style={{ color: ROLE_THEME.landlord.deep }}>
              {zh ? '你的隐私，永远不是商品。' : 'Your privacy is never for sale.'}
            </b>
          </h2>
          <p className="mb-0 mt-3.5" style={{ color: INK2 }}>
            {zh
              ? 'Stayloop 靠订阅收费 —— 房东与经纪按价值付费，没有人靠倒卖你的数据赚钱。'
              : 'Stayloop runs on subscriptions — landlords and agents pay for value. Nobody profits from reselling your data.'}
          </p>
          <div className="mx-auto mt-10 max-w-[620px] text-left">
            <div className="rounded-2xl px-7 py-[26px]" style={{ background: DARK, color: DARK_INK }}>
              <h3 className="m-0 font-mono text-[10.5px] font-bold" style={{ letterSpacing: '.16em', color: ROLE_THEME.landlord.light }}>
                {zh ? 'STAYLOOP 定价 · 透明 · 无隐藏' : 'STAYLOOP PRICING · TRANSPARENT · NO HIDDEN FEES'}
              </h3>
              <div className="hp-num mb-0.5 mt-3.5 font-mono text-[34px] font-extrabold" style={{ letterSpacing: '-.02em', color: ROLE_THEME.landlord.light }}>
                $0
              </div>
              <div className="text-[12px]" style={{ color: DARK_MUTED }}>
                {zh
                  ? '租客申请，永远免费 · 次数不限 · 不影响信用分'
                  : 'Tenant applications free forever · unlimited · never touches your credit'}
              </div>
              <ul className="m-0 mt-4 grid list-none gap-[11px] p-0">
                {PRICE_CHECKS.map((li) => (
                  <li key={li.zh as string} className="flex items-baseline gap-2.5 text-[13.5px]">
                    <span className="font-bold" style={{ color: ROLE_THEME.landlord.light }}>
                      ✓
                    </span>
                    <span>{li[lang]}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 pt-3.5 text-[12px]" style={{ borderTop: `1px dashed ${DARK_LINE}`, color: DARK_MUTED, lineHeight: 1.9 }}>
                {zh ? (
                  <>
                    房东：起步 <b className="font-mono" style={{ color: DARK_INK }}>$0</b> · 专业{' '}
                    <b className="font-mono" style={{ color: DARK_INK }}>$19/月</b> · 团队{' '}
                    <b className="font-mono" style={{ color: DARK_INK }}>$39/月</b>　｜　经纪：免费入驻 · 转介分账 RECO 合规
                  </>
                ) : (
                  <>
                    Landlords: Starter <b className="font-mono" style={{ color: DARK_INK }}>$0</b> · Pro{' '}
                    <b className="font-mono" style={{ color: DARK_INK }}>$19/mo</b> · Team{' '}
                    <b className="font-mono" style={{ color: DARK_INK }}>$39/mo</b>　|　Agents: free to join ·
                    RECO-compliant referral splits
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ============ ACT 9 · FINAL CTA ============ */}
      <div className="hp-rv mx-auto max-w-[1180px] px-5 pb-24 pt-[88px] text-center sm:px-8">
        <h2 className="mb-[26px] mt-0 font-extrabold" style={{ fontSize: 'clamp(28px,4.4vw,46px)', letterSpacing: '-.02em' }}>
          {zh ? '现在，试一句。' : 'Now, try one sentence.'}
        </h2>
        <TryBar animate={false} centered buttonLabel={zh ? '开始 →' : 'Start →'} />
        <p className="mt-3.5 text-[12.5px]" style={{ color: INK3 }}>
          {zh
            ? '给你的 AI 起个名字 —— 让租房这件事，从此不一样。'
            : 'Name your AI — and renting is never the same again.'}
        </p>
      </div>

      <Footer />
    </div>
  )
}

/* ===================== animations / reveal CSS ===================== */

function PageStyles() {
  return (
    <style>{`
      .hp-num { font-variant-numeric: tabular-nums; }
      .hp-rv { opacity: 1; }
      .hp-caret { display: inline-block; width: 2px; height: 1em; background: #7C3AED; vertical-align: -2px; margin-left: 2px; }
      .hp-trilink { position: relative; overflow: hidden; }
      @media (prefers-reduced-motion: no-preference) {
        .hp-rv { opacity: 0; transform: translateY(14px); transition: opacity .5s ease, transform .5s ease; }
        .hp-rv.in { opacity: 1; transform: none; }
        .hp-caret { animation: hpBlink 1s steps(1) infinite; }
        @keyframes hpBlink { 50% { opacity: 0; } }
        .hp-orb { animation: hpBreathe 3.5s ease-in-out infinite; }
        @keyframes hpBreathe { 50% { transform: scale(1.08); box-shadow: 0 0 18px rgba(124,58,237,.5); } }
        .hp-panel { animation: hpFadein .3s ease; }
        @keyframes hpFadein { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        .hp-trilink::after { content: ""; position: absolute; top: -2px; width: 26px; height: 6px; border-radius: 999px;
          background: rgba(255,255,255,.85); mix-blend-mode: overlay; filter: blur(1px); animation: hpFlow 2.6s linear infinite; }
        @keyframes hpFlow { from { left: -30px; } to { left: 105%; } }
      }
    `}</style>
  )
}

/* ===================== small building blocks ===================== */

function Eyebrow({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <div className="font-mono text-[11px] font-bold" style={{ letterSpacing: '.2em', color }}>
      {children}
    </div>
  )
}

function BentoCell({ span, children }: { span: 5 | 7; children: React.ReactNode }) {
  return (
    <div
      className={`hp-rv rounded-[18px] px-[26px] py-6 ${span === 5 ? 'lg:col-span-5' : 'lg:col-span-7'}`}
      style={{ background: DARK2, border: `1px solid ${DARK_LINE}` }}
    >
      {children}
    </div>
  )
}

function CellLab({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[10px]" style={{ letterSpacing: '.16em', color: DARK_MUTED }}>
      {children}
    </div>
  )
}

function CellH3({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-1 mt-2 text-[17.5px] font-extrabold" style={{ letterSpacing: '-.01em' }}>
      {children}
    </h3>
  )
}

function CellD({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3.5 mt-0 text-[13px]" style={{ color: DARK_MUTED }}>
      {children}
    </p>
  )
}

function TriNode({ role, name }: { role: RoleKey; name: string }) {
  return (
    <div className="z-[1] flex flex-col items-center gap-2.5">
      <span className="h-[58px] w-[58px] rounded-full" style={{ background: ROLE_ORB(role) }} />
      <span className="font-mono text-[10.5px] font-bold" style={{ letterSpacing: '.14em', color: INK2 }}>
        {name}
      </span>
    </div>
  )
}

function Gauge() {
  return (
    <div className="relative mt-2 h-[5px] rounded-full opacity-90" style={{ background: 'linear-gradient(90deg,#6EE7B7,#FBBF24,#F87171)' }}>
      <span
        className="absolute top-1/2 h-[11px] w-[11px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ left: '34%', background: '#C4B5FD', border: `2px solid ${DARK}` }}
      />
    </div>
  )
}

/* ===================== try bar (typewriter) ===================== */

function useReducedMotion() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}

function TryBar({ animate, buttonLabel, centered }: { animate: boolean; buttonLabel: string; centered?: boolean }) {
  const { lang } = useT()
  const zh = lang === 'zh'
  const lines = zh
    ? ['北约克两房，预算 2800，能养猫', '多大附近找 5 个两房，4000 以内', '帮我发布我的公寓，租金 2600', '这份租约的第 8 条什么意思？']
    : [
        'Two-bed in North York, budget $2,800, cat-friendly',
        'Find 5 two-beds near UofT under $4,000',
        'List my condo for rent at $2,600',
        'What does clause 8 of this lease mean?',
      ]
  const reduced = useReducedMotion()
  const run = animate && !reduced
  const [lineIdx, setLineIdx] = useState(0)
  const [chars, setChars] = useState(9999)

  useEffect(() => {
    if (!run) {
      setLineIdx(0)
      setChars(9999)
      return
    }
    // Blueprint timing: 1800ms initial delay, 65ms/char, 2600ms hold per line.
    let li = 0
    let i = 0
    let timer: ReturnType<typeof setTimeout>
    setLineIdx(0)
    setChars(9999)
    const type = () => {
      i++
      setLineIdx(li)
      setChars(i)
      timer = i >= lines[li].length ? setTimeout(advance, 2600) : setTimeout(type, 65)
    }
    const advance = () => {
      li = (li + 1) % lines.length
      i = 0
      timer = setTimeout(type, 65)
    }
    timer = setTimeout(() => {
      i = 0
      timer = setTimeout(type, 65)
    }, 1800)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, lang])

  const current = lines[lineIdx] ?? lines[0]
  const shown = run ? current.slice(0, chars) : lines[0]
  const target = run ? current : lines[0]

  return (
    <div
      className={`mt-7 flex max-w-[480px] overflow-hidden rounded-[14px] bg-white ${centered ? 'mx-auto' : ''}`}
      style={{ border: `1.5px solid ${INK}`, boxShadow: '0 10px 30px -18px rgba(23,22,27,.35)' }}
    >
      <span
        className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap px-[18px] py-[15px] text-left text-[14.5px]"
        style={{ color: INK2 }}
        aria-live="off"
      >
        {shown}
        <span className="hp-caret" aria-hidden="true" />
      </span>
      <Link
        href={`/tenant/agent?prompt=${encodeURIComponent(target)}`}
        className="flex items-center px-6 text-[14.5px] font-bold text-white"
        style={{ background: ROLE_THEME.tenant.accent }}
      >
        {buttonLabel}
      </Link>
    </div>
  )
}

/* ===================== hero demo card ===================== */

function HeroDemoCard({ zh }: { zh: boolean }) {
  return (
    <div className="min-w-0 rounded-[20px] px-5 pb-4 pt-5" style={{ background: DARK, color: DARK_INK, boxShadow: '0 30px 60px -30px rgba(23,22,27,.5)' }}>
      <div className="flex items-center gap-2.5 pb-3" style={{ borderBottom: `1px solid ${DARK_LINE}` }}>
        <span className="hp-orb h-[26px] w-[26px] rounded-full" style={{ background: ROLE_ORB('tenant') }} />
        <b className="text-[13.5px]">{zh ? 'LUNA · 你的 AI' : 'LUNA · YOUR AI'}</b>
        <span className="ml-auto font-mono text-[9.5px]" style={{ letterSpacing: '.12em', color: ROLE_THEME.landlord.light }}>
          ● {zh ? '在线 · 读取你的记忆' : 'ONLINE · READING YOUR MEMORY'}
        </span>
      </div>
      <div className="flex flex-col gap-2.5 pb-1 pt-3.5">
        <div className="max-w-[85%] self-end px-3.5 py-[9px] text-[13px] text-white" style={{ background: ROLE_THEME.tenant.accent, borderRadius: '12px 12px 3px 12px' }}>
          {zh ? '北约克两房，预算 2800，能养猫' : 'Two-bed in North York, budget $2,800, cat-friendly'}
        </div>
        <div className="max-w-[92%] self-start px-3.5 py-[9px] text-[13px]" style={{ background: DARK2, borderRadius: '12px 12px 12px 3px', color: DARK_INK }}>
          {zh
            ? '好的，帮你搜北约克允许养猫的两房 —— 先看真实行情，再上房源 👇'
            : 'On it — searching cat-friendly two-beds in North York. Real market data first, then the listings 👇'}
        </div>
        <div className="rounded-xl px-3.5 py-3" style={{ background: DARK2, border: `1px solid ${DARK_LINE}` }}>
          <div className="font-mono text-[9px]" style={{ letterSpacing: '.14em', color: DARK_MUTED }}>
            {zh ? '📊 NORTH YORK · 2 房+ 真实行情 · 样本 12 套' : '📊 NORTH YORK · 2BED+ LIVE MARKET · SAMPLE 12'}
          </div>
          <div className="mt-1 flex items-baseline gap-2.5">
            <span className="hp-num text-[16px] font-extrabold" style={{ letterSpacing: '-.01em' }}>
              $2,300–$4,500
            </span>
            <span className="text-[11px]" style={{ color: DARK_MUTED }}>
              {zh ? '中位' : 'median'}{' '}
              <b className="hp-num" style={{ color: DARK_INK }}>
                $2,820
              </b>
            </span>
          </div>
          <Gauge />
          <div className="mt-2.5 pt-[9px] text-[10.5px]" style={{ borderTop: `1px dashed ${DARK_LINE}`, color: DARK_MUTED }}>
            {zh ? '官方基准 · TRREB Toronto C14 · 2026 Q1：成交均价 ' : 'Official benchmark · TRREB Toronto C14 · 2026 Q1: avg leased '}
            <b className="hp-num" style={{ color: DARK_INK }}>
              $2,914
            </b>{' '}
            {zh ? '· 224 宗 · 同比 −4.6%' : '· 224 leases · −4.6% YoY'}
            <svg className="mt-1.5 block w-full" viewBox="0 0 260 44" role="img" aria-label={zh ? '两年租金趋势' : '2-year rent trend'}>
              <polyline
                fill="none"
                stroke="#C4B5FD"
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
                points="6,16 42,10 78,15 114,21 150,23 186,20 222,22 254,32"
              />
              <circle cx="254" cy="32" r="3.4" fill="#C4B5FD" stroke={DARK} strokeWidth="1.6" />
              <text x="252" y="14" textAnchor="end" fontSize="9" fontFamily="ui-monospace, monospace" fill={DARK_INK} fontWeight="700">
                $2,914
              </text>
            </svg>
          </div>
        </div>
        <div className="max-w-[92%] self-start px-3.5 py-[9px] text-[13px]" style={{ background: DARK2, borderRadius: '12px 12px 12px 3px', color: DARK_INK }}>
          {zh
            ? '预算在中位以上，可以挑剔一点。3 套符合的房源卡已附上，第一套周六下午可看房，要我约吗？'
            : 'Your budget sits above the median — you can afford to be picky. 3 matching listing cards attached; the first has a Saturday-afternoon viewing. Want me to book it?'}
        </div>
      </div>
      <div className="mt-2.5 text-center font-mono text-[9.5px]" style={{ letterSpacing: '.1em', color: DARK_MUTED }}>
        {zh ? (
          <>
            以上为<b style={{ color: ROLE_THEME.tenant.light }}>真实产品输出</b> · 数据来自 Realtor.ca 实时挂牌与 TRREB 季度成交
          </>
        ) : (
          <>
            <b style={{ color: ROLE_THEME.tenant.light }}>REAL PRODUCT OUTPUT</b> · Realtor.ca live listings + TRREB
            quarterly leases
          </>
        )}
      </div>
    </div>
  )
}

/* ===================== role tabs / panels ===================== */

function Still({
  file,
  gradient,
  act,
  orbchip,
  orbRole,
}: {
  file: string
  gradient: string
  act: React.ReactNode
  orbchip?: React.ReactNode
  orbRole?: RoleKey
}) {
  // Persona still: /personas/<file> shows when it exists; the act gradient is
  // the designed fallback (same approach as RoleLanding's story strip, minus
  // stock photos).
  const [imgOk, setImgOk] = useState(true)
  return (
    <div className="relative flex items-end p-4 text-white" style={{ aspectRatio: '7 / 5', background: gradient }}>
      {imgOk && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/personas/${file}`}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setImgOk(false)}
        />
      )}
      <div className="pointer-events-none absolute inset-0" style={{ boxShadow: 'inset 0 -70px 70px -30px rgba(0,0,0,.55)' }} />
      <span className="absolute right-3.5 top-3 rounded-md px-2 py-[3px] font-mono text-[9px] opacity-70" style={{ background: 'rgba(0,0,0,.35)' }}>
        {file}
      </span>
      {orbchip && orbRole && (
        <span
          className="absolute left-3.5 top-3 flex items-center gap-[7px] rounded-full px-2.5 py-1 font-mono text-[9.5px] font-bold"
          style={{ letterSpacing: '.14em', background: 'rgba(0,0,0,.42)', color: ROLE_THEME[orbRole].light }}
        >
          <span className="h-[13px] w-[13px] rounded-full" style={{ background: ROLE_ORB(orbRole) }} />
          {orbchip}
        </span>
      )}
      <span className="relative font-mono text-[10px] font-bold" style={{ letterSpacing: '.18em', textShadow: '0 1px 8px rgba(0,0,0,.5)' }}>
        {act}
      </span>
    </div>
  )
}

function RoleTabs({ lang, zh }: { lang: Lang; zh: boolean }) {
  const [role, setRole] = useState<RoleKey>('tenant')
  // Mimic RoleLanding's auth-aware CTAs: onboarded users of a role go straight
  // to their agent home; everyone else hits the role's onboarding entry.
  const onbTenant = useOnboarded('tenant')
  const onbLandlord = useOnboarded('landlord')
  const onbAgent = useOnboarded('agent')
  const onb: Record<RoleKey, ReturnType<typeof useOnboarded>> = {
    tenant: onbTenant,
    landlord: onbLandlord,
    agent: onbAgent,
  }
  const p = PANELS.find((x) => x.role === role)!
  const th = ROLE_THEME[role]
  const ctaHref = onb[role].onboarded ? ROLE_HOME[role] : p.onboardingHref

  return (
    <div>
      <div role="tablist" aria-label={zh ? '选择角色' : 'Choose a role'} className="mb-8 flex flex-wrap justify-center gap-2.5">
        {PANELS.map((panel) => {
          const active = panel.role === role
          const t = ROLE_THEME[panel.role]
          return (
            <button
              key={panel.role}
              id={`hp-tab-${panel.role}`}
              role="tab"
              aria-selected={active}
              aria-controls={`hp-panel-${panel.role}`}
              onClick={() => setRole(panel.role)}
              className="flex items-center gap-2 rounded-full px-6 py-2.5 text-[14px] font-bold"
              style={
                active
                  ? { border: `1.5px solid ${t.accent}`, background: SOFT[panel.role], color: INK }
                  : { border: `1.5px solid ${LINE}`, background: '#fff', color: INK2 }
              }
            >
              <span className="h-2 w-2 rounded-full" style={{ background: t.accent }} />
              {panel.tab[lang]}
            </button>
          )
        })}
      </div>

      <div key={role} id={`hp-panel-${role}`} role="tabpanel" aria-labelledby={`hp-tab-${role}`} className="hp-panel">
        <div className="mx-auto mb-7 max-w-[720px] text-center">
          <blockquote className="m-0 font-extrabold" style={{ fontSize: 'clamp(18px,2.4vw,23px)', lineHeight: 1.45 }}>
            “{p.quote[lang]}”
          </blockquote>
          <div className="mt-2 font-mono text-[11px]" style={{ letterSpacing: '.08em', color: INK3 }}>
            {p.who[lang]}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {p.scenes.map((s) => (
            <div key={s.file} className="flex flex-col overflow-hidden rounded-2xl bg-white" style={{ border: `1px solid ${LINE}` }}>
              <Still file={s.file} gradient={s.gradient} act={s.act[lang]} orbchip={s.orbchip?.[lang]} orbRole={s.orbchip ? role : undefined} />
              <div className="flex-1 px-[18px] pb-4 pt-3.5 text-[13px]" style={{ color: INK2 }}>
                <b className="mb-0.5 block text-[13.5px]" style={{ color: INK }}>
                  {s.capTitle[lang]}
                </b>
                {s.capBody[lang]}
              </div>
            </div>
          ))}
        </div>

        <div
          className="mt-[18px] grid grid-cols-1 items-center gap-3 rounded-[18px] px-9 py-[30px] text-center lg:grid-cols-[auto_1fr_auto] lg:gap-x-[38px] lg:text-left"
          style={{ background: DARK, color: DARK_INK }}
        >
          <div className="hp-num whitespace-nowrap font-mono font-extrabold" style={{ fontSize: 'clamp(28px,4vw,42px)', letterSpacing: '-.02em' }}>
            <span className="mr-3 align-[6px] line-through" style={{ color: DARK_MUTED, fontSize: '.6em', textDecorationThickness: 2 }}>
              {p.deltaFrom[lang]}
            </span>
            <span style={{ color: th.light }}>{p.deltaTo[lang]}</span>
          </div>
          <div className="mx-auto max-w-[34em] text-[14px] lg:mx-0" style={{ color: DARK_MUTED }}>
            <b style={{ color: DARK_INK }}>{p.whyLead[lang]}</b>
            {p.whyBody[lang]}
          </div>
          <Link
            href={ctaHref}
            className="justify-self-center whitespace-nowrap rounded-xl px-6 py-[13px] text-[14px] font-bold text-white lg:justify-self-end"
            style={{ background: th.accent }}
          >
            {p.cta[lang]}
          </Link>
        </div>
      </div>
    </div>
  )
}

/* ===================== data ===================== */

const FACTS: { key: string; color: string; big: LS; p: LS }[] = [
  {
    key: '90s',
    color: ROLE_THEME.tenant.deep,
    big: { zh: <>90<Small>秒</Small></>, en: <>90<Small>s</Small></> },
    p: {
      zh: 'Rental Passport 首次验证，之后每次申请一键复用。',
      en: 'First Rental Passport verification — every later application reuses it in one click.',
    },
  },
  {
    key: '8dim',
    color: ROLE_THEME.landlord.deep,
    big: { zh: <>8<Small>维 · 504 数据点</Small></>, en: <>8<Small>dims · 504 data points</Small></> },
    p: {
      zh: '可解释的深度尽调：每一分都告诉你我看了什么、为什么。',
      en: 'Explainable deep diligence: every point tells you what was checked and why.',
    },
  },
  {
    key: '16365',
    color: ROLE_THEME.agent.deep,
    big: { zh: <>16,365<Small>宗</Small></>, en: <>16,365<Small>leases</Small></> },
    p: {
      zh: 'TRREB 上季真实成交作为行情基准，议价有官方数据托底。',
      en: "Last quarter's real TRREB leases as your market benchmark — negotiate on official data.",
    },
  },
  {
    key: '100',
    color: GOLD,
    big: { zh: <>100<Small>%</Small></>, en: <>100<Small>%</Small></> },
    p: {
      zh: '每个对外动作先经你批准、写入审计日志，RTA / OHRC 合规护栏全程在线。',
      en: 'Every outbound action needs your approval and lands in the audit log — RTA / OHRC guardrails always on.',
    },
  },
  {
    key: '247',
    color: ROLE_THEME.tenant.deep,
    big: { zh: <>24<Small>/7</Small></>, en: <>24<Small>/7</Small></> },
    p: {
      zh: '偏好说一次永远记得，你睡觉时它也在替你跟进。',
      en: 'Say a preference once, remembered forever — it follows up while you sleep.',
    },
  },
  {
    key: 'zh',
    color: ROLE_THEME.landlord.deep,
    big: { zh: <>中<Small>文全程</Small></>, en: <>中<Small>Chinese, end to end</Small></> },
    p: {
      zh: '找房到签约全程中文服务，英文租约逐条讲给你听 —— 为新移民与留学生而生。',
      en: 'Full Chinese service from search to signing; English leases explained clause by clause — built for newcomers and students.',
    },
  },
]

function Small({ children }: { children: React.ReactNode }) {
  return (
    <small className="ml-[3px] font-bold" style={{ fontSize: '.42em', letterSpacing: 0 }}>
      {children}
    </small>
  )
}

const SHIFTS: { role: RoleKey; who: string; from: LS; to: LS }[] = [
  { role: 'tenant', who: 'TENANT × LUNA', from: { zh: '申请人', en: 'Applicant' }, to: { zh: '被数据争取的人', en: 'The one data fights for' } },
  { role: 'landlord', who: 'LANDLORD × LOGIC', from: { zh: '管理员', en: 'Property manager' }, to: { zh: '只做决定的人', en: 'The one who only decides' } },
  { role: 'agent', who: 'AGENT × BRIEF', from: { zh: '业务员', en: 'Salesperson' }, to: { zh: '只做专业的人', en: 'The one who only does the craft' } },
]

type Panel = {
  role: RoleKey
  tab: LSS
  quote: LSS
  who: LSS
  scenes: { file: string; gradient: string; act: LSS; orbchip?: LSS; capTitle: LSS; capBody: LSS }[]
  deltaFrom: LSS
  deltaTo: LSS
  whyLead: LSS
  whyBody: LSS
  cta: LSS
  onboardingHref: string
}

const PANELS: Panel[] = [
  {
    role: 'tenant',
    tab: { zh: 'Mia 的故事', en: "Mia's story" },
    quote: { zh: '没有加拿大信用记录，我到底该怎么租房？', en: 'With no Canadian credit history, how am I supposed to rent at all?' },
    who: { zh: 'MIA CHEN · 27 · 软件工程师 · 新移民', en: 'MIA CHEN · 27 · SOFTWARE ENGINEER · NEWCOMER' },
    scenes: [
      {
        file: 'mia-01-anxious.jpg',
        gradient: 'linear-gradient(160deg,#3A3247,#241F30 55%,#17131F)',
        act: { zh: '第一幕 · 深夜的申请表', en: 'ACT 1 · FORMS AT MIDNIGHT' },
        capTitle: { zh: '信用空白，被拒 3 次。', en: 'No credit file, rejected 3 times.' },
        capBody: {
          zh: '纸箱堆满旧住处，3 天后必须退房。五个网站刷到深夜，同样的资料填了一遍又一遍。',
          en: 'Boxes piled in the old place, 3 days to move out. Five sites till midnight, the same forms over and over.',
        },
      },
      {
        file: 'mia-02-luna.jpg',
        gradient: 'linear-gradient(150deg,#8B6BD9,#6D46C4 50%,#4A2E8E)',
        act: { zh: '第二幕 · 一句话', en: 'ACT 2 · ONE SENTENCE' },
        orbchip: { zh: 'LUNA 接手', en: 'LUNA TAKES OVER' },
        capTitle: { zh: '"市中心、一居、能养猫。"', en: '"Downtown, one-bed, cat-friendly."' },
        capBody: {
          zh: 'Luna 翻遍全城、约看、比价，把英文租约逐条讲成中文，替她跟房东谈。',
          en: 'Luna combs the whole city, books viewings, compares prices, explains the English lease clause by clause in Chinese, and negotiates with the landlord.',
        },
      },
      {
        file: 'mia-03-home.jpg',
        gradient: 'linear-gradient(150deg,#E9C99B,#C08B57 55%,#7A4E3C)',
        act: { zh: '第三幕 · 城市灯火', en: 'ACT 3 · CITY LIGHTS' },
        capTitle: { zh: '当天电子签约。', en: 'E-signed the same day.' },
        capBody: {
          zh: '报修 2 小时响应，12 个月租金准时 —— 她的记录开始替她说话。',
          en: 'Repairs answered within 2 hours, 12 months of on-time rent — her record starts speaking for her.',
        },
      },
    ],
    deltaFrom: { zh: 'Score 60', en: 'Score 60' },
    deltaTo: { zh: '91', en: '91' },
    whyLead: { zh: '第二次搬家，她只说了一句话。', en: 'Her second move took one sentence.' },
    whyBody: {
      zh: '验证过一次的 Passport 处处通行，8 维评分让没有信用记录的人也有了会说话的履历。',
      en: ' A Passport verified once travels everywhere; the 8-dimension score gives people without credit history a résumé that speaks.',
    },
    cta: { zh: '唤醒你的 AI 租房助手 →', en: 'Wake up your rental AI →' },
    onboardingHref: '/onboarding/welcome',
  },
  {
    role: 'landlord',
    tab: { zh: 'Sarah 的故事', en: "Sarah's story" },
    quote: { zh: '做决定前要查、要比，还怕踩 RTA 的雷。', en: 'Before every decision I research, compare — and worry about tripping the RTA.' },
    who: { zh: 'SARAH WANG · 41 · 会计师 · 2 套投资公寓', en: 'SARAH WANG · 41 · ACCOUNTANT · 2 INVESTMENT CONDOS' },
    scenes: [
      {
        file: 'sarah-01-vacancy.jpg',
        gradient: 'linear-gradient(160deg,#2A3550,#1D2438 55%,#131829)',
        act: { zh: '第一幕 · 空置在烧钱', en: 'ACT 1 · VACANCY BURNS CASH' },
        capTitle: { zh: '每月 $2,900 空置损失。', en: '$2,900 lost to vacancy each month.' },
        capBody: {
          zh: '一叠申请不知道信谁 —— 工资单是真是假？深夜还被报修电话吵醒。',
          en: 'A stack of applications and no idea who to trust — are the pay stubs even real? Maintenance calls still wake her at night.',
        },
      },
      {
        file: 'sarah-02-logic.jpg',
        gradient: 'linear-gradient(150deg,#2E8B6E,#10614C 55%,#0A3D31)',
        act: { zh: '第二幕 · 尽调排好序', en: 'ACT 2 · DILIGENCE, RANKED' },
        orbchip: { zh: 'LOGIC 接管', en: 'LOGIC TAKES OVER' },
        capTitle: { zh: '4 分钟重做房源，多平台同步。', en: 'Listing rebuilt in 4 minutes, synced everywhere.' },
        capBody: {
          zh: '每份申请 8 维尽调读完排好序，「不养宠」这类 RTA 雷区当场被拦下。',
          en: 'Every application arrives with 8-dimension diligence read and ranked; RTA landmines like "no pets" get blocked on the spot.',
        },
      },
      {
        file: 'sarah-03-decide.jpg',
        gradient: 'linear-gradient(150deg,#F3D9A4,#D9A05B 55%,#8C5B3F)',
        act: { zh: '第三幕 · 阳台上的早晨', en: 'ACT 3 · MORNING ON THE BALCONY' },
        capTitle: { zh: '午休时按下「同意」。', en: 'She taps "Approve" on her lunch break.' },
        capBody: {
          zh: '租约自动起草电子签。夜间报修、Month 11 续约决策包，都有 Logic 盯着。',
          en: 'The lease drafts and e-signs itself. Night maintenance and the Month-11 renewal decision pack — Logic watches it all.',
        },
      },
    ],
    deltaFrom: { zh: '30 分钟', en: '30 min' },
    deltaTo: { zh: '30 秒', en: '30 sec' },
    whyLead: { zh: '她的工作只剩一件事：拍板。', en: 'Her job is down to one thing: the decision.' },
    whyBody: {
      zh: '接待、尽调、起草、收租、续约全部后台完成，每个对外动作先经她点头、留有审计痕迹。',
      en: ' Intake, diligence, drafting, rent and renewals all run in the background — every outbound action waits for her nod and leaves an audit trail.',
    },
    cta: { zh: '让 Logic 接管你的房源 →', en: 'Let Logic take over your listings →' },
    onboardingHref: '/onboarding/name?role=landlord',
  },
  {
    role: 'agent',
    tab: { zh: 'David 的故事', en: "David's story" },
    quote: { zh: '不是没机会，是时间被行政碎片化了。', en: "It's not a lack of opportunity — my time gets shredded by admin." },
    who: { zh: 'DAVID PARK · 35 · 持牌经纪 · RECO 6 年', en: 'DAVID PARK · 35 · LICENSED AGENT · 6 YEARS RECO' },
    scenes: [
      {
        file: 'david-01-task.jpg',
        gradient: 'linear-gradient(160deg,#3C4658,#2A3140 55%,#1B202B)',
        act: { zh: '第一幕 · 车里的任务', en: 'ACT 1 · TASKS FROM THE CAR' },
        capTitle: { zh: '70% 的时间耗在杂活上。', en: '70% of his time went to busywork.' },
        capBody: {
          zh: '整理材料、排时间、催跟进；收入不稳，客户一忙就跟丢。',
          en: 'Prepping materials, juggling schedules, chasing follow-ups; income unstable, clients lost the moment things get busy.',
        },
      },
      {
        file: 'david-02-showing.jpg',
        gradient: 'linear-gradient(150deg,#5B8DEF,#2F63CF 55%,#1E3F8F)',
        act: { zh: '第二幕 · 专业带看', en: 'ACT 2 · THE PROFESSIONAL SHOWING' },
        orbchip: { zh: 'BRIEF 编排', en: 'BRIEF ORCHESTRATES' },
        capTitle: { zh: '他只做专业的部分。', en: 'He only does the professional part.' },
        capBody: {
          zh: '时间地点、租客画像、授权问答清单 —— 材料包 Brief 已备好，记录自动归档留痕。',
          en: 'Time and place, tenant profile, authorized Q&A checklist — Brief has the packet ready, and records archive themselves with a full trail.',
        },
      },
      {
        file: 'david-03-payout.jpg',
        gradient: 'linear-gradient(150deg,#F5C983,#DE9552 55%,#96583A)',
        act: { zh: '第三幕 · 落日与结算', en: 'ACT 3 · SUNSET AND SETTLEMENT' },
        capTitle: { zh: '当晚自动结算。', en: 'Settled automatically that night.' },
        capBody: {
          zh: '月度回顾：带看 32 次、保留率 94%、Toronto West Top 8%。转介分账 RECO 合规、全程留痕。',
          en: 'Monthly review: 32 showings, 94% retention, Toronto West Top 8%. Referral splits RECO-compliant, fully logged.',
        },
      },
    ],
    deltaFrom: { zh: '时薪 $25', en: 'Hourly $25' },
    deltaTo: { zh: '$43', en: '$43' },
    whyLead: { zh: '同样的一周，接得下两倍的客户。', en: 'The same week now fits twice the clients.' },
    whyBody: {
      zh: 'AI 编排一切、当晚结算 —— 他的时间只花在带看与专业判断上。',
      en: ' AI orchestrates everything and settles the same night — his time goes only to showings and professional judgment.',
    },
    cta: { zh: '让 Brief 打理你的业务 →', en: 'Let Brief run your business →' },
    onboardingHref: '/onboarding/name?role=agent',
  },
]

const DIMS: { zh: string; en: string; v: number }[] = [
  { zh: '身份核验', en: 'Identity', v: 99 },
  { zh: '收入流水', en: 'Income flow', v: 92 },
  { zh: '租住历史', en: 'Rental history', v: 96 },
  { zh: '文档反欺诈', en: 'Doc anti-fraud', v: 94 },
  { zh: '法庭裁定', en: 'Court rulings', v: 100 },
  { zh: '行为信号', en: 'Behavior signals', v: 88 },
]

const CHECKLIST: { noKey: string; no: LSS; h: LSS; p: LS; chip: LSS; chipRole: RoleKey }[] = [
  {
    noKey: '01',
    no: { zh: '01 · 找房', en: '01 · SEARCH' },
    h: { zh: '说一句，收房源', en: 'Say it once, get listings' },
    p: {
      zh: (
        <>
          对话式搜索全城实时房源，<b style={{ color: INK }}>行情卡 + TRREB 官方基准</b>自动附上，议价有底气。
        </>
      ),
      en: (
        <>
          Conversational search across live city listings, with the <b style={{ color: INK }}>market card + official TRREB benchmark</b>{' '}
          attached — negotiate with confidence.
        </>
      ),
    },
    chip: { zh: 'LUNA 已接管', en: 'LUNA ON IT' },
    chipRole: 'tenant',
  },
  {
    noKey: '02',
    no: { zh: '02 · 尽调', en: '02 · DILIGENCE' },
    h: { zh: '验一次，处处通行', en: 'Verify once, go anywhere' },
    p: {
      zh: (
        <>
          90 秒建好 Rental Passport，<b style={{ color: INK }}>8 维评分</b>替你说话 —— 每次申请一键复用。
        </>
      ),
      en: (
        <>
          Build your Rental Passport in 90 seconds; the <b style={{ color: INK }}>8-dimension score</b> speaks for you — reused in one
          click on every application.
        </>
      ),
    },
    chip: { zh: 'LUNA 已接管', en: 'LUNA ON IT' },
    chipRole: 'tenant',
  },
  {
    noKey: '03',
    no: { zh: '03 · 签约', en: '03 · SIGNING' },
    h: { zh: '看得懂，签得快', en: 'Understand it, sign it fast' },
    p: {
      zh: (
        <>
          安省标准 / TRREB 租约一键起草，<b style={{ color: INK }}>逐条中文解读</b>，当天电子签。
        </>
      ),
      en: (
        <>
          Ontario Standard / TRREB leases drafted in one click, <b style={{ color: INK }}>explained clause by clause in Chinese</b>,
          e-signed the same day.
        </>
      ),
    },
    chip: { zh: 'LOGIC 协同', en: 'LOGIC IN SYNC' },
    chipRole: 'landlord',
  },
  {
    noKey: '04',
    no: { zh: '04 · 入住托管', en: '04 · MOVE-IN CARE' },
    h: { zh: '住进去，不断联', en: 'Move in, stay connected' },
    p: {
      zh: (
        <>
          缴租、维修、续约、退租全程照看，<b style={{ color: INK }}>续约提前 120 天</b>备好方案等你选。
        </>
      ),
      en: (
        <>
          Rent, repairs, renewal and move-out all looked after — <b style={{ color: INK }}>renewal options ready 120 days ahead</b>,
          waiting for your pick.
        </>
      ),
    },
    chip: { zh: 'LUNA 在岗', en: 'LUNA ON DUTY' },
    chipRole: 'tenant',
  },
]

const PRICE_CHECKS: LSS[] = [
  { zh: '验证一次，N 次申请一键复用', en: 'Verify once, reuse across N applications in one click' },
  { zh: '你的评分你先看 —— 每一分都有理由', en: 'You see your score first — a reason behind every point' },
  { zh: '分享哪些字段，每次由你点头，原件永不离开你', en: 'You approve which fields to share, every time — originals never leave you' },
]
