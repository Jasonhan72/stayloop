import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import { groupThreads, filterThreads, threadGroupKey, threadLabel } from '@/lib/agent/threadList'

const now = new Date(2026, 9, 4, 12, 0)
const row = (id: string, at: string, title: string | null = id, summary: string | null = null) => ({ id, title, summary, last_message_at: at, updated_at: at })

describe('conversation list (2026-10-04)', () => {
  it('groups by when a conversation last moved, newest first', () => {
    const rows = [
      row('old', new Date(2026, 6, 1).toISOString()),
      row('today2', new Date(2026, 9, 4, 11).toISOString()),
      row('yday', new Date(2026, 9, 3, 9).toISOString()),
      row('today1', new Date(2026, 9, 4, 1).toISOString()),
      row('week', new Date(2026, 8, 30).toISOString()),
      row('month', new Date(2026, 8, 15).toISOString()),
    ]
    const g = groupThreads(rows, 'zh', now)
    expect(g.map((x) => x.label)).toEqual(['今天', '昨天', '过去 7 天', '过去 30 天', '更早'])
    expect(g[0].rows.map((r) => r.id)).toEqual(['today2', 'today1'])
    expect(threadGroupKey(new Date(2026, 9, 3, 23, 59).toISOString(), now)).toBe('yesterday')
  })
  it('search matches the title and the last reply', () => {
    const rows = [row('a', now.toISOString(), '帮我找房', '找到 6 套'), row('b', now.toISOString(), '报修', 'Bathroom leak')]
    expect(filterThreads(rows, 'LEAK').map((r) => r.id)).toEqual(['b'])
    expect(filterThreads(rows, '6 套').map((r) => r.id)).toEqual(['a'])
    expect(filterThreads(rows, '  ').length).toBe(2)
  })
  it('an untitled conversation is named by what it said or when — never 「新对话」 next to the 新对话 button', () => {
    expect(threadLabel({ title: null, summary: '明白。请直接告诉我需求——是找房还是报修？' }, 'zh')).toBe('明白。请直接告诉我需求——是找房还是报修？')
    expect(threadLabel({ title: '  ', last_message_at: new Date(2026, 9, 3, 12).toISOString() }, 'zh')).toBe('10月3日的对话')
    expect(threadLabel({ title: null, last_message_at: new Date(2026, 9, 3, 12).toISOString() }, 'en')).toBe('Chat · Oct 3')
    expect(threadLabel({ title: null }, 'zh')).not.toBe('新对话')
    expect(threadLabel({ title: '我要报修：【哪里】', custom_title: '【厨房】水槽漏水' }, 'zh')).toBe('【厨房】水槽漏水') // a typed name is kept as typed
  })
  it('a rename survives saves: it lives in custom_title, which saves never touch', () => {
    const t = fs.readFileSync('lib/agent/threads.ts', 'utf8')
    expect(t).toMatch(/custom_title: v \|\| null/)
    const save = t.slice(t.indexOf('export async function saveThread'), t.indexOf('export async function appendToThread'))
    expect(save).not.toMatch(/custom_title/)
    expect(t).toContain('custom_title: (r.custom_title as string | null) ?? null,')
    expect(fs.readFileSync('supabase/migrations/20261004_agent_threads_custom_title.sql', 'utf8')).toMatch(/add column if not exists custom_title/)
  })
  it('the assistant page shows the list: a column from xl, a drawer elsewhere, a toggle in the chat', () => {
    const p = fs.readFileSync('components/agent/AgentWorkspacePage.tsx', 'utf8')
    expect(p).toMatch(/variant="column"/)
    expect(p).toMatch(/variant="drawer"/)
    expect(p).toMatch(/data-testid="thread-list-toggle"/)
    expect(p).toMatch(/onNewThread=\{newThread\}/)
    const c = fs.readFileSync('components/agent/ThreadList.tsx', 'utf8')
    expect(c).toMatch(/router\.push\(`\/\$\{t\.role\}\/agent\?thread=\$\{t\.id\}`\)/)
    expect(c).toMatch(/if \(id === currentThreadId\) onNewThread\(\)/)
  })
})
