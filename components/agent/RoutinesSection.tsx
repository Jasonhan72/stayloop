'use client'
// 「例行任务」 at the top of the panel's 任务 tab (第三批 ⑥, 2026-10-25; laid out after the Muse
// panel's 「scheduled tasks」 on 2026-11-27): the person's recurring jobs for the assistant. Each
// row is a bell, the job and when it runs next; opening a row shows its schedule, the last result
// and what can be done with it (run now, on / off, delete in two steps). Three rows show until
// 「查看全部」. Below: a small form to add one from the hat's allow-list. Rows are the person's own
// (RLS); explicit columns only (column-level grants). The cron does the running; 「现在运行」 asks
// the same route.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useT } from '@/lib/i18n'
import { useAuth } from '@/lib/useAuth'
import type { AgentRole } from '@/lib/agent/types'
import { ROUTINE_COLUMNS, ROUTINE_KINDS, isValidSchedule, nextRunAt, nextRunLabel, routineDef, scheduleLabel, type RoutineRow, type RoutineSchedule } from '@/lib/agent/routines'
import { fmtRowTime } from '@/lib/agent/activityLog'
import { notifyActivityChanged } from '@/lib/agent/useActivityLog'
import PanelFold, { RowIcon } from './PanelFold'
import { BellIcon } from './panelIcons'

/** How many rows show before 「查看全部」. */
const FIRST_ROWS = 3

export default function RoutinesSection({ role, live }: { role: AgentRole; live: boolean }) {
  const { lang } = useT()
  const auth = useAuth()
  const userId = live && auth.user ? auth.user.id : null
  const zh = lang === 'zh'
  const [rows, setRows] = useState<RoutineRow[] | null>(null)
  const [adding, setAdding] = useState(false)
  const [kind, setKind] = useState<string>(ROUTINE_KINDS[role][0]?.kind ?? '')
  const [every, setEvery] = useState<RoutineSchedule['every']>(ROUTINE_KINDS[role][0]?.defaultSchedule.every ?? 'weekly')
  const [weekday, setWeekday] = useState(ROUTINE_KINDS[role][0]?.defaultSchedule.weekday ?? 1)
  const [day, setDay] = useState(ROUTINE_KINDS[role][0]?.defaultSchedule.day ?? 1)
  const [hour, setHour] = useState(ROUTINE_KINDS[role][0]?.defaultSchedule.hour ?? 9)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const def = routineDef(role, kind)

  const load = useCallback(async () => {
    if (!live || !userId) { setRows([]); return }
    const { data } = await supabase.from('agent_routines').select(ROUTINE_COLUMNS).eq('role', role).order('created_at', { ascending: false }).limit(20)
    setRows(((data ?? []) as RoutineRow[]))
  }, [live, userId, role])
  useEffect(() => { void load() }, [load])

  const pickKind = (k: string) => {
    setKind(k)
    const d = routineDef(role, k)
    if (d) { setEvery(d.defaultSchedule.every); setWeekday(d.defaultSchedule.weekday ?? 1); setDay(d.defaultSchedule.day ?? 1); setHour(d.defaultSchedule.hour) }
  }
  const schedule: RoutineSchedule = every === 'weekly' ? { every, weekday, hour } : every === 'monthly' ? { every, day, hour } : { every, hour }

  async function add() {
    if (!def || !userId || !isValidSchedule(schedule)) return
    setBusy('add'); setErr(null)
    const { error } = await supabase.from('agent_routines').insert({ user_id: userId, role, kind: def.kind, title: zh ? def.zh : def.en, params: def.params, schedule, next_run_at: nextRunAt(schedule).toISOString(), enabled: true })
    setBusy(null)
    if (error) { setErr(zh ? '没建上，请再试一次。' : 'Could not add — try again.'); return }
    setAdding(false); await load(); notifyActivityChanged()
  }
  async function toggle(r: RoutineRow) {
    setBusy(r.id)
    const next = !r.enabled
    const { error } = await supabase.from('agent_routines').update({ enabled: next, next_run_at: next ? nextRunAt(r.schedule).toISOString() : r.next_run_at }).eq('id', r.id)
    setBusy(null)
    if (error) { setErr(zh ? '没改上，请再试一次。' : 'Could not change — try again.'); return }
    await load()
  }
  async function remove(r: RoutineRow) {
    setBusy(r.id); setConfirm(null)
    const { error } = await supabase.from('agent_routines').delete().eq('id', r.id)
    setBusy(null)
    if (error) { setErr(zh ? '没删掉，请再试一次。' : 'Could not delete — try again.'); return }
    await load()
  }
  async function runNow(r: RoutineRow) {
    setBusy(r.id); setErr(null)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/cron/agent-routines', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` }, body: JSON.stringify({ id: r.id }) })
    setBusy(null)
    if (!res.ok) { setErr(zh ? '这次没跑成，请稍后再试。' : 'That run failed — try again later.'); return }
    await load(); notifyActivityChanged()
  }

  const n = rows?.length ?? 0
  const title = n > 0 ? (zh ? `${n} 个例行任务` : `${n} routine${n === 1 ? '' : 's'}`) : (zh ? '例行任务' : 'Routines')

  // Preview: nothing is stored for a visitor, so there is nothing to list — say what this is for.
  if (!live) {
    return (
      <PanelFold title={title} testid="panel-routines">
        <p className="pb-1 text-[13px] leading-relaxed text-body-3">
          {zh ? '登录后，可以让它每天、每周或每月替你做一件事：到期前提醒交租、检查续约窗口、汇总新申请。发给别人的每一条仍要你点头。' : 'Once signed in, it can do one thing for you every day, week or month — a rent reminder before the due date, a renewal-window check, a digest of new applications. Anything sent to someone else still needs your OK.'}
        </p>
      </PanelFold>
    )
  }

  const WD = zh ? ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const sel = 'rounded-lg border border-line-divider bg-white px-2 py-1 text-[12.5px]'
  const more = 'flex min-h-10 w-full items-center justify-center text-[13px] font-semibold text-ink transition hover:text-brand-strong'
  const shown = rows ? (showAll ? rows : rows.slice(0, FIRST_ROWS)) : []
  return (
    <PanelFold title={title} testid="panel-routines">
      {rows === null ? (
        <p className="py-2 text-[12.5px] text-body-3">{zh ? '读取中…' : 'Loading…'}</p>
      ) : rows.length === 0 && !adding ? (
        <p className="py-1 text-[13px] leading-relaxed text-body-3">{zh ? '还没有例行任务。比如「每周一检查续约窗口」「到期前提醒租客交租」。' : 'No routines yet — e.g. “check renewal windows every Monday”.'}</p>
      ) : (
        <ul>
          {shown.map((r) => {
            const lr = r.last_result as { ok?: boolean; count?: number; note?: string } | null
            const open = openId === r.id
            // The stored title is in the language the routine was made in; the allow-list has both.
            const d = routineDef(role, r.kind)
            const name = d ? (zh ? d.zh : d.en) : r.title
            return (
              <li key={r.id} data-testid="routine-row">
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => { setOpenId(open ? null : r.id); setConfirm(null) }}
                  className="-mx-2 flex w-[calc(100%+16px)] items-start gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-surface-chip/70"
                >
                  <RowIcon><BellIcon /></RowIcon>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-[14px] font-semibold leading-snug ${r.enabled ? 'text-ink' : 'text-body-3'}`}>{name}</span>
                    <span className="mt-0.5 block text-[12.5px] leading-snug text-body-3">{r.enabled ? nextRunLabel(r.next_run_at, zh ? 'zh' : 'en') : (zh ? '已停用' : 'Turned off')}</span>
                  </span>
                </button>
                {open && (
                  <div className="mb-2 ml-12 space-y-1.5" data-testid="routine-detail">
                    <div className="text-[12px] leading-snug text-body-3">
                      {scheduleLabel(r.schedule, zh ? 'zh' : 'en')} · {zh ? '多伦多时间' : 'Toronto time'}
                      {r.last_run_at && <> · {zh ? '上次' : 'last'} {fmtRowTime(r.last_run_at, lang)} {lr?.ok === false ? <span className="text-danger">✕ {lr.note}</span> : lr ? <span>✓ {lr.count ?? 0}</span> : null}</>}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px]">
                      <button type="button" disabled={busy === r.id} onClick={() => void runNow(r)} className="min-h-9 font-semibold text-brand-strong disabled:opacity-50">{busy === r.id ? '…' : zh ? '现在运行' : 'Run now'}</button>
                      <button type="button" disabled={busy === r.id} onClick={() => void toggle(r)} className="min-h-9 text-body-2 disabled:opacity-50">{r.enabled ? (zh ? '停用' : 'Turn off') : (zh ? '启用' : 'Turn on')}</button>
                      {confirm === r.id ? (
                        <span data-testid="routine-delete-confirm" className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1">
                          {zh ? '删除这条例行任务？' : 'Delete this routine?'}
                          <button type="button" onClick={() => void remove(r)} className="font-semibold text-danger">{zh ? '确认' : 'Confirm'}</button>
                          <button type="button" onClick={() => setConfirm(null)}>{zh ? '取消' : 'Cancel'}</button>
                        </span>
                      ) : (
                        <button type="button" onClick={() => setConfirm(r.id)} className="min-h-9 text-body-3">{zh ? '删除' : 'Delete'}</button>
                      )}
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {rows && rows.length > FIRST_ROWS && (
        <button type="button" data-testid="routine-see-all" aria-expanded={showAll} onClick={() => setShowAll((v) => !v)} className={more}>
          {showAll ? (zh ? '收起' : 'Show fewer') : (zh ? `查看全部 ${rows.length} 个例行任务` : `See all ${rows.length} routines`)}
        </button>
      )}
      {!adding && rows !== null && (
        <button type="button" data-testid="routine-add" onClick={() => setAdding(true)} className={more}>{zh ? '＋ 新例行任务' : '+ New routine'}</button>
      )}
      {adding && def && (
        <div className="mt-2 rounded-xl border border-line-divider bg-surface-chip/50 p-3" data-testid="routine-form">
          <label className="block text-[12px] font-semibold text-body-2">{zh ? '做什么' : 'What'}
            <select className={`${sel} mt-1 w-full`} value={kind} onChange={(e) => pickKind(e.target.value)}>
              {ROUTINE_KINDS[role].map((d) => <option key={d.kind} value={d.kind}>{zh ? d.zh : d.en}</option>)}
            </select>
          </label>
          <p className="mt-1 text-[11.5px] leading-snug text-body-3">{zh ? def.descZh : def.descEn}{def.reach === 'others' && <> · <b>{zh ? '发给别人的仍要你点头' : 'still needs your approval before anyone is contacted'}</b></>}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px]">
            <select className={sel} value={every} onChange={(e) => setEvery(e.target.value as RoutineSchedule['every'])}>
              <option value="daily">{zh ? '每天' : 'Daily'}</option><option value="weekly">{zh ? '每周' : 'Weekly'}</option><option value="monthly">{zh ? '每月' : 'Monthly'}</option>
            </select>
            {every === 'weekly' && <select className={sel} value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>{WD.map((w, i) => <option key={i} value={i}>{w}</option>)}</select>}
            {every === 'monthly' && <select className={sel} value={day} onChange={(e) => setDay(Number(e.target.value))}>{Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{zh ? `${d} 号` : `${d}`}</option>)}</select>}
            <select className={sel} value={hour} onChange={(e) => setHour(Number(e.target.value))}>{Array.from({ length: 24 }, (_, h) => h).map((h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}</select>
            <span className="text-body-3">{zh ? '多伦多时间' : 'Toronto time'}</span>
          </div>
          <div className="mt-2 flex gap-2">
            <button type="button" data-testid="routine-save" disabled={busy === 'add'} onClick={() => void add()} className="sl-btn-primary !px-4 !py-1.5 text-[12.5px] disabled:opacity-50">{busy === 'add' ? '…' : zh ? '建好' : 'Add'}</button>
            <button type="button" onClick={() => setAdding(false)} className="rounded-full border border-line-divider px-3 py-1.5 text-[12.5px]">{zh ? '取消' : 'Cancel'}</button>
          </div>
        </div>
      )}
      {err && <div className="mt-1 text-[12px] text-danger">{err}</div>}
    </PanelFold>
  )
}
