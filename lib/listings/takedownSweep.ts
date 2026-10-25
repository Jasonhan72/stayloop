// The take-down sweep (回流闭环 2026-10-26; design/ai-rebuild-report-review-2026-10-25.md
// 第一批 3). Called from the daily proactive cron; a server module so it can be
// run on its own. Server only (service role client in).
import type { SupabaseClient } from '@supabase/supabase-js'
import { attachMainThread } from '@/lib/agent/mainThread'
import { isPasteBackChannel, PASTE_BACK_CHANNELS, PASTE_BACK_LABEL } from '@/lib/listings/shareChannels'

export const TAKEDOWN_ACTION_TYPE = 'takedown_reminder'
export type TakedownSweepSummary = { cards: number; listings: number; error?: string }

// Take-down reminders (回流闭环 2026-10-26): a listing that is off market while a
// hand-posted ad (Kijiji / Marketplace / group / 小红书 / Instagram / WeChat) is
// still recorded as posted gets one pending `takedown_reminder` card naming
// those places. Approving it = the landlord says they are down (the executor
// marks the rows removed). One card per listing while one is pending.
export async function runTakedownSweep(admin: SupabaseClient): Promise<TakedownSweepSummary> {
  const { data: rows, error } = await admin.from('listing_syndications').select('listing_id, channel, external_url').eq('status', 'posted').in('channel', [...PASTE_BACK_CHANNELS]).limit(2000)
  if (error) throw new Error(`syndications load failed: ${error.message}`)
  const byListing = new Map<string, { channel: string; external_url: string | null }[]>()
  for (const r of (rows ?? []) as { listing_id: string; channel: string; external_url: string | null }[]) {
    byListing.set(r.listing_id, [...(byListing.get(r.listing_id) ?? []), { channel: r.channel, external_url: r.external_url }])
  }
  if (!byListing.size) return { cards: 0, listings: 0 }
  const { data: ls } = await admin.from('listings').select('id, address, unit, landlord_id, is_active, status').in('id', [...byListing.keys()])
  type L = { id: string; address: string; unit: string | null; landlord_id: string | null; is_active: boolean; status: string | null }
  const off = ((ls ?? []) as L[]).filter((l) => !l.is_active || l.status === 'archived' || l.status === 'rented')
  if (!off.length) return { cards: 0, listings: 0 }
  const landlordIds = [...new Set(off.map((l) => l.landlord_id).filter((x): x is string => !!x))]
  const { data: lds } = await admin.from('landlords').select('id, auth_id').in('id', landlordIds)
  const authOf = new Map(((lds ?? []) as { id: string; auth_id: string | null }[]).map((r) => [r.id, r.auth_id]))
  const { data: cards } = await admin.from('agent_pending_actions').select('id, metadata').eq('action_type', TAKEDOWN_ACTION_TYPE).eq('status', 'pending').limit(2000)
  const pendingFor = new Set(((cards ?? []) as { metadata: { listing_id?: string } | null }[]).map((c) => c.metadata?.listing_id).filter((x): x is string => !!x))
  const inserts: { user_id: string; role: string; metadata: Record<string, unknown>; [k: string]: unknown }[] = []
  for (const l of off) {
    if (pendingFor.has(l.id)) continue
    const userId = (l.landlord_id && authOf.get(l.landlord_id)) || l.landlord_id
    if (!userId) continue
    const places = byListing.get(l.id) ?? []
    const names = places.map((p) => (isPasteBackChannel(p.channel) ? PASTE_BACK_LABEL[p.channel].zh : p.channel))
    const namesEn = places.map((p) => (isPasteBackChannel(p.channel) ? PASTE_BACK_LABEL[p.channel].en : p.channel))
    const unit = `${l.address}${l.unit ? ` #${l.unit}` : ''}`
    inserts.push({
      user_id: userId, role: 'landlord', action_type: TAKEDOWN_ACTION_TYPE,
      title: `房源已下线，外面还挂着 ${places.length} 处 · ${unit} / Ads still up elsewhere`,
      summary: `${unit} 已不在 Stayloop 上架，但你记录过这些地方还挂着：${names.join('、')}。外面挂着已租出的房子只会招来无效咨询。去那几处撤帖后批准这张卡，记录就一起关掉。 / ${unit} is off market on Stayloop but you recorded ads on ${namesEn.join(', ')}. Pull them, then approve to close those records.`,
      recipient_label: null, data_scope: ['房源状态', '外部帖子记录'], excluded_data: ['申请人资料'], risk_level: 'low', status: 'pending', requires_approval: true,
      metadata: { listing_id: l.id, channels: places.map((p) => p.channel), urls: places.map((p) => p.external_url), source: 'proactive_sweep' },
    })
  }
  if (!inserts.length) return { cards: 0, listings: off.length }
  const { error: insErr } = await admin.from('agent_pending_actions').insert(await attachMainThread(admin, inserts))
  if (insErr) throw new Error(`takedown insert failed: ${insErr.message}`)
  return { cards: inserts.length, listings: off.length }
}

