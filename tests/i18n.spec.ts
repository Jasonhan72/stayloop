// DICT completeness — every key must carry a non-empty zh AND en string.
// A missing side renders as a raw key (or falls back silently) in the UI.
import { describe, expect, it } from 'vitest'
import { DICT } from '@/lib/i18n'

describe('i18n DICT completeness', () => {
  const entries = Object.entries(DICT as Record<string, { en?: unknown; zh?: unknown }>)

  it('has a non-trivial number of keys', () => {
    expect(entries.length).toBeGreaterThan(50)
  })

  it('every key has non-empty zh and en strings', () => {
    const broken: string[] = []
    for (const [key, val] of entries) {
      const enOk = typeof val?.en === 'string' && val.en.trim().length > 0
      const zhOk = typeof val?.zh === 'string' && val.zh.trim().length > 0
      if (!enOk || !zhOk) broken.push(`${key} (en:${enOk ? 'ok' : 'MISSING'}, zh:${zhOk ? 'ok' : 'MISSING'})`)
    }
    expect(broken, `keys missing a language side:\n${broken.join('\n')}`).toEqual([])
  })

  it('no entry carries stray languages beyond en/zh (shape drift guard)', () => {
    for (const [, val] of entries) {
      expect(Object.keys(val as object).sort()).toEqual(['en', 'zh'])
    }
  })
})
