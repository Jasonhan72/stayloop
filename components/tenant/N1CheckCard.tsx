'use client'

// Tenant-side「核对涨租通知 N1」(V1.0 stage 2, 乙 #10). A real block on
// /tenant/lease: the tenant types what the notice says, lib/tenant/n1Check
// checks it against lib/ontario/rules and cites the section. No account data,
// no model call, nothing stored. It checks — it never says a notice is void.
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useT } from '@/lib/i18n'
import { checkN1, type N1Finding } from '@/lib/tenant/n1Check'

const TONE: Record<N1Finding['tone'], string> = {
  ok: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  check: 'border-amber-300 bg-amber-50 text-amber-900',
  info: 'border-line-divider bg-surface-chip text-body-2',
}
const MARK: Record<N1Finding['tone'], string> = { ok: '✓', check: '⚠', info: '·' }

export default function N1CheckCard() {
  const { lang } = useT()
  const zh = lang === 'zh'
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [served, setServed] = useState('')
  const [effective, setEffective] = useState('')
  const [last, setLast] = useState('')
  const [ran, setRan] = useState(false)

  const result = useMemo(() => {
    if (!ran) return null
    return checkN1({ currentRent: Number(current), newRent: Number(next), servedDate: served, effectiveDate: effective, lastIncreaseDate: last || null })
  }, [ran, current, next, served, effective, last])

  const canRun = Number(current) > 0 && Number(next) >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(served) && /^\d{4}-\d{2}-\d{2}$/.test(effective)

  return (
    <section id="n1-check" data-testid="n1-check-card" className="mb-5 overflow-hidden rounded-xl border border-line-divider bg-white">
      <div className="border-b border-line-divider px-4 py-3">
        <h2 className="text-[14px] font-bold tracking-tight">{zh ? '核对涨租通知（N1）' : 'Check a rent-increase notice (N1)'}</h2>
        <p className="mt-1 text-[12px] text-body-3">
          {zh
            ? '把通知上的数字和日期填进来，按安省《住宅租赁法》核对：指导比例、90 天通知期、12 个月一次。只核对、只引用法条，不替 LTB 下结论。'
            : 'Type what the notice says and it is checked against Ontario’s Residential Tenancies Act: the guideline, 90 days’ notice, once per 12 months. It checks and cites — it does not decide for the LTB.'}
        </p>
      </div>
      <form
        className="grid gap-3 p-4 sm:grid-cols-2"
        onSubmit={(e) => { e.preventDefault(); setRan(true) }}
      >
        <label className="text-[12px] text-body-2">
          {zh ? '现在的月租（$）' : 'Current monthly rent ($)'}
          <input className="sl-input mt-1 w-full" inputMode="decimal" value={current} onChange={(e) => { setCurrent(e.target.value.replace(/[^\d.]/g, '')); setRan(false) }} placeholder="2,000" aria-label={zh ? '现在的月租' : 'Current monthly rent'} />
        </label>
        <label className="text-[12px] text-body-2">
          {zh ? '通知上的新月租（$）' : 'New monthly rent on the notice ($)'}
          <input className="sl-input mt-1 w-full" inputMode="decimal" value={next} onChange={(e) => { setNext(e.target.value.replace(/[^\d.]/g, '')); setRan(false) }} placeholder="2,042" aria-label={zh ? '新月租' : 'New monthly rent'} />
        </label>
        <label className="text-[12px] text-body-2">
          {zh ? '通知送达日' : 'Date the notice was given'}
          <input type="date" className="sl-input mt-1 w-full" value={served} onChange={(e) => { setServed(e.target.value); setRan(false) }} aria-label={zh ? '通知送达日' : 'Date served'} />
        </label>
        <label className="text-[12px] text-body-2">
          {zh ? '涨租生效日' : 'Date the increase takes effect'}
          <input type="date" className="sl-input mt-1 w-full" value={effective} onChange={(e) => { setEffective(e.target.value); setRan(false) }} aria-label={zh ? '涨租生效日' : 'Effective date'} />
        </label>
        <label className="text-[12px] text-body-2 sm:col-span-2">
          {zh ? '上一次涨租（或起租）的日期 · 可选' : 'Last increase (or tenancy start) · optional'}
          <input type="date" className="sl-input mt-1 w-full sm:max-w-[260px]" value={last} onChange={(e) => { setLast(e.target.value); setRan(false) }} aria-label={zh ? '上一次涨租日期' : 'Last increase date'} />
        </label>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <button type="submit" className="sl-btn-primary px-5 py-2 text-[13px]" disabled={!canRun}>{zh ? '核对' : 'Check'}</button>
          <span className="text-[11.5px] text-body-3">{zh ? '不保存、不发送；只在这个页面上算。' : 'Nothing is saved or sent; it is computed on this page.'}</span>
        </div>
      </form>
      {ran && !result && (
        <p className="border-t border-line-divider px-4 py-3 text-[12.5px] text-amber-800">{zh ? '有一项没填对（租金要是正数，日期要完整）。' : 'Something is off — rent must be a positive number and both dates complete.'}</p>
      )}
      {result && (
        <div className="border-t border-line-divider px-4 py-4" data-testid="n1-check-result">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[12.5px] text-body-2">
            <span>{zh ? '涨幅' : 'Increase'} <b className="text-ink">{result.pct > 0 ? '+' : ''}{result.pct.toFixed(2)}%</b></span>
            <span>{zh ? `${result.guidelineYear} 年指导比例` : `${result.guidelineYear} guideline`} <b className="text-ink">{result.guideline}%</b>{!result.published && <span className="ml-1 text-amber-800">{zh ? '（尚未公布）' : '(not yet published)'}</span>}</span>
            <span>{zh ? '通知期' : 'Notice'} <b className="text-ink">{result.noticeDays} {zh ? '天' : 'days'}</b></span>
          </div>
          <ul className="mt-3 grid gap-2">
            {result.findings.map((f) => (
              <li key={f.code} className={`rounded-lg border px-3 py-2 text-[12.5px] leading-relaxed ${TONE[f.tone]}`}>
                <span className="mr-1.5 font-bold" aria-hidden>{MARK[f.tone]}</span>
                {zh ? f.message.zh : f.message.en}
                <span className="ml-2 font-mono text-[10.5px] opacity-70">{f.statute}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
            <a href={result.links.ltb} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-strong underline underline-offset-2">{zh ? 'LTB（房东与租客委员会）↗' : 'LTB (Landlord and Tenant Board) ↗'}</a>
            <a href={result.links.guideline} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-strong underline underline-offset-2">{zh ? '安省年度指导比例 ↗' : 'Ontario rent increase guideline ↗'}</a>
            <Link href={result.links.rules} className="font-semibold text-brand-strong underline underline-offset-2">{zh ? 'Stayloop 内置的规则与编号 →' : 'Rules Stayloop applies →'}</Link>
          </div>
          <p className="mt-2 text-[11.5px] text-body-3">{zh ? '这是按法条做的核对，不是法律意见；通知是否有效由 LTB 裁定。' : 'A check against the statute, not legal advice; whether a notice is valid is for the LTB.'}</p>
        </div>
      )}
    </section>
  )
}
