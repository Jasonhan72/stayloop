// Work that may finish after the HTTP response has gone out (push notices,
// follow-up emails, suggestion cards).
//
// On Cloudflare Workers a promise that nobody awaits is cancelled as soon as the
// response is returned, unless it rides ctx.waitUntil (up to 30 s more). A bare
// `void notifyUser(…)` before `return NextResponse.json(…)` therefore works in
// `next dev` and silently does nothing in production (code review 2026-11-15,
// S1-4: tenants' repair tickets never produced the landlord's dispatch card).
// Outside the Worker (next dev, vitest, scripts) there is no context and the
// promise simply runs on its own.
//
// Never throws and never rejects: the caller has already answered.
import { getCloudflareContext } from '@opennextjs/cloudflare'

export function afterResponse(work: Promise<unknown> | (() => Promise<unknown>)): void {
  let p: Promise<unknown>
  try {
    p = Promise.resolve(typeof work === 'function' ? work() : work).catch((e) => {
      console.warn('[afterResponse]', e instanceof Error ? e.message : String(e))
    })
  } catch (e) {
    console.warn('[afterResponse]', e instanceof Error ? e.message : String(e))
    return
  }
  try { getCloudflareContext().ctx.waitUntil(p) } catch { void p }
}
