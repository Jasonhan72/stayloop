'use client'

// 任务 — the panel's first tab (2026-11-27, after the Muse panel's first tab): what the assistant
// does on a schedule, then what it did today, then (folded) what it finished on earlier days.
//   · 例行任务: the person's recurring jobs (RoutinesSection).
//   · 今天: today's conversations under this hat and today's outcomes, one timeline, newest first.
//     Only today — the full list of conversations is the AI chats list on the left.
//   · 更早: the same 「替你办完」 outcomes as before, grouped by day; everything else is on the audit page.
// Nothing here decides or sends anything.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useT } from '@/lib/i18n'
import { auditActionLabel } from '@/lib/agent/ideas'
import { OUTCOME_GROUP_LABEL, fmtRowTime, groupOutcomesByDay } from '@/lib/agent/activityLog'
import { ACTIVITY_CHANGED_EVENT, useRecentOutcomes } from '@/lib/agent/useActivityLog'
import { listThreads, type ThreadListRow } from '@/lib/agent/threads'
import { beforeToday, todayItems } from '@/lib/agent/todayTimeline'
import type { AgentRole } from '@/lib/agent/types'
import RoutinesSection from './RoutinesSection'
import PanelFold, { RowIcon } from './PanelFold'
import { ChatBubbleIcon, DoneIcon, FailedIcon } from './panelIcons'

export default function PanelTasksTab({ role, live, visible, onOpenThread, onClose }: {
  role: AgentRole
  live: boolean
  /** The tab is on screen (the column below lg is mounted but hidden → fetch nothing). */
  visible: boolean
  onOpenThread: (id: string) => void | Promise<void>
  /** Sheet only: close it before moving the chat underneath. */
  onClose?: () => void
}) {
  const { lang } = useT()
  const zh = lang === 'zh'
  const outcomes = useRecentOutcomes(live, role, visible, 12)

  // Today's conversations: the same read as the AI chats list, kept to this hat and to today.
  const [threads, setThreads] = useState<ThreadListRow[] | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const h = () => setTick((t) => t + 1)
    window.addEventListener(ACTIVITY_CHANGED_EVENT, h)
    return () => window.removeEventListener(ACTIVITY_CHANGED_EVENT, h)
  }, [])
  useEffect(() => {
    if (!live) { setThreads([]); return }
    if (!visible) return
    let cancelled = false
    listThreads(supabase, 30).then((r) => { if (!cancelled) setThreads(r) }, () => { if (!cancelled) setThreads([]) })
    return () => { cancelled = true }
  }, [live, visible, tick])

  const ready = outcomes !== null && threads !== null
  const today = ready ? todayItems(threads, outcomes, role, lang) : []
  const earlier = outcomes ? groupOutcomesByDay(beforeToday(outcomes)) : []
  const open = (tid: string) => { onClose?.(); void onOpenThread(tid) }

  return (
    <div className="space-y-4">
      <RoutinesSection role={role} live={live} />

      <PanelFold title={zh ? '今天' : 'Today'} testid="panel-today">
        {!live ? (
          <p className="pb-1 text-[13px] leading-relaxed text-body-3">{zh ? '预览模式不留记录。登录后，这里是它今天和你谈过的事、替你办完的事。' : 'Preview keeps no record. Once signed in, this is what it talked through with you today and what it finished for you.'}</p>
        ) : !ready ? (
          <p className="py-2 text-[12.5px] text-body-3">{zh ? '读取中…' : 'Loading…'}</p>
        ) : today.length === 0 ? (
          <p className="pb-1 text-[13px] leading-relaxed text-body-3">{zh ? '今天还没有对话，也没有它替你办完的事。' : 'No conversations today, and nothing finished for you yet.'}</p>
        ) : (
          <ul data-testid="panel-today-list">
            {today.map((it) => {
              const body = (
                <>
                  <RowIcon tone={it.kind === 'done' ? (it.failed ? 'bad' : 'good') : 'plain'}>{it.kind === 'chat' ? <ChatBubbleIcon /> : it.failed ? <FailedIcon /> : <DoneIcon />}</RowIcon>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-[14px] font-semibold leading-snug text-ink">{it.title}</span>
                    {it.note && <span className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-body-3">{it.note}</span>}
                    <span className="mt-0.5 block font-mono text-[10.5px] text-body-3">{fmtRowTime(it.at, lang)}</span>
                  </span>
                </>
              )
              const row = '-mx-2 flex w-[calc(100%+16px)] items-start gap-3 rounded-xl px-2 py-2 text-left'
              return (
                <li key={it.id} data-kind={it.kind}>
                  {it.threadId ? (
                    <button type="button" onClick={() => open(it.threadId as string)} title={zh ? '回到这段对话' : 'Back to this chat'} className={`${row} transition hover:bg-surface-chip/70`}>{body}</button>
                  ) : (
                    <div className={row}>{body}</div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </PanelFold>

      {live && earlier.length > 0 && (
        <PanelFold title={zh ? '更早替你办完的' : 'Finished earlier'} defaultOpen={false} testid="panel-outcomes">
          <div className="space-y-2">
            {earlier.map((g) => (
              <div key={g.key} data-testid={`outcomes-${g.key}`}>
                <div className="font-mono text-[10px] uppercase tracking-eyebrow text-body-3">{zh ? OUTCOME_GROUP_LABEL[g.key].zh : OUTCOME_GROUP_LABEL[g.key].en}</div>
                <ul className="space-y-0.5">
                  {g.rows.map((o) => {
                    const tid = typeof o.metadata?.thread_id === 'string' ? (o.metadata.thread_id as string) : null
                    // A run the executor recorded as failed shows ✕ with its reason — a timeline that only ever ticks is not a record.
                    const failed = o.metadata?.ok === false
                    const reason = failed ? String(o.metadata?.reason ?? o.metadata?.error ?? '').slice(0, 60) : ''
                    const body = (
                      <>
                        <span className={`mt-px flex-none ${failed ? 'text-danger' : 'text-success'}`}>{failed ? '✕' : '✓'}</span>
                        <span className="min-w-0 flex-1 text-[13px] leading-snug text-body">{auditActionLabel(o.action, lang, o.metadata || undefined)}{reason && <span className="text-body-3"> · {reason}</span>}</span>
                        <span className="flex-none font-mono text-[10.5px] text-body-3">{fmtRowTime(o.created_at, lang)}</span>
                      </>
                    )
                    return (
                      <li key={o.id}>
                        {tid ? (
                          <button type="button" onClick={() => open(tid)} title={zh ? '回到这段对话' : 'Back to this chat'} className="-mx-2 flex w-[calc(100%+16px)] items-start gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-surface-chip">{body}</button>
                        ) : (
                          <div className="-mx-2 flex items-start gap-2 px-2 py-1.5">{body}</div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
        </PanelFold>
      )}

      {live && (
        <Link href={`/${role}/audit`} className="inline-flex min-h-9 items-center text-[12.5px] font-semibold text-brand-strong">{zh ? '完整审计 →' : 'Full audit →'}</Link>
      )}
    </div>
  )
}
