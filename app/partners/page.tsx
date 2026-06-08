'use client'

import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

const PARTNERS = [
  { name: 'RBC', cat: '银行 · 按揭', use: '租客按揭预审 · DTI / 收入即时验证' },
  { name: 'Aviva', cat: '保险', use: '租客保险定价 · Tier 自动定档' },
  { name: 'Equifax', cat: '信用', use: '一键信用查询 · Tier 4 入口' },
  { name: 'Plaid / Flinks', cat: '银行连接', use: '工资 / 现金流 · 实时 Tier 2-3 验证' },
  { name: 'Persona', cat: '身份', use: 'Tier 1 ID 验证 · 90 秒' },
  { name: 'CanLII', cat: 'LTB / 法庭', use: '租赁纠纷判例查询' },
]

export default function PartnersPage() {
  return (
    <div style={{ background: '#FAF7EE', color: '#171717' }}>
      <Header variant="transparent" />
      <section style={{ background: 'linear-gradient(180deg,#F2EEE5 0%,#E4EEE3 100%)' }}>
        <div className="mx-auto max-w-[1100px] px-5 py-24 sm:px-7 lg:px-12">
          <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-brand">PARTNERS · 银行 / 保险 / 法务</div>
          <h1 className="mt-4 max-w-[760px] text-[40px] font-extrabold leading-[1.08] tracking-tight sm:text-[52px]">
            一份已验证的信任,<br />接进你的产品。
          </h1>
          <p className="mt-5 max-w-[640px] text-[17px] leading-relaxed text-body-2">
            通过 Trust API,把 Stayloop 验证过的身份、收入、信用结论嵌入你的流程 ——
            验证一次,处处复用,每次调用链上留痕。
          </p>
          <div className="mt-7">
            <Link href="/contact" className="sl-btn-primary !px-6 !py-[13px] !text-[15px]">成为合作伙伴 →</Link>
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
                  <span className="font-mono text-[10.5px] uppercase tracking-eyebrow text-body-3">{p.cat}</span>
                </div>
                <p className="mt-3 text-[13px] leading-relaxed text-body-2">{p.use}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
