'use client'

// The landlord's or tenant's review of a provider after acceptance (services
// marketplace §3; table provider_reviews since 2026-09-23). The table, its
// policies (one per user per work order, within 14 days of acceptance, only
// on accepted / paid / closed orders) and the provider's "收到的评价" list
// existed; what was missing was any place to write one (four-role audit
// 2026-10-12, A⑦). This card sits under the work-order card for the two
// parties; the server policy is the authority — the form only offers it.
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'

import { REVIEW_WINDOW_DAYS, reviewWindowOpen } from '@/lib/marketplace/reviews'

export type ReviewRow = { id: string; overall: number; on_time: number | null; communication: number | null; quality: number | null; comment: string | null; created_at: string }

const ASPECTS = [
  { key: 'on_time', zh: '准时', en: 'On time' },
  { key: 'communication', zh: '沟通', en: 'Communication' },
  { key: 'quality', zh: '质量', en: 'Quality' },
] as const
type AspectKey = (typeof ASPECTS)[number]['key']

function Stars({ value, onChange, label, disabled }: { value: number; onChange?: (v: number) => void; label: string; disabled?: boolean }) {
  return (
    <span className="inline-flex items-center gap-0.5" role={onChange ? 'radiogroup' : undefined} aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        onChange
          ? <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${label} ${n}`} disabled={disabled} onClick={() => onChange(n)} className={'h-7 w-7 text-[18px] leading-none ' + (n <= value ? 'text-amber-500' : 'text-line-strong')}>★</button>
          : <span key={n} className={'text-[14px] leading-none ' + (n <= value ? 'text-amber-500' : 'text-line-strong')}>★</span>
      ))}
    </span>
  )
}

export default function ReviewForm({ workOrderId, providerId, acceptedAt, viewer, zh, providerName }: {
  workOrderId: string
  providerId: string | null
  acceptedAt: string | null
  viewer: 'landlord' | 'tenant'
  zh: boolean
  providerName?: string | null
}) {
  const { user } = useAuth()
  const [mine, setMine] = useState<ReviewRow | null | undefined>(undefined)
  const [open, setOpen] = useState(false)
  const [overall, setOverall] = useState(0)
  const [aspects, setAspects] = useState<Record<AspectKey, number>>({ on_time: 0, communication: 0, quality: 0 })
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    supabase.from('provider_reviews').select('id, overall, on_time, communication, quality, comment, created_at').eq('work_order_id', workOrderId).eq('by_user', user.id).maybeSingle()
      .then(({ data }) => { if (!cancelled) setMine((data as ReviewRow | null) ?? null) })
    return () => { cancelled = true }
  }, [user, workOrderId])

  // Only a network provider can be reviewed (a contact reached by email has no provider row).
  if (!user || !providerId || mine === undefined) return null
  const who = providerName || (zh ? '服务商' : 'the provider')

  if (mine) {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-body-3" data-testid="review-done">
        <Stars value={mine.overall} label={zh ? '总体' : 'Overall'} />
        <span>{zh ? `你已评价 ${who} · ${mine.created_at.slice(0, 10)}` : `You reviewed ${who} · ${mine.created_at.slice(0, 10)}`}</span>
        {mine.comment && <span className="text-body-2">「{mine.comment}」</span>}
      </div>
    )
  }
  if (!reviewWindowOpen(acceptedAt)) {
    return <div className="mt-2 text-[12px] text-body-3" data-testid="review-window-closed">{zh ? `评价窗口已过（验收后 ${REVIEW_WINDOW_DAYS} 天内）。` : `The review window has closed (${REVIEW_WINDOW_DAYS} days after acceptance).`}</div>
  }
  if (!open) {
    return <button type="button" className="mt-2 rounded-full border border-line-strong bg-white px-3 py-1.5 text-[12.5px] font-semibold text-body hover:border-brand hover:text-brand" data-testid="review-open" onClick={() => setOpen(true)}>{zh ? `★ 评价 ${who}` : `★ Review ${who}`}</button>
  }

  const submit = async () => {
    if (!overall || busy) return
    setBusy(true); setErr(null)
    const row = {
      work_order_id: workOrderId, provider_id: providerId, by_kind: viewer, by_user: user.id, overall,
      on_time: aspects.on_time || null, communication: aspects.communication || null, quality: aspects.quality || null,
      comment: comment.trim() ? comment.trim().slice(0, 1000) : null,
    }
    const { data, error } = await supabase.from('provider_reviews').insert(row).select('id, overall, on_time, communication, quality, comment, created_at').single()
    setBusy(false)
    if (error || !data) {
      // 23505 = already reviewed; 42501 = outside the window / not a party any more.
      setErr(error?.code === '23505' ? (zh ? '你已经评价过这张工单。' : 'You have already reviewed this work order.') : error?.code === '42501' ? (zh ? '评价窗口已过，或你不是这张工单的当事人。' : 'The review window has closed, or you are not a party to this work order.') : error?.message || 'failed')
      return
    }
    setMine(data as ReviewRow)
  }

  return (
    <div className="mt-2 rounded-xl border border-line-divider bg-surface-chip p-3" data-testid="review-form">
      <div className="text-[13px] font-semibold text-body">{zh ? `评价 ${who}` : `Review ${who}`}</div>
      <p className="mt-0.5 text-[11.5px] text-body-3">{zh ? `验收后 ${REVIEW_WINDOW_DAYS} 天内，房东与租客各一条；评价会显示给网络里的其他房东。` : `One from the landlord and one from the tenant, within ${REVIEW_WINDOW_DAYS} days of acceptance; shown to other landlords in the network.`}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px]">
        <span className="font-semibold">{zh ? '总体 *' : 'Overall *'}</span>
        <Stars value={overall} onChange={setOverall} label={zh ? '总体' : 'Overall'} disabled={busy} />
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-body-2">
        {ASPECTS.map((a) => (
          <span key={a.key} className="inline-flex items-center gap-1">{zh ? a.zh : a.en} <Stars value={aspects[a.key]} onChange={(v) => setAspects((s) => ({ ...s, [a.key]: v }))} label={zh ? a.zh : a.en} disabled={busy} /></span>
        ))}
      </div>
      <textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} rows={2} placeholder={zh ? '一句话（可选，最多 1000 字）' : 'A sentence (optional, up to 1000 characters)'} className="mt-2 w-full rounded-lg border border-line-divider bg-white px-3 py-2 text-[13px]" />
      {err && <p className="mt-1 text-[12px] text-danger">{err}</p>}
      <div className="mt-2 flex gap-2">
        <button type="button" className="sl-btn-primary !py-1.5 !text-[12.5px]" disabled={!overall || busy} onClick={() => void submit()} data-testid="review-submit">{busy ? (zh ? '提交中…' : 'Submitting…') : (zh ? '提交评价' : 'Submit review')}</button>
        <button type="button" className="sl-btn-secondary !py-1.5 !text-[12.5px]" disabled={busy} onClick={() => setOpen(false)}>{zh ? '取消' : 'Cancel'}</button>
      </div>
    </div>
  )
}
