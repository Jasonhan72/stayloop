// 2026-10-13: publishing can start in the AI chat too — the guided card has a
// photo step, chat-attached photos become the draft card's photos, and the
// model may read visible facts from them (never policies).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { intakeFor } from '@/lib/agent/intake'

const read = (p: string) => readFileSync(p, 'utf8')

describe('listing from the chat', () => {
  it('the landlord 「发布房源」 card has an optional photo step', () => {
    const list = intakeFor('list')!
    const photos = list.steps.find((st) => st.key === 'photos')!
    expect(photos.attach).toBe(true)
    expect(photos.optional).toBe(true)
    expect(list.outline.zh).toContain('照片')
  })
  it('chat-attached photos become the new draft card’s photos and the buffer empties', () => {
    const s = read('lib/agent/useAgentSession.ts')
    expect(s).toContain("a.isImage && a.dataUrl.startsWith('data:image/')")
    expect(s).toContain('draftListing = { ...draftListing, images: photoAttachRef.current }')
    expect(s).toContain('photoAttachRef.current = []')
    // an owned-listing rewrite keeps the stored photos
    expect(s).toMatch(/!draftListing\.listing_id && \(!draftListing\.images/)
  })
  it('the landlord prompt lets the model fill visible facts from photos but never policies', () => {
    const p = read('lib/agent/prompts.ts')
    expect(p).toContain('可以只填照片里看得见的事实')
    expect(p).toContain('政策项永远只按用户所说')
  })
})
