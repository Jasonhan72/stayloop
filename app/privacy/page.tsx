'use client'

import Header from '@/components/Header'
import Footer from '@/components/Footer'

export default function PrivacyPage() {
  return (
    <>
      <Header />
      <main className="bg-surface">
        <article className="mx-auto max-w-[720px] px-5 py-16 sm:px-7">
          <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-brand">PRIVACY POLICY</div>
          <h1 className="mt-3 text-[36px] font-extrabold leading-tight tracking-tight sm:text-[44px]">
            我们怎么处理你的数据
          </h1>
          <p className="mt-2 font-mono text-[12px] text-body-3">最后更新 · 2026-05-09</p>

          <Section title="1 · 我们收集什么">
            <p>身份信息 (姓名 / 邮箱 / 电话 / 证件 hash)、收入凭证、银行连接 token (Plaid)、信用 / 法庭记录 (你授权的)、设备 + 使用日志。</p>
          </Section>
          <Section title="2 · 我们怎么用">
            <p>仅用于 Stayloop 服务交付：Tier 评分、与房东 / 经纪 / 合作伙伴授权分享、AI 助手记忆。我们 <b>不</b> 把数据卖给任何第三方。</p>
          </Section>
          <Section title="3 · 你的控制权">
            <p>每个字段都可以随时撤销共享。账户删除后,加密原文 30 天内擦除,衍生 hash (用于 fraud 检测) 保留 12 个月。</p>
          </Section>
          <Section title="4 · 数据存储">
            <p>所有数据存储在 Toronto / Montreal AWS region。Persona / Plaid / Equifax 调用通过加密 TLS 1.3 + token 隔离。</p>
          </Section>
          <Section title="5 · 联系">
            <p>privacy@stayloop.ai 或通过 in-app 聊天。我们 30 天内回复。</p>
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
