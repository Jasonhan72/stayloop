// Listing cards in the chat come in pages of six (two rows of three on the
// desktop console). The server returns up to two pages per turn; the chat
// shows one and offers 「换一批」. Pure helpers so the paging is testable.
import type { ListingCard } from './types'

export const LISTINGS_PAGE = 6

export type ListingsPage = {
  visible: ListingCard[]
  /** cards still held back after this page */
  remaining: number
  /** what the 「换一批」 button should do next */
  next: 'reveal' | 'search'
}

export function pageListings(listings: ListingCard[], offset: number, page = LISTINGS_PAGE): ListingsPage {
  const start = Math.max(0, Math.min(offset, Math.max(0, listings.length - 1)))
  const visible = listings.slice(start, start + page)
  const remaining = Math.max(0, listings.length - (start + page))
  return { visible, remaining, next: remaining > 0 ? 'reveal' : 'search' }
}

/** The message a 「换一批」 click sends when nothing is held back — same
 *  criteria, and the server excludes every address already shown. */
export function nextBatchPrompt(zh: boolean): string {
  return zh ? '换一批，条件不变。' : 'Show me another batch, same criteria.'
}
