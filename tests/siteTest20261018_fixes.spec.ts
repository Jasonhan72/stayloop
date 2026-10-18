// Site test 2026-10-17 · S2 fixes from the defect ledger (B-D1, D-F-01, D-K1, D-K2).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

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
