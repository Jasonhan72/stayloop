'use client'

import Header from '@/components/Header'
import Footer from '@/components/Footer'

export default function AboutPage() {
  return (
    <>
      <Header />
      <main className="bg-surface">
        <section className="mx-auto max-w-[820px] px-5 py-20 sm:px-7">
          <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-brand">
            ABOUT · STAYLOOP
          </div>
          <h1 className="mt-3 text-[44px] font-extrabold leading-tight tracking-tight sm:text-[56px]">
            为多伦多重新设计租住的方式。
          </h1>
          <p className="mt-6 text-[16px] leading-relaxed text-body-2">
            Stayloop 起源于一个朴素的观察 — 在 Toronto，租客和房东 90% 的时间不是在沟通，而是在重复填表、互不信任地观察对方。
            我们用 AI 把这些重复劳动系统化，把信任变成可以复用的协议，让真正的人 (你和你的房东、你的经纪) 能专注在真正重要的决策上。
          </p>
          <h2 className="mt-12 text-[22px] font-bold tracking-tight">原则</h2>
          <ul className="mt-4 space-y-4 text-[14.5px] leading-relaxed text-body-2">
            <li><b className="text-body">隐私优先</b> · 你授权的每一项数据,我们都加密保存,Stayloop 内部都不直接看。</li>
            <li><b className="text-body">关键节点由人决定</b> · AI 永远只做推荐和起草。签字、付款、拒绝 — 都是你按下按钮。</li>
            <li><b className="text-body">本地法规优先</b> · 我们的合同模板严格遵循 Ontario RTA。和 LTB / Tribunal 直接对接。</li>
            <li><b className="text-body">终身免费 · 给租客</b> · 商业模式是房东 / 银行付费。租客侧永远不收钱。</li>
          </ul>
          <h2 className="mt-12 text-[22px] font-bold tracking-tight">团队</h2>
          <p className="mt-4 text-[14.5px] leading-relaxed text-body-2">
            创始团队由前 Shopify、Google、Plaid 工程师与 Toronto 本地房产经纪组成。我们做这件事，是因为我们自己也在租房。
          </p>
        </section>
      </main>
      <Footer />
    </>
  )
}
