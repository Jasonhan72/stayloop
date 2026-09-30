// Load threads for an export (service role): every message (retractions folded
// onto their target, never dropped), the hash chain recomputed here, receipts per
// message, and the raw-email fingerprint of email replies (消息系统 A 期).
import type { SupabaseClient } from '@supabase/supabase-js'
import { verifyChain, type ChainMessage } from '@/lib/threads/hashChain'
import type { PackThread } from './evidencePack'

const COLS = 'id, thread_id, created_at, sender_id, sender_kind, acting_role, sender_label, kind, channel, body, ref_message_id, attachments, meta, prev_hash, hash'

export async function loadPackThread(admin: SupabaseClient, t: { id: string; kind: string; title: string | null; created_at: string }): Promise<{ pack: PackThread; raw: ChainMessage[] }> {
  const [{ data: msgs }, { data: dels }] = await Promise.all([
    admin.from('thread_messages').select(COLS).eq('thread_id', t.id).order('id').limit(2000),
    admin.from('message_deliveries').select('message_id, channel, status, updated_at, provider_message_id').eq('thread_id', t.id).order('id').limit(4000),
  ])
  type Row = Omit<ChainMessage, 'attachments'> & { sender_label: string | null; meta: Record<string, unknown> | null; attachments: { name: string; size: number; sha256: string; path: string }[] }
  const list = (msgs ?? []) as Row[]
  const chain = await verifyChain(list)
  const byMsg = new Map<number, { channel: string; status: string; at: string; provider_message_id: string | null }[]>()
  for (const d of (dels ?? []) as { message_id: number | null; channel: string; status: string; updated_at: string; provider_message_id: string | null }[]) {
    if (d.message_id == null) continue
    const arr = byMsg.get(d.message_id) ?? []
    arr.push({ channel: d.channel, status: d.status, at: d.updated_at, provider_message_id: d.provider_message_id })
    byMsg.set(d.message_id, arr)
  }
  const retracted = new Map<number, string>()
  for (const x of list) if (x.kind === 'retraction' && x.ref_message_id != null) retracted.set(x.ref_message_id, x.created_at)
  const pack: PackThread = {
    id: t.id, kind: t.kind, title: t.title, created_at: t.created_at, chain,
    messages: list.filter((x) => x.kind !== 'retraction').map((x) => ({
      id: x.id, created_at: x.created_at, sender_kind: x.sender_kind, acting_role: x.acting_role, sender_label: x.sender_label, kind: x.kind, body: x.body,
      retracted_at: retracted.get(x.id) ?? null, channel: x.channel, hash: x.hash ?? null, prev_hash: x.prev_hash ?? null,
      deliveries: byMsg.get(x.id) ?? [], raw_sha256: typeof x.meta?.raw_sha256 === 'string' ? (x.meta.raw_sha256 as string) : null,
      attachments: (x.attachments || []).map((a) => ({ name: a.name, size: a.size, sha256: a.sha256, path: a.path })),
    })),
  }
  return { pack, raw: list }
}
