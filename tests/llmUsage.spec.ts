// AI usage metering: cost arithmetic and provider usage normalisation.
import { describe, expect, it } from 'vitest'
import { computeCostUsd, normalizeUsage } from '@/lib/llmUsage'
import { BUILTIN_MODELS, BUILTIN_PRICING } from '@/lib/modelConfig'

describe('computeCostUsd', () => {
  it('prices input/output/cache tokens per 1M', () => {
    const p = { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 }
    expect(computeCostUsd(p, { input: 1_000_000, output: 0, cacheRead: 0, cacheWrite: 0 })).toBe(3)
    expect(computeCostUsd(p, { input: 80_000, output: 5_000, cacheRead: 20_000, cacheWrite: 10_000 })).toBeCloseTo(0.24 + 0.075 + 0.006 + 0.0375, 6)
    // defaults: cache read 10 % of input, cache write = input
    expect(computeCostUsd({ input: 2, output: 10 }, { input: 0, output: 0, cacheRead: 1_000_000, cacheWrite: 1_000_000 })).toBeCloseTo(0.2 + 2, 6)
  })
  it('is null without a price', () => {
    expect(computeCostUsd(undefined, { input: 10, output: 10, cacheRead: 0, cacheWrite: 0 })).toBeNull()
  })
  it('builtins with a pricing entry expose it on the ModelDef', () => {
    const sonnet = BUILTIN_MODELS.find((m) => m.id === 'claude-sonnet-4-6')!
    expect(sonnet.pricing).toEqual(BUILTIN_PRICING['claude-sonnet-4-6'])
    expect(BUILTIN_MODELS.find((m) => m.id === 'gpt-5.4')!.pricing?.input).toBe(2.5)
  })
})

describe('normalizeUsage', () => {
  it('anthropic: separate cache fields', () => {
    expect(normalizeUsage('anthropic', { input_tokens: 1200, output_tokens: 300, cache_read_input_tokens: 5000, cache_creation_input_tokens: 700 }))
      .toEqual({ input: 1200, output: 300, cacheRead: 5000, cacheWrite: 700 })
  })
  it('openai-compat: prompt_tokens includes cached tokens — split them out', () => {
    expect(normalizeUsage('openai-compat', { prompt_tokens: 10_000, completion_tokens: 800, prompt_tokens_details: { cached_tokens: 4_000 } }))
      .toEqual({ input: 6_000, output: 800, cacheRead: 4_000, cacheWrite: 0 })
    // DeepSeek naming
    expect(normalizeUsage('openai-compat', { prompt_tokens: 10_000, completion_tokens: 1, prompt_cache_hit_tokens: 9_000 })).toEqual({ input: 1_000, output: 1, cacheRead: 9_000, cacheWrite: 0 })
    expect(normalizeUsage('openai-compat', null)).toEqual({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 })
  })
})
