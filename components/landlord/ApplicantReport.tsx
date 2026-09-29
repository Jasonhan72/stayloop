'use client'

// SingleKey-style sectioned screening report, used by the sample applicant
// page: summary band first (big score + verdict + one-line AI advice +
// red-flag chips), then one block per scored item. The items are the real
// report's four (lib/screening/rubric.ts — ability to pay, credit, rental and
// legal history, verification); until 2026-09-28 this showed six V4
// dimensions, flagged income under 3× rent as a red flag (a cutoff the OHRC
// rental policy rules out) and called the court check a "CanLII search"
// (CanLII cannot be searched by name).

type Bi = { zh: string; en: string }

export type ReportDim = {
  key: string
  name: Bi
  val: number
  w: number
  color: string
  note?: string | null
}

const SECTIONS: { id: string; icon: string; title: Bi; keys: string[] }[] = [
  { id: 'income',       icon: '💰', title: { zh: '付款能力',       en: 'Ability to pay' },         keys: ['ability_to_pay'] },
  { id: 'credit',       icon: '📊', title: { zh: '信用',           en: 'Credit' },                 keys: ['credit_health'] },
  { id: 'rental',       icon: '⚖️', title: { zh: '租务与司法历史', en: 'Rental & legal history' }, keys: ['rental_history'] },
  { id: 'verification', icon: '🪪', title: { zh: '核验',           en: 'Verification' },           keys: ['verification'] },
]

function band(score: number): { label: Bi; cls: string } {
  if (score >= 85) return { label: { zh: '优秀', en: 'Excellent' }, cls: 'bg-success/10 text-success' }
  if (score >= 70) return { label: { zh: '良好', en: 'Good' }, cls: 'bg-brand/10 text-brand' }
  if (score >= 50) return { label: { zh: '需关注', en: 'Caution' }, cls: 'bg-warning/10 text-warning' }
  return { label: { zh: '高风险', en: 'High risk' }, cls: 'bg-danger/10 text-danger' }
}

function verdict(min: number): { label: Bi; cls: string } {
  if (min >= 85) return { label: { zh: '✓ 未见异常', en: '✓ No issues found' }, cls: 'text-success' }
  if (min >= 70) return { label: { zh: '基本正常', en: 'Looks fine' }, cls: 'text-body-2' }
  if (min >= 50) return { label: { zh: '⚠︎ 需关注', en: '⚠︎ Needs attention' }, cls: 'text-warning' }
  return { label: { zh: '✗ 发现风险', en: '✗ Risk found' }, cls: 'text-danger' }
}

function fallbackAdvice(score: number): Bi {
  if (score >= 85) return { zh: '各维度表现优秀，建议优先安排看房。', en: 'Strong across all dimensions — recommend prioritizing a showing.' }
  if (score >= 70) return { zh: '整体达标，可安排看房，重点确认红旗项。', en: 'Meets the bar overall — book a showing and confirm any flagged items.' }
  if (score >= 50) return { zh: '部分维度需关注，建议先面谈并补充材料。', en: 'Some dimensions need attention — interview first and request more documents.' }
  return { zh: '多个维度低于阈值，建议谨慎推进。', en: 'Multiple dimensions fall below threshold — proceed with caution.' }
}

export default function ApplicantReport({
  lang,
  score,
  dims,
  aiLine,
  ltbCount,
  incomeRatio,
}: {
  lang: 'zh' | 'en'
  score: number
  dims: ReportDim[]
  aiLine?: string | null
  ltbCount?: number | null
  incomeRatio?: number | null
}) {
  const zh = lang === 'zh'
  const byKey = new Map(dims.map((d) => [d.key, d]))
  const b = band(score)

  // Red-flag summary — dimensions below threshold + hard facts.
  const flags: Bi[] = []
  for (const d of dims) {
    if (d.val < 60) flags.push({ zh: `${d.name.zh}偏低 · ${d.val}/100`, en: `${d.name.en} low · ${d.val}/100` })
  }
  if (ltbCount != null && ltbCount > 0) {
    flags.push({ zh: `LTB 判令 ${ltbCount} 条`, en: `${ltbCount} LTB order${ltbCount > 1 ? 's' : ''}` })
  }
  // No income-to-rent flag: the ratio is shown as information only (OHRC rental policy).

  // Section-level extra fact lines beyond the dimension notes.
  const extras: Record<string, Bi | null> = {
    income:
      incomeRatio != null
        ? { zh: `月收入约为租金的 ${incomeRatio.toFixed(1)} 倍（仅供参考，非拒绝依据）`, en: `Monthly income is about ${incomeRatio.toFixed(1)}× the rent (information only, never grounds to decline)` }
        : null,
    rental:
      ltbCount != null
        ? ltbCount === 0
          ? { zh: '安省法院门户与 LTB 判令目录：未查到', en: 'Ontario courts portal and LTB order catalogue: nothing found' }
          : { zh: `LTB 判令目录：${ltbCount} 条同名判令，请打开报告核对`, en: `LTB order catalogue: ${ltbCount} order${ltbCount > 1 ? 's' : ''} under this name — open the report to check` }
        : null,
  }

  return (
    <div className="sl-card p-7">
      {/* Summary band — conclusion before detail (SingleKey report order). */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-[18px] font-bold tracking-tight">{zh ? '筛查报告 · 四项评分' : 'Screening report · four scores'}</h2>
          <p className="mt-2 text-[13.5px] leading-relaxed text-body-2">{aiLine || fallbackAdvice(score)[lang]}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="font-mono text-[40px] font-extrabold leading-none text-brand">{score}</div>
            <div className="font-mono text-[10.5px] uppercase text-body-3">/100</div>
          </div>
          <span className={`rounded-md px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-wider ${b.cls}`}>
            {b.label[lang]}
          </span>
        </div>
      </div>

      {/* Red-flag strip */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-body-3">
          {zh ? '红旗摘要' : 'Red flags'}
        </span>
        {flags.length === 0 ? (
          <span className="rounded-md bg-success/10 px-2.5 py-1 text-[11.5px] font-semibold text-success">
            {zh ? '✓ 未发现红旗 · 四项评分都在参考区间' : '✓ No red flags · all four scores in the reference range'}
          </span>
        ) : (
          flags.map((f) => (
            <span key={f.en} className="rounded-md bg-danger/10 px-2.5 py-1 text-[11.5px] font-semibold text-danger">
              ⚠ {f[lang]}
            </span>
          ))
        )}
      </div>

      {/* Section blocks */}
      <div className="mt-5 divide-y divide-line-divider border-t border-line-divider">
        {SECTIONS.map((s) => {
          const sd = s.keys.map((k) => byKey.get(k)).filter(Boolean) as ReportDim[]
          if (sd.length === 0) return null
          const min = Math.min(...sd.map((d) => d.val))
          const avg = Math.round(sd.reduce((sum, d) => sum + d.val, 0) / sd.length)
          const w = sd.reduce((sum, d) => sum + d.w, 0)
          const v = verdict(min)
          return (
            <details key={s.id} open={min < 70} className="group py-3">
              <summary className="flex cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
                <span className="text-[18px] leading-none">{s.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-[13.5px] font-bold">{s.title[lang]}</span>
                    <span className="font-mono text-[10.5px] text-body-3">{zh ? '权重' : 'Weight'} {w}%</span>
                  </div>
                  <div className={`text-[12px] font-semibold ${v.cls}`}>{v.label[lang]}</div>
                </div>
                <span className="font-mono text-[15px] font-bold">{avg}</span>
                <span className="text-body-3 transition-transform group-open:rotate-90">›</span>
              </summary>
              <div className="mt-3 space-y-3 pl-8 pr-1">
                {extras[s.id] && <div className="font-mono text-[11.5px] text-body-2">{extras[s.id]![lang]}</div>}
                {sd.map((d) => (
                  <div key={d.key}>
                    <div className="flex items-baseline justify-between">
                      <span className="text-[12.5px] font-semibold">
                        {d.name[lang]} <span className="font-mono text-[10px] text-body-3">· {d.w}%</span>
                      </span>
                      <span className="font-mono text-[13px] font-bold" style={{ color: d.color }}>{d.val}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line-divider">
                      <span className="block h-full rounded-full" style={{ width: `${d.val}%`, background: d.color }} />
                    </div>
                    {d.note && <div className="mt-1 text-[12px] text-body-2">{d.note}</div>}
                  </div>
                ))}
              </div>
            </details>
          )
        })}
      </div>
    </div>
  )
}
