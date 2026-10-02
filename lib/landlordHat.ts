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

/** A brand-new account: no landlord / agent / provider hat and the assistant never named
 *  (assistant_profiles.name or this browser's cache for the account). */
export function isBrandNewAccount(hats: HatsLite, named: boolean): boolean {
  return !named && !hats?.landlord && !hats?.agent && !hats?.provider
}

/** Where a signed-in visitor to the homepage goes (V0.7 follow-up, 2026-09-27).
 *  A brand-new account can reach `/` signed in without ever passing the auth
 *  callback — a link minted without a redirect_to (GoTrue then uses the site
 *  URL; the allow-list itself does include /auth/callback), or a visitor who
 *  left onboarding and typed the homepage. Sending such an account to the
 *  tenant chat would skip「选身份，给助手起个名字」entirely; it goes to
 *  onboarding instead. Everyone else lands as homeForHats decides. */
export function landingForAccount(stored: string | null | undefined, hats: HatsLite, named: boolean): string {
  return isBrandNewAccount(hats, named) ? '/onboarding/name' : homeForHats(stored, hats)
}

/** The sign-in callback's landing (site test 2026-10-02, L7 D6 / L6 D5). Only the
 *  role remembered in this browser (`stored`) is the person's own choice; a
 *  candidate read from the account's most recent agent_configs row (or the
 *  signup metadata) is a hint. A 'tenant' hint must not outrank a held provider
 *  hat on a pure service-provider account — every account holds the tenant
 *  hat, so a provider who once opened /tenant/agent was sent to the tenant chat
 *  on every new device while the homepage sent the same account to its jobs. */
export function landingAfterSignIn(stored: string | null | undefined, hint: string | null | undefined, hats: HatsLite): string {
  if (stored && stored in HOME) return homeForHats(stored, hats)
  const providerOnly = !!hats?.provider && !hats?.landlord && !hats?.agent
  return homeForHats(hint === 'tenant' && providerOnly ? null : hint, hats)
}
