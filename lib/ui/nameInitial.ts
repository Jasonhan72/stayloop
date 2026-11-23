// The one character an initial avatar shows for a name.
//
// A leading tag like "[TEST]" and any punctuation / emoji before the first letter or digit are
// skipped, so "[TEST] Northline" shows "N", not "[". Han characters stay whole; Latin is
// uppercased. The messaging avatars had this since 2026-10-21 (`initialOf`); the header and the
// settings page still took the raw first character (noticed 2026-11-17, fixed 2026-11-22).

/** Leading bracket tags: "[TEST] ", "[TEST][QA] ". */
const LEADING_TAGS = /^\s*(\[[^\]]*\]\s*)+/

/** The name without its leading bracket tags ("[TEST] Maple Plumbing" → "Maple Plumbing"). */
export function stripLeadingTags(name: string): string {
  return name.replace(LEADING_TAGS, '')
}

export function nameInitial(name: string | null | undefined, fallback = '?'): string {
  const s = (name ?? '').trim()
  if (!s) return fallback
  const alnum = (c: string) => /[\p{L}\p{N}]/u.test(c)
  const ch = Array.from(stripLeadingTags(s)).find(alnum) ?? Array.from(s).find(alnum) ?? Array.from(s)[0] ?? fallback
  return /[a-z]/i.test(ch) ? ch.toUpperCase() : ch
}
