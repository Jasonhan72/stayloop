'use client'
// Open the conversation of a matter (找得到人 2026-09-30). Resolves on click —
// never one RPC per list row. An existing thread opens with the composer
// focused; a matter with no thread yet opens the message centre's compose sheet
// bound to that matter. Drafts travel in sessionStorage, never in the URL (no
// names, addresses or ticket text in query strings).
import { supabase } from '@/lib/supabase'
import type { ThreadKind } from '@/lib/threads/shared'

export type ThreadTarget = { kind: ThreadKind; ref: string; listingId?: string | null; threadId?: string | null; draft?: string | null }

const DRAFT_PREFIX = 'sl-msg-draft:'
export const draftKey = (kind: string, ref: string) => `${DRAFT_PREFIX}${kind}:${ref}`

export function stashDraft(kind: string, ref: string, text: string | null | undefined) {
  if (!text) return
  try { window.sessionStorage.setItem(draftKey(kind, ref), text.slice(0, 2000)) } catch { /* private mode */ }
}
/** Read and clear a stashed draft. */
export function takeDraft(kind: string, ref: string): string | null {
  try {
    const k = draftKey(kind, ref)
    const v = window.sessionStorage.getItem(k)
    if (v != null) window.sessionStorage.removeItem(k)
    return v
  } catch { return null }
}

export async function resolveThreadHref(t: ThreadTarget): Promise<string> {
  stashDraft(t.kind, t.ref, t.draft)
  let id = t.threadId ?? null
  if (!id) {
    const { data } = t.kind === 'listing_inquiry' && t.listingId
      ? await supabase.rpc('find_listing_thread', { p_listing: t.listingId })
      : await supabase.rpc('find_thread', { p_kind: t.kind, p_ref: t.ref })
    id = data ? String(data) : null
  }
  return id ? `/messages?t=${id}&compose=1` : `/messages?new=${t.kind}:${t.ref}`
}
