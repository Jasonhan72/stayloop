'use client'

// Tenant move-out tools (V1.0 stage 2, 乙 #10): N9 timing, deposit interest
// and a move-out checklist — three real blocks on /tenant/lease. The maths is
// in lib/tenant/moveOut; nothing here calls a model or writes the database.
// The checklist ticks live in this browser only (localStorage, try/catch).
import { useEffect, useMemo, useState } from 'react'
import { useT } from '@/lib/i18n'
import { LTB_FORMS_URL, MOVE_OUT_ITEMS, depositInterest, moveOutProgress, n9Timing } from '@/lib/tenant/moveOut'

const STORE_KEY = 'sl-move-out-checklist'

function fmtDate(iso: string, zh: boolean): string {
  const d = new Date(`${iso}T00:00:00Z`)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString(zh ? 'zh-CN' : 'en-CA', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
}
const money = (n: number) => `$${n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function MoveOutTools() {
  const { lang } = useT()
  const zh = lang === 'zh'
  return (
    <section id="move-out" data-testid="move-out-tools" className="mb-5 overflow-hidden rounded-xl border border-line-divider bg-white">
      <div className="border-b border-line-divider px-4 py-3">
        <h2 className="text-[14px] font-bold tracking-tight">{zh ? '退租工具' : 'Move-out tools'}</h2>
        <p className="mt-1 text-[12px] text-body-3">
          {zh ? 'N9 日期 · 押金利息 · 退租清单。按安省《住宅租赁法》计算并注明法条；不代填、不代送任何表格。' : 'N9 dates · deposit interest · move-out checklist. Computed under Ontario’s Residential Tenancies Act with the section cited; no form is filled or served for you.'}
        </p>
      </div>
      <div className="grid gap-5 p-4">
        <N9Block zh={zh} />
        <DepositBlock zh={zh} />
        <ChecklistBlock zh={zh} />
      </div>
    </section>
  )
}

function N9Block({ zh }: { zh: boolean }) {
  const [endDate, setEndDate] = useState('')
  const [termType, setTermType] = useState<'fixed' | 'monthly'>('fixed')
  const r = useMemo(() => (/^\d{4}-\d{2}-\d{2}$/.test(endDate) ? n9Timing({ leaseEndDate: endDate, termType }) : null), [endDate, termType])
  return (
    <div data-testid="move-out-n9" className="rounded-xl border border-line-divider bg-surface-chip p-4">
      <h3 className="text-[13px] font-bold">{zh ? '① 退租通知 N9 · 今天发的话最早能搬的日子' : '① Move-out notice (N9) · earliest date if you give notice today'}</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-[12px] text-body-2">
          {zh ? '租约类型' : 'Tenancy type'}
          <select className="sl-input mt-1 w-full" value={termType} onChange={(e) => setTermType(e.target.value as 'fixed' | 'monthly')} aria-label={zh ? '租约类型' : 'Tenancy type'}>
            <option value="fixed">{zh ? '定期租约（还在租期内）' : 'Fixed term (still within the term)'}</option>
            <option value="monthly">{zh ? '月租（租期已过或本来就是月租）' : 'Month-to-month (term ended, or monthly from the start)'}</option>
          </select>
        </label>
        <label className="text-[12px] text-body-2">
          {zh ? (termType === 'fixed' ? '租约到期日' : '原租约的到期日（决定每月租期在哪天结束）') : termType === 'fixed' ? 'Lease end date' : 'Original lease end date (sets the day each monthly period ends)'}
          <input type="date" className="sl-input mt-1 w-full" value={endDate} onChange={(e) => setEndDate(e.target.value)} aria-label={zh ? '租约到期日' : 'Lease end date'} />
        </label>
      </div>
      {r && (
        <div className="mt-3 text-[12.5px] leading-relaxed text-body-2" data-testid="move-out-n9-result">
          <p>
            {zh ? '今天送达 N9，最早可终止日：' : 'Given today, the earliest termination date is '}
            <b className="text-ink">{fmtDate(r.earliest, zh)}</b>
            {zh ? `（${r.basis === 'term_end' ? '租期末日' : `月租期末日，每月 ${r.periodEndDay} 日`}）` : ` (${r.basis === 'term_end' ? 'the term’s last day' : `end of a monthly period, the ${r.periodEndDay}th`})`}
            {zh ? '；为了这个日期，通知最晚要在 ' : '; for that date the notice must reach the landlord by '}
            <b className="text-ink">{fmtDate(r.serveBy, zh)}</b>
            {zh ? ' 送达。' : '.'}
          </p>
          <ul className="mt-2 grid gap-1">
            {r.notes.map((n) => (
              <li key={n.statute} className="text-[12px]">
                {zh ? n.text.zh : n.text.en} <span className="font-mono text-[10.5px] text-body-3">{n.statute}</span>
              </li>
            ))}
          </ul>
          <a href={LTB_FORMS_URL} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-[12px] font-semibold text-brand-strong underline underline-offset-2">{zh ? 'LTB 表格下载（N9）↗' : 'LTB forms (N9) ↗'}</a>
        </div>
      )}
    </div>
  )
}

function DepositBlock({ zh }: { zh: boolean }) {
  const [deposit, setDeposit] = useState('')
  const [paidOn, setPaidOn] = useState('')
  const r = useMemo(() => (Number(deposit) > 0 && /^\d{4}-\d{2}-\d{2}$/.test(paidOn) ? depositInterest({ deposit: Number(deposit), paidOn }) : null), [deposit, paidOn])
  return (
    <div data-testid="move-out-deposit" className="rounded-xl border border-line-divider bg-surface-chip p-4">
      <h3 className="text-[13px] font-bold">{zh ? '② 押金利息 · 房东应付多少' : '② Deposit interest · what the landlord owes'}</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-[12px] text-body-2">
          {zh ? '租金押金（$）' : 'Rent deposit ($)'}
          <input className="sl-input mt-1 w-full" inputMode="decimal" value={deposit} onChange={(e) => setDeposit(e.target.value.replace(/[^\d.]/g, ''))} placeholder="2,000" aria-label={zh ? '租金押金' : 'Rent deposit'} />
        </label>
        <label className="text-[12px] text-body-2">
          {zh ? '押金支付日' : 'Date the deposit was paid'}
          <input type="date" className="sl-input mt-1 w-full" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} aria-label={zh ? '押金支付日' : 'Deposit paid on'} />
        </label>
      </div>
      {r && (
        <div className="mt-3 text-[12.5px] text-body-2" data-testid="move-out-deposit-result">
          {r.rows.length === 0 ? (
            <p>{zh ? '还没满一年，第一笔利息还没到期。' : 'Less than a year so far — the first interest payment is not due yet.'}</p>
          ) : (
            <>
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-left text-body-3"><th className="py-1 font-medium">{zh ? '到期日' : 'Due'}</th><th className="py-1 font-medium">{zh ? '比例' : 'Rate'}</th><th className="py-1 text-right font-medium">{zh ? '利息' : 'Interest'}</th></tr>
                </thead>
                <tbody>
                  {r.rows.map((row) => (
                    <tr key={row.dueOn} className="border-t border-line-divider">
                      <td className="py-1">{fmtDate(row.dueOn, zh)}</td>
                      <td className="py-1">{row.pct}%{!row.published && <span className="ml-1 text-amber-800">{zh ? '（未公布，按最近值）' : '(unpublished, latest used)'}</span>}</td>
                      <td className="py-1 text-right">{money(row.amount)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-line-divider font-semibold text-ink"><td className="py-1" colSpan={2}>{zh ? '已到期应付合计' : 'Due so far'}</td><td className="py-1 text-right">{money(r.total)}</td></tr>
                </tbody>
              </table>
            </>
          )}
          {r.accrued && (
            <p className="mt-2 text-[12px] text-body-3">
              {zh
                ? `本年度（${fmtDate(r.accrued.since, zh)} 起）按 ${r.accrued.pct}% 折算到今天约 ${money(r.accrued.amount)}，下一笔到期日 ${fmtDate(r.accrued.nextDueOn, zh)}；这是估算，退租时的结算以房东与你的约定为准。`
                : `This year (since ${fmtDate(r.accrued.since, zh)}) pro-rated at ${r.accrued.pct}% is about ${money(r.accrued.amount)} to date; the next payment falls due ${fmtDate(r.accrued.nextDueOn, zh)}. An estimate — settle the final figure with your landlord.`}
            </p>
          )}
          <ul className="mt-2 grid gap-1">
            {r.notes.map((n) => (
              <li key={n.statute} className="text-[12px]">
                {zh ? n.text.zh : n.text.en} <span className="font-mono text-[10.5px] text-body-3">{n.statute}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function ChecklistBlock({ zh }: { zh: boolean }) {
  const [done, setDone] = useState<Set<string>>(new Set())
  const [notes, setNotes] = useState<Record<string, string>>({})
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY)
      if (raw) {
        const j = JSON.parse(raw) as { done?: string[]; notes?: Record<string, string> }
        setDone(new Set(Array.isArray(j.done) ? j.done : []))
        setNotes(j.notes && typeof j.notes === 'object' ? j.notes : {})
      }
    } catch { /* private window or blocked storage: start empty */ }
  }, [])
  const persist = (d: Set<string>, n: Record<string, string>) => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ done: [...d], notes: n })) } catch { /* ignore */ }
  }
  const toggle = (key: string) => {
    const next = new Set(done)
    if (next.has(key)) next.delete(key); else next.add(key)
    setDone(next); persist(next, notes)
  }
  const note = (key: string, v: string) => {
    const next = { ...notes, [key]: v.slice(0, 200) }
    setNotes(next); persist(done, next)
  }
  const p = moveOutProgress(done)
  const groups = (['notice', 'money', 'handover'] as const).map((g) => ({ g, items: MOVE_OUT_ITEMS.filter((i) => i.group === g) }))
  const GROUP: Record<typeof groups[number]['g'], { zh: string; en: string }> = {
    notice: { zh: '通知', en: 'Notice' },
    money: { zh: '押金与租金', en: 'Deposit & rent' },
    handover: { zh: '交接与搬家', en: 'Handover & moving' },
  }
  return (
    <div data-testid="move-out-checklist" className="rounded-xl border border-line-divider bg-surface-chip p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[13px] font-bold">{zh ? '③ 退租清单' : '③ Move-out checklist'}</h3>
        <span className="text-[11.5px] text-body-3">{p.done} / {p.total} · {zh ? '只存在这台设备上' : 'kept on this device only'}</span>
      </div>
      {groups.map(({ g, items }) => (
        <div key={g} className="mt-3">
          <div className="sl-eyebrow">{zh ? GROUP[g].zh : GROUP[g].en}</div>
          <ul className="mt-1.5 grid gap-1.5">
            {items.map((it) => {
              const isDone = done.has(it.key)
              return (
                <li key={it.key} className="rounded-lg border border-line-divider bg-white px-3 py-2">
                  <div className="flex items-start gap-2.5">
                    <button type="button" role="checkbox" aria-checked={isDone} aria-label={zh ? it.label.zh : it.label.en} onClick={() => toggle(it.key)} className={`mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded border text-[11px] ${isDone ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-line-strong bg-white'}`}>{isDone ? '✓' : ''}</button>
                    <div className="min-w-0 flex-1">
                      <div className={`text-[12.5px] ${isDone ? 'text-body-3 line-through' : 'text-ink'}`}>{zh ? it.label.zh : it.label.en}</div>
                      {it.note && <div className="mt-0.5 text-[11.5px] text-body-3">{zh ? it.note.zh : it.note.en}</div>}
                      {it.needsNote && (
                        <input className="sl-input mt-1.5 w-full text-[12px]" value={notes[it.key] ?? ''} onChange={(e) => note(it.key, e.target.value)} placeholder={zh ? it.needsNote.zh : it.needsNote.en} aria-label={zh ? `${it.label.zh} · 备注` : `${it.label.en} · note`} />
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}
