// 第三批 ⑥ 例行任务 (user 2026-10-25): the person's recurring jobs for the assistant.
//   • per-hat allow-list in code == the CHECK in the migration; kinds that reach others only make
//     approval cards, kinds that report to the person run at once (主对话 message + push);
//   • next-run arithmetic is Toronto wall-clock; the cron only runs due rows; signed-in 「现在运行」
//     runs the caller's own row only; every run leaves a routine_ran audit event.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { ALL_ROUTINE_KINDS, ROUTINE_KINDS, daysUntilDueDay, dueDateIso, fromToronto, isValidSchedule, nextRunAt, scheduleLabel, torontoParts } from '@/lib/agent/routines'

const read = (p: string) => readFileSync(p, 'utf8')
const code = (p: string) => read(p).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')

describe('allow-list', () => {
  it('code and database agree on the kinds, per hat', () => {
    // 2026-10-26: monthly_brief joined the landlord list in a follow-up migration; the latest allow-list wins.
    const sql = read('supabase/migrations/20261026_agent_routines_monthly_brief.sql')
    for (const k of ALL_ROUTINE_KINDS) expect(sql, k).toContain(`'${k}'`)
    expect(sql).toContain("(role = 'landlord' and kind in ('rent_reminder_cards','renewal_window_check','applications_digest','overdue_rent_check','monthly_brief'))")
    expect(sql).toContain("(role = 'tenant' and kind in ('rent_due_reminder','maintenance_followup'))")
    expect(sql).toContain("(role = 'agent' and kind in ('client_followup_digest'))")
    // Only one kind reaches other people, and it goes through approval cards.
    const others = (Object.values(ROUTINE_KINDS).flat()).filter((d) => d.reach === 'others').map((d) => d.kind)
    expect(others).toEqual(['rent_reminder_cards'])
  })
  it('the cron row, column grants and RLS are in the migration', () => {
    const sql = read('supabase/migrations/20261025_agent_routines.sql')
    expect(sql).toContain("'agent-routines-sweep'")
    expect(sql).toContain("'10 * * * *'")
    expect(sql).toContain('revoke update on public.agent_routines from authenticated;')
    expect(sql).toContain('grant update (title, params, schedule, next_run_at, enabled) on public.agent_routines to authenticated;')
    expect(sql).toMatch(/for all to authenticated using \(user_id = auth\.uid\(\)\) with check \(user_id = auth\.uid\(\)\)/)
  })
})

describe('schedule arithmetic (Toronto)', () => {
  it('next run is strictly after now, on the right weekday / day, at the hour', () => {
    const from = new Date('2026-10-25T13:30:00Z') // Sun 09:30 Toronto (EDT)
    const daily = nextRunAt({ every: 'daily', hour: 9 }, from)
    expect(torontoParts(daily)).toMatchObject({ y: 2026, m: 10, d: 26, h: 9, min: 0 })
    const weekly = nextRunAt({ every: 'weekly', weekday: 1, hour: 9 }, from)
    expect(torontoParts(weekly)).toMatchObject({ m: 10, d: 26, h: 9, weekday: 1 })
    const monthly = nextRunAt({ every: 'monthly', day: 1, hour: 17 }, from)
    expect(torontoParts(monthly)).toMatchObject({ y: 2026, m: 11, d: 1, h: 17 })
    // Same day later today counts.
    const later = nextRunAt({ every: 'daily', hour: 20 }, from)
    expect(torontoParts(later)).toMatchObject({ m: 10, d: 25, h: 20 })
  })
  it('wall-clock conversion survives the DST step (2026-11-01 02:00 EDT → EST)', () => {
    expect(torontoParts(fromToronto(2026, 11, 2, 9))).toMatchObject({ y: 2026, m: 11, d: 2, h: 9, min: 0 })
    expect(torontoParts(fromToronto(2026, 10, 31, 9))).toMatchObject({ y: 2026, m: 10, d: 31, h: 9, min: 0 })
  })
  it('due-day helpers and labels', () => {
    const now = new Date('2026-10-29T15:00:00Z') // Oct 29 Toronto
    expect(daysUntilDueDay(1, now)).toBe(3)
    expect(dueDateIso(1, now)).toBe('2026-11-01')
    expect(daysUntilDueDay(29, now)).toBe(0)
    expect(scheduleLabel({ every: 'weekly', weekday: 1, hour: 9 }, 'zh')).toBe('每周一 09:00')
    expect(scheduleLabel({ every: 'monthly', day: 1, hour: 17 }, 'en')).toBe('Monthly on the 1 at 17:00')
    expect(isValidSchedule({ every: 'weekly', weekday: 7, hour: 9 })).toBe(false)
    expect(isValidSchedule({ every: 'monthly', day: 31, hour: 9 })).toBe(false)
    expect(isValidSchedule({ every: 'daily', hour: 9 })).toBe(true)
  })
})

describe('route and panel', () => {
  it('cron mode needs the shared secret; signed-in mode runs only the caller’s own row and does not advance it', () => {
    const r = code('app/api/cron/agent-routines/route.ts')
    expect(r).toContain("timingSafeEqual(given, cronSecret)")
    expect(r).toContain(".eq('enabled', true).lte('next_run_at', new Date().toISOString())")
    expect(r).toContain(".eq('id', id).eq('user_id', ud.user.id)")
    expect(r).toContain('const out = await runRows(svc, [row as Row], false)')
    expect(r).toContain("action: 'routine_ran'")
  })
  it('rent-reminder cards are the existing approval cards (pending, requires_approval), attached to the 主对话, never duplicated per due date', () => {
    const r = code('app/api/cron/agent-routines/route.ts')
    expect(r).toContain("action_type: 'rent_reminder'")
    expect(r).toContain("status: 'pending', requires_approval: true")
    expect(r).toContain("source: 'routine', routine_id: r.id, thread_id: mainId")
    expect(r).toContain("seen.has(`${l.id}:${dueDate}`)")
    // Reports to self: a message in the 主对话 + push, no card.
    expect(r).toContain('await appendToThread(svc, mainId, [msg])')
  })
  it('the panel section lists, adds from the allow-list, runs now, and deletes in two steps; the prompt points people there', () => {
    const p = code('components/agent/RoutinesSection.tsx')
    expect(p).toContain('data-testid="panel-routines"')
    expect(p).toContain("supabase.from('agent_routines').select(ROUTINE_COLUMNS)")
    expect(p).not.toMatch(/select\('\*'\)/)
    expect(p).toContain('data-testid="routine-delete-confirm"')
    expect(p).toContain("fetch('/api/cron/agent-routines'")
    expect(code('components/agent/AssistantPanel.tsx')).toContain('<RoutinesSection role={role} live={live} />')
    expect(read('lib/agent/prompts.ts')).toContain('# 例行任务')
    expect(read('lib/agent/ideas.ts')).toContain('routine_ran:')
  })
})
