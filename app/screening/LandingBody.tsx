'use client'

// The landing's visible body — client so it follows the language toggle.
// The SSR pass renders the zh default (i18n resolves 'zh' on the server), so
// crawlers and the JSON-LD in page.tsx keep seeing consistent Chinese; an
// EN-browser visitor gets English from the first client frame (the anti-FOUC
// script in the root layout sets the language before hydration).

import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { useT } from '@/lib/i18n'
import { COMPARISON, FAQS, PRINCIPLES, SOURCES, STEPS } from './copy'

export default function LandingBody() {
  const { lang } = useT()
  const zh = lang === 'zh'

  return (
    <div style={{ background: '#FFFFFF', minHeight: '100vh' }} className="flex flex-col">
      <Header variant="transparent" />

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto max-w-[880px] px-5 pb-14 pt-16 text-center">
          <div className="font-mono text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: '#1B1B3C' }}>
            STAYLOOP · TENANT SCREENING
          </div>
          <h1 className="mx-auto mt-4 max-w-[640px] text-[34px] font-extrabold leading-tight tracking-tight sm:text-[44px]">
            {zh ? (
              <>租客筛查,几分钟出一份<br />经得起追问的报告</>
            ) : (
              <>Tenant screening that can<br />answer for every number</>
            )}
          </h1>
          <p className="mx-auto mt-4 max-w-[560px] text-[15px] leading-relaxed text-body-2">
            {zh
              ? '上传申请人提交的材料——AI 抽取事实,确定性规则计算评分,法庭与 LTB 公开记录按姓名实际检索。报告里的每个数字都能回答「这是从哪儿来的」。'
              : 'Upload what the applicant submitted — AI extracts the facts, deterministic rules compute the score, and court and LTB public records are actually searched by name. Every number in the report can answer "where did this come from".'}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/screening/app"
              className="rounded-xl px-7 py-3.5 text-[15px] font-bold text-white shadow-lg"
              style={{ background: '#1B1B3C' }}
            >
              {zh ? '开始筛查 · 注册即免费试用 →' : 'Start a screening — free with a quick signup →'}
            </Link>
            <Link href="/pricing" className="rounded-xl border border-line-divider bg-white px-6 py-3.5 text-[14px] font-semibold text-body-2">
              {zh ? '查看定价' : 'See pricing'}
            </Link>
          </div>
          <p className="mt-3 text-[12px] text-body-3">
            {zh ? 'Ontario tenant screening · report in minutes · free tier included' : '安省租客筛查 · 几分钟出报告 · 注册即可免费试用'}
          </p>
        </section>

        {/* Sources */}
        <section className="border-y border-line-divider bg-white">
          <div className="mx-auto max-w-[880px] px-5 py-14">
            <h2 className="text-[22px] font-extrabold tracking-tight">{zh ? '实际检索的数据源' : 'What actually gets searched'}</h2>
            <p className="mt-1 text-[13px] text-body-3">
              {zh ? 'What actually gets searched — 每个数据源在报告里带着自己的检索状态。' : 'Every source carries its own search status in the report.'}
            </p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {SOURCES.map((s) => (
                <div key={s.en} className="rounded-xl border border-line-divider bg-[#FFFFFF] p-5">
                  <div className="text-[14.5px] font-bold">{zh ? s.zh : s.en}</div>
                  <div className="font-mono text-[10.5px] uppercase tracking-wide text-body-3">{zh ? s.en : s.zh}</div>
                  <p className="mt-2 text-[12.5px] leading-relaxed text-body-2">{zh ? s.descZh : s.descEn}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Comparison — what the report does that a per-report product does not */}
        <section className="mx-auto max-w-[880px] px-5 py-14">
          <h2 className="text-[22px] font-extrabold tracking-tight">{zh ? '和按份出售的筛查报告有什么不同' : 'How this differs from a per-report screening product'}</h2>
          <p className="mt-1 text-[13px] text-body-3">
            {zh ? '右列描述的是加拿大与美国常见按份报告产品的一般做法,不针对任何一家。' : 'The right-hand column describes what typical per-report products in Canada and the US advertise, not any one vendor.'}
          </p>
          <div className="mt-6 overflow-x-auto rounded-xl border border-line-divider bg-white">
            <table className="w-full min-w-[620px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-line-divider bg-[#FFFFFF] text-left font-mono text-[10.5px] uppercase tracking-wide text-body-3">
                  <th className="px-4 py-2.5 font-bold">{zh ? '能力' : 'Capability'}</th>
                  <th className="px-4 py-2.5 font-bold" style={{ color: '#047857' }}>Stayloop</th>
                  <th className="px-4 py-2.5 font-bold">{zh ? '典型按份报告' : 'Typical per-report product'}</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((row) => (
                  <tr key={row.en} className="border-b border-line-divider last:border-b-0 align-top">
                    <td className="px-4 py-2.5 text-body-2">{zh ? row.zh : row.en}</td>
                    <td className="px-4 py-2.5 font-semibold" style={{ color: row.us ? '#047857' : '#A1A1AA' }}>{row.us ? '✓' : '—'}</td>
                    <td className="px-4 py-2.5 text-body-3">
                      <span className="font-semibold" style={{ color: row.typical ? '#3F3F46' : '#A1A1AA' }}>{row.typical ? '✓' : '—'}</span>
                      {(zh ? row.typicalNoteZh : row.typicalNoteEn) && <span className="ml-2 text-[12px]">{zh ? row.typicalNoteZh : row.typicalNoteEn}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Principles */}
        <section className="mx-auto max-w-[880px] px-5 py-14">
          <h2 className="text-[22px] font-extrabold tracking-tight">{zh ? '这份报告的四条纪律' : "The report's four disciplines"}</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {PRINCIPLES.map((p, i) => (
              <div key={p.zh} className="rounded-xl border border-line-divider bg-white p-5">
                <div className="font-mono text-[20px] font-extrabold" style={{ color: '#1B1B3C22' }}>0{i + 1}</div>
                <div className="mt-1 text-[14.5px] font-bold">{zh ? p.zh : p.en}</div>
                <p className="mt-2 text-[12.5px] leading-relaxed text-body-2">{zh ? p.descZh : p.descEn}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="mx-auto max-w-[880px] px-5 pb-14">
          <h2 className="text-[22px] font-extrabold tracking-tight">{zh ? '怎么进行一次租客筛查' : 'How a screening works'}</h2>
          <p className="mt-1 text-[13px] text-body-3">
            {zh ? 'How tenant screening works on Stayloop — 三步,全程可见。' : 'Three steps, every one visible as it runs.'}
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {STEPS.map((st, i) => (
              <div key={st.zh} className="rounded-xl border border-line-divider bg-white p-5">
                <div className="font-mono text-[24px] font-extrabold" style={{ color: '#1B1B3C' }}>{i + 1}</div>
                <div className="mt-1 text-[14.5px] font-bold">{zh ? st.zh : st.en}</div>
                <p className="mt-2 text-[12.5px] leading-relaxed text-body-2">{zh ? st.descZh : st.descEn}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Compliance strip */}
        <section className="border-y border-line-divider bg-white">
          <div className="mx-auto max-w-[880px] px-5 py-10">
            <h2 className="text-[15px] font-extrabold">{zh ? '合规姿态' : 'Compliance posture'}</h2>
            <p className="mt-2 max-w-[720px] text-[12.5px] leading-relaxed text-body-2">
              {zh
                ? '筛查工具的使用遵循安省《人权法典》下 O. Reg. 290/98 允许的选择方式(信用参考、租史、信用检查、收入信息,须整体考量)。受保护特征不进入评分,合规审计随每份报告输出。报告基于申请人自愿提交的文件与公开记录生成;Stayloop 不是《消费者报告法》(安省)意义上的消费者报告机构,本报告亦非该法意义上的消费者报告。个人信息按 PIPEDA 要求加密存储,申请人有权查阅并要求更正。'
                : "Screening follows the selection practices O. Reg. 290/98 under Ontario's Human Rights Code permits (credit references, rental history, credit checks, income information — considered together). Protected grounds never enter the score, and a compliance audit ships with every report. Reports are generated from documents the applicant voluntarily submits plus public records; Stayloop is not a consumer reporting agency within the meaning of the Consumer Reporting Act (Ontario), nor is the report a consumer report under that Act. Personal information is stored encrypted per PIPEDA, and applicants may access and correct it."}
            </p>
          </div>
        </section>

        {/* FAQ — same arrays feed the FAQPage JSON-LD in the server page */}
        <section className="mx-auto max-w-[880px] px-5 py-14">
          <h2 className="text-[22px] font-extrabold tracking-tight">{zh ? '常见问题' : 'Frequently asked questions'}</h2>
          <p className="mt-1 text-[13px] text-body-3">{zh ? 'Tenant screening in Ontario — FAQ' : '安省租客筛查 · FAQ'}</p>
          <div className="mt-6 space-y-3">
            {FAQS.map((f) => {
              const item = zh ? f.zh : f.en
              return (
                <details key={f.zh.q} className="group rounded-xl border border-line-divider bg-white px-5 py-4">
                  <summary className="cursor-pointer list-none text-[14.5px] font-bold marker:content-none">
                    <span className="mr-2 font-mono text-[12px]" style={{ color: '#1B1B3C' }}>Q</span>
                    {item.q}
                  </summary>
                  <p className="mt-3 text-[13px] leading-relaxed text-body-2">{item.a}</p>
                </details>
              )
            })}
          </div>
        </section>

        {/* Final CTA */}
        <section className="mx-auto max-w-[880px] px-5 py-16 text-center">
          <h2 className="text-[24px] font-extrabold tracking-tight">
            {zh ? '下一位申请人,用报告说话' : 'Let the report speak for your next applicant'}
          </h2>
          <p className="mx-auto mt-2 max-w-[460px] text-[13.5px] text-body-2">
            {zh ? '注册免费账号即可开始筛查(免费档每月 5 单);历史记录云端保留,并可解锁深度核验。' : 'Create a free account to start screening (5 free per month); your history is saved to your account, and deep verification unlocks.'}
          </p>
          <Link
            href="/screening/app"
            className="mt-6 inline-block rounded-xl px-8 py-4 text-[15px] font-bold text-white shadow-lg"
            style={{ background: '#1B1B3C' }}
          >
            {zh ? '开始筛查 →' : 'Start a screening →'}
          </Link>
        </section>
      </main>

      <Footer />
    </div>
  )
}
