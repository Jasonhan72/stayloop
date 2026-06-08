'use client'

import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

const PRINCIPLES = [
  { h: '关键决定永远是你的', b: 'AI 替你跑流程、压结论,但分享 Passport、提交申请、签约、付款 —— 全部经你确认才执行。' },
  { h: '信任可以复用', b: '验证一次,跨房东、平台、机构出示摘要。把一叠 PDF 变成一个可携带的协议。' },
  { h: '看得见来源', b: '每一分都能点开看到它从哪来。不是黑箱风险分,而是加权的证据。' },
  { h: '合规是底线', b: '符合本地法律 · 软查不影响信用 · 每一步链上留痕、可回溯。' },
]

export default function AboutPage() {
  return (
    <div style={{ background: '#FAF7EE', color: '#171717' }}>
      <Header variant="transparent" />
      <section style={{ background: 'linear-gradient(180deg,#F2EEE5 0%,#E4EEE3 100%)' }}>
        <div className="mx-auto max-w-[900px] px-5 py-24 sm:px-7 lg:px-12">
          <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-brand">ABOUT · STAYLOOP</div>
          <h1 className="mt-4 text-[40px] font-extrabold leading-[1.08] tracking-tight sm:text-[54px]">
            为 AI 时代,<br />重新设计租住的方式。
          </h1>
          <p className="mt-6 max-w-[680px] text-[17px] leading-relaxed text-body-2">
            在 Toronto,租客和房东 90% 的时间不是在沟通,而是在重复填表、互不信任地观察对方。
            Stayloop 用 AI 把这些重复劳动系统化,把信任变成可复用的协议 —— 让真正的人,专注在真正重要的决定上。
          </p>
        </div>
      </section>

      <section>
        <div className="mx-auto max-w-[1100px] px-5 py-20 sm:px-7 lg:px-12">
          <h2 className="text-[26px] font-extrabold tracking-tight sm:text-[32px]">我们的原则</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {PRINCIPLES.map((p) => (
              <div key={p.h} className="sl-card p-6">
                <h4 className="text-[16px] font-bold">{p.h}</h4>
                <p className="mt-2 text-[13.5px] leading-relaxed text-body-2">{p.b}</p>
              </div>
            ))}
          </div>
          <div className="mt-12 flex flex-wrap gap-3">
            <Link href="/onboarding/welcome" className="sl-btn-primary !px-6 !py-[13px] !text-[15px]">开始使用 →</Link>
            <Link href="/contact" className="rounded-[10px] border border-line-strong bg-white px-6 py-[12px] text-[14px] font-semibold text-body transition hover:border-brand hover:text-brand">联系我们</Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
