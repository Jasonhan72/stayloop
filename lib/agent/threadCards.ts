// Which approval cards belong in which conversation (2026-10-04).
//
// The chat used to append every open card on the account to whatever
// conversation was showing, so "+ 新会话" opened a fresh thread that still
// ended with yesterday's cards and looked like the old one. A card now shows
// in the conversation it was proposed in (metadata.thread_id, written by the
// orchestrator); cards from other conversations, and cards with no
// conversation (cron renewals, page actions), live on the to-do page and in
// the panel's to-do tab, with a one-line pointer from the chat.

export type CardLike = { id: string; status: string; metadata?: Record<string, unknown> | null }

/** The conversation an approval card was proposed in; null for cron / page cards. */
export function cardThreadId(card: { metadata?: Record<string, unknown> | null }): string | null {
  const t = card.metadata?.thread_id
  return typeof t === 'string' && t ? t : null
}

/**
 * `scoped` = a signed-in workspace chat with real threads. Unscoped (demo,
 * anonymous preview, the homepage film) keeps every card in the chat.
 * A brand-new conversation (threadId null) has no cards of its own yet.
 */
export function splitCardsByThread<T extends CardLike>(cards: readonly T[], threadId: string | null, scoped: boolean): { here: T[]; elsewhere: T[] } {
  const open = cards.filter((a) => a.status === 'pending' || a.status === 'approved')
  if (!scoped) return { here: open, elsewhere: [] }
  const here: T[] = []
  const elsewhere: T[] = []
  for (const a of open) (threadId && cardThreadId(a) === threadId ? here : elsewhere).push(a)
  return { here, elsewhere }
}

/** A countdown row belongs to the conversation its card came from. */
export function scheduledInThread(entry: { threadId?: string | null }, threadId: string | null, scoped: boolean): boolean {
  if (!scoped) return true
  return !!threadId && entry.threadId === threadId
}
