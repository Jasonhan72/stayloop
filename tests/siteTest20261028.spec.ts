// 全站测试 2026-10-28 · 修复守卫（defect ledger design/test-cases-2026-10-28/defect-ledger.md）
//   T6-D12 plain HTTP served a page after the Worker move → the proxy 308s http:// to https://www
//   T6-D13 kb_source_status() callable by any signed-in user → service role only
//   M-D2   PATCH /api/admin/knowledge on an unknown id returned 200 → 404
//   N-D1   the weekly refresh's eval step crashed without .env.local in CI → tolerated
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { referenceList } from '@/lib/kb/cite'
import type { KbHit } from '@/lib/kb/search'

const read = (p: string) => readFileSync(p, 'utf8')
const code = (p: string) => read(p).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')

describe('site test 2026-10-28 fixes', () => {
  it('T6-D12: the proxy redirects plain HTTP to https://www with a 308, before the apex hop, and the apex hop forces https', () => {
    const p = code('proxy.ts')
    expect(p).toContain("const scheme = (request.headers.get('x-forwarded-proto') || new URL(request.url).protocol.replace(':', '')).toLowerCase()")
    expect(p).toContain("if (scheme === 'http' && /stayloop\\.ai$/.test(host)) {")
    expect(p.indexOf("if (scheme === 'http'")).toBeLessThan(p.indexOf("if (host === 'stayloop.ai') {"))
    expect(p.match(/url\.protocol = 'https:'/g)?.length).toBe(2)
    const audit = read('scripts/route-audit.mjs')
    expect(audit).toContain("await probe('http → https (www)', `http://www.stayloop.ai/login`")
    expect(audit).toContain("await probe('http → https (apex)', `http://stayloop.ai/`")
  })
  it('T6-D13: kb_source_status() is service-role only', () => {
    const sql = read('supabase/migrations/20261028_kb_source_status_service_only.sql')
    expect(sql).toContain('revoke execute on function public.kb_source_status() from public, anon, authenticated')
    expect(sql).toContain('grant execute on function public.kb_source_status() to service_role')
    expect(sql).not.toMatch(/to authenticated/)
  })
  it('M-D2: reviewing an unknown change id is a 404, not a silent 200', () => {
    const r = code('app/api/admin/knowledge/route.ts')
    expect(r).toContain(".eq('id', id).select('id')")
    expect(r).toContain("if (!data || !data.length) return NextResponse.json({ error: 'not found' }, { status: 404 })")
  })
  it('I-D1: an unparseable model reply is logged and retried once on the built-in default before the canned line', () => {
    const r = code('app/api/agent/turn/route.ts')
    expect(r).toContain("if (!parsed || typeof parsed.reply !== 'string') {")
    expect(r).toContain("source: 'agent/turn-retry'")
    expect(r.indexOf("source: 'agent/turn-retry'")).toBeLessThan(r.indexOf('const salvage = parsed ? \'\' : salvageReply(raw)'))
  })
  it('I-D2: the chat listing card resolves amenities to one language like /listings', () => {
    expect(code('components/agent/ListingChatCard.tsx')).toContain("resolveList('amenities', (l.tags || []).filter((t) => t !== 'den'), zh ? 'zh' : 'en')")
  })
  it('I-D4: two passages of one section are one reference', () => {
    const h = (over: Partial<KbHit>): KbHit => ({ chunk_id: 'c', document_id: 'd', source_key: 'on-rta-2006', source_title: 'RTA', authority_level: 1, title: 'Residential Tenancies Act, 2006', url: 'https://www.ontario.ca/laws/statute/06r17#BK1', section_ref: '106 (1/2)', heading_path: [], body: 'x', in_force: true, consolidated_date: '2026-09-21', meta: null, score: 0.1, ...over })
    const { reply, refs } = referenceList('一个月 [K1]，利息 [K2]，再提 [K1]。', [h({}), h({ chunk_id: 'c2', section_ref: '106 (2/2)', url: 'https://www.ontario.ca/laws/statute/06r17#BK1' })])
    expect(refs.map((r) => [r.n, r.ref])).toEqual([[1, 's. 106']])
    expect(reply).toBe('一个月 [1]，利息 [1]，再提 [1]。')
  })
  it('D-D1: no fire-and-forget Supabase builder without .then (it never runs)', () => {
    const { execSync } = require('node:child_process') as typeof import('node:child_process')
    const files = execSync("grep -rlE 'void (supabase|sb|svc|admin)\\.from\\(' app components lib", { encoding: 'utf8' }).trim().split('\n').filter(Boolean)
    const offenders: string[] = []
    for (const f of files) {
      const lines = read(f).split('\n')
      lines.forEach((l, i) => {
        if (!/void (supabase|sb|svc|admin)\.from\(/.test(l)) return
        const stmt = lines.slice(i, i + 6).join('\n')
        if (!/\.then\(/.test(stmt)) offenders.push(`${f}:${i + 1}`)
      })
    }
    expect(offenders).toEqual([])
    expect(code('app/landlord/applicants/[id]/page.tsx')).toContain(".is('viewed_at', null).then(() => {}, () => {})")
    expect(code('app/landlord/leases/new/page.tsx')).toMatch(/source: 'lease_terms'[^\n]*\.then\(\(\) => \{\}, \(\) => \{\}\)/)
  })
  it('G-D1 / G-D2: a professional trade is never dispatched — server rule, modal list, providers filter; four referral links', () => {
    expect(code('lib/marketplace/server.ts')).toContain("if (isProfessionalTrade(trade)) return { ok: false, error: 'professional trade is referral only', status: 422 }")
    expect(code('components/marketplace/DispatchModal.tsx')).toContain('{TRADES.filter((t) => !isProfessionalTrade(t.key)).map((t) => <option')
    const p = code('app/landlord/providers/page.tsx')
    expect(p).toContain('data-testid="professional-trade-links"')
    expect(p).toContain('{TRADES.filter((t) => !isProfessionalTrade(t.key)).map(')
  })
  it('F-D1 / E-D1: T776 needs the landlord hat; token APIs get no-referrer', () => {
    expect(code('app/api/finance/t776/route.ts')).toContain("if (ids.length < 2) return NextResponse.json({ error: 'landlord_required' }, { status: 403, headers: NO_STORE })")
    expect(code('proxy.ts')).toContain("'/api/w/', '/api/consumer/request/', '/api/verify/'")
  })
  it('N-D1: the eval script tolerates a missing .env.local (CI)', () => {
    const e = read('scripts/kb/eval.ts')
    expect(e).toMatch(/try \{\n\s*for \(const line of readFileSync\('\.env\.local'/)
  })
})
