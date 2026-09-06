'use client'

import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { useT, type Lang } from '@/lib/i18n'

const PRINCIPLES: { h: Record<Lang, string>; b: Record<Lang, string> }[] = [
  { h: { zh: '关键决定永远是你的', en: 'Key decisions are always yours' }, b: { zh: 'AI 替你跑流程、压结论,但分享 Passport、提交申请、签约、付款 —— 全部经你确认才执行。', en: 'AI runs the process and distills conclusions, but sharing your Passport, submitting an application, signing and paying — none of it happens without your confirmation.' } },
  { h: { zh: '信任可以复用', en: 'Trust can be reused' }, b: { zh: '验证一次,跨房东、平台、机构出示摘要。把一叠 PDF 变成一个可携带的协议。', en: 'Verify once, then present a summary across landlords, platforms and institutions. Turn a stack of PDFs into one portable proof.' } },
  { h: { zh: '看得见来源', en: 'Sources you can see' }, b: { zh: '每一分都能点开看到它从哪来。不是黑箱风险分,而是加权的证据。', en: 'Open any point and see where it came from. Not a black-box risk number, but weighted evidence.' } },
  { h: { zh: '合规是底线', en: 'Compliance is the floor' }, b: { zh: '符合本地法律 · 软查不影响信用 · 每一步链上留痕、可回溯。', en: 'Compliant with local law · soft checks never touch your credit · every step logged on-chain and traceable.' } },
]

export default function AboutPage() {
  const { lang } = useT()
  const zh = lang === 'zh'
  return (
    <div style={{ background: '#FFFFFF', color: '#171717' }}>
      <Header variant="transparent" />
      <section style={{ background: '#F3F8FC', borderBottom: '1px solid #E4EEF6' }}>
        <div className="mx-auto max-w-[900px] px-5 py-24 sm:px-7 lg:px-12">
          <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-brand">ABOUT · STAYLOOP</div>
          <h1 className="mt-4 text-[30px] font-extrabold leading-[1.08] tracking-tight sm:text-[44px] lg:text-[54px]">
            {zh ? <>为 AI 时代,<br />重新设计租住的方式。</> : <>Renting,<br />redesigned for the AI era.</>}
          </h1>
          <p className="mt-6 max-w-[680px] text-[17px] leading-relaxed text-body-2">
            {zh
              ? '在 Toronto,租客和房东 90% 的时间不是在沟通,而是在重复填表、互不信任地观察对方。Stayloop 用 AI 把这些重复劳动系统化,把信任变成可复用的协议 —— 让真正的人,专注在真正重要的决定上。'
              : 'In Toronto, tenants and landlords spend 90% of their time not communicating, but refilling forms and watching each other with distrust. Stayloop uses AI to systematize that repetitive work and turn trust into a reusable proof — so real people can focus on the decisions that truly matter.'}
          </p>
        </div>
      </section>

      <section>
        <div className="mx-auto max-w-[1100px] px-5 py-20 sm:px-7 lg:px-12">
          <h2 className="text-[26px] font-extrabold tracking-tight sm:text-[32px]">{zh ? '我们的原则' : 'Our principles'}</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {PRINCIPLES.map((p) => (
              <div key={p.h.zh} className="sl-card p-6">
                <h4 className="text-[16px] font-bold">{p.h[lang]}</h4>
                <p className="mt-2 text-[13.5px] leading-relaxed text-body-2">{p.b[lang]}</p>
              </div>
            ))}
          </div>
          <div className="mt-12 flex flex-wrap gap-3">
            <Link href="/onboarding/name" className="sl-btn-primary !px-6 !py-[13px] !text-[15px]">{zh ? '开始使用 →' : 'Get started →'}</Link>
            <Link href="/contact" className="rounded-[10px] border border-line-strong bg-white px-6 py-[12px] text-[14px] font-semibold text-body transition hover:border-brand hover:text-brand">{zh ? '联系我们' : 'Contact us'}</Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
