// RENEWAL_INTENT_RE — the deterministic first line of the renewal lane.
// A hit suppresses listing cards (the tenant is negotiating, not moving),
// so both false negatives AND false positives are product bugs.
import { describe, expect, it } from 'vitest'
import { AGENT_LEASING_FACTS, RENEWAL_INTENT_RE, buildSystemPrompt } from '@/lib/agent/prompts'

describe('RENEWAL_INTENT_RE — renewal/negotiation intent detection', () => {
  const HITS = [
    '我想续约，需要注意什么？',
    '房东要涨租，合理吗？',
    '租金上涨了 5%，我能拒绝吗？',
    '收到 N1 表怎么办',
    '跟房东谈租金有什么技巧',
    'I want to renew my lease next month',
    'my landlord proposed a rent increase of 4%',
    'how do I negotiate with my landlord',
    'what is an above-guideline increase?',
    '到期后转 month-to-month 可以吗',
    '想续租但房东要加租',
  ]

  it.each(HITS)('matches renewal intent: %s', (msg) => {
    expect(RENEWAL_INTENT_RE.test(msg)).toBe(true)
  })

  const MISSES = [
    '帮我找两居室公寓，预算 $2,500',
    '有没有宠物友好的房源？',
    '这个小区安全吗，通勤方便吗',
    'help me find a 2 bedroom apartment near High Park',
    'what documents do I need to apply for this unit?',
    '押金一般要交多少？',
    'can you show me condos downtown under $2,800',
  ]

  it.each(MISSES)('does not match ordinary search/apply intent: %s', (msg) => {
    expect(RENEWAL_INTENT_RE.test(msg)).toBe(false)
  })

  it('is not a global regex (repeated .test calls stay consistent)', () => {
    expect(RENEWAL_INTENT_RE.global).toBe(false)
    expect(RENEWAL_INTENT_RE.test('续约')).toBe(true)
    expect(RENEWAL_INTENT_RE.test('续约')).toBe(true)
  })
})

// 2026-09-13: the agent quick cards (租客筛查 / 挂牌定价 / 租约与押金 /
// 合规边界) rely on Brief actually having these rule blocks. If someone
// trims the prompt, the cards would promise what the model cannot do.
describe('agent (Brief) system prompt', () => {
  const wf = { workflow_type: 'general', workflow_id: null, current_stage: 'idle', completed_steps: [], status: 'active' as const }
  const p = buildSystemPrompt('agent', 'Brief', [], wf)
  it('carries the screening hand-off to /screening/app with the landlord-decides rule', () => {
    expect(p).toContain('/screening/app')
    expect(p).toContain('由房东本人决定')
    expect(p).toContain('RTA s.134')
  })
  it('carries the pricing rule (search → real listings + TRREB, no hand-written prices)', () => {
    expect(p).toContain('挂牌定价')
    expect(p).toContain('TRREB')
    expect(p).toContain('绝不要自己手写任何具体价格数字')
  })
  it('carries the Ontario leasing fact pack and nothing beyond it', () => {
    expect(p).toContain(AGENT_LEASING_FACTS)
    expect(AGENT_LEASING_FACTS).toContain('RTA s.106')
    expect(AGENT_LEASING_FACTS).toContain('Information Guide')
    expect(AGENT_LEASING_FACTS).toContain('TRESA s.32')
  })
  it('does not leak the agent blocks into the tenant prompt', () => {
    const t = buildSystemPrompt('tenant', 'Nova', [], wf)
    expect(t).not.toContain('挂牌定价')
    expect(t).not.toContain(AGENT_LEASING_FACTS)
  })
})
