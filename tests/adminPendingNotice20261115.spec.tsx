// @vitest-environment jsdom
// 2026-11-15 · user: 「管理员账号登录，如果要等待核验的，需要有登录后提示的机制」.
// An agent's RECO registration sat in the queue and nothing told the admins. Admins now get a
// count on the header menu's 「后台管理」 row and a notice after signing in.
import React from 'react'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { only, textOf } from './helpers/dom'
import {
  ADMIN_QUEUES, adminPendingSeenKey, openQueues, parseAdminPending, pendingTotal, readSeen, shouldShowNotice, type AdminPending,
} from '@/lib/admin/pendingCounts'

vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => React.createElement('a', { href, ...rest }, children) }))

import AdminPendingNotice from '../components/admin/AdminPendingNotice'

const none: AdminPending = { agents: 0, listings: 0, providers: 0, disputes: 0, consumer: 0, knowledge: 0 }
const UID = '00000000-0000-4000-8000-0000000000aa'
const SIGN_IN = '2026-11-15T20:00:00Z'

afterEach(() => { cleanup(); window.localStorage.clear() })

describe('counts', () => {
  it('parses the RPC answer; a refusal, a failure or junk is null', () => {
    expect(parseAdminPending({ agents: 1, listings: '2', providers: 0, disputes: 1, consumer: null, knowledge: -3 })).toEqual({ agents: 1, listings: 2, providers: 0, disputes: 1, consumer: 0, knowledge: 0 })
    expect(parseAdminPending({ error: 'forbidden' })).toBeNull()
    expect(parseAdminPending(null)).toBeNull()
    expect(parseAdminPending([1, 2])).toBeNull()
    expect(parseAdminPending('x')).toBeNull()
  })
  it('totals and lists only the queues with something in them, each pointing at its admin page', () => {
    const p = { ...none, agents: 1, disputes: 2 }
    expect(pendingTotal(p)).toBe(3)
    expect(pendingTotal(null)).toBe(0)
    expect(openQueues(p).map((q) => [q.key, q.href, q.n])).toEqual([['agents', '/admin/agents', 1], ['disputes', '/admin/providers', 2]])
    for (const q of ADMIN_QUEUES) expect(q.href.startsWith('/admin/')).toBe(true)
  })
})

describe('when the notice shows', () => {
  const p = { ...none, agents: 1 }
  it('nothing waiting → never', () => {
    expect(shouldShowNotice(none, SIGN_IN, null)).toBe(false)
    expect(shouldShowNotice(null, SIGN_IN, null)).toBe(false)
  })
  it('something waiting and never closed → yes', () => {
    expect(shouldShowNotice(p, SIGN_IN, null)).toBe(true)
  })
  it('closed during this sign-in at these counts → no; a queue growing brings it back', () => {
    const seen = { signInAt: SIGN_IN, counts: p }
    expect(shouldShowNotice(p, SIGN_IN, seen)).toBe(false)
    expect(shouldShowNotice({ ...p, agents: 2 }, SIGN_IN, seen)).toBe(true)
    expect(shouldShowNotice({ ...p, listings: 1 }, SIGN_IN, seen)).toBe(true)
    // one handled, one still there: no new nag
    expect(shouldShowNotice({ ...none, agents: 1 }, SIGN_IN, { signInAt: SIGN_IN, counts: { ...none, agents: 2 } })).toBe(false)
  })
  it('a new sign-in shows it again even at the same counts', () => {
    expect(shouldShowNotice(p, '2026-11-16T09:00:00Z', { signInAt: SIGN_IN, counts: p })).toBe(true)
  })
  it('a damaged stored value reads as "never closed"', () => {
    expect(readSeen('{not json')).toBeNull()
    expect(readSeen('{"signInAt":"x"}')).toBeNull()
    expect(readSeen(null)).toBeNull()
  })
})

describe('<AdminPendingNotice>', () => {
  const p = { ...none, agents: 1, knowledge: 2 }
  const mount = (over: Partial<React.ComponentProps<typeof AdminPendingNotice>> = {}) =>
    render(<AdminPendingNotice pending={p} userId={UID} signInAt={SIGN_IN} pathname="/" zh {...over} />).container

  it('names the total and each open queue with its count and link', () => {
    const c = mount()
    const box = only(c, '[data-testid="admin-pending-notice"]')
    expect(textOf(box)).toContain('有 3 项等你处理')
    expect(only<HTMLAnchorElement>(c, '[data-testid="admin-pending-notice-agents"]').getAttribute('href')).toBe('/admin/agents')
    expect(textOf(only(c, '[data-testid="admin-pending-notice-agents"]'))).toBe('经纪认证1')
    expect(textOf(only(c, '[data-testid="admin-pending-notice-knowledge"]'))).toBe('知识库变动2')
    expect(c.querySelector('[data-testid="admin-pending-notice-listings"]')).toBeNull()
    // fixed, so it pushes nothing down (the assistant page keeps nothing above the conversation)
    expect(box.className).toContain('fixed')
  })

  it('closing remembers this sign-in and these counts; it stays closed on the next page', () => {
    const c = mount()
    fireEvent.click(only(c, '[data-testid="admin-pending-notice-close"]'))
    expect(c.querySelector('[data-testid="admin-pending-notice"]')).toBeNull()
    expect(readSeen(window.localStorage.getItem(adminPendingSeenKey(UID)))).toEqual({ signInAt: SIGN_IN, counts: p })
    cleanup()
    expect(mount({ pathname: '/landlord/agent' }).querySelector('[data-testid="admin-pending-notice"]')).toBeNull()
  })

  it('comes back on the next sign-in, and when a queue grows', () => {
    window.localStorage.setItem(adminPendingSeenKey(UID), JSON.stringify({ signInAt: SIGN_IN, counts: p }))
    only(mount({ signInAt: '2026-11-16T09:00:00Z' }), '[data-testid="admin-pending-notice"]')
    cleanup()
    only(mount({ pending: { ...p, agents: 2 } }), '[data-testid="admin-pending-notice"]')
  })

  it('not shown inside /admin, with nothing waiting, or before the counts arrive', () => {
    expect(mount({ pathname: '/admin/agents' }).querySelector('[data-testid="admin-pending-notice"]')).toBeNull()
    cleanup()
    expect(mount({ pending: none }).querySelector('[data-testid="admin-pending-notice"]')).toBeNull()
    cleanup()
    expect(mount({ pending: null }).querySelector('[data-testid="admin-pending-notice"]')).toBeNull()
  })

  it('English interface has no Chinese in it', () => {
    const c = mount({ zh: false })
    expect(/[一-鿿]/.test(textOf(only(c, '[data-testid="admin-pending-notice"]')))).toBe(false)
    expect(textOf(c)).toContain('3 items are waiting on you')
  })
})

describe('wiring', () => {
  const read = (f: string) => readFileSync(f, 'utf8')
  it('the RPC refuses non-admins (coalesced), returns counts only, and is not callable by anon', () => {
    const mig = read('supabase/migrations/20261115e_admin_pending_counts.sql')
    expect(mig).toContain("when not coalesce(public.is_stayloop_admin(), false) then jsonb_build_object('error', 'forbidden')")
    expect(mig).toContain('revoke execute on function public.admin_pending_counts() from public, anon, authenticated;')
    expect(mig).toContain('grant execute on function public.admin_pending_counts() to authenticated, service_role;')
    for (const q of ADMIN_QUEUES) expect(mig).toContain(`'${q.key}',`)
    // waiting on the applicant's own email is not waiting on an admin
    expect(mig).toContain("status in ('matched', 'needs_review')")
  })
  it('the header asks only for admins, counts it in the menu, and mounts the notice outside <header>', () => {
    const h = read('components/Header.tsx')
    expect(h).toContain('const adminPending = useAdminPending(isAdmin)')
    expect(h).toContain('const attention = pendingCount + unreadMessages + adminWaiting')
    expect(h).toContain('data-testid="menu-admin-pending"')
    expect(h.indexOf('<AdminPendingNotice')).toBeGreaterThan(h.indexOf('</header>'))
    expect(read('lib/admin/useAdminPending.ts')).toContain("if (!isAdmin) { setP(null); return }")
  })
  it('each admin queue page refreshes the count after a decision; the admin home shows the same counts', () => {
    for (const f of ['agents', 'verify', 'providers', 'knowledge', 'consumer-requests']) {
      expect(read(`app/admin/${f}/page.tsx`)).toContain('notifyAdminPendingChanged()')
    }
    const home = read('app/admin/page.tsx')
    expect(home).toContain('const waiting = useAdminPending(!!role)')
    expect(home).toContain("hot: (waiting?.agents ?? 0) > 0")
  })
})
