// Per-viewer "last read message" marker for household conversations — a
// browser convenience (localStorage), never shared state. Used by the
// messages inbox (three-role test report 2026-09-24, SL-T-07).
const key = (hh: string) => `sl-msg-read:${hh}`

export function getReadMark(hh: string): number {
  try { return Number(localStorage.getItem(key(hh)) || 0) || 0 } catch { return 0 }
}

export function setReadMark(hh: string, lastId: number): void {
  try { if (lastId > getReadMark(hh)) localStorage.setItem(key(hh), String(lastId)) } catch { /* private mode */ }
}

/** Unread = the newest message is newer than the mark and was not sent by me. */
export function isUnread(hh: string, latest: { id: number; sender_id: string } | null, me: string): boolean {
  return !!latest && latest.sender_id !== me && latest.id > getReadMark(hh)
}
