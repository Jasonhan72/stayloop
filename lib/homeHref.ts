// Where the logo goes (V0.7, 2026-09-27 — user: "登录以后点击 logo 应该跳到哪里？").
//
// Visitors: the marketing homepage. Signed-in people: the assistant of the hat
// they are acting as (providers: their work-order desk) — the same place the
// login lands them and the same place `/` redirects them to, but without the
// detour through `/`. While auth or the hats are still loading the answer is
// `/`, which matches the prerendered HTML (no hydration-time branching) and
// still ends up in the right place through the homepage's own redirect.
import { HOME } from '@/lib/landlordHat'

export type HomeHrefInput = {
  signedIn: boolean
  hatsLoading: boolean
  /** acting as a provider: on /provider/* or a remembered provider hat with no role in the path */
  onProvider: boolean
  /** the held hat the header shows as acting (activeHat) */
  hat: 'tenant' | 'landlord' | 'agent'
}

export function homeHrefFor(o: HomeHrefInput): string {
  if (!o.signedIn || o.hatsLoading) return '/'
  return o.onProvider ? HOME.provider : HOME[o.hat]
}
