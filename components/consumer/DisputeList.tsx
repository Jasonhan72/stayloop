'use client'

// "我的争议" — the applicant's disputes on this request, each with its status
// in plain words (open / corrected / supplemented / deleted / maintained).

import { type ConsumerDisputeView, disputeStatusText, fmtDate, itemKindText } from './types'

const TONE: Record<ConsumerDisputeView['status'], { bg: string; fg: string }> = {
  open: { bg: '#FEF3E2', fg: '#B45309' },
  corrected: { bg: '#E4EEE3', fg: '#065F46' },
  supplemented: { bg: '#E4EEE3', fg: '#065F46' },
  deleted: { bg: '#E4EEE3', fg: '#065F46' },
  maintained: { bg: '#EEF5FA', fg: '#4A4A6A' },
}

export default function DisputeList({ disputes, zh }: { disputes: ConsumerDisputeView[]; zh: boolean }) {
  return (
    <section data-testid="my-disputes" className="rounded-2xl border border-line-divider bg-white p-5 sm:p-6">
      <div className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-body-3">{zh ? '我的争议' : 'MY DISPUTES'}</div>
      {disputes.length === 0 ? (
        <p className="mt-2 text-[13.5px] text-body-3">{zh ? '还没有提出过争议。档案里每条旁边都有「这条不对」。' : 'No disputes yet. Every item in the file has a “This is wrong” button.'}</p>
      ) : (
        <ul className="mt-3 divide-y divide-line-divider">
          {disputes.map((d) => {
            const tone = TONE[d.status] || TONE.open
            return (
              <li key={d.id} className="py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full px-2 py-[2px] font-mono text-[10.5px] font-bold" style={{ background: tone.bg, color: tone.fg }}>{disputeStatusText(d.status, zh)}</span>
                  <span className="text-[12px] text-body-3">{itemKindText(d.item_kind, zh)} · {fmtDate(d.created_at, zh)}</span>
                </div>
                <div className="mt-1 text-[14px] font-semibold break-words">{d.item_label}</div>
                {d.statement && <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-body-2">{d.statement}</p>}
                {d.resolution_note && (
                  <p className="mt-2 rounded-lg bg-surface-chip px-3 py-2 text-[13px] leading-relaxed text-body-2">
                    <span className="font-semibold">{zh ? 'Stayloop 的答复：' : 'Stayloop’s answer: '}</span>{d.resolution_note}
                    {d.resolved_at && <span className="text-body-3"> · {fmtDate(d.resolved_at, zh)}</span>}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
