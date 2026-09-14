// The active hat (design/multi-role-accounts-2026-09.md §3): the route
// prefix is the truth; the remembered role in localStorage is only the
// fallback on neutral pages. Pure so it can be tested without the auth hook.
export type ActiveRole = 'tenant' | 'landlord' | 'agent' | null

/** /tenant/*, /landlord/*, /agent/* name their hat; the landlord-only
 *  screening app and dashboard count as landlord; everything else is null. */
export function roleFromPath(path: string | null | undefined): ActiveRole {
  if (!path) return null
  if (path.startsWith('/tenant/')) return 'tenant'
  if (path.startsWith('/landlord/') || path.startsWith('/screening/app') || path.startsWith('/dashboard')) return 'landlord'
  if (path.startsWith('/agent/')) return 'agent'
  return null
}
