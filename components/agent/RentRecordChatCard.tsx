'use client'

// Recording rent, finished in the AI conversation (2026-11-24, user: 「接着做记租金」). It appears under
// the assistant's reply when a signed-in landlord or tenant says rent was received or paid
// (lib/agent/rentRecordIntent.ts):
//   which     the person's managed tenancies in this role; the one they named is chosen
//   periods   exactly the rows the tenancy page's rent tab would let them mark — the month they named
//             is ticked, or the latest one already due
//   date      the day it was actually paid, per period: it decides paid vs late. A period that would
//             be late if recorded today has no date until the person gives one (「到期当天」 and 「今天」
//             are one tap each), and the card says what the chosen day would record, in the page's own words
//   confirm   only 「确认」 records anything, one `mark_rent_paid` per ticked period
// Every call is the person's own (lib/household/rentClient.ts). The assistant never sees the rows and
// cannot press the button: this is a form the person submits, not something the assistant proposes —
// a landlord's conversation still proposes no approval card. Stayloop handles no money: this is
// the record of rent the two sides paid between themselves.
//
// What survives a reload: that this card recorded something (this browser, per account and card).
// Without that note the card simply reads the ledger again — a period already recorded is no longer
// on it, so nothing can be recorded twice.
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useT } from '@/lib/i18n'
import { useAuth } from '@/lib/useAuth'
import { notifyFactsChanged } from '@/lib/facts/useFacts'
import { notifyPendingChanged } from '@/lib/agent/pendingCount'
import { rentMonthHint, type RentRecordOffer } from '@/lib/agent/rentRecordIntent'
import type { AgentRole } from '@/lib/agent/types'
import { earliestPaidOn, torontoDate } from '@/lib/household/ledger'
import { defaultPaidOn, paidOnNote, pickPeriods, pickTenancy, tenancyLabel, type RentRole, type RentTenancy } from '@/lib/household/rentRecord'
import { loadRentTenancies, recordRentPaid } from '@/lib/household/rentClient'

type Recorded = { due: string; paidOn: string; late: boolean; amount: number }
type Done = { id: string; label: string; recorded: Recorded[] }
type Step = 'loading' | 'failed' | 'empty' | 'pick' | 'saving' | 'done'

export const rentRecordDoneKey = (uid: string, offerId: string) => `sl-rent-record:${uid}:${offerId}`

const money = (n: number) => `$${n.toLocaleString('en-CA', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`
/** `11 月 1 日` / `Nov 1` — the year only when it is not this one. */
function dueLabel(due: string, today: string, zh: boolean): string {
  const [y, m, d] = [Number(due.slice(0, 4)), Number(due.slice(5, 7)), Number(due.slice(8, 10))]
  const sameYear = due.slice(0, 4) === today.slice(0, 4)
  if (zh) return `${sameYear ? '' : `${y} 年 `}${m} 月 ${d} 日`
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]
  return `${mon} ${d}${sameYear ? '' : `, ${y}`}`
}

export default function RentRecordChatCard({ offer, role, said }: { offer: RentRecordOffer; role: AgentRole; said?: string }) {
  const { lang } = useT()
  const zh = lang === 'zh'
  const { user } = useAuth()
  const uid = user?.id ?? null
  const who: RentRole | null = role === 'landlord' || role === 'tenant' ? role : null
  const fid = useId()
  const today = useMemo(() => torontoDate(), [])
  const month = useMemo(() => rentMonthHint(said, today), [said, today])

  const [step, setStep] = useState<Step>('loading')
  const [tenancies, setTenancies] = useState<RentTenancy[]>([])
  const [at, setAt] = useState(0)
  const [ticked, setTicked] = useState<string[]>([])
  const [paidOn, setPaidOn] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [justRecorded, setJustRecorded] = useState<Recorded[]>([])
  const [done, setDone] = useState<Done | null>(null)
  const loadedFor = useRef<string | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const acted = useRef(false)

  const load = useCallback(async (preselect: boolean) => {
    if (!uid || !who) return
    try {
      const list = await loadRentTenancies(uid, who)
      setTenancies(list)
      if (!list.length) { setStep('empty'); return }
      if (preselect) {
        const i = Math.max(0, pickTenancy(list, said))
        setAt(i)
        setTicked(pickPeriods(list[i].periods, month))
      }
      setStep('pick')
    } catch {
      setStep('failed')
    }
  }, [uid, who, said, month])

  // Recorded from this card already (in this browser): say so; otherwise read the ledger — once per card and account.
  useEffect(() => {
    if (!uid || !who || loadedFor.current === `${uid}:${offer.id}`) return
    loadedFor.current = `${uid}:${offer.id}`
    try {
      const raw = window.localStorage.getItem(rentRecordDoneKey(uid, offer.id))
      const d = raw ? (JSON.parse(raw) as Done) : null
      if (d && typeof d.id === 'string' && Array.isArray(d.recorded)) { setDone(d); setStep('done'); return }
    } catch { /* no storage: the card reads the ledger */ }
    void load(true)
  }, [uid, who, offer.id, load])

  // After the person acted, keep what changed in view (the thread scrolled to its end before the card filled in).
  useEffect(() => {
    if (!acted.current) return
    try { boxRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }) } catch { /* not scrollable here */ }
  }, [step, errors])

  if (!uid || !who) return null

  const t = tenancies[at] ?? null
  const dateOf = (due: string) => paidOn[due] ?? defaultPaidOn(due, today)
  const notes = Object.fromEntries((t?.periods ?? []).map((p) => [p.due, paidOnNote(p.due, dateOf(p.due), today, zh)]))
  const chosen = (t?.periods ?? []).filter((p) => ticked.includes(p.due))
  const canConfirm = step === 'pick' && chosen.length > 0 && chosen.every((p) => notes[p.due].ok)

  function chooseTenancy(i: number) {
    setAt(i)
    setTicked(pickPeriods(tenancies[i]?.periods ?? [], month))
    setErrors({})
  }
  function toggle(due: string) {
    setTicked((x) => (x.includes(due) ? x.filter((d) => d !== due) : [...x, due]))
    setErrors((e) => { const n = { ...e }; delete n[due]; return n })
  }

  async function confirm() {
    if (!t || !canConfirm) return
    acted.current = true
    setStep('saving')
    const ok: Recorded[] = []
    const bad: Record<string, string> = {}
    // one at a time, oldest first: each is its own row, and a refusal names its period
    for (const p of chosen) {
      const r = await recordRentPaid(t.leaseId, p.due, dateOf(p.due), zh)
      if (r.ok) ok.push({ due: p.due, paidOn: dateOf(p.due), late: notes[p.due].late, amount: p.amount })
      else bad[p.due] = r.message
    }
    if (ok.length) { notifyFactsChanged(); notifyPendingChanged() }
    const all = [...justRecorded, ...ok]
    setJustRecorded(all)
    if (Object.keys(bad).length) {
      // what went through is recorded; what did not stays on the card with its reason
      setErrors(bad)
      setTicked(Object.keys(bad))
      await load(false)
      return
    }
    const d: Done = { id: t.id, label: tenancyLabel(t), recorded: all }
    setDone(d); setStep('done')
    try { window.localStorage.setItem(rentRecordDoneKey(uid!, offer.id), JSON.stringify(d)) } catch { /* no storage */ }
  }

  const verb = who === 'landlord' ? (zh ? '已收' : 'received') : (zh ? '已付' : 'paid')
  const roleName = who === 'landlord' ? (zh ? '房东' : 'landlord') : (zh ? '租客' : 'tenant')
  const recordedLine = (r: Recorded) => (zh
    ? `${dueLabel(r.due, today, true)}到期 · ${money(r.amount)} · 记为 ${r.paidOn} ${verb}${r.late ? '（迟付）' : ''}`
    : `Due ${dueLabel(r.due, today, false)} · ${money(r.amount)} · recorded as ${verb} on ${r.paidOn}${r.late ? ' (late)' : ''}`)

  return (
    <div ref={boxRef} className="w-full max-w-[460px] scroll-mb-4 scroll-mt-4 rounded-xl border border-line-divider bg-white p-4 text-left" data-testid="rent-record-card" data-step={step}>
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-[#E6F5EF] text-[#047857]" aria-hidden>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
        </span>
        <div className="text-[14px] font-bold text-ink">{zh ? '记租金' : 'Record rent'}</div>
        <span className="ml-auto text-[11.5px] text-body-3">{zh ? `以${roleName}身份` : `As the ${roleName}`}</span>
      </div>

      {step === 'loading' && (
        <div className="py-6 text-center" role="status" data-testid="rent-record-loading">
          <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-[#00ACE4] border-t-transparent" />
          <p className="mt-2 text-[12.5px] text-body-3">{zh ? '正在读你的租金记录…' : 'Reading your rent record…'}</p>
        </div>
      )}

      {step === 'failed' && (
        <div className="mt-3" data-testid="rent-record-failed">
          <p className="text-[12.5px] leading-relaxed text-red-700" role="alert">{zh ? '租金记录没有读出来，所以这里什么都没有列。请重试。' : 'The rent record could not be read, so nothing is listed here. Please try again.'}</p>
          <button type="button" onClick={() => { setStep('loading'); void load(true) }} className="mt-2 rounded-lg border border-line-divider px-3 py-1.5 text-[12.5px] font-semibold text-body">{zh ? '重试' : 'Retry'}</button>
        </div>
      )}

      {step === 'empty' && (
        <div className="mt-3" data-testid="rent-record-empty">
          <p className="text-[12.5px] leading-relaxed text-body-2">
            {who === 'landlord'
              ? (zh ? '你名下还没有在管租约，所以没有可以记的账期。先把签好的租约导入——在对话里说一句「导入租约」就行。' : 'You have no managed tenancy yet, so there is no period to record. Bring the signed lease in first — just say “import my lease” here.')
              : (zh ? '你还没有在管租约，所以没有可以记的账期。可以自己把签好的租约导入（说一句「导入租约」），或请房东邀请你加入。' : 'You are not in a managed tenancy yet, so there is no period to record. Import the signed lease yourself (say “import my lease”), or ask your landlord to invite you.')}
          </p>
          <Link href="/leases/import" className="mt-2 inline-block text-[12.5px] font-semibold text-brand underline underline-offset-2">{zh ? '或者去导入页 →' : 'Or open the import page →'}</Link>
        </div>
      )}

      {(step === 'pick' || step === 'saving') && t && (
        <div className="mt-2" data-testid="rent-record-form">
          {tenancies.length > 1 ? (
            <>
              <label htmlFor={`${fid}-t`} className="mb-1 mt-2 block text-[12px] font-semibold text-body-2">{zh ? '哪一份租约' : 'Which tenancy'}</label>
              <select id={`${fid}-t`} value={at} onChange={(e) => chooseTenancy(Number(e.target.value))} disabled={step === 'saving'} className="w-full rounded-lg border border-line-divider bg-white px-3 py-2 text-[14px] text-ink" data-testid="rent-record-tenancy">
                {tenancies.map((x, i) => <option key={x.id} value={i}>{tenancyLabel(x)}{who === 'landlord' && x.tenant ? ` · ${x.tenant}` : ''}</option>)}
              </select>
            </>
          ) : (
            <p className="mt-2 text-[13px] font-semibold text-ink" data-testid="rent-record-tenancy-one">{tenancyLabel(t)}{who === 'landlord' && t.tenant ? <span className="font-normal text-body-2"> · {t.tenant}</span> : null}</p>
          )}

          {justRecorded.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-[12px] text-[#047857]" data-testid="rent-record-partial">
              {justRecorded.map((r) => <li key={r.due}>✓ {recordedLine(r)}</li>)}
            </ul>
          )}

          {t.periods.length === 0 ? (
            <div className="mt-3" data-testid="rent-record-none">
              <p className="text-[12.5px] leading-relaxed text-body-2">{zh ? '这份租约到期的各期都已经记上了，现在没有可以记的。' : 'Every period that is due on this tenancy is already recorded; there is nothing to record now.'}</p>
              <Link href={`/h/${t.id}?tab=rent`} className="mt-2 inline-block text-[12.5px] font-semibold text-brand underline underline-offset-2">{zh ? '打开租金记录 →' : 'Open the rent record →'}</Link>
            </div>
          ) : (
            <>
              <p className="mt-2 text-[12px] leading-relaxed text-body-3">
                {zh ? `勾选${verb}的各期，把日期改成实际${who === 'landlord' ? '收到' : '付款'}的那一天。` : `Tick the periods that were ${verb} and set each date to the day it was actually ${verb}.`}
              </p>
              <ul className="mt-2 space-y-2" data-testid="rent-record-periods">
                {t.periods.map((p) => {
                  const on = ticked.includes(p.due)
                  const n = notes[p.due]
                  return (
                    <li key={p.due} className={`rounded-lg border px-3 py-2 ${on ? 'border-[#00ACE4] bg-[#F3FBFE]' : 'border-line-divider bg-white'}`} data-testid="rent-record-period" data-due={p.due} data-on={on ? '1' : '0'}>
                      <label className="flex cursor-pointer items-center gap-2.5">
                        <input type="checkbox" checked={on} onChange={() => toggle(p.due)} disabled={step === 'saving'} className="h-[18px] w-[18px] flex-none accent-[#00ACE4]" data-testid="rent-record-tick" />
                        <span className="min-w-0 flex-1 text-[13.5px] text-ink">
                          <span className="font-semibold">{zh ? `${dueLabel(p.due, today, true)}到期` : `Due ${dueLabel(p.due, today, false)}`}</span>
                          <span className="text-body-2"> · {money(p.amount)}</span>
                        </span>
                        <span className={`flex-none rounded-full px-2 py-[1px] text-[11px] font-semibold ${p.overdue ? 'bg-amber-50 text-amber-800' : 'bg-[#F1F5F9] text-body-2'}`}>{p.overdue ? (zh ? '已到期 · 未记' : 'Due · not recorded') : (zh ? '还没到期' : 'Not due yet')}</span>
                      </label>
                      {on && (
                        <div className="mt-2 pl-[28px]">
                          <label className="flex flex-wrap items-center gap-2 text-[12px] text-body-2">
                            {who === 'landlord' ? (zh ? '收到日期' : 'Received on') : (zh ? '付款日期' : 'Paid on')}
                            <input
                              type="date"
                              value={dateOf(p.due)}
                              min={earliestPaidOn(p.due, today)}
                              max={today}
                              disabled={step === 'saving'}
                              onChange={(e) => setPaidOn((m) => ({ ...m, [p.due]: e.target.value }))}
                              aria-label={zh ? `${p.due} 这一期的付款日期` : `Payment date for the ${p.due} period`}
                              className="rounded-md border border-line-divider bg-white px-2 py-1 text-[13px] text-ink"
                              data-testid="rent-record-paid-on"
                            />
                          </label>
                          {/* would be late if recorded today: the person says which day — never a pre-filled guess */}
                          {p.overdue && (
                            <div className="mt-1.5 flex flex-wrap gap-1.5" data-testid="rent-record-day-chips">
                              {[{ k: 'due', v: p.due, t: zh ? `到期当天 · ${dueLabel(p.due, today, true)}` : `On the due date · ${dueLabel(p.due, today, false)}` }, { k: 'today', v: today, t: zh ? '今天' : 'Today' }].map((c) => (
                                <button key={c.k} type="button" disabled={step === 'saving'} onClick={() => setPaidOn((m) => ({ ...m, [p.due]: c.v }))} aria-pressed={dateOf(p.due) === c.v} data-testid={`rent-record-day-${c.k}`}
                                  className={`min-h-[32px] rounded-full border px-2.5 text-[12px] font-semibold transition ${dateOf(p.due) === c.v ? 'border-[#00ACE4] bg-[#00ACE4] text-white' : 'border-line-divider bg-white text-body hover:border-brand'}`}>
                                  {c.t}
                                </button>
                              ))}
                            </div>
                          )}
                          {!dateOf(p.due) && <p className="mt-1 text-[11.5px] leading-relaxed text-body-3" data-testid="rent-record-date-ask">{zh ? `选一下是哪一天${who === 'landlord' ? '收到' : '付'}的：日期决定记成准时还是迟付，记上之后不能改。` : `Say which day it was ${who === 'landlord' ? 'received' : 'paid'}: the date decides on time or late, and a record cannot be changed afterwards.`}</p>}
                          {n.text && <p className={`mt-1 text-[11.5px] leading-relaxed ${n.ok ? 'text-amber-700' : 'text-red-700'}`} data-testid="rent-record-date-note">{n.text}</p>}
                        </div>
                      )}
                      {errors[p.due] && <p className="mt-1.5 pl-[28px] text-[12px] text-red-700" role="alert" data-testid="rent-record-error">{errors[p.due]}</p>}
                    </li>
                  )
                })}
              </ul>
              <button type="button" onClick={() => void confirm()} disabled={!canConfirm} className="mt-3 w-full rounded-lg py-2.5 text-[14px] font-bold text-white transition hover:brightness-95 disabled:opacity-50" style={{ background: '#00ACE4' }} data-testid="rent-record-confirm">
                {step === 'saving' ? (zh ? '正在记…' : 'Recording…') : zh ? `确认记为${verb}${chosen.length > 1 ? `（${chosen.length} 期）` : ''}` : `Confirm as ${verb}${chosen.length > 1 ? ` (${chosen.length} periods)` : ''}`}
              </button>
              <p className="mt-2 text-center text-[11.5px] leading-relaxed text-body-3">
                {zh ? '确认之前什么都不会记。记上之后对方能看到，并可以在租约页确认。Stayloop 不经手资金。' : 'Nothing is recorded until you confirm. Once recorded, the other side can see it and confirm it on the tenancy’s page. Stayloop handles no money.'}
              </p>
            </>
          )}
        </div>
      )}

      {step === 'done' && done && (
        <div className="mt-3" data-testid="rent-record-done">
          <div className="text-[13.5px] font-bold text-ink">{zh ? `✓ 已记 ${done.recorded.length} 期` : `✓ ${done.recorded.length} period${done.recorded.length === 1 ? '' : 's'} recorded`}</div>
          <div className="mt-0.5 text-[12.5px] text-body-2">{done.label}</div>
          <ul className="mt-1.5 space-y-0.5 text-[12.5px] text-body">
            {done.recorded.map((r) => <li key={r.due}>{recordedLine(r)}</li>)}
          </ul>
          <p className="mt-1.5 text-[12px] leading-relaxed text-body-3">
            {who === 'landlord'
              ? (zh ? '租客能在租约页看到这条记录并确认；收据或流水可以在那里补上。' : 'The tenant can see and confirm this on the tenancy’s page; a receipt or statement can be attached there.')
              : (zh ? '房东确认后，这就是双方确认过的付租记录；付款凭证可以在租约页补上。' : 'Once your landlord confirms it, this is a rent record both sides confirmed; proof of payment can be attached on the tenancy’s page.')}
          </p>
          <Link href={`/h/${done.id}?tab=rent`} className="mt-3 inline-flex min-h-[40px] items-center rounded-lg px-4 text-[13.5px] font-bold text-white transition hover:brightness-95" style={{ background: '#00ACE4' }} data-testid="rent-record-open">
            {zh ? '打开租金记录 →' : 'Open the rent record →'}
          </Link>
        </div>
      )}
    </div>
  )
}
