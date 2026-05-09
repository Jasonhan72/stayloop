'use client'

import Header from '@/components/Header'
import Footer from '@/components/Footer'

export default function TermsPage() {
  return (
    <>
      <Header />
      <main className="bg-surface">
        <article className="mx-auto max-w-[720px] px-5 py-16 sm:px-7">
          <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-brand">TERMS OF SERVICE</div>
          <h1 className="mt-3 text-[36px] font-extrabold leading-tight tracking-tight sm:text-[44px]">
            服务条款
          </h1>
          <p className="mt-2 font-mono text-[12px] text-body-3">2026-05-09 版</p>

          <Section title="1 · 接受条款">
            <p>使用 Stayloop 即表示同意本条款 + 隐私政策。Stayloop 由 Stayloop Technologies Inc. (Ontario corp) 运营。</p>
          </Section>
          <Section title="2 · 你的承诺">
            <p>你提交的所有 Passport 信息真实有效。Stayloop 有权对欺诈行为暂停 / 终止账户,并向相关执法 / LTB 报告。</p>
          </Section>
          <Section title="3 · 服务变更">
            <p>我们会持续迭代功能。计划中的破坏性变更会提前 30 天通知。免费用户的免费等级永远不削减现有 Free 范围。</p>
          </Section>
          <Section title="4 · 责任限制">
            <p>Stayloop 不承担因使用本平台造成的间接 / 偶发性 / 惩罚性损害。我们的最高赔偿限于过去 12 个月你向我们支付的费用。</p>
          </Section>
          <Section title="5 · 适用法律">
            <p>本条款受 Ontario 省法律管辖。任何争议先经 Stayloop 内部 mediator 调解,再提交 Ontario Superior Court 处理。</p>
          </Section>
        </article>
      </main>
      <Footer />
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-[18px] font-bold tracking-tight">{title}</h2>
      <div className="mt-3 text-[14.5px] leading-relaxed text-body-2">{children}</div>
    </section>
  )
}
