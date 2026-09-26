// Three-role sign-in walkthrough on production (2026-09-26, test accounts via
// one-time links): what it turned up and the guards that keep it fixed.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { WORK_ORDER_COLUMNS } from '@/lib/marketplace/workOrders'

const read = (p: string) => readFileSync(p, 'utf8')

describe('three-role walkthrough 2026-09-26', () => {
  it('work_orders is read by an explicit column list, never select(*) — the table has column-level grants (token withheld), so * is a 403 for every signed-in reader', () => {
    expect(WORK_ORDER_COLUMNS.split(', ')).not.toContain('token')
    expect(WORK_ORDER_COLUMNS.split(', ').length).toBeGreaterThanOrEqual(40)
    for (const f of ['components/household/MaintenancePanel.tsx', 'app/provider/jobs/page.tsx', 'app/landlord/providers/page.tsx', 'app/admin/providers/page.tsx']) {
      const s = read(f)
      expect(s, f).not.toMatch(/from\('work_orders'\)\.select\('\*'\)/)
    }
    expect(read('components/household/MaintenancePanel.tsx')).toContain("from('work_orders').select(WORK_ORDER_COLUMNS)")
    expect(read('app/provider/jobs/page.tsx')).toContain("from('work_orders').select(WORK_ORDER_COLUMNS)")
  })
  it('/dashboard/listings (a page that never existed) redirects to /dashboard, and the assistant no longer sends landlords there', () => {
    expect(read('middleware.ts')).toContain("if (/^\\/dashboard\\/listings\\/?$/.test(url.pathname)) {\n      url.pathname = '/dashboard'")
    expect(read('app/api/agent/turn/route.ts')).not.toContain('到 /dashboard/listings 补充')
  })
  it('signing out clears the cached avatar as well as the cached name', () => {
    expect(read('lib/useAuth.ts')).toContain('clearCachedAiNames()\n    clearStoredAvatar()')
    expect(read('lib/agent/avatars.tsx')).toContain('export function clearStoredAvatar(): void {')
  })
})
