// 第三批 ⑦ (user 2026-10-25: 「先主对话 + 话题，再例行任务」): one pinned 主对话 per user × hat.
//   • created on first visit and opened when no conversation is remembered in this browser;
//   • listed above the topics, undeletable (list + database trigger), rename allowed;
//   • the daily scans attach their cards to it (metadata.thread_id) so they show in that chat;
//   • 「送到话题…」 under a reply appends a copy to another conversation of the same hat.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { isEmptyThread, threadLabel } from '@/lib/agent/threadList'

const read = (p: string) => readFileSync(p, 'utf8')
const code = (p: string) => read(p).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')

describe('list helpers', () => {
  it('the main row is labelled 主对话 unless renamed, and is never hidden as empty', () => {
    const main = { id: 'm', role: 'landlord', title: null, custom_title: null, summary: null, turn_count: 0, message_count: 0, created_at: '2026-10-25T00:00:00Z', updated_at: '2026-10-25T00:00:00Z', last_message_at: null, is_main: true }
    expect(threadLabel(main, 'zh')).toBe('主对话')
    expect(threadLabel(main, 'en')).toBe('Main chat')
    expect(threadLabel({ ...main, custom_title: '和 Logic 的日常' }, 'zh')).toBe('和 Logic 的日常')
    expect(isEmptyThread(main, 'other')).toBe(false)
    expect(isEmptyThread({ ...main, is_main: false }, 'other')).toBe(true)
  })
})

describe('database', () => {
  const sql = read('supabase/migrations/20261025_agent_threads_main.sql')
  it('one main per user × hat; deleting it from the browser is refused', () => {
    expect(sql).toMatch(/create unique index if not exists agent_threads_main_uniq on public\.agent_threads \(user_id, role\) where is_main/)
    expect(sql).toMatch(/if old\.is_main and public\.is_direct_client_write\(\) then\s+raise exception 'main_thread_undeletable'/)
    expect(sql).toMatch(/before delete on public\.agent_threads/)
  })
})

describe('wiring', () => {
  it('ensureMainThread is race-safe (insert, then re-select on conflict); attachMainThread only fills a missing thread_id', () => {
    const m = code('lib/agent/mainThread.ts')
    expect(m).toContain("is_main: true, title: null, messages: [], message_count: 0")
    expect(m).toContain('if (error) return findMainThread(client, userId, role)')
    expect(m).toContain("if (typeof meta.thread_id === 'string' && meta.thread_id) { out.push(r); continue }")
  })
  it('the session opens the main chat when nothing is remembered; the scans attach their cards to it', () => {
    expect(code('lib/agent/useAgentSession.ts')).toContain('const mainId = await ensureMainThread(client, uid, role)')
    const p = code('app/api/agent/proactive/route.ts')
    expect(p.match(/\.insert\(await attachMainThread\(/g)?.length).toBe(3)
  })
  it('the list pins the main chat, calls the rest topics, and offers no delete for it', () => {
    const t = code('components/agent/ThreadList.tsx')
    expect(t).toContain('data-testid="thread-main"')
    expect(t).toContain("const mainRow = mine.find((r) => r.is_main) ?? null")
    expect(t).toContain('{!t.is_main && <button type="button" role="menuitem" onClick={() => setConfirmDelete(t.id)}')
    expect(t).toContain("{zh ? '新话题' : 'New topic'}")
    expect(t).toContain("setError(zh ? '主对话不能删除。' : 'The main chat cannot be deleted.')")
  })
  it('「送到话题…」 copies the reply as an assistant message into a same-hat topic, never the greeting', () => {
    const c = code('components/agent/AgentChat.tsx')
    expect(c).toContain('data-testid="send-to-topic"')
    expect(c).toContain("m.role === 'agent' && live && currentThreadId && m.text.trim() && i > 0 &&")
    expect(c).toContain('await appendToThread(supabase, t.id, [copy])')
    expect(c).toContain("r.role === role && r.id !== currentThreadId && !isEmptyThread(r, currentThreadId)")
  })
})
