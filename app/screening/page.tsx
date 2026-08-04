// /screening — the public landing for 租客筛查.
//
// This URL was an auth wall for its entire life: the money keyword of the
// whole product ("tenant screening" — screenings is the only table with real
// activity) rendered "Authenticating..." to every crawler and every shared
// link. The app moved to /screening/app, untouched; this page is the front
// door: server-rendered, indexable, and honest about exactly what a screening
// does and does not do.
//
// Signed-in users never linger here — AutoEnter forwards them straight to the
// app, so every legacy bookmark and back-link that points at /screening still
// behaves as before for existing users.
//
// Copy discipline: every claim on this page states something the product
// actually does today (sources actually searched, disclosure language lifted
// from the report itself). No invented numbers — pricing stays on /pricing.

import type { Metadata } from 'next'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import AutoEnter from './AutoEnter'

export const metadata: Metadata = {
  title: '租客筛查 · 几分钟出报告 | Stayloop Tenant Screening',
  description:
    '安省租客筛查:AI 读取申请材料,确定性取证引擎核验文件真伪,检索 LTB 判令目录与安省法院公开门户,生成可追溯的筛查报告。免注册可试一单。Ontario tenant screening with document forensics, LTB order catalogue and court portal checks.',
  alternates: { canonical: 'https://www.stayloop.ai/screening' },
  openGraph: {
    title: '租客筛查 · Stayloop',
    description: '上传申请材料,几分钟得到一份每个结论都注明依据的筛查报告。',
    url: 'https://www.stayloop.ai/screening',
  },
}

const SOURCES = [
  {
    zh: 'LTB 判令目录(安省开放数据)',
    en: 'LTB Order Catalogue — Ontario Open Data',
    descZh: '按姓名建库检索房东与租客委员会已公开的终局判令;姓名命中须经地址佐证才计入,目录不含判决结果,报告只说「已出判令」并附原件链接。',
  },
  {
    zh: '安省法院公开门户',
    en: 'Ontario Courts public portal',
    descZh: '民事与小额法庭的真实当事人检索,区分申请人是被告还是原告——只有被告/债务人记录才影响评分。',
  },
  {
    zh: '确定性文件取证引擎',
    en: 'Deterministic document forensics',
    descZh: 'PDF 元数据与生成工具指纹、内部结构分析、CRA 法定扣缴复算、工资单数学一致性、跨文档交叉核对——服务端确定性计算,不是 AI 猜测。',
  },
  {
    zh: '信用报告转录与核验',
    en: 'Credit report transcription & checks',
    descZh: '转录申请人自行上传的信用报告(逐条账户、额度、催收),复核真伪特征与报告时效。Stayloop 不直连征信局。',
  },
  {
    zh: '雇主独立性核验',
    en: "Employer arm's-length checks",
    descZh: '联邦公司注册库 + 官方 CBR/MRAS 联查:雇主是否真实存在、雇佣信签署人是否与申请人是关联方(家族公司自开收入证明是最常见的造假形态)。',
  },
]

const PRINCIPLES = [
  {
    zh: '每个结论注明依据',
    descZh: '评分由公开规则对测得事实计算——报告逐条列出触发的规则与所读数值,同样的材料永远得到同样的分数。',
  },
  {
    zh: '查过和没查过,分开说',
    descZh: '「✓ 已检索」只代表真的按姓名执行了检索;不可用、超时、未检索的数据源单独标注,绝不冒充「无记录」。',
  },
  {
    zh: '同名≠同一个人',
    descZh: '法庭与 LTB 的姓名命中在地址佐证之前一律视为可能同名,不进评分;网页索引命中标注为「提及」,永不参与打分。',
  },
  {
    zh: 'OHRC 红线内建',
    descZh: '种族、宗教、残障、家庭状况、是否领取补助等受保护特征不进入检索、不进入评分——合规审计随报告输出。',
  },
]

export default function ScreeningLanding() {
  return (
    <div style={{ background: '#FDFBF6', minHeight: '100vh' }} className="flex flex-col">
      <Header variant="transparent" />
      <AutoEnter />

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto max-w-[880px] px-5 pb-14 pt-16 text-center">
          <div className="font-mono text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: '#7C3AED' }}>
            STAYLOOP · TENANT SCREENING
          </div>
          <h1 className="mx-auto mt-4 max-w-[640px] text-[34px] font-extrabold leading-tight tracking-tight sm:text-[44px]">
            租客筛查,几分钟出一份
            <br />
            经得起追问的报告
          </h1>
          <p className="mx-auto mt-4 max-w-[560px] text-[15px] leading-relaxed text-body-2">
            上传申请人提交的材料——AI 抽取事实,确定性规则计算评分,法庭与 LTB 公开记录按姓名实际检索。
            报告里的每个数字都能回答「这是从哪儿来的」。
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/screening/app"
              className="rounded-xl px-7 py-3.5 text-[15px] font-bold text-white shadow-lg"
              style={{ background: '#7C3AED' }}
            >
              开始筛查 · 免注册试一单 →
            </Link>
            <Link href="/pricing" className="rounded-xl border border-line-divider bg-white px-6 py-3.5 text-[14px] font-semibold text-body-2">
              查看定价
            </Link>
          </div>
          <p className="mt-3 text-[12px] text-body-3">Ontario tenant screening · report in minutes · try one without an account</p>
        </section>

        {/* Sources */}
        <section className="border-y border-line-divider bg-white">
          <div className="mx-auto max-w-[880px] px-5 py-14">
            <h2 className="text-[22px] font-extrabold tracking-tight">实际检索的数据源</h2>
            <p className="mt-1 text-[13px] text-body-3">
              What actually gets searched — 每个数据源在报告里带着自己的检索状态。
            </p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {SOURCES.map((s) => (
                <div key={s.en} className="rounded-xl border border-line-divider bg-[#FDFBF6] p-5">
                  <div className="text-[14.5px] font-bold">{s.zh}</div>
                  <div className="font-mono text-[10.5px] uppercase tracking-wide text-body-3">{s.en}</div>
                  <p className="mt-2 text-[12.5px] leading-relaxed text-body-2">{s.descZh}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Principles */}
        <section className="mx-auto max-w-[880px] px-5 py-14">
          <h2 className="text-[22px] font-extrabold tracking-tight">这份报告的四条纪律</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {PRINCIPLES.map((p, i) => (
              <div key={p.zh} className="rounded-xl border border-line-divider bg-white p-5">
                <div className="font-mono text-[20px] font-extrabold" style={{ color: '#7C3AED22' }}>0{i + 1}</div>
                <div className="mt-1 text-[14.5px] font-bold">{p.zh}</div>
                <p className="mt-2 text-[12.5px] leading-relaxed text-body-2">{p.descZh}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Compliance strip */}
        <section className="border-y border-line-divider bg-white">
          <div className="mx-auto max-w-[880px] px-5 py-10">
            <h2 className="text-[15px] font-extrabold">合规姿态</h2>
            <p className="mt-2 max-w-[720px] text-[12.5px] leading-relaxed text-body-2">
              筛查工具的使用遵循安省《人权法典》下 O. Reg. 290/98 允许的选择方式(信用参考、租史、信用检查、收入信息,须整体考量)。
              受保护特征不进入评分,合规审计随每份报告输出。报告基于申请人自愿提交的文件与公开记录生成;
              Stayloop 不是《消费者报告法》(安省)意义上的消费者报告机构,本报告亦非该法意义上的消费者报告。
              个人信息按 PIPEDA 要求加密存储,申请人有权查阅并要求更正。
            </p>
          </div>
        </section>

        {/* Final CTA */}
        <section className="mx-auto max-w-[880px] px-5 py-16 text-center">
          <h2 className="text-[24px] font-extrabold tracking-tight">下一位申请人,用报告说话</h2>
          <p className="mx-auto mt-2 max-w-[460px] text-[13.5px] text-body-2">
            免注册可完整体验一单;注册后保留历史、解锁深度核验。
          </p>
          <Link
            href="/screening/app"
            className="mt-6 inline-block rounded-xl px-8 py-4 text-[15px] font-bold text-white shadow-lg"
            style={{ background: '#7C3AED' }}
          >
            开始筛查 →
          </Link>
        </section>
      </main>

      <Footer />
    </div>
  )
}
