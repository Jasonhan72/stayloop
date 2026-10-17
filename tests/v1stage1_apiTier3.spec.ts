// V1.0 stage 1 · 丁 #19 (2026-10-15): the partner screening API is the third
// tier of the Stayloop API and must stay closed until the Consumer Reporting
// Act registration is complete — behind its own switch, not just CRA_MODE —
// and the API pages describe the three tiers honestly.
// See design/v1-scope-and-roadmap-2026-10.md §3.1 丁 and
// design/research/v1/open-api-2026-10.md D1-11 / D4, legal-check 14–16.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { partnerScreeningEnabled, PARTNER_SCREENING_CLOSED, PARTNER_SCREENING_ENV } from '@/lib/api/partnerScreening'

const read = (p: string) => readFileSync(p, 'utf8')

describe('partnerScreeningEnabled — both conditions must hold', () => {
  it('on + registered → open', () => {
    expect(partnerScreeningEnabled({ PARTNER_SCREENING_API: 'on' })).toBe(true)
    expect(partnerScreeningEnabled({ PARTNER_SCREENING_API: ' ON ', CRA_MODE: 'registered' })).toBe(true)
  })
  it('on + tool → closed', () => {
    expect(partnerScreeningEnabled({ PARTNER_SCREENING_API: 'on', CRA_MODE: 'tool' })).toBe(false)
  })
  it('off + registered → closed', () => {
    expect(partnerScreeningEnabled({ PARTNER_SCREENING_API: 'off' })).toBe(false)
    expect(partnerScreeningEnabled({ PARTNER_SCREENING_API: 'true', CRA_MODE: 'registered' })).toBe(false)
    expect(partnerScreeningEnabled({})).toBe(false)
  })
  it('off + tool → closed', () => {
    expect(partnerScreeningEnabled({ CRA_MODE: 'tool' })).toBe(false)
    expect(partnerScreeningEnabled({ PARTNER_SCREENING_API: 'off', CRA_MODE: 'tool' })).toBe(false)
  })
  it('the env name and the 503 body are what the docs say', () => {
    expect(PARTNER_SCREENING_ENV).toBe('PARTNER_SCREENING_API')
    expect(PARTNER_SCREENING_CLOSED.error).toBe('partner_screening_closed')
    expect(PARTNER_SCREENING_CLOSED.message).toMatch(/Consumer Reporting Act registration/)
  })
  it('the build never pins the switch on', () => {
    expect((process.env.PARTNER_SCREENING_API ?? '').toLowerCase()).not.toBe('on')
  })
})

describe('/api/v1/screen checks the switch first, then CRA_MODE', () => {
  const src = read('app/api/v1/screen/route.ts')
  it('returns 503 partner_screening_closed before reading the key', () => {
    const sw = src.indexOf('partnerScreeningEnabled()')
    const key = src.indexOf("req.headers.get('x-api-key')")
    const cra = src.indexOf('personalRecordLookupsAllowed()')
    expect(sw).toBeGreaterThan(-1)
    expect(sw).toBeLessThan(key)
    expect(key).toBeLessThan(cra)
    expect(src).toContain('NextResponse.json(PARTNER_SCREENING_CLOSED, { status: 503 })')
  })
  it('keeps the cra_mode_tool branch as defence in depth', () => {
    expect(src).toContain("error: 'cra_mode_tool'")
  })
  it('.env.example documents the switch next to CRA_MODE', () => {
    const env = read('.env.example')
    expect(env).toContain('PARTNER_SCREENING_API=')
    expect(env.indexOf('CRA_MODE=registered')).toBeLessThan(env.indexOf('PARTNER_SCREENING_API='))
  })
})

describe('/stayloop-api pages describe three tiers', () => {
  const pages = { docs: read('app/stayloop-api/docs/page.tsx'), marketing: read('app/stayloop-api/page.tsx') }
  for (const [name, src] of Object.entries(pages)) {
    it(`${name}: tier 3 is marked closed and the consent basis is PIPEDA 4.3`, () => {
      expect(src).toContain('暂不开放')
      expect(src).toMatch(/not yet open|closed/i)
      expect(src).toContain('PIPEDA')
      expect(src).toContain('消费者报告法')
      // stage 5 (2026-10-16): tier 1 is rendered from lib/api/openapi.ts, but the compliance endpoint is still named in prose
      for (const e of ['/listings/compliance', 'POST /passport/verify', 'POST /screen']) expect(src).toContain(e)
    })
    it(`${name}: no s.8(1)(b) as authority, no listing-feed claims, no stale naming`, () => {
      expect(src).not.toMatch(/8\(1\)\(b\)/)
      expect(src).not.toMatch(/实时挂牌|MLS|TRREB/)
      expect(src).not.toMatch(/不是消费者报告机构|not a consumer reporting agency/)
      expect(src).not.toMatch(/助手|管家/)
    })
    it(`${name}: AI-client terms — real-time user-initiated only, no retention / indexing / training; MCP is live (stage 5, 2026-10-16), no longer "in preparation"`, () => {
      expect(src).toMatch(/实时/)
      expect(src).toMatch(/留存/)
      expect(src).toMatch(/建索引|索引/)
      expect(src).toMatch(/训练/)
      expect(src).toMatch(/MCP/)
      expect(src).toContain('https://www.stayloop.ai/api/mcp')
      expect(src).not.toMatch(/筹备中/)
      expect(src).not.toMatch(/in preparation/)
      // no promised launch date for anything — the only dates are the API version constant and protocol versions in examples
      expect(src).not.toMatch(/(上线|open|launch)[^\n]{0,40}20\d\d-\d\d-\d\d/)
    })
  }
  it('docs: the 503 body is shown and the error table lists it', () => {
    expect(pages.docs).toContain('"error": "partner_screening_closed"')
    expect(pages.docs).toMatch(/\['503', /)
  })
})

describe('passport/verify boundary text', () => {
  const src = read('app/api/v1/passport/verify/route.ts')
  it('cites PIPEDA 4.3 as the consent basis and keeps s.10(7); s.8(1)(b) is no longer the authority', () => {
    expect(src).toContain('PIPEDA')
    expect(src).toContain('10(7)')
    expect(src).not.toMatch(/8\(1\)\(b\)/)
  })
})
