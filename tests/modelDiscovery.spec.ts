// /admin/models 「发现新模型」 (lib/modelDiscovery.ts, 2026-09-21): provider
// listing → catalogue diff. Pure helpers only; the network call is not tested.
import { describe, expect, it } from 'vitest'
import { diffProvider, isChatCandidate, parseModelList, providerModelsUrl } from '@/lib/modelDiscovery'
import { BUILTIN_CATALOG } from '@/lib/modelConfig'

describe('providerModelsUrl', () => {
  it('knows the listing endpoint for every registered provider with a fixed host', () => {
    expect(providerModelsUrl('ANTHROPIC_API_KEY')).toBe('https://api.anthropic.com/v1/models?limit=1000')
    expect(providerModelsUrl('OPENAI_API_KEY')).toBe('https://api.openai.com/v1/models')
    expect(providerModelsUrl('GEMINI_API_KEY')).toBe('https://generativelanguage.googleapis.com/v1beta/openai/models')
    expect(providerModelsUrl('DASHSCOPE_API_KEY')).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1/models')
    expect(providerModelsUrl('CUSTOM_LLM_API_KEY_1')).toBeNull()
    expect(providerModelsUrl('NOT_A_KEY')).toBeNull()
  })
})

describe('parseModelList', () => {
  it('reads both the Anthropic and the OpenAI shapes and strips the Gemini prefix', () => {
    expect(parseModelList({ data: [{ id: 'claude-opus-5', display_name: 'Claude Opus 5', created_at: '2026-05-01T00:00:00Z' }] })).toEqual([
      { id: 'claude-opus-5', created: Math.floor(Date.parse('2026-05-01T00:00:00Z') / 1000), label: 'Claude Opus 5' },
    ])
    expect(parseModelList({ data: [{ id: 'models/gemini-3.7-flash', object: 'model' }] })[0]).toEqual({ id: 'gemini-3.7-flash', created: null, label: null })
    expect(parseModelList({ data: [{ id: 'gpt-5.5', created: 1777000000, owned_by: 'openai' }] })[0].created).toBe(1777000000)
    expect(parseModelList({ error: 'x' })).toEqual([])
    expect(parseModelList(null)).toEqual([])
  })
})

describe('isChatCandidate', () => {
  it('keeps chat models and drops embeddings / audio / image / dated snapshots', () => {
    for (const ok of ['gpt-5.5', 'claude-sonnet-5', 'gemini-3.7-flash', 'deepseek-v4-pro', 'kimi-k3', 'qwen3.8-max', 'glm-5.3', 'o5-mini']) expect(isChatCandidate(ok), ok).toBe(true)
    for (const no of ['text-embedding-4', 'gpt-5-tts', 'whisper-2', 'gpt-image-2', 'dall-e-4', 'gpt-5.4-realtime', 'omni-moderation', 'gpt-5.4-2026-03-14', 'qwen3.5-ocr', 'veo-4', 'gpt-4o-audio-preview', 'lyria-3-pro-preview', 'nano-banana-pro-preview', 'gemini-robotics-er-2-preview', 'gemini-3.8-live', 'gpt-5.1-codex', 'gpt-5-search-api', 'qwen-mt-uni']) expect(isChatCandidate(no), no).toBe(false)
  })
})

describe('diffProvider', () => {
  const cat = BUILTIN_CATALOG
  it('new = listed chat models not in the catalogue, newest first; retired = catalogue ids the provider dropped', () => {
    const listed = parseModelList({ data: [
      { id: 'gpt-5.5', created: 1777000000 }, { id: 'gpt-5.4', created: 1770000000 }, { id: 'gpt-5.4-mini', created: 1770000000 },
      { id: 'gpt-6', created: 1790000000 }, { id: 'gpt-5.5-mini', created: 1780000000 }, { id: 'text-embedding-4', created: 1 },
    ] })
    const d = diffProvider('OPENAI_API_KEY', listed, cat)
    expect(d.fresh.map((m) => m.id)).toEqual(['gpt-6', 'gpt-5.5-mini'])
    expect(d.retired).toEqual(['gpt-5.4-nano'])
  })
  it('a dated snapshot counts as the alias being present', () => {
    const d = diffProvider('ANTHROPIC_API_KEY', parseModelList({ data: [{ id: 'claude-opus-5' }, { id: 'claude-sonnet-5' }, { id: 'claude-opus-4-8' }, { id: 'claude-sonnet-4-6' }, { id: 'claude-haiku-4-5-20251001' }] }), cat)
    expect(d.retired).toEqual([])
  })
  it('an empty or failed listing retires nothing', () => {
    expect(diffProvider('OPENAI_API_KEY', [], cat).retired).toEqual([])
  })
  it('only considers catalogue rows on the same key', () => {
    const d = diffProvider('DEEPSEEK_API_KEY', parseModelList({ data: [{ id: 'deepseek-v4-pro' }, { id: 'deepseek-v4-flash' }, { id: 'deepseek-v5' }] }), cat)
    expect(d.fresh.map((m) => m.id)).toEqual(['deepseek-v5'])
    expect(d.retired).toEqual([])
  })
})
