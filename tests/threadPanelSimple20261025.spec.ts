// 消息气泡「更简单直接」(user 2026-10-25, the Grok-bot look): a centred stamp when the day changes or an
// hour passes, the sender named once per run of their messages (outside the bubble, never for your own),
// bare bubbles, the run's time under its last bubble, no per-line mono header and no per-line ✓ 你已确认.
// The record itself is unchanged: hash chain, retract, acknowledge, formal copies, attachments all stay.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const code = (p: string) => readFileSync(p, 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')

describe('thread panel bubbles', () => {
  const p = code('components/threads/ThreadPanel.tsx')
  it('stamps at breaks, sender once per run, time under the run', () => {
    expect(p).toContain('data-testid="thread-timestamp"')
    expect(p).toContain('const breakBefore = !prev || dayOf(prev.created_at) !== dayOf(m.created_at) || Date.parse(m.created_at) - Date.parse(prev.created_at) > 3_600_000')
    expect(p).toContain('{!sameRunAsPrev && !isMine && <div className="mb-0.5 mt-1 pl-1 text-[11px] text-body-3" data-testid="bubble-sender">')
    expect(p).toContain('{lastOfRun && (')
    expect(p).toMatch(/const stampOf = \(iso: string, z: boolean\) => \{/)
  })
  it('no per-line mono header or per-line acknowledged tick; the record controls remain', () => {
    // The old per-bubble header row (mono name · role · time inside every bubble) is gone; the unread badge in the header may keep its mono.
    expect(p).not.toContain('mb-0.5 flex flex-wrap items-baseline gap-x-2 font-mono')
    expect(p).not.toContain('你已确认')
    for (const t of ['data-testid="read-state"', 'data-testid="acknowledge"', 'data-testid="thread-retracted"', 'data-testid="thread-retract"', 'data-testid="thread-channel"', 'data-testid="thread-attachments"']) expect(p).toContain(t)
    expect(p).toContain("'正式通知副本' : 'FORMAL COPY'")
  })
  it('the footer is one short line; the long explanation moved to its title', () => {
    expect(p).toContain("'记录只追加：撤回不删原文 · 每条带服务器时间与哈希'")
    expect(p).toMatch(/title=\{zh \? `时间按 \$\{tz\} 显示/)
  })
})
