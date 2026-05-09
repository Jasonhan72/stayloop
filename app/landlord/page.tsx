'use client'

import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

export default function LandlordLanding() {
  return (
    <>
      <Header />
      <main className="bg-surface">
        <section
          className="relative overflow-hidden"
          style={{ background: 'linear-gradient(180deg,#F2EEE5 0%, rgba(4,120,87,0.10) 100%)' }}
        >
          <div className="mx-auto max-w-[1320px] px-5 py-20 sm:px-7 lg:px-12">
            <div className="grid items-center gap-12 lg:grid-cols-[1.4fr_1fr]">
              <div>
                <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-brand">
                  LANDLORD · LOGIC
                </div>
                <h1 className="mt-3 text-[44px] font-extrabold leading-tight tracking-tight sm:text-[56px]">
                  让出租更清晰，<br />也更可靠。
                </h1>
                <p className="mt-5 max-w-[580px] text-[17px] leading-relaxed text-body-2">
                  Logic 把每份申请的身份、收入、信用、法庭记录、上家 reference 整理在一张卡上。
                  你设定政策，它替你筛选；关键决策一直在你手里。
                </p>
                <div className="mt-7 flex flex-wrap gap-3">
                  <Link href="/dashboard" className="sl-btn-primary !px-6 !py-[14px]">
                    打开我的工作台
                  </Link>
                  <Link href="/pricing" className="sl-btn-secondary !py-[12px]">
                    定价方案
                  </Link>
                </div>
              </div>
              <div className="hidden lg:block">
                <div className="sl-card relative aspect-square w-full overflow-hidden p-8">
                  <div className="orb landlord pulse mx-auto h-[120px] w-[120px]" style={{ color: '#047857' }} />
                  <div className="mt-6 text-center">
                    <div className="text-[20px] font-bold">Logic</div>
                    <div className="font-mono text-[11px] uppercase tracking-eyebrow text-body-3">YOUR LANDLORD COPILOT</div>
                  </div>
                  <div className="mt-6 space-y-2">
                    {['六维 AI 评分 · 信用 / 收入 / 法庭 / 稳定性…', '租约自动起草 + LTB 兼容', '风险信号 24/7 监测'].map((l) => (
                      <div key={l} className="rounded-lg bg-surface-chip px-3 py-2 text-[13px]">
                        ✓ {l}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1320px] px-5 py-20 sm:px-7 lg:px-12">
          <h2 className="text-[28px] font-bold tracking-tight sm:text-[34px]">
            从发布到续约，全流程一个 workspace
          </h2>
          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[
              { t: '发布房源', d: '设定 Tier 要求 · 系统自动同步到 listing 详情页 + 申请入口。' },
              { t: '智能筛选', d: 'Logic 按你的政策自动跑过每份意向，给出推荐和拒绝理由。' },
              { t: '电子签约', d: 'OREA Form 400 兼容 · 双方签字 · 自动归档。' },
              { t: '租金 + 维修', d: '自动收租、维修工单分发、续约提醒。' },
            ].map((b) => (
              <div key={b.t} className="sl-card p-6">
                <h3 className="text-[18px] font-bold tracking-tight">{b.t}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-body-2">{b.d}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
