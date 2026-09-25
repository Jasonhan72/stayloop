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

/** Pages that carry a role prefix without being that role's workspace: the
 *  landlord onboarding door, the agent registration form, and the screening
 *  app (used by RECO agents for client screening since 2026-09-24). Visiting
 *  them must not be remembered as "this account uses that hat" — review
 *  2026-09-25: a tenant bounced to /landlord/become had landlord remembered
 *  and was then bounced off /settings as well. */
const NOT_A_CHOICE = ['/landlord/become', '/agent/verify', '/screening/app']
export function rememberableRoleFromPath(path: string | null | undefined): ActiveRole {
  if (!path || NOT_A_CHOICE.some((p) => path.startsWith(p))) return null
  return roleFromPath(path)
}
