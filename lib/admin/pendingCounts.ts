// What is waiting on the back office (RPC admin_pending_counts, migration 20261115e).
// Pure: the queue list, parsing the RPC answer, and the "should the notice show" rule.
//
// Why this exists (2026-11-15): an agent submitted a RECO registration and nothing told the
// admins — they had to open /admin/agents to find out. Admins now get a count in the header
// menu and a notice after signing in.

export const ADMIN_QUEUES = [
  { key: 'agents', href: '/admin/agents', zh: '经纪认证', en: 'Agent verification' },
  { key: 'listings', href: '/admin/verify', zh: '房源验证', en: 'Listing verification' },
  { key: 'providers', href: '/admin/providers', zh: '服务商核验', en: 'Provider verification' },
  { key: 'disputes', href: '/admin/providers', zh: '工单争议', en: 'Work-order disputes' },
  { key: 'consumer', href: '/admin/consumer-requests', zh: '消费者档案请求', en: 'Consumer file requests' },
  { key: 'knowledge', href: '/admin/knowledge', zh: '知识库变动', en: 'Knowledge base changes' },
] as const

export type AdminQueueKey = (typeof ADMIN_QUEUES)[number]['key']
export type AdminPending = Record<AdminQueueKey, number>

/** The RPC answer as counts; null when it refused (`{error}`), failed, or is not an object. */
export function parseAdminPending(data: unknown): AdminPending | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const o = data as Record<string, unknown>
  if ('error' in o) return null
  const out = {} as AdminPending
  for (const q of ADMIN_QUEUES) {
    const n = Number(o[q.key])
    out[q.key] = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
  }
  return out
}

export function pendingTotal(p: AdminPending | null | undefined): number {
  if (!p) return 0
  return ADMIN_QUEUES.reduce((sum, q) => sum + (p[q.key] || 0), 0)
}

/** The queues with something in them, in menu order. */
export function openQueues(p: AdminPending | null | undefined): Array<(typeof ADMIN_QUEUES)[number] & { n: number }> {
  if (!p) return []
  return ADMIN_QUEUES.filter((q) => (p[q.key] || 0) > 0).map((q) => ({ ...q, n: p[q.key] }))
}

/** What the admin last acknowledged: which sign-in it was, and the counts at that moment. */
export type AdminPendingSeen = { signInAt: string | null; counts: Partial<AdminPending> }

/** Show the notice when there is something waiting and either this is a new sign-in since the
 *  admin last closed it, or a queue has grown past what they closed it at. Closing it does not
 *  hide the menu count — only the notice. */
export function shouldShowNotice(p: AdminPending | null | undefined, signInAt: string | null, seen: AdminPendingSeen | null): boolean {
  if (pendingTotal(p) === 0) return false
  if (!seen) return true
  if ((seen.signInAt ?? null) !== (signInAt ?? null)) return true
  return ADMIN_QUEUES.some((q) => (p![q.key] || 0) > (Number(seen.counts?.[q.key]) || 0))
}

export const adminPendingSeenKey = (userId: string) => `stayloop_admin_pending_seen:${userId}`

export function readSeen(raw: string | null): AdminPendingSeen | null {
  if (!raw) return null
  try {
    const o = JSON.parse(raw) as AdminPendingSeen
    if (!o || typeof o !== 'object' || typeof o.counts !== 'object' || o.counts === null) return null
    return { signInAt: typeof o.signInAt === 'string' ? o.signInAt : null, counts: o.counts }
  } catch {
    return null
  }
}
