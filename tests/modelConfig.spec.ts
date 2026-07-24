// Model-slot config — the whitelist/sanitize layer must never let a dirty DB
// value, an unknown model id, or a PII-sensitive slot assignment through.
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ALLOWED_MODELS,
  DEFAULT_MODELS,
  MODEL_SLOTS,
  getModelDef,
  sanitize,
  supportsAssistantPrefill,
  supportsTemperature,
} from '@/lib/modelConfig'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('sanitize — dirty values fall back to defaults', () => {
  it('null / non-object raw returns the defaults', () => {
    expect(sanitize(null)).toEqual(DEFAULT_MODELS)
    expect(sanitize(undefined)).toEqual(DEFAULT_MODELS)
    expect(sanitize('garbage')).toEqual(DEFAULT_MODELS)
    expect(sanitize(42)).toEqual(DEFAULT_MODELS)
  })

  it('unknown model ids are replaced by the slot default', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key')
    const out = sanitize({ turn: 'gpt-4o', screening: 'totally-made-up' })
    expect(out.turn).toBe(DEFAULT_MODELS.turn)
    expect(out.screening).toBe(DEFAULT_MODELS.screening)
  })

  it('non-string slot values are ignored', () => {
    const out = sanitize({ turn: 123, classify: { id: 'claude-haiku-4-5' }, forensics: null })
    expect(out).toEqual(DEFAULT_MODELS)
  })

  it('a whitelisted model with its provider key configured is accepted', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key')
    const out = sanitize({ turn: 'claude-haiku-4-5' })
    expect(out.turn).toBe('claude-haiku-4-5')
  })

  it('a whitelisted model WITHOUT its provider key falls back to the default', () => {
    vi.stubEnv('DEEPSEEK_API_KEY', '')
    const out = sanitize({ turn: 'deepseek-v4-flash' })
    expect(out.turn).toBe(DEFAULT_MODELS.turn)
  })

  it('unmentioned slots always resolve to their defaults', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key')
    const out = sanitize({ turn: 'claude-opus-4-8' })
    expect(out.screening).toBe(DEFAULT_MODELS.screening)
    expect(out.classify).toBe(DEFAULT_MODELS.classify)
    expect(out.forensics).toBe(DEFAULT_MODELS.forensics)
  })
})

describe('allowedSlots — 国产 openai-compat models are locked out of PII slots', () => {
  it('deepseek-v4-flash in the screening slot is rejected even with its key configured', () => {
    vi.stubEnv('DEEPSEEK_API_KEY', 'test-key')
    const out = sanitize({ screening: 'deepseek-v4-flash', forensics: 'deepseek-v4-flash', classify: 'deepseek-v4-flash' })
    expect(out.screening).toBe(DEFAULT_MODELS.screening)
    expect(out.forensics).toBe(DEFAULT_MODELS.forensics)
    expect(out.classify).toBe(DEFAULT_MODELS.classify)
  })

  it('deepseek-v4-flash IS accepted in the turn slot when its key is configured', () => {
    vi.stubEnv('DEEPSEEK_API_KEY', 'test-key')
    expect(sanitize({ turn: 'deepseek-v4-flash' }).turn).toBe('deepseek-v4-flash')
  })

  it('structural invariant: every non-Anthropic model is turn-only', () => {
    for (const m of ALLOWED_MODELS.filter((m) => m.provider !== 'anthropic')) {
      expect(m.allowedSlots, `${m.id} allowedSlots`).toEqual(['turn'])
      expect(m.vision, `${m.id} must not claim vision`).toBe(false)
      expect(m.baseUrl, `${m.id} needs baseUrl`).toMatch(/^https:\/\//)
    }
  })

  it('structural invariant: every default model is whitelisted and slot-allowed', () => {
    for (const slot of MODEL_SLOTS) {
      const def = getModelDef(DEFAULT_MODELS[slot])
      expect(def, `default for ${slot} must be whitelisted`).toBeDefined()
      expect(def!.allowedSlots).toContain(slot)
      expect(def!.provider).toBe('anthropic')
    }
  })
})

describe('capability helpers', () => {
  it('supportsTemperature: newer generations reject sampling params', () => {
    expect(supportsTemperature('claude-sonnet-4-6')).toBe(true)
    expect(supportsTemperature('claude-haiku-4-5')).toBe(true)
    expect(supportsTemperature('claude-sonnet-5')).toBe(false)
    expect(supportsTemperature('claude-opus-4-8')).toBe(false)
  })

  it('supportsAssistantPrefill: only Haiku 4.5 in the whitelist accepts prefill', () => {
    expect(supportsAssistantPrefill('claude-haiku-4-5')).toBe(true)
    expect(supportsAssistantPrefill('claude-sonnet-4-6')).toBe(false)
    expect(supportsAssistantPrefill('claude-sonnet-5')).toBe(false)
  })
})
