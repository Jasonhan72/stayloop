// 2026-10-12 · weekly model auto-discovery (user: "自动每星期检查一次新模型，如果有新的就添加进可选的模型列表里")
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ADD_PER_PROVIDER, FRESH_WINDOW_DAYS, pickFreshToAdd } from '@/lib/models/autoDiscover'

describe('pickFreshToAdd', () => {
  const now = Date.parse('2026-10-12T12:00:00Z')
  const day = 86_400
  it('dated listings: only the recent ones, newest first, capped; undated: the first few as listed', () => {
    const fresh = [
      { id: 'new-a', created: now / 1000 - 3 * day },
      { id: 'new-b', created: now / 1000 - 20 * day },
      { id: 'old-c', created: now / 1000 - (FRESH_WINDOW_DAYS + 5) * day },
    ]
    expect(pickFreshToAdd(fresh, now).map((m) => m.id)).toEqual(['new-a', 'new-b'])
    const many = Array.from({ length: 10 }, (_, i) => ({ id: `m${i}`, created: now / 1000 - i * day }))
    expect(pickFreshToAdd(many, now)).toHaveLength(ADD_PER_PROVIDER)
    const undated = Array.from({ length: 10 }, (_, i) => ({ id: `u${i}` }))
    expect(pickFreshToAdd(undated, now).map((m) => m.id)).toEqual(['u0', 'u1', 'u2', 'u3', 'u4', 'u5'])
  })
})

describe('the weekly job', () => {
  it('adds through the same defaults + probe as the admin page, opens passing models to users, disables failing delisted ones, emails admins', () => {
    const lib = readFileSync('lib/models/autoDiscover.ts', 'utf8')
    expect(lib).toContain('const d = inferDefaults(env, m.id, info?.label)')
    expect(lib).toContain("? { user_selectable: true, enabled: true }")
    expect(lib).toContain("user_selectable: false, enabled: false, note: `${row.note} · 连通测试失败")
    expect(lib).toContain("source: 'cron/model-discover'")
    expect(lib).toContain('厂商已不再列出')
    expect(lib).toContain("admin.from('admin_users').select('user_id')")
    const route = readFileSync('app/api/cron/model-discover/route.ts', 'utf8')
    expect(route).toContain("secretMatches(given, secret)")
    expect(route).toContain('runAutoDiscovery(admin, auth.userId)')
    const mig = readFileSync('supabase/migrations/20261012_model_discover_weekly.sql', 'utf8')
    expect(mig).toContain("'model-discover-weekly'")
    expect(mig).toContain("'40 13 * * 1'")
    expect(mig).toContain("/api/cron/model-discover")
    const page = readFileSync('app/admin/models/page.tsx', 'utf8')
    expect(page).toContain('data-testid="auto-discover-note"')
    expect(page).toContain('<table className="w-full min-w-[760px] table-fixed text-[12.5px]">')
    expect(readFileSync('app/api/cron/realtor-freshness/route.ts', 'utf8')).toContain("import { secretMatches } from '@/lib/cron/secret'")
  })
})

// 2026-11-15 · user: 「添加新模型的按钮位置有时候会变动」. The weekly-check note was a flex item between
// the two buttons, so its wrapping (viewport width, language, the "asking…" label) moved and
// stretched 「添加模型」. Measured before: right edge 0–14px off the container, height 47 / 69 / 150.
describe('catalogue header on /admin/models', () => {
  const page = readFileSync('app/admin/models/page.tsx', 'utf8')
  const from = page.indexOf('data-testid="catalogue-actions"')
  const actions = page.slice(from, page.indexOf('</div>', from))
  it('keeps the two buttons alone in a right-aligned group; the note is its own line below', () => {
    expect(page).toContain('<div className="ml-auto flex shrink-0 items-center gap-2" data-testid="catalogue-actions">')
    expect(actions.match(/<button /g)).toHaveLength(2)
    expect(actions).not.toContain('text-[11.5px]')
    expect(page).toContain('<p className="mt-2 text-[11.5px] text-body-3" data-testid="auto-discover-note">')
    expect(page.indexOf('data-testid="auto-discover-note"')).toBeLessThan(page.indexOf('{catMsg && <Banner'))
  })
  it('the discover button holds both labels in one grid cell, so its width does not change while asking', () => {
    expect(actions).toContain("col-start-1 row-start-1 ${discovering ? 'invisible' : ''}")
    expect(actions).toContain("col-start-1 row-start-1 ${discovering ? '' : 'invisible'}")
    expect(actions).toContain('sl-btn-primary whitespace-nowrap')
  })
})
