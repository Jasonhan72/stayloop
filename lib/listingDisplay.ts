// Display helpers for the listing detail page (pure; tests in
// tests/walkthrough20260925.spec.ts).

/** Free-text parking ("不含车位（可选租 $100/月）") used to render as 有 — the
 *  walk-through listing said the opposite (2026-09-25). */
export function parkingStat(text: string | null | undefined, zh: boolean): string {
  const t = (text || '').trim()
  if (!t) return zh ? '未提供' : 'Not provided'
  if (/^(不含|无|没有|不带|不提供|no\b|none|not included|without)/i.test(t)) {
    return /(可租|可选租|另租|available|extra|additional|\$)/i.test(t) ? (zh ? '可另租' : 'Available (extra)') : (zh ? '不含' : 'Not included')
  }
  return zh ? '有' : 'Yes'
}
