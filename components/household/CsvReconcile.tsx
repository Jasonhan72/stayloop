'use client'

// Reconcile the rent ledger against a bank-statement CSV — V1.0 stage 3 甲 #4 (G10).
//
// The CSV is read with FileReader and parsed in the browser (lib/household/
// csvReconcile, pure). Nothing is uploaded or stored: the only writes are the
// `mark_rent_paid` RPC calls for the periods the landlord ticks, one per
// period, each reported on its own line. No native dialogs anywhere — the
// confirmation is the checkbox list itself.
import { useCallback, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  BANK_FORMAT_LABEL, markPaidErrorText, matchReasonText, parseBankCsv, proposeMatches, reconcileRecords, warningText,
  type BankRow, type ParsedBankCsv, type PeriodMatch, type ReconcileResult,
} from '@/lib/household/csvReconcile'

type PeriodIn = { due: string; state: string; upcoming?: boolean; record?: { status?: string | null; amount?: number | string | null } | null }
type RowResult = { due: string; ok: boolean; message?: string }

export default function CsvReconcile({ leaseId, householdId, periods, monthlyRent, tenantName, zh, onDone }: {
  leaseId: string
  householdId: string
  /** The ledger's periods (rentLedger().periods). */
  periods: PeriodIn[]
  monthlyRent: number
  tenantName?: string | null
  zh: boolean
  /** Called once after the ticked periods have been written (whatever the per-row outcome). */
  onDone: () => void
}) {
  const [open, setOpen] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [parsed, setParsed] = useState<ParsedBankCsv | null>(null)
  const [readError, setReadError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<RowResult[] | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const result: ReconcileResult | null = useMemo(() => {
    if (!parsed) return null
    return proposeMatches(parsed.rows, periods, { monthlyRent, tenantName })
  }, [parsed, periods, monthlyRent, tenantName])

  const onFile = useCallback((file: File | null) => {
    setResults(null)
    setReadError(null)
    if (!file) return
    setFileName(file.name)
    const reader = new FileReader()
    reader.onerror = () => setReadError(zh ? '读不了这个文件。' : 'Could not read the file.')
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : ''
      const p = parseBankCsv(text)
      setParsed(p)
      const r = proposeMatches(p.rows, periods, { monthlyRent, tenantName })
      // Default ticks: exact matches only. 'likely' is for the landlord to confirm.
      setSelected(new Set(r.matches.filter((m) => m.confidence === 'exact').map((m) => m.due)))
    }
    reader.readAsText(file)
  }, [periods, monthlyRent, tenantName, zh])

  const toggle = (due: string) => setSelected((prev) => { const n = new Set(prev); if (n.has(due)) n.delete(due); else n.add(due); return n })

  const writes = result ? reconcileRecords(result.matches, selected) : []

  const run = async () => {
    if (!writes.length || busy) return
    setBusy(true)
    const out: RowResult[] = []
    for (const w of writes) {
      const { error } = await supabase.rpc('mark_rent_paid', { p_lease: leaseId, p_due: w.due, p_paid_on: w.paid_on })
      out.push(error ? { due: w.due, ok: false, message: markPaidErrorText(error.message, zh) } : { due: w.due, ok: true })
      setResults([...out])
    }
    setBusy(false)
    setSelected(new Set())
    onDone()
  }

  const reset = () => {
    setParsed(null); setFileName(null); setResults(null); setSelected(new Set()); setReadError(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  const fmt = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const matchable = result ? result.matches.filter((m) => m.confidence !== 'none') : []

  return (
    <div className="mt-4 rounded-xl border border-line-divider bg-surface-chip p-4" data-testid="csv-reconcile" data-household={householdId}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 text-left">
        <span className="text-[13px] font-extrabold">{zh ? '用银行流水对账（CSV，不上传）' : 'Reconcile with a bank statement (CSV, not uploaded)'}</span>
        <span className="text-[12px] text-body-3">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="mt-3 text-[12.5px]">
          <p className="text-body-3">
            {zh
              ? '从网银导出 CSV（RBC、TD、Scotiabank、CIBC、BMO、Tangerine / Simplii 的格式都认得），把入账和未记录的账期配对。CSV 只在你的浏览器里解析，不会上传或保存；记录仍然是逐期「标记已付」，付款日取入账日期。'
              : 'Export a CSV from online banking (RBC, TD, Scotiabank, CIBC, BMO and Tangerine / Simplii formats are recognised) and match deposits to unrecorded periods. The CSV is parsed in your browser only and is never uploaded or saved; each period is still recorded with “mark paid”, dated by the deposit.'}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="rounded-full border border-line-divider bg-white px-3.5 py-1.5 text-[12px] font-bold hover:border-[#00ACE4] cursor-pointer">
              {zh ? '选择 CSV 文件' : 'Choose a CSV file'}
              <input ref={inputRef} type="file" accept=".csv,text/csv,text/plain" className="sr-only" aria-label={zh ? '银行流水 CSV' : 'Bank statement CSV'}
                onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
            </label>
            {fileName && <span className="text-body-2">{fileName}</span>}
            {parsed && <button type="button" onClick={reset} className="text-[12px] text-body-3 underline">{zh ? '换一个文件' : 'Another file'}</button>}
          </div>
          {readError && <p className="mt-2 text-[12px] text-danger">{readError}</p>}

          {parsed && result && (
            <div className="mt-3" data-testid="csv-reconcile-result">
              <p className="text-body-2">
                {parsed.format === 'unknown'
                  ? (zh ? '没认出这个文件的格式。' : 'The file format was not recognised.')
                  : zh
                    ? `识别为 ${BANK_FORMAT_LABEL[parsed.format]} 格式 · 读到 ${parsed.total} 条记录，其中入账 ${parsed.rows.length} 笔 · 未记录的账期 ${result.eligible} 期，配上 ${matchable.length} 期。`
                    : `Read as ${BANK_FORMAT_LABEL[parsed.format]} · ${parsed.total} records, ${parsed.rows.length} deposits · ${result.eligible} unrecorded period(s), ${matchable.length} matched.`}
              </p>
              {parsed.warnings.length > 0 && (
                <ul className="mt-1.5 space-y-0.5 text-[11.5px] text-amber-800">
                  {parsed.warnings.map((w) => <li key={w}>· {warningText(w, zh)}</li>)}
                </ul>
              )}

              {result.matches.length > 0 && (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-[12px]">
                    <thead className="text-[11px] uppercase tracking-wide text-body-3">
                      <tr>
                        <th className="py-1 pr-2"></th>
                        <th className="py-1 pr-3">{zh ? '到期日' : 'Due'}</th>
                        <th className="py-1 pr-3">{zh ? '月租' : 'Rent'}</th>
                        <th className="py-1 pr-3">{zh ? '匹配到的入账' : 'Matched deposit'}</th>
                        <th className="py-1 pr-3">{zh ? '置信度' : 'Confidence'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.matches.map((m) => <MatchRow key={m.due} m={m} zh={zh} rent={fmt(monthlyRent)} checked={selected.has(m.due)} disabled={busy || !!results} onToggle={() => toggle(m.due)} result={results?.find((r) => r.due === m.due)} />)}
                    </tbody>
                  </table>
                </div>
              )}

              {!results && matchable.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button type="button" disabled={busy || !writes.length} onClick={() => void run()} className="rounded-full bg-[#00ACE4] px-4 py-2 text-[12.5px] font-bold text-white disabled:opacity-50" data-testid="csv-reconcile-run">
                    {busy
                      ? (zh ? '记录中…' : 'Recording…')
                      : zh ? `把勾选的 ${writes.length} 期记为已付` : `Mark the ${writes.length} ticked period(s) paid`}
                  </button>
                  <span className="text-[11.5px] text-body-3">{zh ? '付款日按入账日期记录；逾期与否由付款日决定。' : 'Dated by the deposit; late or not follows the payment date.'}</span>
                </div>
              )}
              {results && !busy && (
                <p className="mt-3 text-[12.5px]" data-testid="csv-reconcile-summary">
                  <span className="font-semibold text-success">✓ </span>
                  {zh
                    ? `已记录 ${results.filter((r) => r.ok).length} 期${results.some((r) => !r.ok) ? `，${results.filter((r) => !r.ok).length} 期没有记录成功（见上方）` : ''}。`
                    : `${results.filter((r) => r.ok).length} period(s) recorded${results.some((r) => !r.ok) ? `, ${results.filter((r) => !r.ok).length} not recorded (see above)` : ''}.`}
                </p>
              )}

              {result.unmatched.length > 0 && (
                <div className="mt-4" data-testid="csv-reconcile-unmatched">
                  <div className="text-[12px] font-bold">{zh ? '这些入账没有对应账期' : 'These deposits have no matching period'}</div>
                  <p className="mt-0.5 text-[11.5px] text-body-3">
                    {zh ? '金额像租金，但没有一期能配上——可能是已经记录过的期、预付、或别的款项。要记录请在上方账期表里手动「标记已付」。' : 'Rent-sized, but no period fits — perhaps an already-recorded period, a prepayment, or something else. To record one, use “mark paid” on the period above.'}
                  </p>
                  <ul className="mt-1.5 space-y-0.5 font-mono text-[11.5px] text-body-2">
                    {result.unmatched.map((r, k) => <li key={k}>{r.date} · {fmt(r.amount)} · {r.description || '—'}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function MatchRow({ m, zh, rent, checked, disabled, onToggle, result }: {
  m: PeriodMatch; zh: boolean; rent: string; checked: boolean; disabled: boolean; onToggle: () => void; result?: RowResult
}) {
  const tx: BankRow | undefined = m.tx
  const conf = m.confidence === 'exact' ? (zh ? '确定' : 'exact') : m.confidence === 'likely' ? (zh ? '可能' : 'likely') : (zh ? '无' : 'none')
  const confClass = m.confidence === 'exact' ? 'text-success' : m.confidence === 'likely' ? 'text-amber-700' : 'text-body-3'
  return (
    <tr className="border-t border-line-divider align-top" data-due={m.due} data-confidence={m.confidence}>
      <td className="py-2 pr-2">
        {tx && <input type="checkbox" checked={checked} disabled={disabled} onChange={onToggle} aria-label={`${zh ? '记录' : 'Record'} ${m.due}`} />}
      </td>
      <td className="py-2 pr-3 font-mono">{m.due}</td>
      <td className="py-2 pr-3 font-mono">{rent}</td>
      <td className="py-2 pr-3">
        {tx ? (
          <div>
            <div className="font-mono">{tx.date} · ${tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            <div className="text-body-2">{tx.description || '—'}</div>
          </div>
        ) : <span className="text-body-3">—</span>}
        <div className="mt-0.5 text-[11px] text-body-3">{matchReasonText(m, zh)}</div>
        {result && (
          <div className={`mt-0.5 text-[11.5px] ${result.ok ? 'text-success' : 'text-danger'}`}>
            {result.ok ? (zh ? '✓ 已记录' : '✓ recorded') : `✗ ${result.message}`}
          </div>
        )}
      </td>
      <td className={`py-2 pr-3 font-semibold ${confClass}`}>{conf}</td>
    </tr>
  )
}
