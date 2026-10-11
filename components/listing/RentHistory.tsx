'use client'

// 租金记录 on the listing page (2026-10-10, user: "租金历史价格，登录用户才可以看，要不就模糊处理").
// Mirrors the VOW convention (PropTx Art. 8: registered consumers only for history): an
// anonymous visitor sees the current row, the earlier rows blurred behind a sign-in bar.
// The rows are real (the trigger-maintained price_history) — nothing is faked to look blurred.
import Link from 'next/link'
import { ListingSection } from '@/components/listing/ListingSection'
import type { PriceEvent } from '@/lib/listingInsights'

export function rentHistoryRows(history: PriceEvent[] | null | undefined): PriceEvent[] {
  return Array.isArray(history) ? [...history].reverse() : []
}

function eventText(h: PriceEvent, zh: boolean): string {
  const prev = h.prev != null ? Number(h.prev).toLocaleString() : ''
  if (h.event === 'imported') return zh ? '导入 Stayloop（Realtor.ca 挂牌）' : 'Imported (Realtor.ca listing)'
  if (h.event === 'listed') return zh ? '上架' : 'Listed'
  if (h.prev != null) return h.price > h.prev ? (zh ? `涨价（原 $${prev}）` : `Increased (was $${prev})`) : (zh ? `降价（原 $${prev}）` : `Reduced (was $${prev})`)
  return zh ? '调价' : 'Changed'
}

export function RentHistory({ zh, history, signedIn, loginHref }: { zh: boolean; history: PriceEvent[] | null | undefined; signedIn: boolean; loginHref: string }) {
  const rows = rentHistoryRows(history)
  if (rows.length === 0) return null
  const gated = !signedIn && rows.length > 1
  const visible = gated ? rows.slice(0, 1) : rows
  const hidden = gated ? rows.slice(1) : []
  const row = (h: PriceEvent, i: number) => (
    <div key={`${h.date}-${i}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13.5px]">
      <span className="font-mono text-[12px] text-body-3">{String(h.date).slice(0, 10)}</span>
      <span className="flex-1 text-body-2">{eventText(h, zh)}</span>
      <span className="font-semibold">${Number(h.price).toLocaleString()}</span>
    </div>
  )
  return (
    <ListingSection zh={zh} title={zh ? '租金记录' : 'Rent history'} eyebrow="RENT HISTORY">
      <div className="overflow-hidden rounded-[12px] border border-line-divider bg-white" data-testid="rent-history">
        <div className="divide-y divide-line-divider">{visible.map(row)}</div>
        {gated && (
          <div className="relative border-t border-line-divider">
            <div className="divide-y divide-line-divider select-none blur-[5px]" aria-hidden="true" data-testid="rent-history-blurred">
              {hidden.map(row)}
            </div>
            <div className="absolute inset-0 flex items-center justify-center bg-white/55 px-4">
              <Link href={loginHref} className="rounded-full border border-line-strong bg-white px-4 py-2 text-[13px] font-semibold text-body shadow-sm transition hover:border-brand hover:text-brand" data-testid="rent-history-signin">
                🔒 {zh ? `登录后查看完整记录 · 还有 ${hidden.length} 条` : `Sign in to see the full history · ${hidden.length} more`}
              </Link>
            </div>
          </div>
        )}
      </div>
      <p className="mt-2 text-[12px] text-body-3">
        {zh
          ? '记录的是这套房源在 Stayloop 上的挂牌与调价。完整的历史记录只对登录用户开放。'
          : 'Listing and price changes for this home on Stayloop. The full history is available to signed-in users only.'}
      </p>
    </ListingSection>
  )
}
