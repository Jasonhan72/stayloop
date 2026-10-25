'use client'
// 「外面还挂着」(回流闭环, 2026-10-26): under a listing that is off market, the
// hand-posted ads the landlord recorded (Kijiji / Marketplace / group / 小红书 /
// Instagram / WeChat) with a link each and 「已撤下」. Renders nothing while the
// listing is live or nothing is recorded. The rows come from the dashboard's one
// GET /api/listings/syndications (not one request per row). The daily sweep raises the same list
// as a takedown_reminder card for landlords who do not come back to this page.
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { isPasteBackChannel, PASTE_BACK_LABEL } from '@/lib/listings/shareChannels'
import type { SyndicationRow } from '@/lib/listings/syndication'

export default function TakedownNotice({ zh, listingId, active, rows, onChanged }: { zh: boolean; listingId: string; active: boolean; rows: SyndicationRow[]; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const posted = rows.filter((r) => r.listing_id === listingId && r.status === 'posted' && isPasteBackChannel(r.channel))
  if (active || !posted.length) return null
  const remove = async (row: SyndicationRow) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) return
    setBusy(row.id)
    try {
      const r = await fetch('/api/listings/syndications', {
        method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing_id: listingId, channel: row.channel, action: 'removed' }),
      })
      if (r.ok) onChanged()
    } finally { setBusy(null) }
  }
  return (
    <div data-testid="takedown-notice" className="basis-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] leading-relaxed">
      <div className="font-semibold text-amber-900">{zh ? `已下架，但外面还挂着 ${posted.length} 处：去撤帖，撤完点一下。` : `Off market here, still advertised in ${posted.length} place${posted.length > 1 ? 's' : ''}: pull the ads, then tick them off.`}</div>
      <ul className="mt-1 space-y-1">
        {posted.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{isPasteBackChannel(r.channel) ? (zh ? PASTE_BACK_LABEL[r.channel].zh : PASTE_BACK_LABEL[r.channel].en) : r.channel}</span>
            {r.external_url && <a href={r.external_url} target="_blank" rel="noreferrer" className="min-w-0 truncate text-brand underline-offset-2 hover:underline">{r.external_url.replace(/^https?:\/\//, '')}</a>}
            <button type="button" onClick={() => void remove(r)} disabled={busy === r.id} className="ml-auto rounded-full border border-amber-300 bg-white px-2.5 py-[2px] text-[11.5px] font-semibold text-amber-900 hover:border-amber-500" data-testid="takedown-removed">{zh ? '已撤下' : 'Taken down'}</button>
          </li>
        ))}
      </ul>
    </div>
  )
}
