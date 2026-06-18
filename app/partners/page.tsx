'use client'

import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { useT, type Lang } from '@/lib/i18n'

const PARTNERS: { name: string; cat: Record<Lang, string>; use: Record<Lang, string> }[] = [
  { name: 'RBC', cat: { zh: '银行 · 按揭', en: 'Bank · mortgage' }, use: { zh: '租客按揭预审 · DTI / 收入即时验证', en: 'Tenant mortgage pre-qualification · instant DTI / income verification' } },
  { name: 'Aviva', cat: { zh: '保险', en: 'Insurance' }, use: { zh: '租客保险定价 · 认证级别 自动定档', en: 'Tenant insurance pricing · auto-tiered by verification level' } },
  { name: 'Equifax', cat: { zh: '信用', en: 'Credit' }, use: { zh: '一键信用查询 · 认证 4 级 入口', en: 'One-click credit check · Tier 4 gateway' } },
  { name: 'Plaid / Flinks', cat: { zh: '银行连接', en: 'Bank connectivity' }, use: { zh: '工资 / 现金流 · 实时 认证 2-3 级 验证', en: 'Payroll / cash flow · real-time Tier 2–3 verification' } },
  { name: 'Persona', cat: { zh: '身份', en: 'Identity' }, use: { zh: '认证 1 级 ID 验证 · 90 秒', en: 'Tier 1 ID verification · 90 seconds' } },
  { name: 'CanLII', cat: { zh: 'LTB / 法庭', en: 'LTB / courts' }, use: { zh: '租赁纠纷判例查询', en: 'Rental dispute case-law search' } },
]

export default function PartnersPage() {
  const { lang } = useT()
  const zh = lang === 'zh'
  return (
    <div style={{ background: '#FAF7EE', color: '#171717' }}>
      <Header variant="transparent" />
      <section style={{ background: 'linear-gradient(180deg,#F2EEE5 0%,#E4EEE3 100%)' }}>
        <div className="mx-auto max-w-[1100px] px-5 py-24 sm:px-7 lg:px-12">
          <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-brand">{zh ? 'PARTNERS · 银行 / 保险 / 法务' : 'PARTNERS · Banking / Insurance / Legal'}</div>
          <h1 className="mt-4 max-w-[760px] text-[30px] font-extrabold leading-[1.08] tracking-tight sm:text-[44px] lg:text-[52px]">
            {zh ? <>一份已验证的信任,<br />接进你的产品。</> : <>Verified trust,<br />plugged into your product.</>}
          </h1>
          <p className="mt-5 max-w-[640px] text-[17px] leading-relaxed text-body-2">
            {zh
              ? '通过 Trust API,把 Stayloop 验证过的身份、收入、信用结论嵌入你的流程 —— 验证一次,处处复用,每次调用链上留痕。'
              : 'Through the Trust API, embed Stayloop’s verified identity, income and credit conclusions into your flow — verify once, reuse everywhere, every call logged on-chain.'}
          </p>
          <div className="mt-7">
            <Link href="/contact" className="sl-btn-primary !px-6 !py-[13px] !text-[15px]">{zh ? '成为合作伙伴 →' : 'Become a partner →'}</Link>
          </div>
        </div>
      </section>

      <section>
        <div className="mx-auto max-w-[1100px] px-5 py-20 sm:px-7 lg:px-12">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PARTNERS.map((p) => (
              <div key={p.name} className="sl-card p-6">
                <div className="flex items-baseline justify-between">
                  <span className="text-[18px] font-extrabold tracking-tight">{p.name}</span>
                  <span className="font-mono text-[10.5px] uppercase tracking-eyebrow text-body-3">{p.cat[lang]}</span>
                </div>
                <p className="mt-3 text-[13px] leading-relaxed text-body-2">{p.use[lang]}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
