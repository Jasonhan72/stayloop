'use client'

// One rent period on the household hub's rent tab (V1.0 阶段 3 · 甲 #4 · G9,
// 2026-10-16) — shared by the current lease and the replaced term's list.
// A recorded period shows who recorded it and whether the OTHER side confirmed
// (confirm_rent_payment — the page owns the RPC call; the recorder never sees a
// confirm button), and carries a receipt: attached through /api/rent/evidence
// (server-side SHA-256, private bucket, appended once), viewed through a short
// signed URL. An unrecorded period keeps the page's own payment-date field and
// may be recorded and receipted in one go. Nothing here deletes anything.
import { useRef, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { notifyFactsChanged } from '@/lib/facts/useFacts'
import { acceptEvidenceFile, evidenceErrorText, periodEvidenceState, shortSha, type EvidenceRow } from '@/lib/household/rentEvidence'
import { torontoDate, type PeriodState } from '@/lib/household/ledger'

export type RentPeriodRecord = EvidenceRow & { id?: string; paid_at?: string | null; amount?: number | string | null; evidence_mime?: string | null }

type Props = {
  due: string
  amount: number
  state: PeriodState
  upcoming: boolean
  onSchedule: boolean
  record: RentPeriodRecord | null
  leaseId: string
  myUid: string | null
  /** A member's display: "我" for the signed-in user, otherwise a name or the role word. */
  whoLabel: (uid: string | null | undefined) => string
  zh: boolean
  busy: boolean
  /** The page's own payment-date field (date input + late hint) for an unrecorded period. */
  paidOnField?: ReactNode
  paidOnValue: string
  paidOnOk: boolean
  onMarkPaid: () => void
  onConfirm: () => Promise<void>
  /** Reload after a receipt was attached. */
  onChanged: () => Promise<void> | void
  /** Visual variant: the replaced term's list sits on an amber card. */
  previous?: boolean
}

const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,application/pdf,.jpg,.jpeg,.png,.webp,.heic,.pdf'

function isImage(rec: RentPeriodRecord | null): boolean {
  const mime = rec?.evidence_mime || ''
  if (mime) return mime.startsWith('image/')
  return /\.(jpe?g|png|webp|heic)$/i.test(rec?.evidence_path || '')
}

export default function RentPeriodRow(p: Props) {
  const { due, amount, state, upcoming, onSchedule, record, zh } = p
  const ev = periodEvidenceState(record, p.myUid)
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [noteDraft, setNoteDraft] = useState('')

  async function attach(file: File) {
    setErr(null)
    const ok = acceptEvidenceFile({ name: file.name, type: file.type, size: file.size })
    if (!ok.ok) { setErr(evidenceErrorText(ok.reason, zh)); return }
    setUploading(true)
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token) { setErr(evidenceErrorText('sign_in_required', zh)); return }
      const fd = new FormData()
      fd.set('lease_id', p.leaseId)
      fd.set('due_date', due)
      fd.set('file', file, file.name)
      if (!ev.recorded) fd.set('paid_on', p.paidOnValue)
      if (noteDraft.trim()) fd.set('note', noteDraft.trim().slice(0, 200))
      const res = await fetch('/api/rent/evidence', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd })
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) { setErr(evidenceErrorText(j.error || `HTTP ${res.status}`, zh)); return }
      setNoteDraft('')
      notifyFactsChanged()
      await p.onChanged()
    } catch (e) {
      setErr(evidenceErrorText((e as Error).message, zh))
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function confirm() {
    setErr(null)
    setConfirming(true)
    try { await p.onConfirm() } finally { setConfirming(false) }
  }

  // Signed for 10 minutes: an image opens inline under the row, a PDF in a new tab.
  // The tab is opened on the click, before the await, so the popup rule is satisfied.
  async function view() {
    if (!record?.evidence_path) return
    setErr(null)
    if (preview) { setPreview(null); return }
    const image = isImage(record)
    const win = image ? null : window.open('about:blank', '_blank')
    const { data, error } = await supabase.storage.from('tenancy-files').createSignedUrl(record.evidence_path, 600)
    if (error || !data?.signedUrl) { win?.close(); setErr(zh ? '暂时打不开这份回执，稍后再试。' : 'Could not open the receipt right now — try again.'); return }
    if (image) setPreview(data.signedUrl)
    else if (win) win.location.href = data.signedUrl
    else window.open(data.signedUrl, '_blank', 'noopener')
  }

  const recorded = state === 'paid' || state === 'late'
  const attachLabel = uploading ? (zh ? '上传中…' : 'Uploading…') : recorded ? (zh ? '附回执' : 'Attach receipt') : (zh ? '标记已付并附回执' : 'Mark paid + receipt')
  const bigBtn = 'rounded-md border border-line-divider px-3 py-1 text-[11px] font-bold hover:border-[#00ACE4] disabled:opacity-50'

  return (
    <div className={'rounded-lg border border-line-divider/60 px-4 py-2.5 text-[13px]' + (p.previous ? ' bg-white' : '')} data-state={state} data-testid="rent-period-row">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono font-semibold">{due}</span>
        {amount > 0 && <span className="text-body-3">${amount.toLocaleString()}</span>}
        {!onSchedule && state === 'due' && (
          <span className="text-[11px] text-body-3" data-testid="rent-off-schedule">{zh ? '不在每月账期上 · 不计入欠款合计' : 'Not on the monthly schedule · not counted in arrears'}</span>
        )}
        <span className="ml-auto flex flex-wrap items-center justify-end gap-2">
          {recorded ? (
            <span className="rounded-md px-2 py-0.5 font-mono text-[10px] font-bold"
              style={state === 'paid' ? { color: '#047857', background: '#04785714' } : { color: '#DC2626', background: '#DC262614' }}>
              {state === 'paid' ? (zh ? '✓ 已付' : '✓ PAID') : (zh ? '已付 · 迟付' : 'PAID LATE')}
            </span>
          ) : state === 'upcoming' ? (
            <span className="font-mono text-[10px] font-bold text-body-3">{zh ? '未到期' : 'UPCOMING'}</span>
          ) : (
            <>
              <span className="font-mono text-[10px] font-bold text-amber-700">{upcoming ? (zh ? '待付 · 未到期' : 'DUE · UPCOMING') : (zh ? '待付' : 'DUE')}</span>
              {p.paidOnField}
              <button onClick={p.onMarkPaid} disabled={p.busy || !p.paidOnOk} className={bigBtn}>
                {zh ? '标记已付' : 'Mark paid'}
              </button>
            </>
          )}
          {state !== 'upcoming' && (
            <button type="button" onClick={() => fileRef.current?.click()} disabled={p.busy || uploading || (!recorded && !p.paidOnOk) || ev.hasEvidence}
              className={bigBtn} data-testid="rent-attach-evidence" title={ev.hasEvidence ? (zh ? '这一期已有回执' : 'This period already has a receipt') : undefined}>
              {attachLabel}
            </button>
          )}
          <input ref={fileRef} type="file" accept={ACCEPT} className="hidden" aria-label={zh ? `${due} 这一期的回执文件` : `Receipt file for the ${due} period`}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void attach(f) }} />
        </span>
      </div>

      {recorded && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-body-3" data-testid="rent-period-marks">
          <span>
            {zh ? `${p.whoLabel(ev.recordedBy)} 记录` : `Recorded by ${p.whoLabel(ev.recordedBy)}`}
            {record?.paid_at ? (zh ? ` · 付于 ${torontoDate(record.paid_at)}` : ` · paid ${torontoDate(record.paid_at)}`) : ''}
          </span>
          <span aria-hidden>·</span>
          {ev.confirmed ? (
            <span className="font-semibold text-[#047857]" data-testid="rent-confirmed">
              {ev.confirmedByMe
                ? (zh ? '我已确认' : 'Confirmed by me')
                : (zh ? `${p.whoLabel(record?.confirmed_by)} 已确认` : `Confirmed by ${p.whoLabel(record?.confirmed_by)}`)}
              {record?.confirmed_at ? ` · ${torontoDate(record.confirmed_at)}` : ''}
            </span>
          ) : ev.canConfirm ? (
            <button type="button" onClick={() => void confirm()} disabled={p.busy || confirming}
              className="rounded-md border border-[#047857]/40 px-2.5 py-0.5 text-[11px] font-bold text-[#047857] hover:bg-[#04785714] disabled:opacity-50" data-testid="rent-confirm">
              {confirming ? (zh ? '确认中…' : 'Confirming…') : (zh ? '确认这一期已收到 / 已付' : 'Confirm this period')}
            </button>
          ) : (
            <span data-testid="rent-awaiting">{zh ? '等对方确认' : 'Awaiting the other side'}</span>
          )}
          {ev.hasEvidence ? (
            <>
              <span aria-hidden>·</span>
              <span className="inline-flex flex-wrap items-center gap-1.5" data-testid="rent-evidence">
                <span className="font-semibold text-ink">{zh ? '回执' : 'Receipt'}</span>
                <span className="max-w-[220px] truncate" title={record?.evidence_name ?? undefined}>{record?.evidence_name || (zh ? '文件' : 'file')}</span>
                <button type="button" onClick={() => void view()} className="font-semibold text-brand-strong hover:underline">
                  {preview ? (zh ? '收起' : 'Hide') : (zh ? '查看' : 'View')}
                </button>
                {record?.evidence_sha256 && <span className="font-mono text-[10px]" title={record.evidence_sha256}>sha256 {shortSha(record.evidence_sha256)}</span>}
                {record?.evidence_at && <span>{torontoDate(record.evidence_at)}</span>}
              </span>
            </>
          ) : null}
          {record?.note && <span className="basis-full text-body-2" data-testid="rent-note">{zh ? '备注：' : 'Note: '}{record.note}</span>}
        </div>
      )}
      {!ev.hasEvidence && state !== 'upcoming' && (
        <div className="mt-1.5">
          <input value={noteDraft} onChange={(e) => setNoteDraft(e.target.value.slice(0, 200))} maxLength={200}
            placeholder={zh ? '附回执时带一句备注（可选）：比如 e-Transfer 参考号' : 'A note with the receipt (optional): e.g. the e-Transfer reference'}
            aria-label={zh ? `${due} 这一期的回执备注` : `Receipt note for the ${due} period`}
            className="w-full max-w-[420px] rounded-md border border-line-divider bg-white px-2 py-1 text-[11.5px] text-ink" />
        </div>
      )}
      {preview && (
        <div className="mt-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt={zh ? `${due} 这一期的回执` : `Receipt for ${due}`} className="max-h-[320px] max-w-full rounded-md border border-line-divider" />
        </div>
      )}
      {err && <p className="mt-1.5 text-[11.5px] text-danger" role="alert">{err}</p>}
    </div>
  )
}
