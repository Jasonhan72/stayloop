'use client'

import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { useT } from '@/lib/i18n'

export default function PrivacyPage() {
  const { lang } = useT()
  const zh = lang === 'zh'
  return (
    <>
      <Header />
      <main className="bg-surface">
        <article className="mx-auto max-w-[720px] px-5 py-16 sm:px-7">
          <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-brand">PRIVACY POLICY</div>
          <h1 className="mt-3 text-[36px] font-extrabold leading-tight tracking-tight sm:text-[44px]">
            {zh ? '我们怎么处理你的数据' : 'How we handle your data'}
          </h1>
          <p className="mt-2 font-mono text-[12px] text-body-3">{zh ? '最后更新 · 2026-05-09' : 'Last updated · 2026-05-09'}</p>

          <Section title={zh ? '1 · 我们收集什么' : '1 · What we collect'}>
            <p>{zh
              ? '身份信息 (姓名 / 邮箱 / 电话 / 证件 hash)、收入凭证、银行连接 token (Plaid)、信用 / 法庭记录 (你授权的)、设备 + 使用日志。'
              : 'Identity information (name / email / phone / document hash), proof of income, bank-connection tokens (Plaid), credit and court records (where you authorize them), and device and usage logs.'}</p>
          </Section>
          <Section title={zh ? '2 · 我们怎么用' : '2 · How we use it'}>
            <p>{zh ? (
              <>仅用于 Stayloop 服务交付：护照盖章评分、与房东 / 经纪 / 合作伙伴授权分享、AI 助手记忆。我们 <b>不</b> 把数据卖给任何第三方。</>
            ) : (
              <>Only to deliver the Stayloop service: passport-stamp scoring, authorized sharing with landlords / agents / partners, and AI-assistant memory. We do <b>not</b> sell your data to any third party.</>
            )}</p>
          </Section>
          <Section title={zh ? '3 · 你的控制权' : '3 · Your control'}>
            <p>{zh
              ? '每个字段都可以随时撤销共享。账户删除后,加密原文 30 天内擦除,衍生 hash (用于 fraud 检测) 保留 12 个月。'
              : 'You can revoke sharing of any field at any time. After you delete your account, the encrypted originals are erased within 30 days, while derived hashes (used for fraud detection) are retained for 12 months.'}</p>
          </Section>
          <Section title={zh ? '4 · 数据存储' : '4 · Data storage'}>
            <p>{zh
              ? '所有数据存储在 Toronto / Montreal AWS region。Persona / Plaid / Equifax 调用通过加密 TLS 1.3 + token 隔离。'
              : 'All data is stored in the Toronto / Montreal AWS regions. Calls to Persona / Plaid / Equifax run over encrypted TLS 1.3 with token isolation.'}</p>
          </Section>
          <Section title={zh ? '5 · 联系' : '5 · Contact'}>
            <p>{zh ? (
              <>请通过 <Link href="/contact" className="font-semibold text-brand hover:underline">联系页面</Link> 或 in-app 聊天联系我们。我们 30 天内回复。</>
            ) : (
              <>Reach us through our <Link href="/contact" className="font-semibold text-brand hover:underline">contact page</Link> or in-app chat. We respond within 30 days.</>
            )}</p>
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
