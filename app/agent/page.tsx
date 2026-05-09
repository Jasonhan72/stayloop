'use client'

import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

export default function AgentLanding() {
  return (
    <>
      <Header active="/agent" />
      <main className="bg-surface">
        <section
          className="relative overflow-hidden"
          style={{ background: 'linear-gradient(180deg,#F2EEE5 0%, rgba(37,99,235,0.10) 100%)' }}
        >
          <div className="mx-auto max-w-[1320px] px-5 py-20 sm:px-7 lg:px-12">
            <div className="grid items-center gap-12 lg:grid-cols-[1.4fr_1fr]">
              <div>
                <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-info">
                  AGENT · BRIEF
                </div>
                <h1 className="mt-3 text-[44px] font-extrabold leading-tight tracking-tight sm:text-[56px]">
                  把行政交给系统，<br />把关系留给人。
                </h1>
                <p className="mt-5 max-w-[580px] text-[17px] leading-relaxed text-body-2">
                  Brief 帮你接客户、拍房源、安排看房、跟进申请。
                  你专注线下服务、谈判和信任关系，每场看房都有清晰授权范围 + 即时结算。
                </p>
                <div className="mt-7 flex flex-wrap gap-3">
                  <Link href="/agent/agent" className="sl-btn-primary !px-6 !py-[14px]">
                    打开我的任务板
                  </Link>
                  <Link href="/agent/onboarding" className="sl-btn-secondary !py-[12px]">
                    加入经纪网络
                  </Link>
                </div>
              </div>
              <div className="hidden lg:block">
                <div className="sl-card relative aspect-square w-full overflow-hidden p-8">
                  <div className="orb agent pulse mx-auto h-[120px] w-[120px]" style={{ color: '#2563EB' }} />
                  <div className="mt-6 text-center">
                    <div className="text-[20px] font-bold">Brief</div>
                    <div className="font-mono text-[11px] uppercase tracking-eyebrow text-body-3">FIELD AGENT COPILOT</div>
                  </div>
                  <div className="mt-6 space-y-2">
                    {['每单清晰授权范围 · 不出错', '看完即结算 · 无拖款', '客户记忆 = 你的资产'].map((l) => (
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
      </main>
      <Footer />
    </>
  )
}
