// Self-learning reflection layer (lib/agent/reflection.ts) — pure parts:
// output sanitization, prompt-block rendering, and the staleness window that
// gates the once-a-day background refresh in /api/agent/turn.
import { describe, expect, it } from 'vitest'
import { needsReflection, sanitizeUserModel, userModelToPromptBlock } from '@/lib/agent/reflection'

describe('sanitizeUserModel', () => {
  it('clamps arrays to 6 items and 60 chars, drops non-strings', () => {
    const m = sanitizeUserModel(
      {
        goals: ['a'.repeat(100), '', 42, 'b', 'c', 'd', 'e', 'f', 'g'],
        preferences: ['中文沟通'],
        constraints: [],
        communication_style: 'x'.repeat(200),
        current_focus: '把 89 Estelle 租出去',
        worked_well: null,
        avoid: 'not-an-array',
      },
      12,
    )
    expect(m).not.toBeNull()
    expect(m!.goals).toHaveLength(6)
    expect(m!.goals[0]).toHaveLength(60)
    expect(m!.goals).not.toContain('')
    expect(m!.communication_style).toHaveLength(120)
    expect(m!.worked_well).toEqual([])
    expect(m!.avoid).toEqual([])
    expect(m!.turns_analyzed).toBe(12)
    expect(m!.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('returns null for empty/garbage output — never stores a blank profile', () => {
    expect(sanitizeUserModel(null, 5)).toBeNull()
    expect(sanitizeUserModel('text', 5)).toBeNull()
    expect(sanitizeUserModel({ goals: [], preferences: [], constraints: [], communication_style: '', current_focus: '', worked_well: [], avoid: [] }, 5)).toBeNull()
  })

  it('keeps a profile that only has worked_well/avoid signal? no — needs core content', () => {
    // worked_well alone is not enough to claim we "know" the user.
    expect(sanitizeUserModel({ worked_well: ['approved renewal letters'] }, 5)).toBeNull()
  })
})

describe('userModelToPromptBlock', () => {
  it('renders only sections that have content', () => {
    const block = userModelToPromptBlock({
      goals: ['把 89 Estelle 租出去'],
      preferences: [],
      constraints: ['预算 $3,000 以内'],
      communication_style: '简短直接，中文',
      current_focus: '筛查申请人',
      worked_well: [],
      avoid: ['长篇模板邮件'],
      updated_at: '2026-08-24',
      turns_analyzed: 10,
    })
    expect(block).toContain('长期理解')
    expect(block).toContain('把 89 Estelle 租出去')
    expect(block).toContain('预算 $3,000 以内')
    expect(block).toContain('避免: 长篇模板邮件')
    expect(block).not.toContain('- 偏好:')
    expect(block).toContain('memory_writes')
  })

  it('returns empty string for null/empty/malformed values', () => {
    expect(userModelToPromptBlock(null)).toBe('')
    expect(userModelToPromptBlock(undefined)).toBe('')
    expect(userModelToPromptBlock({})).toBe('')
    expect(userModelToPromptBlock('bogus')).toBe('')
  })
})

describe('needsReflection — the once-a-day gate', () => {
  const now = Date.parse('2026-08-24T12:00:00Z')
  it('true when no profile exists yet', () => {
    expect(needsReflection(null, now)).toBe(true)
    expect(needsReflection({ updated_at: null }, now)).toBe(true)
    expect(needsReflection({ updated_at: 'garbage' }, now)).toBe(true)
  })
  it('false within the 20h window, true after', () => {
    expect(needsReflection({ updated_at: '2026-08-24T02:00:00Z' }, now)).toBe(false)
    expect(needsReflection({ updated_at: '2026-08-23T10:00:00Z' }, now)).toBe(true)
  })
})
