'use client'

// The landlord's three steps on a managed tenancy — lease here → record the rent → export the record
// (V0.9, 2026-11-22; lib/household/alreadyRenting.ts). Sits above the hub's tabs for the landlord side.
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { openHtmlFromPost } from '@/lib/export/openHtml'
import { alreadyRentingSteps, matterForHousehold } from '@/lib/household/alreadyRenting'

export default function AlreadyRenting({ householdId, zh, imported, recorded, canReconcile, onGoRent }: {
  householdId: string
  zh: boolean
  imported: boolean
  /** rent periods with a record on the current lease */
  recorded: number
  canReconcile: boolean
  /** open the rent tab at the reconcile box */
  onGoRent: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const steps = alreadyRentingSteps({ imported, recorded, canReconcile }, zh)

  async function exportRecord() {
    setBusy(true); setErr(null)
    try {
      // my_matters() also makes sure the tenancy has its matter (ensure_matter) before we ask for its pack.
      const { data, error } = await supabase.rpc('my_matters')
      const matterId = error ? null : matterForHousehold(data, householdId)
      if (!matterId) { setErr(zh ? '暂时找不到这份租约的记录，请刷新后再试。' : 'This tenancy’s record could not be found just now — refresh and try again.'); return }
      const r = await openHtmlFromPost('/api/matters/export', { matter_id: matterId, lang: zh ? 'zh' : 'en', acting_role: 'landlord', kind: 'arrears' })
      if (!r.ok) setErr(r.error === 'not_a_party' ? (zh ? '你不是这件事的当事人。' : 'You are not a party to this matter.') : (zh ? `导出没有成功（${r.error || '未知错误'}），请稍后再试。` : `The export did not go through (${r.error || 'unknown error'}) — try again shortly.`))
    } finally { setBusy(false) }
  }

  return (
    <div className="mt-5 rounded-xl border border-landlord/25 bg-landlord/[0.04] p-4 sm:p-5" data-testid="already-renting">
      <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrow text-landlord">{zh ? '已经在租 · 三步把账记起来' : 'ALREADY RENTING · THREE STEPS TO A KEPT LEDGER'}</div>
      <ol className="mt-3 grid gap-3 lg:grid-cols-3">
        {steps.map((s) => (
          <li key={s.key} data-testid={`renting-step-${s.key}`} data-done={s.done ? '1' : '0'} className="flex min-w-0 gap-3 rounded-lg bg-white p-3">
            <span className={'mt-[1px] flex h-6 w-6 flex-none items-center justify-center rounded-full font-mono text-[11px] font-bold ' + (s.done ? 'bg-success/15 text-success' : 'bg-surface-chip text-body-3')} aria-hidden>
              {s.done ? '✓' : s.n}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-bold">{s.title}</div>
              <p className="mt-0.5 text-[12px] leading-relaxed text-body-2">{s.body}</p>
              {s.key === 'reconcile' && canReconcile && (
                <button type="button" onClick={onGoRent} data-testid="renting-go-rent" className="mt-2 text-[12.5px] font-semibold text-brand underline underline-offset-2">
                  {zh ? (recorded > 0 ? '去租金记录 →' : '去对账 →') : (recorded > 0 ? 'Open the rent record →' : 'Reconcile now →')}
                </button>
              )}
              {s.key === 'export' && (
                <button type="button" onClick={() => void exportRecord()} disabled={busy} data-testid="renting-export" className="mt-2 rounded-full border border-line-strong bg-white px-3 py-[5px] text-[12.5px] font-semibold text-body transition hover:border-brand hover:text-brand disabled:opacity-50">
                  {busy ? '…' : zh ? '导出记录' : 'Export the record'}
                </button>
              )}
            </div>
          </li>
        ))}
      </ol>
      {err && <p className="mt-2 text-[12px] text-danger" role="alert" data-testid="renting-export-error">{err}</p>}
    </div>
  )
}
