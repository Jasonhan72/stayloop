'use client'

import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { useT } from '@/lib/i18n'

/**
 * V5 ART 35 · Agent Onboarding
 * 4-step "join the network" flow.
 */

const STEPS = [
  {
    n: 1,
    title: { zh: '上传 RECO 执照', en: 'Upload RECO license' },
    desc: { zh: '我们会向 RECO 在线核验你的牌照状态，通常 1 小时内完成。', en: 'We verify your license status with RECO online, usually within an hour.' },
    fields: [
      { zh: '执照号', en: 'License #' },
      { zh: '姓名', en: 'Name' },
      { zh: 'Brokerage', en: 'Brokerage' },
    ],
  },
  {
    n: 2,
    title: { zh: '设定接单偏好', en: 'Set assignment preferences' },
    desc: { zh: '区域、客单价、是否拍照 / 写作配套。AI Agent 按这些来分配任务。', en: 'Area, deal size, whether you offer photo / copywriting add-ons. Your AI agent assigns tasks accordingly.' },
    fields: [
      { zh: '工作区域', en: 'Service area' },
      { zh: '客单价区间', en: 'Deal-size range' },
      { zh: '可接业务类型', en: 'Business types accepted' },
    ],
  },
  {
    n: 3,
    title: { zh: 'Stripe Connect', en: 'Stripe Connect' },
    desc: { zh: '转介费在线结算，每笔自动开具含 HST 的发票，报税时直接导出。', en: 'Referral fees settle online, each with an HST invoice issued automatically — export them at tax time.' },
    fields: [{ zh: 'Stripe Connect 授权', en: 'Stripe Connect authorization' }],
  },
  {
    n: 4,
    title: { zh: '资质审核', en: 'Credential review' },
    desc: { zh: 'Stayloop 团队审核你的资料 + 第一周的 onboarding call。', en: 'The Stayloop team reviews your profile plus a first-week onboarding call.' },
    fields: [{ zh: 'Onboarding call 时间', en: 'Onboarding call time' }],
  },
]

const PERKS = [
  { zh: '7×24 自动派单 — 无需自己拉客', en: '24/7 auto-dispatch — no need to chase leads yourself' },
  { zh: '佣金每单 24h 内到账（市场平均 30 天）', en: 'Commission paid within 24h per deal (market average 30 days)' },
  { zh: 'AI 帮你写 listing / brief 包 / OREA 表', en: 'AI drafts your listings / brief packs / OREA forms' },
  { zh: 'Stayloop 客户已通过盖章验证 — no time wasters', en: 'Stayloop clients are stamp-verified — no time wasters' },
  { zh: 'T4A / GST 自动归集', en: 'T4A / GST automatically reconciled' },
]

export default function AgentOnboardingPage() {
  const { lang } = useT()
  const zh = lang === 'zh'
  return (
    <>
      <Header variant="transparent" />
      <main className="bg-surface">
        {/* Hero */}
        <section
          className="relative overflow-hidden"
          style={{
            background:
              'linear-gradient(180deg,#F4F6F9 0%, rgba(37,99,235,0.10) 100%)',
            marginTop: -72,
            paddingTop: 72,
          }}
        >
          <div className="mx-auto max-w-[1320px] px-6 py-20 sm:px-8 lg:px-12">
            <div className="grid items-center gap-10 lg:grid-cols-[1.4fr_1fr]">
              <div>
                <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-agent">
                  {zh ? 'AGENT · 加入网络' : 'AGENT · JOIN THE NETWORK'}
                </div>
                <h1 className="mt-3 text-[32px] font-extrabold leading-tight tracking-tight sm:text-[56px]">
                  {zh ? <>做 Toronto 最被尊重的<br />租赁经纪。</> : <>Become Toronto’s most<br />respected leasing agent.</>}
                </h1>
                <p className="mt-5 max-w-[560px] text-[16px] leading-relaxed text-body-2">
                  {zh
                    ? '你的 AI Agent 是你的 copilot — 它接客户、配房源、写 brief、起草约 ;你做的是面对面的判断。已通过盖章验证的客户直接进你 inbox。'
                    : 'Your AI agent is your copilot — it takes clients, matches listings, writes briefs and drafts leases; you make the face-to-face calls. Stamp-verified clients land straight in your inbox.'}
                </p>
                <div className="mt-7 flex flex-wrap gap-3">
                  <Link
                    href="#start"
                    className="sl-btn-primary !px-6 !py-[14px]"
                    style={{ background: '#1E3A8A' }}
                  >
                    {zh ? '开始申请 →' : 'Start application →'}
                  </Link>
                  <Link href="/agent/agent" className="sl-btn-secondary !py-[12px]">
                    {zh ? '先看 AI Agent 工作台' : 'Preview the AI Agent workspace'}
                  </Link>
                </div>
              </div>
              <div className="hidden lg:block">
                <div className="sl-card p-7">
                  <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-agent">
                    {zh ? '加入后你能享受' : 'What you get after joining'}
                  </div>
                  <ul className="mt-4 space-y-3 text-[13.5px] text-body-2">
                    {PERKS.map((p) => (
                      <li key={p.en} className="flex items-start gap-2">
                        <span
                          className="mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[10px]"
                          style={{ background: 'rgba(37,99,235,0.15)', color: '#1E3A8A' }}
                        >
                          ✓
                        </span>
                        {p[lang]}
                      </li>
                    ))}
                  </ul>
                  <div
                    className="mt-5 rounded-[10px] border px-4 py-3 text-[12.5px]"
                    style={{ background: 'rgba(37,99,235,0.06)', borderColor: 'rgba(37,99,235,0.25)' }}
                  >
                    {zh ? <><b>$52,800</b> · 网络内经纪 2025 平均年收入</> : <><b>$52,800</b> · average 2025 annual income for network agents</>}
                    <br />
                    <span className="text-body-3">{zh ? 'vs. GTA 平均 $41,200（CREA 2024）' : 'vs. GTA average $41,200 (CREA 2024)'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 4-step */}
        <section
          id="start"
          className="mx-auto max-w-[1320px] px-6 py-20 sm:px-8 lg:px-12"
        >
          <h2 className="text-[28px] font-bold tracking-tight sm:text-[34px]">
            {zh ? '4 步加入，平均 48 小时通过' : '4 steps to join, approved in 48 hours on average'}
          </h2>
          <p className="mt-2 text-[14px] text-body-2">
            {zh ? '申请 / 资质 / 收款 / 审核 — Stayloop 团队会全程协助。' : 'Apply / credential / payment / review — the Stayloop team assists you throughout.'}
          </p>

          <div className="mt-10 space-y-5">
            {STEPS.map((s) => (
              <div
                key={s.n}
                className="grid gap-5 sl-card p-7 sm:grid-cols-[80px_1fr_auto] sm:items-center"
              >
                <div
                  className="flex h-14 w-14 items-center justify-center rounded-full text-[20px] font-extrabold text-white"
                  style={{ background: '#1E3A8A' }}
                >
                  {s.n}
                </div>
                <div>
                  <h3 className="text-[18px] font-bold tracking-tight">{s.title[lang]}</h3>
                  <p className="mt-1 text-[13.5px] text-body-2">{s.desc[lang]}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {s.fields.map((f) => (
                      <span
                        key={f.en}
                        className="rounded-[6px] border border-line-divider bg-white px-2.5 py-1 font-mono text-[10.5px] text-body-2"
                      >
                        {f[lang]}
                      </span>
                    ))}
                  </div>
                </div>
                <Link
                  href={`/agent/agent?prompt=${encodeURIComponent(zh ? `帮我完成入驻第 ${s.n} 步：${s.title.zh}` : `Help me complete onboarding step ${s.n}: ${s.title.en}`)}`}
                  className="rounded-[10px] border border-line-strong bg-white px-4 py-[10px] text-center text-[13px] font-semibold text-body transition hover:border-agent hover:text-agent"
                >
                  {s.n === 1
                    ? (zh ? '上传执照' : 'Upload license')
                    : s.n === 4
                      ? (zh ? '约时间' : 'Book time')
                      : (zh ? '设定' : 'Set up')}
                </Link>
              </div>
            ))}
          </div>
        </section>

        {/* CTA strip */}
        <section
          className="border-t border-line-divider"
          style={{ background: 'rgba(37,99,235,0.06)' }}
        >
          <div className="mx-auto flex max-w-[1320px] flex-wrap items-center justify-between gap-6 px-6 py-12 sm:px-8 lg:px-12">
            <div>
              <h3 className="text-[22px] font-bold tracking-tight">{zh ? '现在就提交' : 'Submit now'}</h3>
              <p className="mt-1 text-[13.5px] text-body-2">
                {zh ? '我们 1 个工作日内回复。审核期间 AI Agent 工作台只读权限已为你开通。' : 'We reply within one business day. Read-only access to the AI Agent workspace is enabled for you during review.'}
              </p>
            </div>
            <div className="flex gap-3">
              <Link
                href="/contact"
                className="sl-btn-primary !px-6 !py-[12px]"
                style={{ background: '#1E3A8A' }}
              >
                {zh ? '提交申请 →' : 'Submit application →'}
              </Link>
              <Link href="/contact" className="sl-btn-secondary">
                {zh ? '先聊聊' : 'Chat first'}
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
