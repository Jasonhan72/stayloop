'use client'

import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

export default function TrustApiPage() {
  return (
    <>
      <Header variant="transparent" />
      <main className="bg-surface">
        <section
          className="relative overflow-hidden border-b border-line-divider"
          style={{
            background: 'linear-gradient(135deg, #0B0B0E 0%, #065F46 100%)',
            marginTop: -72,
            paddingTop: 72,
          }}
        >
          <div className="mx-auto max-w-[1320px] px-5 py-24 text-white sm:px-7 lg:px-12">
            <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-emerald-200">
              TRUST API · PARTNERS
            </div>
            <h1 className="mt-3 max-w-[760px] text-[44px] font-extrabold leading-tight tracking-tight sm:text-[56px]">
              把 Stayloop 的信任图谱<br />接进你的产品。
            </h1>
            <p className="mt-5 max-w-[620px] text-[17px] leading-relaxed text-emerald-50/85">
              银行做按揭、保险公司做承保、物业公司做接管 — 都需要"这个人是不是可信租客"的实时答案。
              Trust API 给你 webhook + REST，3 行代码就能查 Tier 1-4 信任分数。
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/contact" className="sl-btn-primary !px-7 !py-[14px]">
                预约 30 分钟洽谈
              </Link>
              <a
                href="#endpoints"
                className="rounded-[10px] border border-white/40 bg-white/10 px-6 py-[12px] text-[14px] font-semibold text-white backdrop-blur transition hover:bg-white/20"
              >
                查看 Endpoints
              </a>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1320px] px-5 py-20 sm:px-7 lg:px-12">
          <h2 className="text-[28px] font-bold tracking-tight sm:text-[34px]">
            谁在用 Trust API
          </h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              { name: 'RBC', use: '租客按揭预审 · 即时 DTI / 收入验证' },
              { name: 'Aviva', use: '租客保险定价 · Tier 自动定档' },
              { name: 'Sage Property Mgmt', use: '物业接管尽调 · 30 秒批量审' },
            ].map((p) => (
              <div key={p.name} className="sl-card p-6">
                <div className="text-[18px] font-bold">{p.name}</div>
                <p className="mt-2 text-[13.5px] leading-relaxed text-body-2">{p.use}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="endpoints" className="mx-auto max-w-[1320px] px-5 py-12 sm:px-7 lg:px-12">
          <h2 className="text-[28px] font-bold tracking-tight sm:text-[34px]">Endpoints</h2>
          <div className="mt-6 sl-card overflow-hidden font-mono text-[12.5px]">
            {[
              { m: 'POST', e: '/v1/trust/score', d: '查询某个 tenantId 的 Tier 分数 (1-4 + 子项)' },
              { m: 'POST', e: '/v1/trust/verify-income', d: '直接走 Plaid · 实时月收入 + DTI' },
              { m: 'POST', e: '/v1/trust/verify-id', d: '调用 Persona · 返回 ID hash + 验证时间' },
              { m: 'GET',  e: '/v1/trust/passport/:id', d: '读取已授权的 Rental Passport (字段级 ACL)' },
              { m: 'POST', e: '/v1/webhooks/tier-changed', d: 'Tier 升降级 webhook · push 到你的 endpoint' },
            ].map((r) => (
              <div
                key={r.e}
                className="grid grid-cols-[60px_1fr_2fr] items-center gap-4 border-b border-line-divider px-5 py-4 last:border-0"
              >
                <span
                  className={
                    'inline-flex w-fit items-center rounded-md px-2 py-1 text-[10.5px] font-bold uppercase ' +
                    (r.m === 'POST' ? 'bg-info/10 text-info' : 'bg-success/10 text-success')
                  }
                >
                  {r.m}
                </span>
                <span className="font-bold text-body">{r.e}</span>
                <span className="text-body-2">{r.d}</span>
              </div>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
