// PostgreSQL rejects any JSON that carries U+0000 ("unsupported Unicode
// escape sequence", SQLSTATE 22P05) — jsonb/text cannot store NUL. Text
// pulled out of PDFs by pdf.js does contain it (unmapped glyphs come back
// as U+0000), and since the 2026-08-21 real-global polyfill made text
// extraction actually work in production, a 50k-char text_sample with one
// NUL in it failed the whole screening write (2026-09-11, 14-file run).
// Every jsonb payload the screening pipeline writes goes through this.

const NUL = String.fromCharCode(0)

export function stripNul<T>(value: T): T {
  if (typeof value === 'string') return (value.includes(NUL) ? value.split(NUL).join('') : value) as T
  if (Array.isArray(value)) return value.map(stripNul) as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k.split(NUL).join('')] = stripNul(v)
    return out as T
  }
  return value
}
