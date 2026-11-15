/**
 * A same-site path taken from a `?next=` / `?redirect=` value, or null.
 *
 * "Starts with / and not with // or /\" is not enough: the URL parser strips
 * TAB, CR and LF before it reads the address and treats `\` as `/`, so
 * `/\t/evil.com` is `//evil.com` — another origin (code review 2026-11-15,
 * S2-7; Next's router does a full page load for an off-site URL). The value is
 * refused when it carries a control character or a backslash, and then resolved
 * against the origin to make sure it stays on it.
 *
 * The one place this rule lives — the login form, the auth page, the OAuth
 * callback and /landlord/become all use it.
 */
export function sameSitePath(raw: string | null | undefined, origin = 'https://www.stayloop.ai'): string | null {
  if (!raw || raw[0] !== '/' || raw.startsWith('//')) return null
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(raw)) return null
  try {
    if (new URL(raw, origin).origin !== new URL(origin).origin) return null
  } catch {
    return null
  }
  return raw
}
