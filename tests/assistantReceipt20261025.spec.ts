// 第一批 of design/assistant-messaging-benchmark-2026-10-24.md (user 2026-10-25: 「按方案从第一批开始」):
// ① the turn receipt (what the turn READ and DID, built server-side from real loads, rendered under the
//    reply) + a one-line sign-off rule in the prompt; ② the conversation list's outcome line comes from
//    the receipt; ③ 「记住了：…」 memory notes and the panel's status line (connected / preview).
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { humanValue, memoryNoteLines, receiptIsEmpty, receiptSummary, type TurnReceipt } from '@/lib/agent/receipt'
import { threadSummary } from '@/lib/agent/threads'
import { dropDoneSignOff } from '@/lib/agent/guardrail'
import type { ChatMessage } from '@/lib/agent/types'

const read = (p: string) => readFileSync(p, 'utf8')
const code = (p: string) => read(p).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')

const receipt: TurnReceipt = {
  read: [{ kind: 'snapshot', zh: '读了你的数据：租约 2（生效 1）', en: 'Read your data: 2 leases (1 in force)' }],
  did: [{ kind: 'market', zh: '查了 CMHC / 统计局租金基准（North York）', en: 'Checked the CMHC / StatCan rent benchmark (North York)' }, { kind: 'card', zh: '出了待批卡：发租金提醒', en: 'Proposed a card for your approval: rent reminder' }],
}

describe('receipt helpers', () => {
  it('memory notes: label + value, trimmed, at most four, nothing for no writes', () => {
    const notes = memoryNoteLines([
      { key: 'move_in', label: '搬家时间', value: '2 月初', confidence: 0.9, memory_type: 'preference' },
      { key: 'budget', label: '预算', value: 2400, confidence: 0.8, memory_type: 'constraint' },
      { key: 'x', label: '', value: { a: 1 }, confidence: 0.5, memory_type: 'semantic' },
    ], true)
    expect(notes).toEqual(['记住了：搬家时间：2 月初', '记住了：预算：2400', '记住了：x：a 1'])
    // Objects read like a person wrote them: the summary-like field wins, else a few primitive fields; never raw JSON.
    expect(humanValue({ policy: '每月1号收租，逾期3天以内不催缴', rent_due_day: 1, grace_period_days: 3 })).toBe('每月1号收租，逾期3天以内不催缴')
    expect(humanValue({ rent_due_day: 1, grace_period_days: 3, nested: { x: 1 } })).toBe('rent due day 1，grace period days 3')
    expect(humanValue(['猫', '狗'])).toBe('猫、狗')
    expect(memoryNoteLines([{ key: 'k', label: 'Budget', value: '2400', confidence: 1, memory_type: 'profile' }], false)).toEqual(['Remembered: Budget: 2400'])
    expect(memoryNoteLines([], true)).toEqual([])
    expect(memoryNoteLines(null, true)).toEqual([])
    const many = Array.from({ length: 6 }, (_, i) => ({ key: `k${i}`, label: `L${i}`, value: 'v', confidence: 1, memory_type: 'profile' }))
    expect(memoryNoteLines(many, true)).toHaveLength(4)
  })
  it('summary prefers what was done, falls back to what was read, counts memories', () => {
    expect(receiptSummary(receipt, null, true)).toBe('查了 CMHC / 统计局租金基准（North York） · 出了待批卡：发租金提醒')
    expect(receiptSummary({ read: receipt.read, did: [] }, ['记住了：x'], true)).toBe('读了你的数据：租约 2（生效 1） · 记住 1 条')
    expect(receiptSummary({ read: [], did: [] }, null, true)).toBeNull()
    expect(receiptSummary(receipt, null, false)).toMatch(/^Checked the CMHC/)
    expect(receiptIsEmpty({ read: [], did: [] })).toBe(true)
    expect(receiptIsEmpty(receipt)).toBe(false)
  })
})

describe('② conversation list outcome line', () => {
  const msg = (over: Partial<ChatMessage>): ChatMessage => ({ id: 'm', role: 'agent', text: '好的，我看了你的租约，下面是建议……', ...over })
  it('uses the receipt when the last reply has one, else the flattened prose', () => {
    expect(threadSummary([{ id: 'u', role: 'user', text: '帮我看看' }, msg({ receipt })])).toBe('查了 CMHC / 统计局租金基准（North York） · 出了待批卡：发租金提醒')
    expect(threadSummary([{ id: 'u', role: 'user', text: '帮我看看' }, msg({})])).toMatch(/^好的，我看了你的租约/)
    // The receipt of the LAST agent message wins, not an older one.
    expect(threadSummary([msg({ receipt }), msg({ id: 'm2', text: '再说一句。' })])).toBe('再说一句。')
  })
})

describe('wiring', () => {
  it('the turn route builds the receipt from real loads and returns it; the mapping and the session carry it to the message', () => {
    const r = code('app/api/agent/turn/route.ts')
    expect(r).toContain('buildUserContextDetailed(sbAuth, role, turnUserId)')
    expect(r).toMatch(/const receipt: TurnReceipt = \{ read: \[\], did: \[\] \}/)
    expect(r).toContain("if (memories.length) receipt.read.push({ kind: 'memories'")
    expect(r).toContain("if (docs.length) receipt.read.push({ kind: 'documents'")
    expect(r).toContain("if (draftListing) receipt.did.push({ kind: 'draft'")
    expect(r).toContain("if (!anonymous && out.proposedAction) receipt.did.push({ kind: 'card'")
    expect(r).toMatch(/draft_listing: draftListing,\s*receipt,/)
    expect(code('lib/agent/orchestrator.ts')).toContain('receipt: turn.receipt,')
    const s = code('lib/agent/useAgentSession.ts')
    expect(s.match(/receipt = turn\.receipt/g)?.length).toBe(2)
    expect(s).toContain('memoryNotes: memoryNotes.length ? memoryNotes : undefined')
  })
  it('the chat renders the receipt card under the reply; the panel shows the status line', () => {
    const c = code('components/agent/AgentChat.tsx')
    expect(c).toContain('data-testid="turn-receipt"')
    expect(c).toContain('data-testid="memory-note"')
    expect(c).toContain('<TurnReceiptCard receipt={m.receipt} memoryNotes={m.memoryNotes} zh={zh} />')
    const p = code('components/agent/AssistantPanel.tsx')
    expect(p.match(/data-testid="assistant-status"/g)?.length).toBe(2)
    expect(p).toContain("'预览 · 未登录，只看不记'")
    expect(p).toContain('已连接 · 读取${STATUS_READS[role].zh}')
  })
  it('the prompt asks for the sign-off only when waiting or missing something — never 「办完了。」(user 2026-10-27); the snapshot builder reports its counts', () => {
    const p = read('lib/agent/prompts.ts')
    expect(p).toContain('「等你点头。」')
    expect(p).toContain('不要写「办完了」')
    expect(p).not.toContain('「办完了。」(本轮该做的都做了)')
    expect(code('app/api/cron/agent-routines/route.ts')).not.toContain('办完了')
    expect(code('lib/agent/guardrail.ts')).toContain('reply = dropDoneSignOff(reply)')
    expect(dropDoneSignOff('好的，下面是建议。\n\n办完了。')).toBe('好的，下面是建议。')
    expect(dropDoneSignOff('Here is the plan.\n\nDone.')).toBe('Here is the plan.')
    expect(dropDoneSignOff('已发出去。\n\n等你点头。')).toBe('已发出去。\n\n等你点头。')
    expect(dropDoneSignOff('还缺：入住日期。')).toBe('还缺：入住日期。')
    expect(dropDoneSignOff('这件事办完了，下一步是签字。')).toBe('这件事办完了，下一步是签字。')
    const u = code('lib/agent/userContext.ts')
    expect(u).toContain('export async function buildUserContextDetailed')
    expect(u).toMatch(/read: \{ applications: appRows\.length, screenings: scr\.length, leases: leaseRows\.length/)
  })
})
