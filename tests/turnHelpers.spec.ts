// Pure plumbing of /api/agent/turn (extracted to lib/agent/turnHelpers.ts):
// anonymous rate-limit IP bucketing, input clamps, and the model-output
// parse/salvage pipeline.
import { describe, expect, it } from 'vitest'
import {
  bucketAnonIp,
  clampMemories,
  normalizeWorkflow,
  safeParseJson,
  salvageReply,
} from '@/lib/agent/turnHelpers'
import type { MemoryItem } from '@/lib/agent/types'

describe('bucketAnonIp — IPv6 /64 bucketing', () => {
  it('leaves IPv4 addresses unchanged', () => {
    expect(bucketAnonIp('203.0.113.7')).toBe('203.0.113.7')
    expect(bucketAnonIp('unknown')).toBe('unknown')
  })

  it('buckets an uncompressed IPv6 address to its first 4 groups (/64)', () => {
    expect(bucketAnonIp('2001:0db8:abcd:0012:aaaa:bbbb:cccc:dddd')).toBe('2001:0db8:abcd:0012')
  })

  it('two addresses in the same /64 share a bucket; different /64s do not', () => {
    const a = bucketAnonIp('2001:0db8:abcd:0012:1111:2222:3333:4444')
    const b = bucketAnonIp('2001:0db8:abcd:0012:ffff:eeee:dddd:cccc')
    const c = bucketAnonIp('2001:0db8:abcd:0013:1111:2222:3333:4444')
    expect(a).toBe(b)
    expect(a).not.toBe(c)
  })

  it('never widens a compressed form beyond 4 groups', () => {
    expect(bucketAnonIp('::1').split(':').length).toBeLessThanOrEqual(4)
    expect(bucketAnonIp('2001:db8::7334').split(':').length).toBeLessThanOrEqual(4)
  })
})

describe('clampMemories — prompt-interpolated input is bounded', () => {
  const item = (over: Partial<MemoryItem> = {}): MemoryItem => ({
    key: 'k',
    label: 'k',
    value: 'v',
    memory_type: 'preference',
    confidence: 0.8,
    ...over,
  })

  it('non-array input yields an empty list', () => {
    expect(clampMemories(undefined)).toEqual([])
    expect(clampMemories({ key: 'x' })).toEqual([])
    expect(clampMemories('nope')).toEqual([])
  })

  it('caps the list at 50 items', () => {
    expect(clampMemories(Array.from({ length: 80 }, () => item()))).toHaveLength(50)
  })

  it('truncates string keys and values to 500 chars', () => {
    const [m] = clampMemories([item({ key: 'k'.repeat(900), value: 'v'.repeat(900) })])
    expect((m.key as string).length).toBe(500)
    expect((m.value as string).length).toBe(500)
  })

  it('leaves non-string values untouched', () => {
    const [m] = clampMemories([item({ value: { nested: true } })])
    expect(m.value).toEqual({ nested: true })
  })
})

describe('normalizeWorkflow — partial payloads cannot crash prompt building', () => {
  it('undefined input yields a fully-populated default state', () => {
    expect(normalizeWorkflow(undefined)).toEqual({
      workflow_type: '',
      workflow_id: null,
      current_stage: '',
      completed_steps: [],
      status: 'active',
    })
  })

  it('a partial object (missing completed_steps) still yields an array', () => {
    const w = normalizeWorkflow({ workflow_type: 'find_home', current_stage: 'search' })
    expect(w.completed_steps).toEqual([])
    expect(w.workflow_type).toBe('find_home')
  })

  it('wrong-typed fields fall back per-field, and completed_steps is capped at 20', () => {
    const w = normalizeWorkflow({
      workflow_type: 42,
      current_stage: null,
      completed_steps: Array.from({ length: 30 }, (_, i) => `s${i}`),
      status: 7,
    })
    expect(w.workflow_type).toBe('')
    expect(w.current_stage).toBe('')
    expect(w.completed_steps).toHaveLength(20)
    expect(w.status).toBe('active')
  })
})

describe('safeParseJson — tolerant model-output parsing', () => {
  it('parses bare JSON', () => {
    expect(safeParseJson('{"reply":"hi"}')).toEqual({ reply: 'hi' })
  })

  it('parses JSON inside a ```json fence', () => {
    expect(safeParseJson('```json\n{"reply":"hi"}\n```')).toEqual({ reply: 'hi' })
  })

  it('parses JSON surrounded by prose', () => {
    expect(safeParseJson('Sure, here it is: {"reply":"hi"} hope that helps')).toEqual({ reply: 'hi' })
  })

  it('returns null for prose without JSON and for broken JSON', () => {
    expect(safeParseJson('just some prose')).toBeNull()
    expect(safeParseJson('{"reply":"truncat')).toBeNull()
  })
})

describe('salvageReply — prose is kept, broken JSON never leaks to the user', () => {
  it('plain prose comes back as the reply (fences stripped)', () => {
    expect(salvageReply('多伦多冬天很冷，记得看暖气类型。')).toBe('多伦多冬天很冷，记得看暖气类型。')
    expect(salvageReply('```\nplain answer\n```')).toBe('plain answer')
  })

  it('extracts the reply value from a truncated JSON object', () => {
    const raw = '{"reply":"预算 $2,500 可以看 Liberty Village。","memory_writes":[{"key":"bud'
    expect(salvageReply(raw)).toBe('预算 $2,500 可以看 Liberty Village。')
  })

  it('unescapes \\n and \\" inside the extracted reply', () => {
    expect(salvageReply('{"reply":"line1\\nline2 \\"quoted\\"","next')).toBe('line1\nline2 "quoted"')
  })

  it('JSON-looking output without an extractable reply yields empty string', () => {
    expect(salvageReply('{"memory_writes":[],"next_stage":null')).toBe('')
    expect(salvageReply('{ broken and no reply field')).toBe('')
  })
})
