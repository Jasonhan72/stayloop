// 例行任务 (第三批 ⑥, 2026-10-25): the person's own recurring jobs for the assistant. Pure module
// (browser form + cron route + tests): the per-hat allow-list (mirrors the CHECK in
// supabase/migrations/20261025_agent_routines.sql), schedule labels, and next-run arithmetic in
// America/Toronto. Kinds that reach other people only create approval cards; kinds that report to
// the person run at once (a message in the 主对话 + a push).
import type { AgentRole } from './types'

export type RoutineEvery = 'daily' | 'weekly' | 'monthly'
export type RoutineSchedule = { every: RoutineEvery; weekday?: number; day?: number; hour: number }
export type RoutineKind =
  | 'rent_reminder_cards' | 'renewal_window_check' | 'applications_digest' | 'overdue_rent_check' | 'monthly_brief'
  | 'rent_due_reminder' | 'maintenance_followup'
  | 'client_followup_digest'
export type RoutineDef = {
  kind: RoutineKind
  zh: string; en: string
  descZh: string; descEn: string
  /** 'others' = produces approval cards (someone else receives something); 'self' = reports to the person only. */
  reach: 'self' | 'others'
  defaultSchedule: RoutineSchedule
  /** Editable knobs with defaults (all small integers). */
  params: Record<string, number>
}
export type RoutineRow = {
  id: string; role: string; kind: RoutineKind; title: string; params: Record<string, unknown>; schedule: RoutineSchedule
  next_run_at: string; last_run_at: string | null; last_result: Record<string, unknown> | null; enabled: boolean; created_at: string
}
export const ROUTINE_COLUMNS = 'id, role, kind, title, params, schedule, next_run_at, last_run_at, last_result, enabled, created_at'
export const TZ = 'America/Toronto'

export const ROUTINE_KINDS: Record<AgentRole, RoutineDef[]> = {
  landlord: [
    { kind: 'rent_reminder_cards', zh: '到期前提醒租客交租', en: 'Rent reminders before the due date', descZh: '每月到期前几天，为每份生效租约出一张「租金提醒」待批卡；你点头后才发给租客。', descEn: 'A few days before each due date, one rent-reminder card per lease in force; it reaches the tenant only after you approve.', reach: 'others', defaultSchedule: { every: 'daily', hour: 9 }, params: { days_before: 3, due_day: 1 } },
    { kind: 'renewal_window_check', zh: '检查续约窗口', en: 'Check renewal windows', descZh: '把 120 天内到期的租约列给你（N1 / N2 要 90 天）。', descEn: 'Lists leases ending within 120 days (90 days’ notice for N1 / N2).', reach: 'self', defaultSchedule: { every: 'weekly', weekday: 1, hour: 9 }, params: {} },
    { kind: 'applications_digest', zh: '新申请汇总', en: 'New applications digest', descZh: '把上次以来收到的申请汇总给你。', descEn: 'Sums up the applications received since the last run.', reach: 'self', defaultSchedule: { every: 'weekly', weekday: 5, hour: 17 }, params: {} },
    { kind: 'overdue_rent_check', zh: '逾期租金汇总', en: 'Overdue rent digest', descZh: '列出账期已过、还没记收到的租金。', descEn: 'Lists rent periods past due with no payment recorded.', reach: 'self', defaultSchedule: { every: 'weekly', weekday: 1, hour: 9 }, params: {} },
    { kind: 'monthly_brief', zh: '每月一页纸简报', en: 'Monthly one-page brief', descZh: '每月 1 号把上个月按房源列出来：收到 / 未记收的租金、维修支出、在市房源与申请，和一条建议。全部来自你的记录，没有的就说没有。', descEn: 'On the 1st, last month listed per unit: rent recorded or not, repair spend, listings on market and applications, plus one suggestion. All from your own records; what is not recorded is said so.', reach: 'self', defaultSchedule: { every: 'monthly', day: 1, hour: 9 }, params: {} },
  ],
  tenant: [
    { kind: 'rent_due_reminder', zh: '交租前提醒我', en: 'Remind me before rent is due', descZh: '到期前几天提醒你这个月的租金和金额。', descEn: 'A reminder a few days before each due date, with the amount.', reach: 'self', defaultSchedule: { every: 'daily', hour: 9 }, params: { days_before: 3, due_day: 1 } },
    { kind: 'maintenance_followup', zh: '报修跟进', en: 'Repair follow-up', descZh: '把还没关闭的报修列给你，方便追问房东。', descEn: 'Lists your open repair tickets so you can follow up with the landlord.', reach: 'self', defaultSchedule: { every: 'weekly', weekday: 1, hour: 9 }, params: {} },
  ],
  agent: [
    { kind: 'client_followup_digest', zh: '客户跟进提醒', en: 'Client follow-up digest', descZh: '列出静默超过几天的客户；跟进由你自己发（CASL）。', descEn: 'Lists clients quiet for more than a few days; you send the follow-up yourself (CASL).', reach: 'self', defaultSchedule: { every: 'weekly', weekday: 1, hour: 9 }, params: { quiet_days: 5 } },
  ],
}
export const ALL_ROUTINE_KINDS: RoutineKind[] = (Object.values(ROUTINE_KINDS) as RoutineDef[][]).flat().map((d) => d.kind)
export function routineDef(role: AgentRole | string, kind: string): RoutineDef | null {
  return (ROUTINE_KINDS[role as AgentRole] ?? []).find((d) => d.kind === kind) ?? null
}

const WEEKDAY = { zh: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'], en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] }
export function scheduleLabel(s: RoutineSchedule, lang: 'zh' | 'en'): string {
  const hh = `${String(s.hour).padStart(2, '0')}:00`
  if (s.every === 'daily') return lang === 'zh' ? `每天 ${hh}` : `Daily ${hh}`
  if (s.every === 'weekly') return lang === 'zh' ? `每${WEEKDAY.zh[s.weekday ?? 1]} ${hh}` : `Every ${WEEKDAY.en[s.weekday ?? 1]} ${hh}`
  return lang === 'zh' ? `每月 ${s.day ?? 1} 号 ${hh}` : `Monthly on the ${s.day ?? 1} at ${hh}`
}

export function isValidSchedule(s: unknown): s is RoutineSchedule {
  if (!s || typeof s !== 'object') return false
  const o = s as Record<string, unknown>
  if (!['daily', 'weekly', 'monthly'].includes(String(o.every))) return false
  if (!Number.isInteger(o.hour) || (o.hour as number) < 0 || (o.hour as number) > 23) return false
  if (o.every === 'weekly' && !(Number.isInteger(o.weekday) && (o.weekday as number) >= 0 && (o.weekday as number) <= 6)) return false
  if (o.every === 'monthly' && !(Number.isInteger(o.day) && (o.day as number) >= 1 && (o.day as number) <= 28)) return false
  return true
}

// ── Toronto wall-clock arithmetic ───────────────────────────────────────────
type Parts = { y: number; m: number; d: number; h: number; min: number; weekday: number }
const FMT = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' })
const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
export function torontoParts(d: Date): Parts {
  const p: Record<string, string> = {}
  for (const x of FMT.formatToParts(d)) p[x.type] = x.value
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute, weekday: WD[p.weekday] ?? 0 }
}
/** The instant at which Toronto's wall clock reads y-m-d h:00 (two passes absorb a DST step). */
export function fromToronto(y: number, m: number, d: number, h: number): Date {
  let guess = Date.UTC(y, m - 1, d, h, 0, 0)
  for (let i = 0; i < 2; i++) {
    const p = torontoParts(new Date(guess))
    const seen = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min)
    guess += Date.UTC(y, m - 1, d, h) - seen
  }
  return new Date(guess)
}
/** The next run strictly after `from`, on the schedule, in Toronto time. */
export function nextRunAt(s: RoutineSchedule, from: Date = new Date()): Date {
  const p = torontoParts(from)
  // Walk day by day from today (at most 40 days: covers monthly + a skipped day).
  for (let i = 0; i <= 40; i++) {
    const probe = new Date(Date.UTC(p.y, p.m - 1, p.d + i, 12))
    const q = torontoParts(probe)
    if (s.every === 'weekly' && q.weekday !== (s.weekday ?? 1)) continue
    if (s.every === 'monthly' && q.d !== (s.day ?? 1)) continue
    const at = fromToronto(q.y, q.m, q.d, s.hour)
    if (at.getTime() > from.getTime()) return at
  }
  return fromToronto(p.y, p.m, p.d + 1, s.hour)
}
/** Days until the next `dueDay` of the month (0 = today), Toronto calendar. */
export function daysUntilDueDay(dueDay: number, now: Date = new Date()): number {
  const p = torontoParts(now)
  const today = Date.UTC(p.y, p.m - 1, p.d)
  let due = Date.UTC(p.y, p.m - 1, dueDay)
  if (due < today) due = Date.UTC(p.y, p.m, dueDay)
  return Math.round((due - today) / 86_400_000)
}
export function dueDateIso(dueDay: number, now: Date = new Date()): string {
  const p = torontoParts(now)
  const today = Date.UTC(p.y, p.m - 1, p.d)
  let due = Date.UTC(p.y, p.m - 1, dueDay)
  if (due < today) due = Date.UTC(p.y, p.m, dueDay)
  return new Date(due).toISOString().slice(0, 10)
}
