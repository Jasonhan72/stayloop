// Model catalogue (2026-08-21): admin-managed rows merge over the builtins,
// the security allow-list rejects key-exfiltration shapes, and a user's pick
// is honoured only while it is still a legitimate choice.
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BUILTIN_CATALOG,
  BUILTIN_MODELS,
  DEFAULT_MODELS,
  baseUrlAllowedFor,
  mergeCatalog,
  pickUserModel,
  rowToModel,
  sanitize,
} from '@/lib/modelConfig'

afterEach(() => vi.unstubAllEnvs())

const okRow = {
  id: 'qwen3-max', label: 'Qwen3 Max', note: 'n', provider: 'openai-compat', base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  api_key_env: 'DASHSCOPE_API_KEY', vision: false, cost_tier: '中', allowed_slots: ['turn'], omit_temperature: false, max_tokens_param: 'max_tokens',
  user_selectable: true, enabled: true, sort_order: 500,
}

describe('rowToModel — security allow-list', () => {
  it('accepts a well-formed row', () => {
    const m = rowToModel(okRow)!
    expect(m.id).toBe('qwen3-max')
    expect(m.provider).toBe('openai-compat')
    expect(m.allowedSlots).toEqual(['turn'])
    expect(m.builtin).toBe(false)
  })
  it('rejects an env var that is not a registered provider key (no Bearer exfil of service-role etc.)', () => {
    expect(rowToModel({ ...okRow, api_key_env: 'SUPABASE_SERVICE_ROLE_KEY', base_url: 'https://evil.example/v1' })).toBeNull()
    expect(rowToModel({ ...okRow, api_key_env: 'ANTHROPIC_API_KEY', provider: 'openai-compat', base_url: 'https://evil.example/v1' })).toBeNull()
  })
  it('rejects a base URL whose host is not on that key\'s allow-list, or non-https', () => {
    expect(rowToModel({ ...okRow, base_url: 'https://evil.example/v1' })).toBeNull()
    expect(rowToModel({ ...okRow, base_url: 'http://dashscope.aliyuncs.com/compatible-mode/v1' })).toBeNull()
    expect(baseUrlAllowedFor('OPENAI_API_KEY', 'https://api.openai.com/v1')).toBe(true)
    expect(baseUrlAllowedFor('OPENAI_API_KEY', 'https://user:pw@api.openai.com/v1')).toBe(false)
    expect(baseUrlAllowedFor('CUSTOM_LLM_API_KEY_1', 'https://my-gateway.example/v1')).toBe(true)
    expect(baseUrlAllowedFor('ANTHROPIC_API_KEY', undefined)).toBe(true)
  })
  it('clamps document slots for text-only models even if the row claims them', () => {
    const m = rowToModel({ ...okRow, allowed_slots: ['turn', 'screening', 'forensics'] })!   // vision:false
    expect(m.allowedSlots).toEqual(['turn'])
    const a = rowToModel({ ...okRow, id: 'claude-x', provider: 'anthropic', api_key_env: 'ANTHROPIC_API_KEY', base_url: null, vision: true, allowed_slots: ['turn', 'screening'] })!
    expect(a.allowedSlots).toEqual(['turn', 'screening'])
  })
  it('rejects malformed ids and unknown providers', () => {
    expect(rowToModel({ ...okRow, id: 'bad id with spaces' })).toBeNull()
    expect(rowToModel({ ...okRow, provider: 'mystery' })).toBeNull()
    expect(rowToModel(null)).toBeNull()
  })
})

describe('mergeCatalog', () => {
  it('with no rows = the builtins', () => {
    expect(mergeCatalog(null).map((m) => m.id)).toEqual(BUILTIN_CATALOG.map((m) => m.id))
  })
  it('a row with a builtin id overrides it (disable/relabel); unknown ids append; invalid rows are skipped', () => {
    const cat = mergeCatalog([
      { ...okRow },
      { ...okRow, id: 'gpt-5.4', label: 'GPT-5.4 (paused)', enabled: false, api_key_env: 'OPENAI_API_KEY', base_url: 'https://api.openai.com/v1', sort_order: 90 },
      { ...okRow, id: 'evil', base_url: 'https://evil.example' },
    ])
    expect(cat.find((m) => m.id === 'qwen3-max')).toBeTruthy()
    const g = cat.find((m) => m.id === 'gpt-5.4')!
    expect(g.enabled).toBe(false)
    expect(g.label).toBe('GPT-5.4 (paused)')
    expect(g.builtin).toBe(true)
    expect(cat.find((m) => m.id === 'evil')).toBeUndefined()
    expect(cat.length).toBe(BUILTIN_MODELS.length + 1)
  })
})

describe('sanitize with a catalogue', () => {
  it('a disabled catalogue model falls back to the default for that slot', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'k')
    const cat = mergeCatalog([{ ...okRow, id: 'claude-sonnet-5', provider: 'anthropic', api_key_env: 'ANTHROPIC_API_KEY', base_url: null, enabled: false, allowed_slots: ['turn', 'screening', 'classify', 'forensics'] }])
    expect(sanitize({ turn: 'claude-sonnet-5' }, cat).turn).toBe(DEFAULT_MODELS.turn)
    expect(sanitize({ turn: 'claude-haiku-4-5' }, cat).turn).toBe('claude-haiku-4-5')
  })
})

describe('pickUserModel', () => {
  it('honours a valid pick, falls back otherwise', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'k')
    vi.stubEnv('DASHSCOPE_API_KEY', 'k')
    const cat = mergeCatalog([okRow, { ...okRow, id: 'qwen-hidden', user_selectable: false }])
    expect(pickUserModel('qwen3-max', 'turn', cat, 'claude-sonnet-4-6')).toBe('qwen3-max')
    expect(pickUserModel('qwen-hidden', 'turn', cat, 'claude-sonnet-4-6')).toBe('claude-sonnet-4-6')   // not user-selectable
    expect(pickUserModel('qwen3-max', 'screening', cat, 'claude-sonnet-4-6')).toBe('claude-sonnet-4-6') // slot not allowed
    expect(pickUserModel('claude-opus-4-8', 'forensics', cat, 'claude-haiku-4-5')).toBe('claude-haiku-4-5') // not a user slot
    expect(pickUserModel('claude-opus-4-8', 'screening', cat, 'claude-sonnet-4-6')).toBe('claude-opus-4-8')
    expect(pickUserModel(null, 'turn', cat, 'claude-sonnet-4-6')).toBe('claude-sonnet-4-6')
  })
  it('a pick whose provider key is missing falls back', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'k')
    vi.stubEnv('DASHSCOPE_API_KEY', '')
    expect(pickUserModel('qwen3-max', 'turn', mergeCatalog([okRow]), 'claude-sonnet-4-6')).toBe('claude-sonnet-4-6')
  })
})

describe('document slots open to any VISION model (2026-08-22)', () => {
  it('a vision-capable third-party row keeps screening/classify/forensics; a text-only one is clamped to turn', () => {
    const vis = rowToModel({ ...okRow, vision: true, allowed_slots: ['turn', 'screening', 'classify', 'forensics'], pdf_input: 'file' })!
    expect(vis.allowedSlots).toEqual(['turn', 'screening', 'classify', 'forensics'])
    expect(vis.vision).toBe(true)
    expect(vis.pdfInput).toBe('file')
    const txt = rowToModel({ ...okRow, vision: false, allowed_slots: ['turn', 'screening'] })!
    expect(txt.allowedSlots).toEqual(['turn'])
    expect(txt.pdfInput).toBeUndefined()
  })
  it('builtin capability flags: GPT-5/Gemini/Qwen3.8/Kimi are vision + document-slot eligible; DeepSeek/GLM are turn-only', () => {
    const byId = Object.fromEntries(BUILTIN_MODELS.map((m) => [m.id, m]))
    for (const id of ['gpt-5.4-mini', 'gemini-3.7-flash', 'qwen3.8-max', 'kimi-k3']) {
      expect(byId[id].vision, id).toBe(true)
      expect(byId[id].allowedSlots, id).toContain('screening')
    }
    for (const id of ['deepseek-v4-flash', 'glm-5.3']) {
      expect(byId[id].vision, id).toBe(false)
      expect(byId[id].allowedSlots, id).toEqual(['turn'])
    }
    expect(byId['gpt-5.4-mini'].pdfInput).toBe('file')
    expect(byId['gemini-3.7-flash'].pdfInput).toBe('image_url')
    expect(byId['kimi-k3'].pdfInput).toBe('text')
  })
})
