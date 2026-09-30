'use client'
// 「发消息」 — one button for every place a person appears (找得到人 2026-09-30).
// It opens that matter's conversation (composer focused) or, when there is none
// yet, the compose sheet bound to the matter. The label only names a person on
// two-party conversations; shared ones say so (「在工单对话里发消息」).
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { resolveThreadHref, type ThreadTarget } from '@/lib/messages/openThread'

type Variant = 'chip' | 'link' | 'primary'
const CLS: Record<Variant, string> = {
  chip: 'inline-flex items-center gap-1 rounded-full border border-line-divider bg-white px-2.5 py-[4px] text-[12px] font-semibold text-body hover:border-brand hover:text-brand disabled:opacity-50',
  link: 'inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand underline-offset-2 hover:underline disabled:opacity-50',
  primary: 'inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-[13px] font-bold text-white hover:bg-brand-strong disabled:opacity-50',
}

export default function MessageButton({ target, label, zh, variant = 'chip', disabledReason, className = '', testId = 'message-button' }: {
  target: ThreadTarget
  /** Full label, e.g. 「发消息给 Sarah」 or 「在工单对话里发消息」. Defaults to 「发消息」. */
  label?: string
  zh: boolean
  variant?: Variant
  /** When set the button is disabled and the reason shows as its tooltip and text. */
  disabledReason?: string | null
  className?: string
  testId?: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  if (disabledReason) {
    return <span className={CLS.chip + ' cursor-not-allowed border-dashed text-body-3 hover:border-line-divider hover:text-body-3 ' + className} title={disabledReason} data-testid={testId} data-disabled="true">✉ {disabledReason}</span>
  }
  return (
    <button type="button" data-testid={testId} disabled={busy} className={CLS[variant] + ' ' + className}
      onClick={async (e) => { e.preventDefault(); e.stopPropagation(); setBusy(true); try { router.push(await resolveThreadHref(target)) } finally { setBusy(false) } }}>
      <span aria-hidden="true">✉</span>{busy ? '…' : label || (zh ? '发消息' : 'Message')}
    </button>
  )
}
