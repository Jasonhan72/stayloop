// Relay principle (消息系统 A 期 · 找得到人 2026-09-30): another person's email address is never shown.
/** Replace any email address embedded in card text (older cards, proactive sweeps) with the recipient's role. */
export function maskEmails(text: string, replacement: string): string {
  // Stayloop's own addresses (privacy@, reply relays) stay — they are nobody's personal inbox.
  return text.replace(/[^\s@，。、：；（）()<>「」"'|]+@[^\s@，。、：；（）()<>「」"'|]+\.[A-Za-z]{2,}/g, (m) => (/@(?:[a-z0-9-]+\.)*stayloop\.ai$/i.test(m) ? m : replacement))
}
