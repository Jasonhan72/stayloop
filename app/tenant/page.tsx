'use client'

import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

export default function TenantLanding() {
  return (
    <>
      <Header />
      <main className="bg-surface">
        <section
          className="relative overflow-hidden"
          style={{ background: 'linear-gradient(180deg,#F2EEE5 0%, rgba(124,58,237,0.08) 100%)' }}
        >
          <div className="mx-auto max-w-[1320px] px-5 py-20 sm:px-7 lg:px-12">
            <div className="grid items-center gap-12 lg:grid-cols-[1.4fr_1fr]">
              <div>
                <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-tenant">
                  TENANT · LUNA
                </div>
                <h1 className="mt-3 text-[44px] font-extrabold leading-tight tracking-tight sm:text-[56px]">
                  一次验证，<br />处处通行。
                </h1>
                <p className="mt-5 max-w-[580px] text-[17px] leading-relaxed text-body-2">
                  你的 AI 经纪 Luna 记得你的预算、偏好、生活习惯。
                  Rental Passport 让你从一份资料、一次心力，应付所有 Toronto 的房东与房源。
                </p>
                <div className="mt-7 flex flex-wrap gap-3">
                  <Link href="/onboarding/tier1" className="sl-btn-primary !px-6 !py-[14px]">
                    创建 Rental Passport
                  </Link>
                  <Link href="/listings" className="sl-btn-secondary !py-[12px]">
                    浏览房源
                  </Link>
                </div>
              </div>
              <div className="hidden lg:block">
                <div className="sl-card relative aspect-square w-full overflow-hidden p-8">
                  <div className="orb tenant pulse mx-auto h-[120px] w-[120px]" style={{ color: '#7C3AED' }} />
                  <div className="mt-6 text-center">
                    <div className="text-[20px] font-bold">Luna</div>
                    <div className="font-mono text-[11px] uppercase tracking-eyebrow text-body-3">PERSONAL AGENT</div>
                  </div>
                  <div className="mt-6 space-y-2">
                    {['每天为你筛选新房源', '记住你的偏好和拒绝过的', '关键节点等你确认'].map((l) => (
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
            Rental Passport 让你少填 80% 重复表
          </h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              { t: '一次输入，处处复用', d: '身份、收入、信用、上家 reference 录入一次，下次申请直接授权调用。' },
              { t: '你授权才能看', d: '房东只能看到你勾选的字段。撤销授权立刻失效。' },
              { t: '随你升级', d: '想看更高 Tier 的房源？升级 Passport，立刻多解锁。' },
            ].map((b) => (
              <div key={b.t} className="sl-card p-6">
                <h3 className="text-[18px] font-bold tracking-tight">{b.t}</h3>
                <p className="mt-2 text-[13.5px] leading-relaxed text-body-2">{b.d}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
