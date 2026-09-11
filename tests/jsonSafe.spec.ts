import { describe, it, expect } from 'vitest'
import { stripNul } from '@/lib/screening/jsonSafe'

const NUL = String.fromCharCode(0)

describe('stripNul — screening jsonb payloads never carry U+0000', () => {
  it('removes NUL from nested strings, arrays and keys', () => {
    const out = stripNul({
      per_file: [{ text_density: { text_sample: `Carlos ${NUL}${NUL}Regueiro${NUL}`, chars_per_page: 12 } }],
      [`bad${NUL}key`]: [`a${NUL}b`, 3, null, true],
    })
    expect(JSON.stringify(out)).not.toContain('u0000')
    expect(out.per_file[0].text_density.text_sample).toBe('Carlos Regueiro')
    expect((out as Record<string, unknown>)['badkey']).toEqual(['ab', 3, null, true])
  })
  it('leaves clean values untouched', () => {
    expect(stripNul('plain')).toBe('plain')
    expect(stripNul(42)).toBe(42)
    expect(stripNul(null)).toBeNull()
  })
})
