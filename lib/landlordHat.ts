// /landlord/become helpers (three-role test report 2026-09-24).

/** Only same-site paths survive as ?next=; anything else → the landlord home. */
export function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\') || raw.startsWith('/landlord/become')) return '/landlord/agent'
  return raw
}

export type HatsLite = { landlord?: boolean; agent?: string | null } | null | undefined
const HOME: Record<'tenant' | 'landlord' | 'agent', string> = { tenant: '/tenant/agent', landlord: '/landlord/agent', agent: '/agent/agent' }

/** Where to land after sign-in. The remembered role (localStorage, may belong
 *  to a previous account on the same browser) only counts if THIS account
 *  holds that hat; otherwise agent if it has an agent profile, else tenant.
 *  (three-role test report 2026-09-24, SL-T-08) */
export function homeForHats(stored: string | null | undefined, hats: HatsLite): string {
  const held = (r: string) => r === 'tenant' || (r === 'landlord' && !!hats?.landlord) || (r === 'agent' && !!hats?.agent)
  if (stored && stored in HOME && held(stored)) return HOME[stored as keyof typeof HOME]
  if (hats?.agent) return HOME.agent
  if (hats?.landlord) return HOME.landlord
  return HOME.tenant
}
