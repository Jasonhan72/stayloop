// /landlord/become helpers (three-role test report 2026-09-24).

/** Only same-site paths survive as ?next=; anything else → the landlord home. */
export function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\') || raw.startsWith('/landlord/become')) return '/landlord/agent'
  return raw
}

export type HatsLite = { landlord?: boolean; agent?: string | null; provider?: string | null } | null | undefined
export const HOME: Record<'tenant' | 'landlord' | 'agent' | 'provider', string> = { tenant: '/tenant/agent', landlord: '/landlord/agent', agent: '/agent/agent', provider: '/provider/jobs' }

/** Where to land after sign-in. The remembered role (localStorage, may belong
 *  to a previous account on the same browser) only counts if THIS account
 *  holds that hat. Otherwise the ONE activated non-tenant hat wins (a pure
 *  service-provider account lands on its jobs page — external review
 *  2026-09-26, P1-1); with several, agent, then landlord, then tenant.
 *  (three-role test report 2026-09-24, SL-T-08) */
export function homeForHats(stored: string | null | undefined, hats: HatsLite): string {
  const held = (r: string) => r === 'tenant' || (r === 'landlord' && !!hats?.landlord) || (r === 'agent' && !!hats?.agent) || (r === 'provider' && !!hats?.provider)
  if (stored && stored in HOME && held(stored)) return HOME[stored as keyof typeof HOME]
  if (hats?.provider && !hats?.agent && !hats?.landlord) return HOME.provider
  if (hats?.agent) return HOME.agent
  if (hats?.landlord) return HOME.landlord
  return HOME.tenant
}
