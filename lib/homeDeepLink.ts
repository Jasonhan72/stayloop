// Homepage deep links after V0.7 (2026-09-27).
//
// Until V0.6 the homepage's hero WAS the assistant, and role / screening pages
// fed an example question into it with `/?role=<r>&ask=<q>` (EliseAI benchmark
// item C, 2026-09-22). The homepage is a marketing + login page now, so the
// same links land in the role's assistant page instead: anonymous visitors get
// the preview there (no account, hourly limit), signed-in users their real
// assistant. `send=1` keeps the old behaviour — the question is sent once on
// arrival (usePromptDeepLink never auto-sends a text with an unfilled 【…】).
export const ASSISTANT_ROLES = ['tenant', 'landlord', 'agent'] as const
export type AssistantRole = (typeof ASSISTANT_ROLES)[number]

export const ASK_MAX = 300

export function isAssistantRole(v: string | null | undefined): v is AssistantRole {
  return v === 'tenant' || v === 'landlord' || v === 'agent'
}

/** `/<role>/agent?prompt=<text>&send=1` — the one place this URL is spelled. */
export function assistantPromptHref(role: AssistantRole, prompt: string, send = true): string {
  const q = new URLSearchParams({ prompt: prompt.trim().slice(0, ASK_MAX) })
  if (send) q.set('send', '1')
  return `/${role}/agent?${q.toString()}`
}

/** The redirect target for a legacy `/?role=<r>&ask=<q>` URL, or null when the
 *  URL is not one (any other path, or no non-empty `ask`). */
export function homeAskRedirect(url: URL): URL | null {
  if (url.pathname !== '/') return null
  const ask = (url.searchParams.get('ask') || '').trim()
  if (!ask) return null
  const role = url.searchParams.get('role')
  const target = new URL(url.toString())
  const href = assistantPromptHref(isAssistantRole(role) ? role : 'tenant', ask)
  const [pathname, search] = href.split('?')
  target.pathname = pathname
  target.search = search ? `?${search}` : ''
  target.hash = ''
  return target
}
