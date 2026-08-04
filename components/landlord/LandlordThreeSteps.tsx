'use client'

// SingleKey-style 1-2-3 onboarding strip for landlords — shown on the
// applicants page zero-data state. Each step is a clickable tile that
// jumps to the corresponding action.
import Link from 'next/link'

type Bi = { zh: string; en: string }

const STEPS: { n: string; title: Bi; desc: Bi; cta: Bi; href: string }[] = [
  {
    n: '01',
    title: { zh: '发布房源 · 邀请申请', en: 'List the unit · invite applicants' },
    desc: {
      zh: '免费发布房源，或把申请链接直接发给意向租客。',
      en: 'List your unit free, or send the application link straight to a prospect.',
    },
    cta: { zh: '去发布房源 →', en: 'Publish a listing →' },
    href: '/dashboard/listings/new',
  },
  {
    n: '02',
    title: { zh: '申请人提交材料，AI 跑六维尽调', en: 'Applicant submits docs, AI runs the check' },
    desc: {
      zh: '身份、收入、法庭记录、材料真伪、一致性 — 几分钟出分，无需你动手。',
      en: 'Identity, income, court records, document fraud, consistency — scored in minutes, hands-free.',
    },
    cta: { zh: '也可自己发起筛查 →', en: 'Or run a screening yourself →' },
    href: '/screening',
  },
  {
    n: '03',
    title: { zh: '看排序报告，一键决定', en: 'Review the ranked report, decide in one click' },
    desc: {
      zh: '申请自动分成 推荐 / 面谈 / 不达标 三组，打开详情页批准或婉拒。',
      en: 'Applications auto-group into Recommended / Interview / Below threshold — open one to approve or decline.',
    },
    cta: { zh: '看样例报告 →', en: 'See a sample report →' },
    href: '/landlord/applicants/1',
  },
]

export default function LandlordThreeSteps({ lang }: { lang: 'zh' | 'en' }) {
  return (
    <div className="mb-8">
      <div className="mb-3 font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
        {lang === 'zh' ? '三步租出去 · HOW IT WORKS' : 'Three steps to rented · HOW IT WORKS'}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {STEPS.map((s) => (
          <Link
            key={s.n}
            href={s.href}
            className="sl-card group flex flex-col p-5 transition hover:border-brand/40 hover:shadow-md"
          >
            <div className="font-mono text-[11px] font-bold uppercase tracking-wider text-brand">STEP {s.n}</div>
            <div className="mt-2 text-[14.5px] font-bold leading-snug">{s.title[lang]}</div>
            <p className="mt-1.5 flex-1 text-[12.5px] leading-relaxed text-body-2">{s.desc[lang]}</p>
            <span className="mt-3 font-mono text-[11.5px] font-semibold text-brand transition group-hover:translate-x-0.5">
              {s.cta[lang]}
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
