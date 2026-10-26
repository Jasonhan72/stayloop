// 报告对照方案 · 第三批站内部分 (2026-10-27): the listing's "first occupied after
// 2018-11-15" statement (RTA s.6.1), the price reference card (public benchmark +
// the landlord's own listings, never a recommendation) and the agent directory's
// in-platform signals (opt-in, thin samples say so).
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { ONTARIO_RULES, ruleById } from '@/lib/ontario/rules'
import { buildListingRow } from '@/lib/listingPublish'
import { SIGNAL_MIN_SAMPLES } from '@/lib/agentPublic'

const read = (p: string) => readFileSync(p, 'utf8')
const code = (p: string) => read(p).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')

describe('first occupied after 2018-11-15', () => {
  it('is a documented info rule in the listing area', () => {
    const r = ruleById('RTA-6-1-rent-control-status')!
    expect(r).toBeTruthy()
    expect(r.area).toBe('listing')
    expect(r.severity).toBe('info')
    expect(r.since).toBe('2018-11-15')
    expect(ONTARIO_RULES.filter((x) => x.id === 'RTA-6-1-rent-control-status')).toHaveLength(1)
  })
  it('rides through both row builders as a tri-state (null = not stated) and is patchable', () => {
    const base = { address: '1 Main St', unit: undefined, city: 'Toronto', province: 'ON' as const, monthly_rent: 2000, bedrooms: 1, bathrooms: 1, property_type: 'condo', has_den: false, sqft: null, deposit: null, amenities: [] as string[] }
    const slim = buildListingRow({ ...base, first_occupied_after_2018: true }, { landlordId: 'x', slug: 's', slim: true, photos: [] }) as Record<string, unknown>
    expect(slim.first_occupied_after_2018).toBe(true)
    const full = buildListingRow({ ...base }, { landlordId: 'x', slug: 's', photos: [] }) as Record<string, unknown>
    expect(full.first_occupied_after_2018).toBeNull()
    const src = read('lib/listingPublish.ts')
    expect(src).toMatch(/const PATCHABLE[\s\S]*?'first_occupied_after_2018'[\s\S]*?\n\]/)
    expect(read('supabase/migrations/20261027_first_occupied_agent_signals.sql')).toContain('add column if not exists first_occupied_after_2018 boolean')
  })
  it('both publish forms and the editor ask it three ways (Ontario only); the public page states it as given', () => {
    for (const p of ['app/dashboard/listings/quick/page.tsx', 'app/dashboard/listings/new/page.tsx', 'app/dashboard/listings/[id]/edit/page.tsx']) {
      const s = code(p)
      expect(s, p).toContain('data-testid="first-occupied"')
      expect(s, p).toContain('2018-11-15 之后才第一次有人入住？')
      expect(s, p).toMatch(/\[\['', [^\]]*\], \['yes', [^\]]*\], \['no'/)
    }
    const pub = code('app/listings/[slug]/page.tsx')
    expect(pub).toContain('data-testid="rent-control-status"')
    expect(pub).toContain("listing.first_occupied_after_2018 != null && province === 'ON'")
    expect(pub).toContain('受年度涨租指导比例约束')
  })
})

describe('price reference card', () => {
  const c = code('components/listings/PriceReferenceCard.tsx')
  it('reads the public benchmark and the landlord’s OWN listings only; Ontario only; no recommendation', () => {
    expect(c).toContain('/api/v1/rent-benchmark')
    expect(c).toContain(".eq('landlord_id', landlordId)")
    expect(c).toContain("if (province !== 'ON' || bedrooms == null) return null")
    expect(c).toContain('不是定价建议')
    expect(c).not.toMatch(/llmChat|realtor|mls|competitor|建议定价|suggested rent/i)
  })
  it('is mounted on quick publish, the wizard and the editor', () => {
    for (const p of ['app/dashboard/listings/quick/page.tsx', 'app/dashboard/listings/new/page.tsx', 'app/dashboard/listings/[id]/edit/page.tsx']) expect(code(p), p).toContain('<PriceReferenceCard ')
  })
})

describe('agent directory signals', () => {
  it('come from one locked RPC, only for agents who opted into showing activity', () => {
    const sql = read('supabase/migrations/20261027_first_occupied_agent_signals.sql')
    expect(sql).toContain('create or replace function public.agent_public_signals(p_auth_ids uuid[])')
    expect(sql).toContain('revoke execute on function public.agent_public_signals(uuid[]) from public, anon, authenticated')
    expect(sql).toContain('grant execute on function public.agent_public_signals(uuid[]) to service_role')
    expect(sql).toContain("c.stage in ('leased', 'closed')")
    expect(sql).toContain('s.scored_at is not null')
    const srv = code('lib/agentPublicServer.ts')
    expect(srv).toContain("rows.filter((r) => r.show_activity).map((r) => r.auth_id)")
    expect(srv).toContain("admin.rpc('agent_public_signals', { p_auth_ids: optIn })")
  })
  it('the card prints counts and says not-enough-data below the sample floor; no auth id leaves the server', () => {
    const page = code('app/agents/page.tsx')
    expect(page).toContain('data-testid="agent-signals"')
    expect(page).toContain('尚无足够数据')
    expect(page).toContain('s.response_samples >= SIGNAL_MIN_SAMPLES')
    expect(SIGNAL_MIN_SAMPLES).toBe(3)
    expect(code('lib/agentPublic.ts')).toMatch(/signals\?: AgentSignals \| null/)
    expect(code('lib/agentPublic.ts')).not.toMatch(/auth_id: string[^\n]*\n[^}]*signals/)
  })
})
