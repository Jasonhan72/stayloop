'use client'

import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { useT, type Lang } from '@/lib/i18n'

const PARTNERS: { name: string; cat: Record<Lang, string>; use: Record<Lang, string> }[] = [
  // Integrations in use or in preparation — not signed partnerships
  // (review 2026-09-14: banks / insurers / former vendor names were listed
  // with no relationship; identity is Veriff, bank is Flinks).
  // Veriff / Flinks production credentials are still pending — Flinks runs its
  // sandbox — so they are "integrated (sandbox)", not "live".
  { name: 'Veriff', cat: { zh: '身份核验 · 已接入（沙箱）', en: 'Identity · integrated (sandbox)' }, use: { zh: '申请人本人授权的证件 + 活体核验', en: 'Applicant-authorised document + liveness check' } },
  { name: 'Flinks', cat: { zh: '银行直连 · 已接入（沙箱）', en: 'Bank · integrated (sandbox)' }, use: { zh: '申请人授权的 90 天入账摘要，原始流水不落库', en: 'Applicant-authorised 90-day deposit summary; raw transactions are never stored' } },
  { name: 'Equifax', cat: { zh: '信用 · 筹备中', en: 'Credit · in preparation' }, use: { zh: '申请人本人授权的征信直拉', en: 'Applicant-authorised bureau pull' } },
  { name: 'Ontario LTB open data', cat: { zh: 'LTB 判令目录 · 已接入', en: 'LTB order catalogue · live' }, use: { zh: '安省开放数据判令目录，按姓名与地址佐证实查', en: 'Ontario open-data order catalogue, searched by name with address corroboration' } },
  { name: 'Ontario Courts portal', cat: { zh: '法庭记录 · 已接入', en: 'Court records · live' }, use: { zh: '民事与小额法庭当事人检索', en: 'Civil and Small Claims party search' } },
  { name: 'TRREB', cat: { zh: '行情基准 · 已接入', en: 'Market benchmark · live' }, use: { zh: '季度租赁市场报告的官方成交基准', en: 'Official leased-rent benchmarks from the quarterly rental market report' } },
]

export default function PartnersPage() {
  const { lang } = useT()
  const zh = lang === 'zh'
  return (
    <div style={{ background: '#FFFFFF', color: '#171717' }}>
      <Header variant="transparent" />
      <section style={{ background: '#F3F8FC', borderBottom: '1px solid #E4EEF6' }}>
        <div className="mx-auto max-w-[1100px] px-5 py-24 sm:px-7 lg:px-12">
          <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-brand">{zh ? 'PARTNERS · 身份 / 银行数据' : 'PARTNERS · Identity / Bank data'}</div>
          <h1 className="mt-4 max-w-[760px] text-[30px] font-extrabold leading-[1.08] tracking-tight sm:text-[44px] lg:text-[52px]">
            {zh ? <>一份已验证的信任,<br />接进你的产品。</> : <>Verified trust,<br />plugged into your product.</>}
          </h1>
          <p className="mt-5 max-w-[640px] text-[17px] leading-relaxed text-body-2">
            {zh
              ? '通过 Trust API,把 Stayloop 验证过的身份、收入、信用结论嵌入你的流程 —— 验证一次,处处复用,每次调用都写入只追加的审计日志。'
              : 'Through the Trust API, embed Stayloop’s verified identity, income and credit conclusions into your flow — verify once, reuse everywhere, every call written to an append-only audit log.'}
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
