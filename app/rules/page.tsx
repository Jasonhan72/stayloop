'use client'

// /rules — every Ontario rule Stayloop enforces, numbered, with its statute
// and where it bites (lifecycle plan 2026-09-22 §1). Screening reports and
// compliance findings cite these ids; this page is what they link to.
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { useT } from '@/lib/i18n'
import { ONTARIO_RULES, type RuleArea } from '@/lib/ontario/rules'

const AREAS: { key: RuleArea; zh: string; en: string }[] = [
  { key: 'listing', zh: '房源发布', en: 'Listings' },
  { key: 'screening', zh: '租客筛查', en: 'Screening' },
  { key: 'notice', zh: '决定与通知', en: 'Decisions & notices' },
  { key: 'lease', zh: '租约', en: 'Leases' },
  { key: 'renewal', zh: '续约与退租', en: 'Renewals & move-out' },
  { key: 'tenancy', zh: '租期中 · 2026 年新规', en: 'During the tenancy · 2026 changes' },
  { key: 'maintenance', zh: '维修与进入', en: 'Maintenance & entry' },
  { key: 'agent', zh: '经纪', en: 'Agents' },
]

export default function RulesPage() {
  const { lang } = useT()
  const zh = lang === 'zh'
  return (
    <div style={{ background: '#FFFFFF' }} className="text-body">
      <Header variant="transparent" />
      <section style={{ background: 'linear-gradient(180deg,#E9F5FD 0%,#FFFFFF 100%)' }}>
        <div className="mx-auto max-w-[1100px] px-5 py-16 sm:px-7 lg:py-20">
          <div className="font-mono text-[13px] font-semibold uppercase tracking-[.12em] text-brand">{zh ? 'RULES · 我们执行的安省规则' : 'RULES · The Ontario rules we enforce'}</div>
          <h1 className="mt-4 max-w-[820px] text-[clamp(28px,3.4vw,42px)] font-semibold leading-[1.1] tracking-[-0.03em]">
            {zh ? '每一条规则都有编号、法条和落点。' : 'Every rule has a number, a statute and a place where it bites.'}
          </h1>
          <p className="mt-5 max-w-[680px] text-[17px] leading-[1.6] text-body-2">
            {zh
              ? '筛查报告、发布检查、租约草稿、通知信里出现的规则编号都指向这里。这些检查是确定性代码，不由模型判断；条文变更只改一处。'
              : 'Rule ids in screening reports, publish checks, lease drafts and notice letters point here. The checks are deterministic code, not model judgement; a change in law is a one-file edit.'}
          </p>
        </div>
      </section>
      <section>
        <div className="mx-auto max-w-[1100px] px-5 py-12 sm:px-7 lg:py-16">
          {AREAS.map((a) => {
            const rules = ONTARIO_RULES.filter((r) => r.area === a.key)
            if (!rules.length) return null
            return (
              <div key={a.key} className="mb-12">
                <h2 className="text-[22px] font-semibold tracking-tight">{zh ? a.zh : a.en}</h2>
                <div className="mt-4 divide-y divide-line-divider rounded-2xl border border-line-divider bg-white">
                  {rules.map((r) => (
                    <div key={r.id} id={r.id} className="scroll-mt-24 px-5 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <code className="rounded bg-surface-chip px-2 py-[2px] font-mono text-[11.5px] font-bold text-brand">{r.id}</code>
                        <span className="rounded-full px-2 py-[2px] text-[11px] font-bold" style={r.severity === 'block' ? { background: '#FEF2F2', color: '#9F1239' } : r.severity === 'warn' ? { background: '#FFFBEB', color: '#B45309' } : { background: '#EEF5FA', color: '#4A4A6A' }}>
                          {r.severity === 'block' ? (zh ? '阻止' : 'blocks') : r.severity === 'warn' ? (zh ? '提醒' : 'warns') : (zh ? '说明' : 'informs')}
                        </span>
                        <span className="text-[12.5px] text-body-3">{r.statute}</span>
                      </div>
                      <div className="mt-1.5 text-[16px] font-semibold">{zh ? r.title.zh : r.title.en}</div>
                      <p className="mt-1 text-[14.5px] leading-relaxed text-body-2">{zh ? r.summary.zh : r.summary.en}</p>
                      <p className="mt-1 text-[12.5px] leading-relaxed text-body-3"><b>{zh ? '在 Stayloop 里：' : 'In Stayloop: '}</b>{zh ? r.enforcement.zh : r.enforcement.en}</p>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
          <p className="max-w-[760px] text-[13px] leading-relaxed text-body-3">
            {zh ? '这不是法律意见。条文以安省官方文本为准（ontario.ca/laws）；生效日期是本站依赖的版本，不是立法史。' : 'This is not legal advice. The statutes as published by Ontario (ontario.ca/laws) govern; effective dates are the versions this site relies on, not a legislative history.'}
          </p>
        </div>
      </section>
      <Footer />
    </div>
  )
}
