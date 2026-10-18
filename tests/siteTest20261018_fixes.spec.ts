// Site test 2026-10-17 · S2 fixes from the defect ledger (B-D1, D-F-01, D-K1, D-K2).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { sanitizeDraftListing } from '../lib/agent/guardrail'

const read = (p: string) => readFileSync(p, 'utf8')

describe('B-D1 · home composer grace window', () => {
  const src = read('components/home/HeroComposer.tsx')
  it('only the automatic rotation opens the grace window', () => {
    expect(src).toContain('changed.current = { at: auto ? Date.now() : 0, prev: cur }')
    expect(src).toContain('setTimeout(() => show(step(1), true), ROTATE_MS)')
    expect(src.split(", true), ROTATE_MS)").length).toBe(2)
  })
})

describe('D-F-01 · N-form toolbox counts days in Toronto', () => {
  const src = read('components/landlord/NoticeToolbox.tsx')
  it('today is the Toronto calendar day, and the unpaid schedule uses it', () => {
    expect(src).toContain('const today = torontoDate()')
    expect(src).not.toContain('isoDate(todayUtc())')
    expect(src).toContain('rentSchedule(start, dueDay, parseDateOnly(today)!, 0)')
  })
})

describe('D-K1 / D-K2 · free plan copy matches FREE_SCREENINGS_PER_MONTH', () => {
  it('the screening register prompt says 3 in Chinese', () => {
    const page = read('app/screening/app/page.tsx')
    expect(page).not.toContain('免费档每月 5 单')
    expect(page).toContain('免费档每月 3 单')
  })
  it('the settings plan line names the deep check and the 30-day trial in Chinese too', () => {
    const line = read('lib/i18n.tsx').split('\n').find((l) => l.includes("'acct.langplan.planFreeDesc'"))!
    expect(line).toContain('另送 1 次深度核查')
    expect(line).toContain('30 天')
  })
})

describe('E-D2 · applicant page decision notice keeps the 60-second undo', () => {
  const page = read('app/landlord/applicants/[id]/page.tsx')
  it('approving does not send on the click; the card waits out UNDO_MS, then sends if not withdrawn', () => {
    expect(page).toContain('const UNDO_MS = 60_000')
    expect(page).not.toContain("await runNotice({ ...(card ?? (row as PendingAction & NoticeRow)), status: 'approved' })")
    expect(page).toContain('setAutoSend({ id: row.id, at: decidedAt + UNDO_MS })')
    expect(page).toContain('setTimeout(() => { setAutoSend(null); void retryStuck() }, Math.max(0, autoSend.at - Date.now()))')
  })
})

describe('G-D1 · work-order act never returns the external contact credential', () => {
  const src = read('app/api/work-orders/[id]/act/route.ts')
  it('the response row is cut down to WORK_ORDER_COLUMNS, which leaves token / external_email out', () => {
    expect(src).not.toContain('work_order: r.wo')
    expect(src).toContain("WORK_ORDER_COLUMNS.split(', ').map((k) => [k, row[k] ?? null])")
    const cols = read('lib/marketplace/workOrders.ts').match(/export const WORK_ORDER_COLUMNS = \[([\s\S]*?)\]\.join/)![1]
    expect(cols).not.toMatch(/'token'|'external_email'/)
  })
})

describe('G-D3 · every token page sends no-referrer', () => {
  it('middleware lists all eight token prefixes from the route table', () => {
    const mw = read('middleware.ts')
    for (const p of ['/verify/', '/intake/', '/my-file/', '/w/', '/lease/sign/', '/p/', '/join/', '/delegate/']) expect(mw, p).toContain(`'${p}'`)
  })
})

describe('G-D2 · a review names the work order’s own provider', () => {
  it('the insert policy compares the review row, not the work order with itself', () => {
    const mig = read('supabase/migrations/20261018b_provider_reviews_policy.sql')
    expect(mig).toContain('w.provider_id is not distinct from provider_reviews.provider_id')
    expect(mig).not.toContain('w.provider_id IS DISTINCT FROM w.provider_id')
  })
})

describe('I-D1 · draft listing copy only states what the user said', () => {
  const said = '帮我发一个房源：28 Avondale Ave #1203，1+1，$2450，11 月 1 日'
  const draft = { title: '28 Avondale 1+1', description: '位于北约克核心便利地段，空间方正实用。采光充沛。2024年新装修。1+1 户型，月租 $2,450，11 月 1 日起租。' }
  it('cuts location, light and renovation claims the user never made, and says so', () => {
    const r = sanitizeDraftListing(draft, 'zh', null, said)
    expect(r.draft.description).toBe('1+1 户型，月租 $2,450，11 月 1 日起租。')
    expect(r.flags).toEqual(expect.arrayContaining(['draft_listing_unconfirmed_location_description', 'draft_listing_unconfirmed_light_description', 'draft_listing_unconfirmed_age_description']))
    expect(r.note).toContain('采光朝向')
  })
  it('keeps them when the user said so, or the photos showed big windows', () => {
    const r = sanitizeDraftListing(draft, 'zh', null, said + '，朝南采光好，2024 年翻新，离地铁近')
    expect(r.draft.description).toBe(draft.description)
    const p = sanitizeDraftListing({ description: '采光充沛。' , amenities: ['large_windows'] }, 'zh', null, said)
    expect(p.draft.description).toBe('采光充沛。')
  })
  it('a move-in date with 年 is not a renovation year', () => {
    const r = sanitizeDraftListing({ description: '2024年新装修。' }, 'zh', null, '2026年11月1日入住，租期一年')
    expect(r.draft.description).toBeUndefined()
  })
  it('the turn route passes only the user\'s own words', () => {
    const route = read('app/api/agent/turn/route.ts')
    expect(route).toContain("hist.filter((h) => h.role === 'user')")
    expect(route).toContain('sanitizeDraftListing(draftListing, uiLang, draftProvince, userSaid)')
  })
})

describe('N-D1 · admin alerts go out one recipient at a time', () => {
  it('both consumer-file alerts use sendAdminAlert, which sends one email per address', () => {
    const lib = read('lib/consumer/server.ts')
    expect(lib).toMatch(/export async function sendAdminAlert[\s\S]*?Array\.from\(new Set\(to\)\)\.map\(\(addr\) => sendEmail\(\{ to: addr,/)
    for (const p of ['app/api/consumer/request/[token]/verify/route.ts', 'app/api/consumer/request/[token]/dispute/route.ts']) {
      const src = read(p)
      expect(src, p).toContain('await sendAdminAlert(to, mail)')
      expect(src, p).not.toContain('sendEmail({ to,')
    }
  })
})

describe('E-D1 · LTB coverage comes from a cache refreshed by the ingest', () => {
  it('ltb_coverage reads the materialized view, refreshed when a run ends ok; the search retries a miss once', () => {
    const mig = read('supabase/migrations/20261018c_ltb_coverage_cache.sql')
    expect(mig).toContain('from public.ltb_coverage_mv m')
    expect(mig).toContain('refresh materialized view public.ltb_coverage_mv;')
    expect(mig).toContain('after insert or update of status on public.ltb_ingest_runs')
    expect(read('lib/ltb/search.ts')).toContain("console.warn('[ltb] coverage missing on first try'")
  })
})

describe('D-F-04 · the tenant rent list shows periods nobody recorded yet', () => {
  it('MyRent adds scheduledPlaceholders from the tenant’s own tenancies and labels them', () => {
    const src = read('components/tenant/MyRent.tsx')
    expect(src).toContain('scheduledPlaceholders(schedHouses, facts.leases,')
    expect(src).toContain('data-testid="rent-unrecorded"')
    expect(src).toContain("'逾期 · 还没有记录'")
    expect(read('supabase/migrations/20261018e_tenant_facts_schedule.sql')).toContain('hh as (select id, current_lease_id, previous_lease_id, next_lease_id, start_date, rent_due_day,')
  })
})

describe('C-S3-5 / C-S3-7 · is_test is not a client-writable flag', () => {
  it('the feed-field guard derives it from a [TEST] tag on insert and never clears it on update', () => {
    const mig = read('supabase/migrations/20261018d_listing_is_test_guard.sql')
    expect(mig).toContain("new.is_test := tagged;")
    expect(mig).toContain('new.is_test := coalesce(old.is_test, false) or tagged;')
    expect(mig).toMatch(/revoke execute on function public\.guard_listing_feed_fields\(\) from public, anon, authenticated, service_role;/)
  })
})
