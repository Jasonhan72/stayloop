// The name others see in conversations (找得到人 2026-09-30). Mirrors person_name() in
// supabase/migrations/20260930_messaging_people.sql: no address, no long number, not "Stayloop".
// Returns '' to clear, null when the value is refused.
export function cleanDisplayName(v: string): string | null {
  const s = v.replace(/[\u200B-\u200F\u2060-\u206F\uFEFF]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60)
  if (!s) return ''
  const folded = s.normalize('NFKC').toLowerCase().replace(/[\s\u00AD._\-·•|/\\]/g, '')
  if (/@/.test(s) || /\d{6,}/.test(s) || folded.includes('stayloop')) return null
  return s
}
