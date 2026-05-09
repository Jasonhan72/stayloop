'use client'

import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

/**
 * V5 ART 35 · Agent Onboarding
 * 4-step "join the network" flow.
 */

const STEPS = [
  {
    n: 1,
    title: '上传 RECO 执照',
    desc: '我们会向 RECO 在线核验你的牌照状态，通常 1 小时内完成。',
    fields: ['执照号', '姓名', 'Brokerage'],
  },
  {
    n: 2,
    title: '设定接单偏好',
    desc: '区域、客单价、是否拍照 / 写作配套。Brief 按这些来分配任务。',
    fields: ['工作区域', '客单价区间', '可接业务类型'],
  },
  {
    n: 3,
    title: 'Stripe Connect',
    desc: '佣金每单 24h 内结算到你的银行账户，T4A 自动报送 CRA。',
    fields: ['Stripe Connect 授权'],
  },
  {
    n: 4,
    title: '资质审核',
    desc: 'Stayloop 团队审核你的资料 + 第一周的 onboarding call。',
    fields: ['Onboarding call 时间'],
  },
]

const PERKS = [
  '7×24 自动派单 — 无需自己拉客',
  '佣金每单 24h 内到账（市场平均 30 天）',
  'Brief AI 帮你写 listing / brief 包 / OREA 表',
  'Stayloop 客户已通过 Tier 验证 — no time wasters',
  'T4A / GST 自动归集',
]

export default function AgentOnboardingPage() {
  return (
    <>
      <Header />
      <main className="bg-surface">
        {/* Hero */}
        <section
          className="relative overflow-hidden"
          style={{
            background:
              'linear-gradient(180deg,#F2EEE5 0%, rgba(37,99,235,0.10) 100%)',
          }}
        >
          <div className="mx-auto max-w-[1320px] px-6 py-20 sm:px-8 lg:px-12">
            <div className="grid items-center gap-10 lg:grid-cols-[1.4fr_1fr]">
              <div>
                <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-agent">
                  AGENT · 加入网络
                </div>
                <h1 className="mt-3 text-[44px] font-extrabold leading-tight tracking-tight sm:text-[56px]">
                  做 Toronto 最被尊重的<br />租赁经纪。
                </h1>
                <p className="mt-5 max-w-[560px] text-[16px] leading-relaxed text-body-2">
                  Brief 是你的 AI copilot — 它接客户、配房源、写 brief、起草约 ；
                  你做的是面对面的判断。已通过 Tier 验证的客户直接进你 inbox。
                </p>
                <div className="mt-7 flex flex-wrap gap-3">
                  <Link
                    href="#start"
                    className="sl-btn-primary !px-6 !py-[14px]"
                    style={{ background: '#1E3A8A' }}
                  >
                    开始申请 →
                  </Link>
                  <Link href="/agent/agent" className="sl-btn-secondary !py-[12px]">
                    先看 Brief 工作台
                  </Link>
                </div>
              </div>
              <div className="hidden lg:block">
                <div className="sl-card p-7">
                  <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-agent">
                    加入后你能享受
                  </div>
                  <ul className="mt-4 space-y-3 text-[13.5px] text-body-2">
                    {PERKS.map((p) => (
                      <li key={p} className="flex items-start gap-2">
                        <span
                          className="mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[10px]"
                          style={{ background: 'rgba(37,99,235,0.15)', color: '#1E3A8A' }}
                        >
                          ✓
                        </span>
                        {p}
                      </li>
                    ))}
                  </ul>
                  <div
                    className="mt-5 rounded-[10px] border px-4 py-3 text-[12.5px]"
                    style={{ background: 'rgba(37,99,235,0.06)', borderColor: 'rgba(37,99,235,0.25)' }}
                  >
                    <b>$52,800</b> · 网络内经纪 2025 平均年收入
                    <br />
                    <span className="text-body-3">vs. GTA 平均 $41,200（CREA 2024）</span>
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
            4 步加入，平均 48 小时通过
          </h2>
          <p className="mt-2 text-[14px] text-body-2">
            申请 / 资质 / 收款 / 审核 — Stayloop 团队会全程协助。
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
                  <h3 className="text-[18px] font-bold tracking-tight">{s.title}</h3>
                  <p className="mt-1 text-[13.5px] text-body-2">{s.desc}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {s.fields.map((f) => (
                      <span
                        key={f}
                        className="rounded-[6px] border border-line-divider bg-white px-2.5 py-1 font-mono text-[10.5px] text-body-2"
                      >
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
                <button className="rounded-[10px] border border-line-strong bg-white px-4 py-[10px] text-[13px] font-semibold text-body transition hover:border-agent hover:text-agent">
                  {s.n === 1 ? '上传执照' : s.n === 4 ? '约时间' : '设定'}
                </button>
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
              <h3 className="text-[22px] font-bold tracking-tight">现在就提交</h3>
              <p className="mt-1 text-[13.5px] text-body-2">
                我们 1 个工作日内回复。审核期间 Brief 工作台只读权限已为你开通。
              </p>
            </div>
            <div className="flex gap-3">
              <Link
                href="/contact"
                className="sl-btn-primary !px-6 !py-[12px]"
                style={{ background: '#1E3A8A' }}
              >
                提交申请 →
              </Link>
              <Link href="/contact" className="sl-btn-secondary">
                先聊聊
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
