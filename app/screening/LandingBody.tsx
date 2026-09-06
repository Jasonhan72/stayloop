'use client'

// The landing's visible body — client so it follows the language toggle.
// The SSR pass renders the zh default (i18n resolves 'zh' on the server), so
// crawlers and the JSON-LD in page.tsx keep seeing consistent Chinese; an
// EN-browser visitor gets English from the first client frame (the anti-FOUC
// script in the root layout sets the language before hydration).
//
// 2026-09 redesign (design/redesign-2026-09/Screening.dc.html): white base,
// one accent, split hero with a real progress preview, sources grid with
// icons, comparison table, pricing strip. Copy still comes from ./copy so
// the JSON-LD cannot drift.

import Link from 'next/link'
import type { ReactNode } from 'react'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { useT } from '@/lib/i18n'
import { COMPARISON, FAQS, PRINCIPLES, SOURCES, STEPS } from './copy'

const ACC = '#1B1B3C'
const OK = '#047857'

const SOURCE_ICONS: ReactNode[] = [
  <svg key="ltb" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0f172a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18M5 21V7l7-4 7 4v14" /><path d="M9 21v-6h6v6" /></svg>,
  <svg key="court" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0f172a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v18M5 8l7-5 7 5M5 8a4 4 0 0 0 8 0M11 8a4 4 0 0 0 8 0" /></svg>,
  <svg key="forensics" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0f172a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6M9 13h6M9 17h6" /></svg>,
  <svg key="credit" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0f172a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 15l3-3 2 2 5-5" /></svg>,
  <svg key="verify" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={OK} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M9 12l2 2 4-4" /></svg>,
  <svg key="employer" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0f172a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
]

const Check = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={OK} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="flex-none"><path d="M20 6L9 17l-5-5" /></svg>
)

export default function LandingBody() {
  const { lang } = useT()
  const zh = lang === 'zh'
  const btnP = 'inline-flex h-[46px] items-center justify-center whitespace-nowrap rounded-[10px] px-[22px] text-[15px] font-bold text-white transition hover:brightness-105'
  const btnG = 'inline-flex h-[46px] items-center justify-center whitespace-nowrap rounded-[10px] border border-[#cbd5e1] bg-white px-[22px] text-[15px] font-bold text-[#0f172a] transition hover:border-[#94a3b8]'

  const progress: { t: string; state: 'done' | 'active' | 'todo' }[] = zh
    ? [
        { t: '文件分类 · 11 份材料，2 份自动压缩', state: 'done' },
        { t: '文件取证 · PDF 结构、生成工具、修改痕迹、CRA 扣缴复算', state: 'done' },
        { t: '信用报告转录与确定性分析 · DTI、利用率、逾期信号', state: 'done' },
        { t: '安省法院门户 · 当事人检索 · 0 条', state: 'done' },
        { t: 'LTB 判令目录 · 按姓名 + 地址佐证', state: 'active' },
        { t: '五维评分与报告', state: 'todo' },
      ]
    : [
        { t: 'File classification · 11 documents, 2 auto-compressed', state: 'done' },
        { t: 'Document forensics · PDF structure, generator, edit trail, CRA deductions', state: 'done' },
        { t: 'Credit report transcription + deterministic analysis', state: 'done' },
        { t: 'Ontario Courts portal · party search · 0 records', state: 'done' },
        { t: 'LTB Order Catalogue · name + address corroboration', state: 'active' },
        { t: 'Five-dimension score and report', state: 'todo' },
      ]

  return (
    <div className="flex min-h-screen flex-col bg-white text-[#0f172a]">
      <Header />

      <main className="flex-1">
        {/* Hero: split */}
        <section className="mx-auto grid max-w-[1312px] items-center gap-10 px-5 pb-12 pt-12 sm:px-7 lg:grid-cols-2 lg:gap-14 lg:px-16 lg:pt-[72px]">
          <div className="flex flex-col gap-[22px]">
            <h1 className="text-[36px] font-extrabold leading-[1.08] tracking-[-0.03em] sm:text-[44px] lg:text-[52px]" style={{ textWrap: 'balance' }}>
              {zh ? '租客筛查，几分钟出一份注明依据的报告。' : 'Tenant screening with a report that cites its evidence, in minutes.'}
            </h1>
            <p className="max-w-[36ch] text-[17px] leading-[1.55] text-[#475569] lg:text-[18px]">
              {zh
                ? '上传申请材料，取证引擎核文件真伪，LTB 判令目录与安省法院门户按姓名检索，申请人本人授权身份与银行直连。每个结论都写明依据。'
                : 'Upload the application, let the forensics engine check the documents, search the LTB Order Catalogue and the Ontario Courts portal by name, and have the applicant authorise identity and bank verification themselves. Every conclusion cites its evidence.'}
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/screening/app" className={btnP} style={{ background: ACC }}>{zh ? '免费开始筛查' : 'Start screening free'}</Link>
              <Link href="/pricing" className={btnG}>{zh ? '查看定价' : 'See pricing'}</Link>
            </div>
            <p className="text-[13px] text-[#64748b]">{zh ? '免费档每月 5 次 · 深度核查按申请人 $14.99 · 无需信用卡' : 'Free tier: 5 a month · deep checks $14.99 per applicant · no credit card'}</p>
          </div>

          <div className="overflow-hidden rounded-xl border border-[#e2e8f0] bg-white" style={{ boxShadow: '0 24px 60px -24px rgba(15,23,42,0.25)' }}>
            <div className="flex items-center justify-between border-b border-[#e2e8f0] bg-[#f8fafc] px-[18px] py-[14px]">
              <div className="text-[14px] font-bold">{zh ? '筛查进度 · Mia Chen' : 'Screening progress · Mia Chen'}</div>
              <span className="font-mono text-[12px] text-[#64748b]">4 / 6</span>
            </div>
            <div className="flex flex-col gap-[10px] px-[18px] py-4">
              {progress.map((p) => (
                <div key={p.t} className="flex items-center gap-3 text-[14px]">
                  {p.state === 'done' ? <Check /> : p.state === 'active'
                    ? <span className="inline-block h-[18px] w-[18px] flex-none animate-spin rounded-full border-2" style={{ borderColor: ACC, borderTopColor: 'transparent' }} />
                    : <span className="inline-block h-[18px] w-[18px] flex-none rounded-full border-2 border-[#cbd5e1]" />}
                  <div className={p.state === 'todo' ? 'text-[#64748b]' : ''}>{p.t}</div>
                </div>
              ))}
            </div>
            <div className="border-t border-[#e2e8f0] bg-[#f8fafc] px-[18px] py-3"><div className="h-2 rounded-full bg-[#e2e8f0]"><div className="h-full rounded-full" style={{ width: '68%', background: ACC }} /></div></div>
          </div>
        </section>

        {/* Sources */}
        <section className="border-t border-[#e2e8f0]">
          <div className="mx-auto flex max-w-[1312px] flex-col gap-7 px-5 py-12 sm:px-7 lg:px-16 lg:py-[72px]">
            <div className="flex max-w-[60ch] flex-col gap-2">
              <h2 className="text-[26px] font-extrabold tracking-[-0.02em] lg:text-[32px]">{zh ? '实际检索的数据源' : 'What actually gets searched'}</h2>
              <p className="text-[16px] text-[#64748b]">{zh ? '每个数据源在报告里带着自己的检索状态。查过和没查过，分开说。' : 'Every source carries its own search status in the report. Searched and not-searched are different things.'}</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {SOURCES.map((s, i) => {
                const hl = i === 4
                return (
                  <div key={s.en} className="flex gap-[14px] rounded-xl border p-5" style={hl ? { borderColor: '#a7f3d0', background: '#f0fdf7' } : { borderColor: '#e2e8f0', background: '#fff' }}>
                    <div className="grid h-10 w-10 flex-none place-items-center rounded-[10px]" style={{ background: hl ? '#d1fae5' : '#f1f5f9' }}>{SOURCE_ICONS[i % SOURCE_ICONS.length]}</div>
                    <div>
                      <div className="text-[15px] font-bold">{zh ? s.zh : s.en}</div>
                      <p className="mt-1 text-[13.5px] leading-[1.5] text-[#64748b]">{zh ? s.descZh : s.descEn}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* Principles: compact four-up */}
        <section className="bg-[#f8fafc]">
          <div className="mx-auto flex max-w-[1312px] flex-col gap-6 px-5 py-12 sm:px-7 lg:px-16">
            <h2 className="text-[26px] font-extrabold tracking-[-0.02em] lg:text-[32px]">{zh ? '这份报告的四条纪律' : "The report's four disciplines"}</h2>
            <div className="grid gap-x-8 gap-y-6 md:grid-cols-2 lg:grid-cols-4">
              {PRINCIPLES.map((p) => (
                <div key={p.zh} className="flex flex-col gap-2 border-t-2 border-[#e2e8f0] pt-4">
                  <div className="text-[15px] font-bold">{zh ? p.zh : p.en}</div>
                  <p className="text-[13.5px] leading-[1.55] text-[#64748b]">{zh ? p.descZh : p.descEn}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Steps */}
        <section className="mx-auto flex max-w-[1312px] flex-col gap-7 px-5 py-12 sm:px-7 lg:px-16 lg:py-[72px]">
          <h2 className="text-[26px] font-extrabold tracking-[-0.02em] lg:text-[32px]">{zh ? '怎么进行一次租客筛查' : 'How a screening works'}</h2>
          <div className="grid gap-6 md:grid-cols-3">
            {STEPS.map((st, i) => (
              <div key={st.zh} className="flex flex-col gap-3 border-t-2 border-[#e2e8f0] pt-5">
                <span className="grid h-8 w-8 place-items-center rounded-full text-[14px] font-extrabold text-white" style={{ background: ACC }}>{i + 1}</span>
                <div className="text-[17px] font-bold">{zh ? st.zh : st.en}</div>
                <p className="text-[14.5px] leading-[1.55] text-[#64748b]">{zh ? st.descZh : st.descEn}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Comparison */}
        <section className="mx-auto flex max-w-[1312px] flex-col gap-6 px-5 pb-12 sm:px-7 lg:px-16 lg:pb-[72px]">
          <div className="flex max-w-[60ch] flex-col gap-2">
            <h2 className="text-[26px] font-extrabold tracking-[-0.02em] lg:text-[32px]">{zh ? '和按份出售的筛查报告有什么不同' : 'How this differs from a per-report screening product'}</h2>
            <p className="text-[16px] text-[#64748b]">{zh ? '右列是加拿大与美国常见按份报告产品的一般做法，不针对任何一家。' : 'The right-hand column describes what typical per-report products in Canada and the US advertise, not any one vendor.'}</p>
          </div>
          <div className="overflow-x-auto rounded-xl border border-[#e2e8f0] bg-white">
            <table className="w-full min-w-[620px] border-collapse text-[14px]">
              <thead>
                <tr className="bg-[#f8fafc] text-left text-[12px] font-bold text-[#64748b]">
                  <th className="px-4 py-3" style={{ width: '52%' }}>{zh ? '能力' : 'Capability'}</th>
                  <th className="px-4 py-3">Stayloop</th>
                  <th className="px-4 py-3">{zh ? '典型按份报告' : 'Typical per-report product'}</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((row) => (
                  <tr key={row.en} className="border-t border-[#e2e8f0] align-top">
                    <td className="px-4 py-3 text-[#334155]">{zh ? row.zh : row.en}</td>
                    <td className="px-4 py-3 font-extrabold" style={{ color: row.us ? OK : '#94a3b8' }}>{row.us ? '✓' : '-'}</td>
                    <td className="px-4 py-3">
                      <span className="font-bold" style={{ color: row.typical ? OK : '#94a3b8' }}>{row.typical ? '✓' : '-'}</span>
                      {(zh ? row.typicalNoteZh : row.typicalNoteEn) && <span className="ml-2 text-[13px] text-[#64748b]">{zh ? row.typicalNoteZh : row.typicalNoteEn}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Pricing strip */}
        <section className="mx-auto max-w-[1312px] px-5 pb-14 sm:px-7 lg:px-16 lg:pb-[88px]">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex flex-col gap-[10px] rounded-xl border border-[#e2e8f0] bg-white p-6">
              <div className="text-[13px] font-bold text-[#64748b]">{zh ? '免费档' : 'Free'}</div>
              <div className="font-mono text-[34px] font-bold">$0</div>
              <p className="text-[14px] leading-[1.55] text-[#334155]">{zh ? '每月 5 次筛查，含取证与信用分析、LTB 与法院记录。' : '5 screenings a month, with forensics, credit analysis, LTB and court records.'}</p>
              <Link href="/screening/app" className={`${btnG} mt-1.5`}>{zh ? '免费开始' : 'Start free'}</Link>
            </div>
            <div className="flex flex-col gap-[10px] rounded-xl border bg-white p-6" style={{ borderColor: ACC, boxShadow: '0 16px 40px -20px rgba(15,23,42,0.3)' }}>
              <div className="text-[13px] font-bold" style={{ color: ACC }}>{zh ? '单次解锁' : 'Single unlock'}</div>
              <div><span className="font-mono text-[34px] font-bold">$14.99</span> <span className="text-[13px] text-[#64748b]">{zh ? '/ 申请人' : '/ applicant'}</span></div>
              <p className="text-[14px] leading-[1.55] text-[#334155]">{zh ? '深度核查与本人授权核验，只对这一位申请人生效。付款链接可以发给申请人由他付。' : 'Deep checks and applicant-authorised verification for this one applicant. The payment link can be sent to the applicant to pay.'}</p>
              <Link href="/screening/app" className={`${btnP} mt-1.5`} style={{ background: ACC }}>{zh ? '解锁一位申请人' : 'Unlock an applicant'}</Link>
            </div>
            <div className="flex flex-col gap-[10px] rounded-xl border border-[#e2e8f0] bg-white p-6">
              <div className="text-[13px] font-bold text-[#64748b]">Pro</div>
              <div><span className="font-mono text-[34px] font-bold">$29</span> <span className="text-[13px] text-[#64748b]">{zh ? '/ 月 CAD' : '/ month CAD'}</span></div>
              <p className="text-[14px] leading-[1.55] text-[#334155]">{zh ? '不限次数、不限房源，深度核查与 AI Agent 全含。多套房的房东选这个。' : 'Unlimited screenings and listings, deep checks and the AI agent included. For landlords with several properties.'}</p>
              <Link href="/dashboard?upgrade=1" className={`${btnG} mt-1.5`}>{zh ? '升级到 Pro' : 'Upgrade to Pro'}</Link>
            </div>
          </div>
        </section>

        {/* Compliance strip */}
        <section className="border-y border-[#e2e8f0] bg-[#f8fafc]">
          <div className="mx-auto max-w-[1312px] px-5 py-10 sm:px-7 lg:px-16">
            <h2 className="text-[15px] font-extrabold">{zh ? '合规姿态' : 'Compliance posture'}</h2>
            <p className="mt-2 max-w-[80ch] text-[12.5px] leading-relaxed text-[#475569]">
              {zh
                ? '筛查工具的使用遵循安省《人权法典》下 O. Reg. 290/98 允许的选择方式(信用参考、租史、信用检查、收入信息,须整体考量)。受保护特征不进入评分,合规审计随每份报告输出。报告基于申请人自愿提交的文件与公开记录生成;Stayloop 不是《消费者报告法》(安省)意义上的消费者报告机构,本报告亦非该法意义上的消费者报告。个人信息按 PIPEDA 要求加密存储,申请人有权查阅并要求更正。'
                : "Screening follows the selection practices O. Reg. 290/98 under Ontario's Human Rights Code permits (credit references, rental history, credit checks, income information, considered together). Protected grounds never enter the score, and a compliance audit ships with every report. Reports are generated from documents the applicant voluntarily submits plus public records; Stayloop is not a consumer reporting agency within the meaning of the Consumer Reporting Act (Ontario), nor is the report a consumer report under that Act. Personal information is stored encrypted per PIPEDA, and applicants may access and correct it."}
            </p>
          </div>
        </section>

        {/* FAQ — same arrays feed the FAQPage JSON-LD in the server page */}
        <section className="mx-auto max-w-[880px] px-5 py-12 sm:px-7 lg:py-14">
          <h2 className="text-[26px] font-extrabold tracking-[-0.02em]">{zh ? '常见问题' : 'Frequently asked questions'}</h2>
          <div className="mt-6 space-y-3">
            {FAQS.map((f) => {
              const item = zh ? f.zh : f.en
              return (
                <details key={f.zh.q} className="group rounded-xl border border-[#e2e8f0] bg-white px-5 py-4">
                  <summary className="cursor-pointer list-none text-[14.5px] font-bold marker:content-none">{item.q}</summary>
                  <p className="mt-3 text-[13.5px] leading-relaxed text-[#475569]">{item.a}</p>
                </details>
              )
            })}
          </div>
        </section>

        {/* Final CTA */}
        <section className="mx-auto max-w-[1312px] px-5 pb-16 sm:px-7 lg:px-16">
          <div className="grid items-center gap-6 rounded-2xl bg-[#0f172a] px-7 py-9 text-white lg:grid-cols-[minmax(0,1fr)_auto] lg:px-16 lg:py-14">
            <div>
              <h2 className="text-[26px] font-extrabold tracking-[-0.02em] lg:text-[32px]">{zh ? '第一单筛查免费，几分钟出报告。' : 'Your first screening is free, and the report takes minutes.'}</h2>
              <p className="mt-2 text-[15px] text-[#cbd5e1]">{zh ? '注册即可使用免费档，不需要信用卡。' : 'Sign up to use the free tier. No credit card needed.'}</p>
            </div>
            <Link href="/screening/app" className={`${btnG} !border-0`}>{zh ? '免费开始筛查' : 'Start screening free'}</Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}
