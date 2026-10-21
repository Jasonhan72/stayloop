// @vitest-environment jsdom
// Site test 2026-10-02 (design/test-plan-2026-09-22.md against deploy a1fab56) · group G5.
//  L6-authed D4 — ThreadPanel scrolled the whole page to the thread on load (scrollIntoView
//                 scrolls every scrollable ancestor; the landlord applicant page opened 933px down).
//  L6-authed D6 — the 「查看这件事 →」 link sat inside a `truncate` line in the /messages header
//                 and was clipped off-screen at 390px.
//  L6-authed D7 — icon-only buttons on the AI draft-listing card had no accessible name.
//  L7-signed-in D5 — the tenant new-ticket modal did not close on Escape.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import React from 'react'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { all, textOf } from './helpers/dom'

const lang = vi.hoisted(() => ({ value: 'zh' as 'zh' | 'en' }))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => React.createElement('a', { href, ...rest }, children) }))
vi.mock('@/lib/i18n', () => ({ useT: () => ({ lang: lang.value, t: (_k: string, f?: string) => f ?? _k }) }))
vi.mock('@/lib/useAuth', () => ({ useAuth: () => ({ user: null, loading: false, role: null, setRole: () => {} }) }))
vi.mock('@/lib/aiName', () => ({ useAIName: () => 'AI 助理' }))
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() }, getSupabaseBrowser: () => ({}) }))
vi.mock('@/lib/favorites', () => ({ favKey: () => 'k', useFavorites: () => ({ isFav: () => false, toggle: () => {} }) }))
vi.mock('@/components/messages/MessageButton', () => ({ default: () => null }))

import NewTicketModal from '../components/tenant/NewTicketModal'
import DraftListingChatCard from '../components/agent/DraftListingChatCard'
import ListingChatCard from '../components/agent/ListingChatCard'

const read = (p: string) => readFileSync(p, 'utf8')

// The test renders in jsdom: the components get a real window/document to carry listeners.
afterEach(() => { cleanup(); vi.unstubAllGlobals(); lang.value = 'zh' })

const key = (k: string) => fireEvent.keyDown(window, { key: k })

describe('L7 D5 · tenant new-ticket modal closes on Escape', () => {
  it('Escape calls onClose; other keys do not; the listener goes away on unmount', () => {
    const onClose = vi.fn()
    const r = render(<NewTicketModal onClose={onClose} />)
    key('Enter')
    expect(onClose).not.toHaveBeenCalled()
    key('Escape')
    expect(onClose).toHaveBeenCalledTimes(1)
    r.unmount()
    key('Escape')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Escape does nothing mid-submit, like the disabled Cancel button', () => {
    const src = read('components/tenant/NewTicketModal.tsx')
    expect(src).toMatch(/e\.key === 'Escape' && !busyRef\.current\) onClose\(\)/)
  })
})

describe('L6 D7 · icon-only buttons on the agent listing cards have names in both languages', () => {
  const draft = { address: '100 King St W', monthly_rent: 2800, bedrooms: 1, images: ['https://cdn.example/a.jpg', 'https://cdn.example/b.jpg'] }
  // No aria-label and no words → only an icon or a glyph like ‹ ›.
  const unnamed = (r: ReturnType<typeof render>) =>
    all(r.container, 'button').filter((b) => !b.getAttribute('aria-label') && !/[\p{L}\p{N}]/u.test(textOf(b)))
  const ariaLabels = (r: ReturnType<typeof render>) => all(r.container, 'button').map((b) => b.getAttribute('aria-label'))

  for (const l of ['zh', 'en'] as const) {
    it(`DraftListingChatCard (${l})`, () => {
      lang.value = l
      const r = render(<DraftListingChatCard draft={draft} />)
      expect(unnamed(r)).toEqual([])
      const labels = ariaLabels(r).filter(Boolean)
      expect(labels).toContain(l === 'zh' ? '再添加照片' : 'Add more photos')
      expect(labels).toContain(l === 'zh' ? '上一张照片' : 'Previous photo')
      expect(labels).toContain(l === 'zh' ? '下一张照片' : 'Next photo')
      r.unmount()
    })

    it(`DraftListingChatCard without photos (${l})`, () => {
      lang.value = l
      const r = render(<DraftListingChatCard draft={{ ...draft, images: [] }} />)
      expect(unnamed(r)).toEqual([])
      expect(ariaLabels(r)).toContain(l === 'zh' ? '添加照片' : 'Add photos')
      r.unmount()
    })

    it(`ListingChatCard favourite heart (${l})`, () => {
      lang.value = l
      const card = { id: 'x', source: 'stayloop' as const, title: 'Unit 1207', address: '100 King St W', price: 2800, beds: 1 }
      const r = render(<ListingChatCard l={card} />)
      expect(unnamed(r)).toEqual([])
      expect(ariaLabels(r)).toContain(l === 'zh' ? '收藏' : 'Save to favorites')
      r.unmount()
    })
  }
})

describe('L6 D4 · ThreadPanel scrolls only its own message list', () => {
  const src = read('components/threads/ThreadPanel.tsx')
  it('never calls scrollIntoView (it scrolls the document too)', () => {
    expect(src).not.toMatch(/\.scrollIntoView\(/)
  })
  it('scrolls the list container itself to the bottom', () => {
    expect(src).toMatch(/<div ref=\{listRef\}[^>]*overflow-y-auto/)
    expect(src).toMatch(/el\.scrollTop = el\.scrollHeight/)
  })
})

describe('L6 D7 · the thread composer controls are named (a placeholder is not a label)', () => {
  const src = read('components/threads/ThreadPanel.tsx')
  it('textarea and the 📎 button carry aria-labels in both languages', () => {
    expect(src).toMatch(/data-testid="thread-input" aria-label=\{zh \? '输入消息' : 'Message'\}/)
    expect(src).toMatch(/aria-label=\{zh \? '添加附件' : 'Add attachment'\} title=\{zh \? '附件/)
  })
})

describe('L6 D6 · the 「查看这件事」 link is never clipped by the subject line', () => {
  const src = read('components/messages/MessageCenter.tsx')
  it('only the subject truncates; the link is flex-none and outside the truncated span', () => {
    const i = src.indexOf('data-testid="conversation-subject"')
    expect(i).toBeGreaterThan(0)
    const block = src.slice(src.lastIndexOf('<div', i), src.indexOf('</div>', i))
    expect(block).not.toMatch(/className="[^"]*\btruncate\b[^"]*"[^>]*data-testid="conversation-subject"/)
    expect(block).toMatch(/<span className="min-w-0 truncate">\{zh \? '关于 ' : 'About '\}\{matterOf\(current\)\}<\/span>/)
    expect(block).toMatch(/className="flex-none whitespace-nowrap text-brand" data-testid="open-matter"/)
  })
})
