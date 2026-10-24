// Where the 「租客筛查」 nav item goes (2026-10-23). A signed-in landlord — or an agent with a live
// RECO registration — lands straight in the workspace. Sending them to the public landing first
// painted the whole marketing page, then AutoEnter swapped it for /screening/app once the hats
// loaded: a visible flash on every click. Anonymous visitors and tenants keep the landing (its
// hat-aware CTA is the tenant's door). Bookmarks to /screening still forward through AutoEnter.
import { isRegistrationLive } from '@/lib/agentProfile'

export function screeningHrefFor(signedIn: boolean, hats: { loading: boolean; landlord: boolean; agent: string | null | undefined }): '/screening' | '/screening/app' {
  if (!signedIn || hats.loading) return '/screening'
  return hats.landlord || isRegistrationLive(hats.agent) ? '/screening/app' : '/screening'
}
