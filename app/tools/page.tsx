'use client'

// /tools — 租房小工具 (2026-10-25 · report review batch 1, design/ai-rebuild-
// report-review-2026-10-25.md §一 "免费查询"). Three free, sign-in-free tools:
// notice date arithmetic (N1 / N4 / N12 through the same computeN* the landlord
// toolbox uses — one source of truth), an asking-rent comparison against the
// CMHC / Statistics Canada benchmark (/api/v1/rent-benchmark), and the "may I
// ask this?" table (lib/ontario/screeningQuestions). Everything is
// deterministic, nothing is saved, no model is called. No form is pre-selected
// and nothing is filled in for the landlord: the official PDFs stay the LTB's.
import { useState } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { useT } from '@/lib/i18n'
import type { RentBenchmarkOut } from '@/lib/api/v1Core'
import {
  computeN1, computeN4, computeN12, noticeForm, SERVICE_METHODS, N12_COMPENSATION_LABEL, N12_WHO_LABEL,
  type ComputeResult, type Flag, type N12Compensation, type N12Who, type NoticeCode, type ServiceMethod,
} from '@/lib/ontario/noticeForms'
import { ASK_GROUPS, ASK_STATUS_LABEL, SCREENING_QUESTIONS, type AskStatus } from '@/lib/ontario/screeningQuestions'

type ToolForm = Exclude<NoticeCode, 'L1'>
const FORMS: ToolForm[] = ['N1', 'N4', 'N12']

const inputCls = 'sl-input w-full'
const FLAG_STYLE: Record<Flag['level'], { bg: string; fg: string; zh: string; en: string }> = {
  block: { bg: '#FEF2F2', fg: '#9F1239', zh: '不行', en: 'Not allowed' },
  warn: { bg: '#FFFBEB', fg: '#92400E', zh: '注意', en: 'Check' },
  info: { bg: '#EFF6FF', fg: '#1D4ED8', zh: '说明', en: 'Note' },
}
const STATUS_STYLE: Record<AskStatus, { bg: string; fg: string }> = {
  ok: { bg: '#ECFDF5', fg: '#047857' },
  ok_limited: { bg: '#FFFBEB', fg: '#92400E' },
  no: { bg: '#FEF2F2', fg: '#9F1239' },
  avoid: { bg: '#F3F4F6', fg: '#374151' },
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12.5px] font-semibold text-body-2">{label}</span>
      {children}
    </label>
  )
}

function Result({ res, code, zh }: { res: ComputeResult; code: ToolForm; zh: boolean }) {
  const form = noticeForm(code)
  const lang = zh ? 'zh' : 'en'
  // Raw ids from computeN* read as labels, the way the landlord toolbox prints them.
  const shown = (f: ComputeResult['fields'][number]): string =>
    f.key === 'method' ? (SERVICE_METHODS.find((m) => m.id === f.value)?.label[lang] ?? f.value)
    : f.key === 'who' ? (N12_WHO_LABEL[f.value as N12Who]?.[lang] ?? f.value)
    : f.key === 'compensation' ? (N12_COMPENSATION_LABEL[f.value as N12Compensation]?.[lang] ?? f.value)
    : f.value
  const fields = res.fields.filter((f) => f.value)
  return (
    <div className="mt-5 rounded-2xl border border-line-divider bg-white p-5" data-testid="tool-result">
      <div className="text-[13px] font-bold uppercase tracking-[.08em] text-body-3">{zh ? '算出来的日期与检查' : 'Dates and checks'}</div>
      <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {fields.map((f) => (
          <div key={f.key} className="flex justify-between gap-3 border-b border-line-divider py-1.5 text-[13.5px]">
            <dt className="text-body-2">{zh ? f.label.zh : f.label.en}</dt>
            <dd className={f.source === 'computed' ? 'font-semibold text-brand' : 'font-semibold'}>{shown(f)}</dd>
          </div>
        ))}
      </dl>
      <ul className="mt-4 space-y-2">
        {res.flags.map((fl, i) => (
          <li key={i} className="flex gap-2 text-[13.5px] leading-relaxed">
            <span className="mt-[2px] shrink-0 rounded-full px-2 py-[1px] text-[11px] font-bold" style={{ background: FLAG_STYLE[fl.level].bg, color: FLAG_STYLE[fl.level].fg }}>{zh ? FLAG_STYLE[fl.level].zh : FLAG_STYLE[fl.level].en}</span>
            <span>
              {zh ? fl.zh : fl.en}
              {fl.rule && <> <Link href={`/rules#${fl.rule}`} className="font-mono text-[11.5px] text-brand underline-offset-2 hover:underline">{fl.rule}</Link></>}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[12.5px] leading-relaxed text-body-3">
        {zh ? '表格请到 LTB 官网下载并自己填写，Stayloop 不代填、不代选、不代送：' : 'Download the form from the LTB and fill it in yourself; Stayloop does not fill, choose or file it: '}
        <a href={form.official.form} target="_blank" rel="noreferrer" className="text-brand underline-offset-2 hover:underline">{form.code} · {zh ? form.versionLabel.zh : form.versionLabel.en}</a>
        {form.official.instructions && <> · <a href={form.official.instructions} target="_blank" rel="noreferrer" className="text-brand underline-offset-2 hover:underline">{zh ? '官方填写说明' : 'Official instructions'}</a></>}
      </p>
    </div>
  )
}

function NoticeTool({ zh, lang }: { zh: boolean; lang: 'zh' | 'en' }) {
  const [form, setForm] = useState<ToolForm | null>(null)
  const [servedOn, setServedOn] = useState('')
  const [method, setMethod] = useState<ServiceMethod>('hand')
  const [n1, setN1] = useState({ currentRent: '', newRent: '', effectiveOn: '', lastIncreaseOn: '', leaseStart: '', exempt: false })
  const [n4, setN4] = useState<{ monthlyRent: string; terminationOn: string; periods: { due: string; amount: string }[] }>({ monthlyRent: '', terminationOn: '', periods: [{ due: '', amount: '' }] })
  const [n12, setN12] = useState<{ terminationOn: string; dueDay: string; who: N12Who; compensation: N12Compensation }>({ terminationOn: '', dueDay: '', who: 'landlord', compensation: 'one_month' })

  const ready =
    form === 'N1' ? !!(servedOn && n1.effectiveOn && n1.currentRent && n1.newRent)
    : form === 'N4' ? !!(servedOn && n4.terminationOn)
    : form === 'N12' ? !!(servedOn && n12.terminationOn)
    : false

  let res: ComputeResult | null = null
  if (ready && form === 'N1') {
    res = computeN1({
      currentRent: Number(n1.currentRent), newRent: Number(n1.newRent), servedOn, method, effectiveOn: n1.effectiveOn,
      lastIncreaseOn: n1.lastIncreaseOn || null, leaseStart: n1.leaseStart || null, firstOccupiedAfter2018: n1.exempt,
    })
  } else if (ready && form === 'N4') {
    const periods = n4.periods.filter((p) => p.due).map((p) => ({ due: p.due, amountOwed: Number(p.amount) || 0 }))
    res = computeN4({ monthlyRent: Number(n4.monthlyRent) || 0, unpaidPeriods: periods, servedOn, method, terminationOn: n4.terminationOn })
  } else if (ready && form === 'N12') {
    const dd = parseInt(n12.dueDay, 10)
    res = computeN12({ servedOn, method, terminationOn: n12.terminationOn, dueDay: Number.isInteger(dd) && dd >= 1 && dd <= 31 ? dd : null, who: n12.who, compensationOffered: n12.compensation })
  }

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-3" data-testid="tool-forms">
        {FORMS.map((code) => {
          const f = noticeForm(code)
          const on = form === code
          return (
            <button
              key={code} type="button" data-testid={`tool-form-${code}`} aria-pressed={on}
              onClick={() => setForm(on ? null : code)}
              className={`rounded-2xl border p-4 text-left transition ${on ? 'border-brand bg-[#E9F5FD]' : 'border-line-divider bg-white hover:border-line-strong'}`}
            >
              <div className="text-[15px] font-bold">{zh ? f.title.zh : f.title.en}</div>
              <div className="mt-1 text-[12.5px] leading-relaxed text-body-2">{zh ? f.what.zh : f.what.en}</div>
            </button>
          )
        })}
      </div>
      {!form && <p className="mt-4 text-[13.5px] text-body-3">{zh ? '选一张表，填几个日期，下面给你算最早可填的日子，并按现行规则检查。' : 'Pick a form and enter a few dates; the earliest allowed dates and the current-rule checks appear below.'}</p>}
      {form && (
        <div className="mt-5 rounded-2xl border border-line-divider bg-surface-chip/40 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={zh ? '送达日（你把通知交给租客的日子）' : 'Date served (the day the tenant gets the notice)'}><input type="date" className={inputCls} value={servedOn} onChange={(e) => setServedOn(e.target.value)} data-testid="tool-served" /></Field>
            <Field label={zh ? '送达方式' : 'Service method'}>
              <select className={inputCls} value={method} onChange={(e) => setMethod(e.target.value as ServiceMethod)}>
                {SERVICE_METHODS.map((m) => <option key={m.id} value={m.id}>{zh ? m.label.zh : m.label.en}</option>)}
              </select>
            </Field>
            {form === 'N1' && (
              <>
                <Field label={zh ? '现租金（每月）' : 'Current rent (monthly)'}><input type="number" inputMode="decimal" min={0} step="0.01" className={inputCls} value={n1.currentRent} onChange={(e) => setN1({ ...n1, currentRent: e.target.value })} /></Field>
                <Field label={zh ? '新租金（每月）' : 'New rent (monthly)'}><input type="number" inputMode="decimal" min={0} step="0.01" className={inputCls} value={n1.newRent} onChange={(e) => setN1({ ...n1, newRent: e.target.value })} /></Field>
                <Field label={zh ? '生效日（涨租日）' : 'Date the increase takes effect'}><input type="date" className={inputCls} value={n1.effectiveOn} onChange={(e) => setN1({ ...n1, effectiveOn: e.target.value })} /></Field>
                <Field label={zh ? '上次涨租日（没有就留空）' : 'Last increase (leave blank if none)'}><input type="date" className={inputCls} value={n1.lastIncreaseOn} onChange={(e) => setN1({ ...n1, lastIncreaseOn: e.target.value })} /></Field>
                <Field label={zh ? '起租日（没涨过租时用它算 12 个月）' : 'Lease start (used for the 12 months when there was no increase)'}><input type="date" className={inputCls} value={n1.leaseStart} onChange={(e) => setN1({ ...n1, leaseStart: e.target.value })} /></Field>
                <label className="flex items-start gap-2 text-[13px] sm:col-span-2">
                  <input type="checkbox" className="mt-0.5" checked={n1.exempt} onChange={(e) => setN1({ ...n1, exempt: e.target.checked })} />
                  <span>{zh ? '这个单位是 2018-11-15 之后第一次有人住进去的（不受指导比例限制，RTA s.6.1）' : 'This unit was first occupied after 2018-11-15 (not bound by the guideline, RTA s.6.1)'}</span>
                </label>
              </>
            )}
            {form === 'N4' && (
              <>
                <Field label={zh ? '月租' : 'Monthly rent'}><input type="number" inputMode="decimal" min={0} step="0.01" className={inputCls} value={n4.monthlyRent} onChange={(e) => setN4({ ...n4, monthlyRent: e.target.value })} /></Field>
                <Field label={zh ? '终止日（付清或搬离）' : 'Termination date (pay or move out by)'}><input type="date" className={inputCls} value={n4.terminationOn} onChange={(e) => setN4({ ...n4, terminationOn: e.target.value })} /></Field>
                <div className="sm:col-span-2">
                  <div className="mb-1 text-[12.5px] font-semibold text-body-2">{zh ? '欠款租期（到期日 + 欠多少）' : 'Unpaid periods (due date + amount owed)'}</div>
                  <div className="space-y-2">
                    {n4.periods.map((p, i) => (
                      <div key={i} className="flex flex-wrap items-center gap-2">
                        <input type="date" className="sl-input" value={p.due} onChange={(e) => setN4({ ...n4, periods: n4.periods.map((x, j) => (j === i ? { ...x, due: e.target.value } : x)) })} aria-label={zh ? '到期日' : 'Due date'} />
                        <span className="text-[13px]">$</span>
                        <input type="number" inputMode="decimal" min={0} step="0.01" className="sl-input !w-[140px]" value={p.amount} onChange={(e) => setN4({ ...n4, periods: n4.periods.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)) })} aria-label={zh ? '欠款金额' : 'Amount owed'} />
                        {n4.periods.length > 1 && <button type="button" className="text-[12.5px] text-body-3 underline-offset-2 hover:underline" onClick={() => setN4({ ...n4, periods: n4.periods.filter((_, j) => j !== i) })}>{zh ? '去掉' : 'Remove'}</button>}
                      </div>
                    ))}
                  </div>
                  {n4.periods.length < 6 && <button type="button" className="mt-2 text-[12.5px] font-semibold text-brand underline-offset-2 hover:underline" onClick={() => setN4({ ...n4, periods: [...n4.periods, { due: '', amount: '' }] })}>{zh ? '+ 再加一个租期' : '+ Add a period'}</button>}
                </div>
              </>
            )}
            {form === 'N12' && (
              <>
                <Field label={zh ? '终止日' : 'Termination date'}><input type="date" className={inputCls} value={n12.terminationOn} onChange={(e) => setN12({ ...n12, terminationOn: e.target.value })} /></Field>
                <Field label={zh ? '每月交租日（几号，用来检查终止日是不是租期末日）' : 'Rent due day (to check the termination date ends a rental period)'}><input type="number" inputMode="numeric" min={1} max={31} className={inputCls} value={n12.dueDay} onChange={(e) => setN12({ ...n12, dueDay: e.target.value })} /></Field>
                <Field label={zh ? '谁要入住' : 'Who will occupy'}>
                  <select className={inputCls} value={n12.who} onChange={(e) => setN12({ ...n12, who: e.target.value as N12Who })}>
                    {(Object.keys(N12_WHO_LABEL) as N12Who[]).map((k) => <option key={k} value={k}>{N12_WHO_LABEL[k][lang]}</option>)}
                  </select>
                </Field>
                <Field label={zh ? '补偿' : 'Compensation'}>
                  <select className={inputCls} value={n12.compensation} onChange={(e) => setN12({ ...n12, compensation: e.target.value as N12Compensation })}>
                    {(Object.keys(N12_COMPENSATION_LABEL) as N12Compensation[]).map((k) => <option key={k} value={k}>{N12_COMPENSATION_LABEL[k][lang]}</option>)}
                  </select>
                </Field>
              </>
            )}
          </div>
          {!ready && <p className="mt-4 text-[13px] text-body-3">{zh ? '把带日期的几格填完，结果会自动出来。' : 'Fill in the dated fields and the result appears.'}</p>}
          {res && <Result res={res} code={form} zh={zh} />}
        </div>
      )}
    </div>
  )
}

function RentTool({ zh }: { zh: boolean }) {
  const [area, setArea] = useState('')
  const [bedrooms, setBedrooms] = useState('1')
  const [type, setType] = useState<'apartment' | 'condo' | 'townhouse' | 'house'>('condo')
  const [asking, setAsking] = useState('')
  const [state, setState] = useState<{ loading: boolean; out: RentBenchmarkOut | null; error: string | null }>({ loading: false, out: null, error: null })

  const run = async () => {
    setState({ loading: true, out: null, error: null })
    try {
      const q = new URLSearchParams({ province: 'ON', bedrooms, type })
      if (area.trim()) q.set('area', area.trim())
      const r = await fetch(`/api/v1/rent-benchmark?${q.toString()}`)
      const j = await r.json().catch(() => null)
      if (!r.ok || !j || j.error) {
        setState({ loading: false, out: null, error: r.status === 429 ? (zh ? '查得太快了，稍等一下再试。' : 'Too many requests; try again in a moment.') : (zh ? '这个区域和户型暂时没有基准数据。' : 'No benchmark figure for this area and size yet.') })
        return
      }
      setState({ loading: false, out: j as RentBenchmarkOut, error: null })
    } catch {
      setState({ loading: false, out: null, error: zh ? '网络没通，再试一次。' : 'The request did not go through; try again.' })
    }
  }

  const ask = Number(asking)
  const out = state.out
  const delta = out && ask > 0 ? ((ask - out.benchmark.avg) / out.benchmark.avg) * 100 : null
  const deltaAsking = out?.asking && ask > 0 ? ((ask - out.asking.avg) / out.asking.avg) * 100 : null
  const pct = (d: number) => `${d > 0 ? '+' : ''}${d.toFixed(1)}%`

  return (
    <div className="rounded-2xl border border-line-divider bg-surface-chip/40 p-5">
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label={zh ? '区域（城市或社区，可留空）' : 'Area (city or neighbourhood, optional)'}><input className={inputCls} value={area} onChange={(e) => setArea(e.target.value)} placeholder={zh ? '例如 North York' : 'e.g. North York'} data-testid="rent-area" /></Field>
        <Field label={zh ? '卧室' : 'Bedrooms'}>
          <select className={inputCls} value={bedrooms} onChange={(e) => setBedrooms(e.target.value)}>
            {['0', '1', '2', '3'].map((b) => <option key={b} value={b}>{b === '0' ? (zh ? '开间' : 'Studio') : b === '3' ? (zh ? '3 卧及以上' : '3+') : b}</option>)}
          </select>
        </Field>
        <Field label={zh ? '类型' : 'Type'}>
          <select className={inputCls} value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            <option value="condo">{zh ? '公寓（condo）' : 'Condo'}</option>
            <option value="apartment">{zh ? '出租公寓楼' : 'Apartment (purpose-built)'}</option>
            <option value="townhouse">{zh ? '联排' : 'Townhouse'}</option>
            <option value="house">{zh ? '独立屋' : 'House'}</option>
          </select>
        </Field>
        <Field label={zh ? '你的要价（每月）' : 'Your asking rent (monthly)'}><input type="number" inputMode="decimal" min={0} className={inputCls} value={asking} onChange={(e) => setAsking(e.target.value)} data-testid="rent-asking" /></Field>
      </div>
      <button type="button" className="sl-btn-primary mt-4" onClick={() => void run()} disabled={state.loading} data-testid="rent-run">{state.loading ? (zh ? '查询中…' : 'Looking up…') : (zh ? '对一对' : 'Compare')}</button>
      {state.error && <p className="mt-3 text-[13.5px] text-body-2">{state.error}</p>}
      {out && (
        <div className="mt-5 rounded-2xl border border-line-divider bg-white p-5" data-testid="rent-result">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="text-[12.5px] text-body-3">{zh ? out.benchmark.label.zh : out.benchmark.label.en}</div>
              <div className="mt-1 text-[28px] font-semibold tracking-tight">${Math.round(out.benchmark.avg).toLocaleString()}<span className="text-[14px] font-normal text-body-3">{zh ? '/月' : '/mo'}</span></div>
              {delta != null && <div className="mt-1 text-[13.5px]">{zh ? `你的要价比它${delta >= 0 ? '高' : '低'} ${pct(Math.abs(delta)).replace('+', '')}` : `Your asking rent is ${pct(delta)} against it`}</div>}
            </div>
            {out.asking && (
              <div>
                <div className="text-[12.5px] text-body-3">{zh ? 'StatCan 挂牌均价 · 多伦多都会区' : 'StatCan asking average · Toronto CMA'} · {out.asking.period}</div>
                <div className="mt-1 text-[28px] font-semibold tracking-tight">${Math.round(out.asking.avg).toLocaleString()}<span className="text-[14px] font-normal text-body-3">{zh ? '/月' : '/mo'}</span></div>
                {deltaAsking != null && <div className="mt-1 text-[13.5px]">{zh ? `你的要价比它${deltaAsking >= 0 ? '高' : '低'} ${pct(Math.abs(deltaAsking)).replace('+', '')}` : `Your asking rent is ${pct(deltaAsking)} against it`}</div>}
              </div>
            )}
          </div>
          <p className="mt-4 text-[12.5px] leading-relaxed text-body-3">{zh ? out.attribution.zh : out.attribution.en}</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-body-3">{zh ? '基准是公开统计的平均数，不是定价建议；在租租客的涨幅仍受指导比例限制，市价只在换租时重置。' : 'The benchmark is a published statistical average, not a pricing recommendation; increases for a sitting tenant stay within the guideline, and the market rate resets only on turnover.'}</p>
        </div>
      )}
    </div>
  )
}

function AskTool({ zh }: { zh: boolean }) {
  const [status, setStatus] = useState<AskStatus | 'all'>('all')
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  const items = SCREENING_QUESTIONS.filter((i) => (status === 'all' || i.status === status) && (!needle || `${i.q.zh} ${i.q.en} ${i.why.zh} ${i.why.en}`.toLowerCase().includes(needle)))
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <input className="sl-input min-w-0 flex-1 sm:max-w-[320px]" value={q} onChange={(e) => setQ(e.target.value)} placeholder={zh ? '搜一个词，例如 宠物、收入、担保人' : 'Search, e.g. pets, income, guarantor'} aria-label={zh ? '搜索问题' : 'Search questions'} data-testid="ask-search" />
        {(['all', 'ok', 'ok_limited', 'no', 'avoid'] as const).map((s) => (
          <button key={s} type="button" onClick={() => setStatus(s)} aria-pressed={status === s} className={`rounded-full border px-3 py-1 text-[12.5px] font-semibold ${status === s ? 'border-brand bg-[#E9F5FD] text-brand' : 'border-line-divider bg-white text-body-2'}`}>
            {s === 'all' ? (zh ? '全部' : 'All') : (zh ? ASK_STATUS_LABEL[s].zh : ASK_STATUS_LABEL[s].en)}
          </button>
        ))}
      </div>
      {ASK_GROUPS.map((g) => {
        const rows = items.filter((i) => i.group === g.key)
        if (!rows.length) return null
        return (
          <div key={g.key} className="mt-6">
            <h3 className="text-[15px] font-bold">{zh ? g.label.zh : g.label.en}</h3>
            <div className="mt-2 divide-y divide-line-divider rounded-2xl border border-line-divider bg-white">
              {rows.map((i) => (
                <div key={i.key} className="px-5 py-4" data-testid={`ask-${i.key}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full px-2 py-[2px] text-[11px] font-bold" style={{ background: STATUS_STYLE[i.status].bg, color: STATUS_STYLE[i.status].fg }}>{zh ? ASK_STATUS_LABEL[i.status].zh : ASK_STATUS_LABEL[i.status].en}</span>
                    <span className="text-[15px] font-semibold">{zh ? i.q.zh : i.q.en}</span>
                  </div>
                  <p className="mt-1.5 text-[14px] leading-relaxed text-body-2">{zh ? i.why.zh : i.why.en}</p>
                  <p className="mt-1 text-[12px] text-body-3">
                    {i.cite}
                    {i.rule && <> · <Link href={`/rules#${i.rule}`} className="font-mono text-[11.5px] text-brand underline-offset-2 hover:underline">{i.rule}</Link></>}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )
      })}
      {!items.length && <p className="mt-4 text-[13.5px] text-body-3">{zh ? '没有匹配的问题。' : 'Nothing matches.'}</p>}
    </div>
  )
}

export default function ToolsPage() {
  const { lang } = useT()
  const zh = lang === 'zh'
  const nav = [
    { id: 'notices', zh: '通知日期算一下', en: 'Notice dates' },
    { id: 'rent', zh: '要价对一对', en: 'Asking rent check' },
    { id: 'ask', zh: '这个能问吗', en: 'May I ask this?' },
  ]
  return (
    <div style={{ background: '#FFFFFF' }} className="text-body">
      <Header variant="transparent" />
      <section style={{ background: 'linear-gradient(180deg,#E9F5FD 0%,#FFFFFF 100%)' }}>
        <div className="mx-auto max-w-[1100px] px-5 py-16 sm:px-7 lg:py-20">
          <div className="font-mono text-[13px] font-semibold uppercase tracking-[.12em] text-brand">{zh ? 'TOOLS · 租房小工具' : 'TOOLS · Free rental tools'}</div>
          <h1 className="sl-type-head mt-4 max-w-[820px] text-[clamp(28px,3.4vw,42px)] font-semibold leading-[1.1] tracking-[-0.03em]">
            {zh ? '先算一算，再动笔。' : 'Check the numbers before you write anything.'}
          </h1>
          <p className="mt-5 max-w-[680px] text-[17px] leading-[1.6] text-body-2">
            {zh
              ? '三个不用登录的小工具：通知日期按现行规则算对，要价和公开基准对一对，筛查问题能不能问一查就知道。全是确定性计算，不经过模型，不保存你填的内容。'
              : 'Three tools, no sign-in: notice dates under the current rules, your asking rent against the public benchmark, and which screening questions you may ask. Deterministic arithmetic, no model, nothing you type is stored.'}
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {nav.map((n) => <a key={n.id} href={`#${n.id}`} className="rounded-full border border-line-divider bg-white px-4 py-1.5 text-[13.5px] font-semibold hover:border-brand hover:text-brand">{zh ? n.zh : n.en}</a>)}
            <Link href="/rules" className="rounded-full border border-line-divider bg-white px-4 py-1.5 text-[13.5px] font-semibold hover:border-brand hover:text-brand">{zh ? '规则与更新记录 →' : 'Rules and change log →'}</Link>
          </div>
        </div>
      </section>
      <section>
        <div className="mx-auto max-w-[1100px] px-5 py-12 sm:px-7 lg:py-16">
          <div id="notices" className="scroll-mt-24">
            <h2 className="text-[22px] font-semibold tracking-tight">{zh ? '通知日期算一下' : 'Notice dates'}</h2>
            <p className="mt-2 max-w-[760px] text-[14.5px] leading-relaxed text-body-2">{zh ? '涨租（N1）、欠租（N4）、房东自用（N12）三张表的日期算术：按送达方式算视为送达日，再按现行规则算最早可填的日子。规则按生效日期版本化，和房东工作台里的 N 表工具箱是同一套代码。' : 'Date arithmetic for rent increase (N1), non-payment (N4) and landlord’s own use (N12): the deemed service date by method, then the earliest date allowed under the current rules. The rules are versioned by in-force date and shared with the landlord workspace toolbox.'}</p>
            <div className="mt-5"><NoticeTool zh={zh} lang={lang} /></div>
          </div>
          <div id="rent" className="mt-16 scroll-mt-24">
            <h2 className="text-[22px] font-semibold tracking-tight">{zh ? '要价对一对' : 'Asking rent check'}</h2>
            <p className="mt-2 max-w-[760px] text-[14.5px] leading-relaxed text-body-2">{zh ? '把你的要价和 CMHC 调查均租、统计局挂牌均价放在一起看。数据来自公开统计，来源句一并显示。' : 'Your asking rent next to the CMHC survey average and the Statistics Canada asking average. Public statistics, with the attribution shown.'}</p>
            <div className="mt-5"><RentTool zh={zh} /></div>
          </div>
          <div id="ask" className="mt-16 scroll-mt-24">
            <h2 className="text-[22px] font-semibold tracking-tight">{zh ? '这个能问吗' : 'May I ask this?'}</h2>
            <p className="mt-2 max-w-[760px] text-[14.5px] leading-relaxed text-body-2">{zh ? '筛查申请人时常见的问题，按安省规定分成「可以问」「有限制」「不能问」「不需要」四类，每条带依据。' : 'Common screening questions sorted under Ontario’s rules into may ask, with limits, do not ask and not needed, each with its source.'} <Link href="/consumer-rights#method" className="font-semibold text-brand underline-offset-2 hover:underline">{zh ? '筛查报告怎么评 →' : 'How the screening report scores →'}</Link></p>
            <div className="mt-5"><AskTool zh={zh} /></div>
          </div>
          <p className="mt-14 max-w-[760px] text-[13px] leading-relaxed text-body-3">
            {zh ? '这不是法律意见。条文以安省官方文本为准（ontario.ca/laws）；遇到具体争议请找持牌 Paralegal 或律师。登录后，房东工作台会用你的租约数据自动算这些日期。' : 'This is not legal advice. The statutes as published by Ontario (ontario.ca/laws) govern; for a specific dispute, consult a licensed paralegal or lawyer. Signed in, the landlord workspace runs these dates from your own lease data.'}
          </p>
        </div>
      </section>
      <Footer />
    </div>
  )
}
