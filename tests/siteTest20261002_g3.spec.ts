// Site test 2026-10-02 (design/test-plan-2026-09-22.md, run against a1fab56) — group G3, platform:
//   L4:D1  Permissions-Policy microphone=() silently killed the 🎙 voice-input button on every chat
//   L4:D2/D3  the orphaned /api/ai-score route (no callers, no auth, paid model, raw PostgREST errors)
//   L4:D4  frozen Stripe Connect routes answered anonymous calls with 501 before checking auth
//   L4:D5  X-Content-Type-Options: nosniff missing on worker-rendered pages and API responses
//   L6-public:D1 + L7-anon:D-07  React #418 on /stayloop-api/docs (Cloudflare Email Obfuscation)
//   L6-public:D8  scripts/mobile-audit.mjs pinned a Playwright cache path that no longer exists
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { NextRequest } from 'next/server'
import { middleware } from '@/middleware'

const read = (p: string) => readFileSync(p, 'utf8')

describe('security headers (L4:D1, L4:D5)', () => {
  const paths = ['/', '/api/public/stats', '/h/00000000-0000-0000-0000-000000000000', '/verify/tok', '/landlord/settings', '/?role=landlord&ask=hi']
  for (const p of paths) {
    it(`middleware sets nosniff and allows the microphone for self on ${p}`, () => {
      const res = middleware(new NextRequest(`https://www.stayloop.ai${p}`, { headers: { host: 'www.stayloop.ai' } }))
      expect(res.headers.get('x-content-type-options')).toBe('nosniff')
      const pp = res.headers.get('permissions-policy') || ''
      expect(pp).toContain('microphone=(self)')
      expect(pp).toContain('camera=()')
      expect(pp).not.toMatch(/microphone=\(\)/)
    })
  }

  it('apex redirect carries the same headers', () => {
    const res = middleware(new NextRequest('https://stayloop.ai/pricing', { headers: { host: 'stayloop.ai' } }))
    expect(res.status).toBe(308)
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
  })

  it('the middleware matcher still covers /api routes', async () => {
    const { config } = await import('@/middleware')
    const re = new RegExp(`^${config.matcher[0]}$`)
    expect(re.test('/api/public/stats')).toBe(true)
    expect(re.test('/h/abc')).toBe(true)
  })

  it('public/_headers (static assets) matches the middleware', () => {
    const h = read('public/_headers')
    expect(h).toMatch(/X-Content-Type-Options: nosniff/)
    expect(h).toMatch(/Permissions-Policy: camera=\(\), microphone=\(self\), geolocation=\(self\)/)
  })
})

describe('/api/ai-score is gone (L4:D2, L4:D3)', () => {
  it('the route directory no longer exists', () => {
    expect(existsSync('app/api/ai-score')).toBe(false)
  })

  it('nothing in app / components / lib calls it', () => {
    const hits = execSync("grep -rln 'api/ai-score' app components lib || true", { encoding: 'utf8' }).trim()
    expect(hits).toBe('')
  })

  it('route-audit probes it as retired (404, no PostgREST text)', () => {
    expect(read('scripts/route-audit.mjs')).toMatch(/retired ai-score → 404/)
  })
})

// ---------------------------------------------------------------------------
// Stripe Connect: authenticate first, then refuse the frozen engine with 410.
const getUser = vi.fn()
const from = vi.fn()
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser }, from, rpc: from }),
}))
vi.mock('@/lib/stripe', () => ({ getStripe: () => { throw new Error('must not reach Stripe') } }))

describe('frozen Stripe Connect routes (L4:D4)', () => {
  beforeEach(() => {
    getUser.mockReset()
    from.mockReset()
    delete process.env.STAYLOOP_COMMISSION_ENGINE
  })

  for (const name of ['onboard', 'settle'] as const) {
    const load = async () => (name === 'onboard'
      ? await import('@/app/api/stripe/connect/onboard/route')
      : await import('@/app/api/stripe/connect/settle/route'))
    const req = (auth?: string) => new NextRequest(`https://www.stayloop.ai/api/stripe/connect/${name}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(auth ? { authorization: auth } : {}) },
      body: '{}',
    })

    it(`${name}: anonymous → 401, not 5xx`, async () => {
      const { POST } = await load()
      const res = await POST(req())
      expect(res.status).toBe(401)
      expect(getUser).not.toHaveBeenCalled()
    })

    it(`${name}: invalid token → 401`, async () => {
      getUser.mockResolvedValue({ data: { user: null }, error: { message: 'bad jwt' } })
      const { POST } = await load()
      expect((await POST(req('Bearer nope'))).status).toBe(401)
    })

    it(`${name}: signed in while frozen → 410 with a clear message, nothing touched`, async () => {
      getUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'a@example.com' } }, error: null })
      const { POST } = await load()
      const res = await POST(req('Bearer good'))
      expect(res.status).toBe(410)
      const j = await res.json()
      expect(j.error).toBe('commission_engine_frozen')
      expect(j.message).toMatch(/paused/)
      expect(j.message_zh).toMatch(/暂停/)
      expect(from).not.toHaveBeenCalled()
    })
  }

  it('no 501 left in either route', () => {
    for (const f of ['app/api/stripe/connect/onboard/route.ts', 'app/api/stripe/connect/settle/route.ts']) {
      expect(read(f)).not.toMatch(/status:\s*501/)
    }
  })
})

describe('/stayloop-api/docs hydration under Cloudflare Email Obfuscation (L6-public:D1, L7-anon:D-07)', () => {
  const src = read('app/stayloop-api/docs/page.tsx')

  it('no email address appears in a single string or text run', () => {
    // Any literal "x@stayloop.ai" ends up as one text run in the served HTML,
    // which Cloudflare rewrites into an <a class="__cf_email__"> — React #418.
    expect(src).not.toMatch(/[A-Za-z0-9._%+-]+@stayloop\.ai/)
  })

  it('the address is rendered split across elements', () => {
    expect(src).toMatch(/<span>privacy<\/span><span>@<\/span><span>stayloop\.ai<\/span>/)
    expect((src.match(/<ContactEmail \/>/g) || []).length).toBeGreaterThanOrEqual(4)
  })

  it('route-audit fails if the served docs page carries an obfuscated address', () => {
    expect(read('scripts/route-audit.mjs')).toMatch(/docs page: no obfuscated address[\s\S]*__cf_email__/)
  })
})

describe('mobile-audit launches a browser that exists (L6-public:D8)', () => {
  const src = read('scripts/mobile-audit.mjs')
  it('no pinned Playwright cache path', () => {
    expect(src).not.toMatch(/chromium_headless_shell-\d+/)
    expect(src).not.toMatch(/ms-playwright/)
  })
  it('CHROME_PATH override, bundled chromium, then system Chrome', () => {
    expect(src).toMatch(/process\.env\.CHROME_PATH/)
    expect(src).toMatch(/channel: 'chrome'/)
  })
  it('covers the public pages the test plan added', () => {
    for (const r of ["'/services'", "'/rules'", "'/stayloop-api/docs'"]) expect(src).toContain(r)
  })
})
