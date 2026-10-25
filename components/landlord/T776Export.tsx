'use client'
// The finance page's tax block (2026-10-27): open the year's T776 layout
// (printable) or download it as CSV. Deterministic export from the landlord's
// own records — lib/landlord/t776 and /api/finance/t776.
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { openHtmlFromPost } from '@/lib/export/openHtml'

export default function T776Export({ zh }: { zh: boolean }) {
  const thisYear = new Date().getFullYear()
  const [year, setYear] = useState(thisYear)
  const [busy, setBusy] = useState<'html' | 'csv' | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const years = [thisYear, thisYear - 1, thisYear - 2]
  const openHtml = async () => {
    setBusy('html'); setErr(null)
    const r = await openHtmlFromPost('/api/finance/t776', { year, lang: zh ? 'zh' : 'en', format: 'html' })
    if (!r.ok) setErr(r.error || (zh ? '没打开，再试一次。' : 'Could not open; try again.'))
    setBusy(null)
  }
  const downloadCsv = async () => {
    setBusy('csv'); setErr(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('sign_in_required')
      const r = await fetch('/api/finance/t776', { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ year, lang: zh ? 'zh' : 'en', format: 'csv' }) })
      if (!r.ok) throw new Error(String(r.status))
      const blob = await r.blob()
      const href = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = href; a.download = `stayloop-t776-${year}.csv`; a.rel = 'noopener'
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(href), 10_000)
    } catch (e) {
      setErr(zh ? `没下载成功（${(e as Error).message}）。` : `Download failed (${(e as Error).message}).`)
    } finally { setBusy(null) }
  }
  return (
    <div data-testid="t776-export">
      <div className="mt-3 flex items-center gap-2">
        <label className="text-[12px] text-body-2">{zh ? '年度' : 'Year'}</label>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="rounded-lg border border-line-divider bg-white px-2 py-1 text-[12.5px]" data-testid="t776-year">
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => void openHtml()} disabled={busy !== null} className="rounded-[8px] border border-line-strong bg-white py-[8px] text-center text-[12.5px] font-semibold transition hover:border-brand hover:text-brand disabled:opacity-50" data-testid="t776-open">{busy === 'html' ? '…' : (zh ? '打开 T776 对照表' : 'Open T776 layout')}</button>
        <button type="button" onClick={() => void downloadCsv()} disabled={busy !== null} className="rounded-[8px] border border-line-strong bg-white py-[8px] text-center text-[12.5px] font-semibold transition hover:border-brand hover:text-brand disabled:opacity-50" data-testid="t776-csv">{busy === 'csv' ? '…' : (zh ? '下载 CSV' : 'Download CSV')}</button>
      </div>
      {err && <p className="mt-2 text-[12px] text-danger">{err}</p>}
      <p className="mt-2 text-[11.5px] leading-relaxed text-body-3">{zh ? '只列记收的租金（8141）和完工工单的金额（8960）；保险、地税、利息等行留空，按你自己的凭证填。不是税务建议。' : 'Only rent recorded as received (8141) and completed work-order amounts (8960); insurance, taxes, interest and the rest stay empty for your own papers. Not tax advice.'}</p>
    </div>
  )
}
