'use client'

import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

const DIMENSIONS = [
  { key: 'doc',     name: '证件真实性',   weight: 20, color: '#7C3AED', desc: 'Vision OCR + 多源比对' },
  { key: 'pay',     name: '支付能力',     weight: 20, color: '#047857', desc: '工资 / Plaid / DTI' },
  { key: 'court',   name: '法庭记录',     weight: 20, color: '#DC2626', desc: 'CanLII LTB 自动查询' },
  { key: 'stable',  name: '稳定性',       weight: 15, color: '#2563EB', desc: '工作 + 居住时长' },
  { key: 'behav',   name: '行为信号',     weight: 13, color: '#D97706', desc: '上家 reference + 续签率' },
  { key: 'consist', name: '信息一致性',   weight: 12, color: '#0B0B0E', desc: '多份资料字段交叉比对' },
]

export default function ScreeningPage() {
  return (
    <>
      <Header variant="transparent" />
      <main className="bg-surface">
        <section
          className="relative overflow-hidden border-b border-line-divider bg-surface-nav"
          style={{ marginTop: -72, paddingTop: 72 }}
        >
          <div className="mx-auto max-w-[1320px] px-5 py-20 sm:px-7 lg:px-12">
            <div className="grid items-center gap-12 lg:grid-cols-[1.4fr_1fr]">
              <div>
                <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-brand">
                  AI SCREENING · 六维评分
                </div>
                <h1 className="mt-3 text-[44px] font-extrabold leading-tight tracking-tight sm:text-[56px]">
                  Toronto 最严谨的<br />租客评分系统。
                </h1>
                <p className="mt-5 max-w-[580px] text-[17px] leading-relaxed text-body-2">
                  Claude Sonnet 4.5 + Vision OCR + Plaid + CanLII + Equifax，把每份申请的 6 个维度合成一个透明的分数。
                  房东只需在 dashboard 上看一张卡。
                </p>
              </div>
              <div className="hidden lg:block">
                <div className="sl-card p-6">
                  <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
                    SAMPLE · MIA WANG
                  </div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-[48px] font-extrabold tracking-tight text-brand">92</span>
                    <span className="text-[14px] text-body-3">/ 100</span>
                  </div>
                  <div className="score-bar mt-2">
                    <span className="fill" style={{ width: '92%' }} />
                  </div>
                  <div className="mt-4 space-y-2">
                    {DIMENSIONS.map((d) => (
                      <div key={d.key} className="grid grid-cols-[100px_1fr_50px] items-center gap-3 text-[12.5px]">
                        <span className="font-mono font-semibold">{d.name}</span>
                        <div className="h-1.5 overflow-hidden rounded-full bg-line-divider">
                          <span
                            className="block h-full rounded-full"
                            style={{
                              width: `${(85 + (d.weight % 5) * 2)}%`,
                              background: d.color,
                            }}
                          />
                        </div>
                        <span className="text-right font-mono font-bold text-brand">
                          {85 + (d.weight % 5) * 2}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1320px] px-5 py-20 sm:px-7 lg:px-12">
          <h2 className="text-[28px] font-bold tracking-tight sm:text-[34px]">六个维度</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {DIMENSIONS.map((d) => (
              <div key={d.key} className="sl-card p-6">
                <div className="flex items-center justify-between">
                  <span
                    className="inline-flex items-center justify-center rounded-md px-2 py-1 font-mono text-[10.5px] font-bold uppercase tracking-wider text-white"
                    style={{ background: d.color }}
                  >
                    {d.weight}%
                  </span>
                </div>
                <h3 className="mt-3 text-[18px] font-bold tracking-tight">{d.name}</h3>
                <p className="mt-2 text-[13.5px] leading-relaxed text-body-2">{d.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-[1320px] px-5 pb-20 sm:px-7 lg:px-12">
          <div className="sl-card p-8 lg:p-12">
            <h2 className="text-[26px] font-bold tracking-tight sm:text-[32px]">分数颜色 = 决策建议</h2>
            <div className="mt-6 grid gap-3 md:grid-cols-5">
              {[
                { range: '≥ 85', label: '强烈推荐', color: '#16A34A' },
                { range: '70–84', label: '推荐', color: '#34D399' },
                { range: '50–69', label: '需面谈', color: '#D97706' },
                { range: '30–49', label: '风险高', color: '#EA580C' },
                { range: '< 30', label: '不建议', color: '#DC2626' },
              ].map((t) => (
                <div key={t.range} className="rounded-xl p-4" style={{ background: t.color + '14', border: `1px solid ${t.color}33` }}>
                  <div className="font-mono text-[13px] font-bold" style={{ color: t.color }}>
                    {t.range}
                  </div>
                  <div className="mt-1 text-[14px] font-bold">{t.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1320px] px-5 pb-24 text-center sm:px-7 lg:px-12">
          <Link href="/dashboard" className="sl-btn-primary !px-7 !py-[14px]">
            进入 Landlord 工作台 →
          </Link>
        </section>
      </main>
      <Footer />
    </>
  )
}
