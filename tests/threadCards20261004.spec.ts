import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import { splitCardsByThread, scheduledInThread, cardThreadId } from '@/lib/agent/threadCards'

const card = (id: string, status: string, thread: string | null) => ({ id, status, metadata: thread ? { thread_id: thread } : {} })
const cards = [card('a', 'pending', 'T1'), card('b', 'approved', 'T1'), card('c', 'pending', 'T2'), card('d', 'approved', null), card('e', 'executed', 'T1')]

describe('approval cards belong to their conversation (2026-10-04)', () => {
  it('a new conversation (no thread yet) has none of its own', () => {
    const r = splitCardsByThread(cards, null, true)
    expect(r.here).toEqual([])
    expect(r.elsewhere.map((c) => c.id)).toEqual(['a', 'b', 'c', 'd'])
  })
  it('an opened conversation shows only its cards', () => {
    const r = splitCardsByThread(cards, 'T1', true)
    expect(r.here.map((c) => c.id)).toEqual(['a', 'b'])
    expect(r.elsewhere.map((c) => c.id)).toEqual(['c', 'd'])
  })
  it('demo / preview chats keep every open card', () => {
    expect(splitCardsByThread(cards, null, false).here.map((c) => c.id)).toEqual(['a', 'b', 'c', 'd'])
  })
  it('countdown rows follow their card', () => {
    expect(scheduledInThread({ threadId: 'T1' }, 'T1', true)).toBe(true)
    expect(scheduledInThread({ threadId: 'T1' }, null, true)).toBe(false)
    expect(scheduledInThread({ threadId: null }, 'T1', true)).toBe(false)
    expect(scheduledInThread({}, null, false)).toBe(true)
    expect(cardThreadId({ metadata: { thread_id: 5 } })).toBeNull()
  })
  it('the workspace page scopes cards and points to the to-do page', () => {
    const page = fs.readFileSync('components/agent/AgentWorkspacePage.tsx', 'utf8')
    expect(page).toMatch(/threadScopedCards=\{live\}/)
    expect(page).toMatch(/todoHref=\{`\/\$\{role\}\/todo`\}/)
    const chat = fs.readFileSync('components/agent/AgentChat.tsx', 'utf8')
    expect(chat).toMatch(/splitCardsByThread\(pendingActions/)
    expect(chat).toMatch(/data-testid="cards-elsewhere"/)
    const hook = fs.readFileSync('lib/agent/useAgentSession.ts', 'utf8')
    expect(hook).toMatch(/threadId: cardThreadId\(card\)/)
  })
})
