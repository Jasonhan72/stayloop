// 2026-10-12: after reading the Consumer Reporting Act (R.S.O. 1990, c. C.33)
// the conclusion was that Stayloop's screening very likely falls inside the
// Act, so the site must not assert "Stayloop is not a consumer reporting
// agency" anywhere. User-facing copy describes how reports are handled
// instead. See design/consumer-reporting-act-research-2026-10.md.
import { describe, it, expect } from 'vitest'
import { execSync } from 'node:child_process'

const BANNED = [
  '不是消费者报告机构',
  '不是《消费者报告法》',
  '不是安省《消费者报告法》',
  'not a consumer reporting agency',
  'Not a consumer report',
  'not a "consumer report"',
]

function grep(pattern: string): string[] {
  try {
    const out = execSync(`grep -rn -F -- ${JSON.stringify(pattern)} app components lib`, { encoding: 'utf8' })
    return out.split('\n').filter((l) => l.trim() && !/\.spec\./.test(l))
  } catch {
    return []
  }
}

describe('consumer reporting act wording (2026-10-12)', () => {
  for (const p of BANNED) {
    it(`no user-facing "${p}" claim`, () => {
      expect(grep(p)).toEqual([])
    })
  }
  it('the applicant notice still carries the s.10(7) right', () => {
    const hits = grep('10(7)')
    expect(hits.some((l) => l.startsWith('app/screening/[id]/notice/page.tsx'))).toBe(true)
  })
})
