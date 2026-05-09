'use client'

import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

const PARTNERS = [
  { name: 'RBC', cat: '银行 · 按揭', use: '租客按揭预审 · DTI / 收入即时验证' },
  { name: 'Aviva', cat: '保险', use: '租客保险定价 · Tier 自动定档' },
  { name: 'Equifax', cat: '信用', use: '一键信用查询 · Tier 4 入口' },
  { name: 'Plaid', cat: '银行连接', use: '工资 / 现金流 · 实时 Tier 2-3 验证' },
  { name: 'Persona', cat: '身份', use: 'Tier 1 ID 验证 · 90 秒' },
  { name: 'CanLII', cat: 'LTB / 法庭', use: '租赁纠纷判例查询' },
]

export default function PartnersPage() {
  return (
    <>
      <Header />
      <main className="bg-surface">
        <section
          className="border-b border-line-divider"
          style={{ background: 'linear-gradient(180deg,#F2EEE5 0%, #E4EEE3 100%)' }}
        >
          <div className="mx-auto max-w-[1320px] px-5 py-20 sm:px-7 lg:px-12">
            <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-brand">
              PARTNERS · ECOSYSTEM
            </div>
            <h1 className="mt-3 max-w-[760px] text-[44px] font-extrabold leading-tight tracking-tight sm:text-[56px]">
              和我们一起搭建<br />Toronto 的可信任租住网络。
            </h1>
            <p className="mt-5 max-w-[620px] text-[16px] leading-relaxed text-body-2">
              如果你是银行、保险公司、物业管理、法务平台或政府服务 — 我们提供 Trust API + 私有部署，让你直接用上租客 / 房东侧的可信任数据。
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/contact" className="sl-btn-primary !px-6 !py-[14px]">预约洽谈</Link>
              <Link href="/trust-api" className="sl-btn-secondary">查看 Trust API</Link>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1320px] px-5 py-16 sm:px-7 lg:px-12">
          <h2 className="text-[26px] font-bold tracking-tight sm:text-[32px]">现有合作 / 集成</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {PARTNERS.map((p) => (
              <div key={p.name} className="sl-card p-6">
                <div className="flex items-baseline justify-between">
                  <h3 className="text-[20px] font-bold">{p.name}</h3>
                  <span className="font-mono text-[10.5px] uppercase text-body-3">{p.cat}</span>
                </div>
                <p className="mt-3 text-[13.5px] leading-relaxed text-body-2">{p.use}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
