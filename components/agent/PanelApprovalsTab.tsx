'use client'

// 批准 — the panel's second tab (2026-11-27, after the Muse panel's 「Approvals history」):
//   · 等你点头: the cards still waiting on the person, each with where to handle it (moved here
//     from the old 待办 tab, unchanged);
//   · 批准记录: every card it proposed under this hat and what became of it — approved and done,
//     declined, could not run, or lapsed, with the reason in the same words the chat uses.
// A record only. Approving, declining and undoing still happen on the cards in the conversation
// (and on the 待办 page for a card that stalled) — never here.
import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useT } from '@/lib/i18n'
import { pickCardLang } from '@/lib/ui/cardLang'
import { cardThreadId } from '@/lib/agent/threadCards'
import { cleanTitle } from '@/lib/agent/threadList'
import { ACTIVITY_CHANGED_EVENT } from '@/lib/agent/useActivityLog'
import { APPROVAL_HISTORY_COLUMNS, agoLabel, approvalAt, approvalFamily, approvalHistory, approvalOutcome, approvalOutcomeLabel, type ApprovalRow } from '@/lib/agent/approvalHistory'
import type { AgentRole, PendingAction } from '@/lib/agent/types'
import PanelFold, { RowIcon } from './PanelFold'
import { ChevronIcon, DocIcon, MailIcon, WrenchIcon } from './panelIcons'

const FAMILY_ICON = { message: <MailIcon />, repair: <WrenchIcon />, lease: <DocIcon />, other: <DocIcon /> } as const

function fmtWhen(iso: string | null, zh: boolean): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return ''
  return d.toLocaleString(zh ? 'zh-CN' : 'en-CA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
}

export default function PanelApprovalsTab({ role, live, waiting, currentThreadId, onOpenThread, onScrollToCard, onClose, visible }: {
  role: AgentRole
  live: boolean
  waiting: PendingAction[]
  currentThreadId: string | null
  onOpenThread: (id: string) => void | Promise<void>
  onScrollToCard?: (id: string) => void
  /** Sheet only: close it before moving the chat underneath. */
  onClose?: () => void
  visible: boolean
}) {
  const { lang } = useT()
  const zh = lang === 'zh'
  // Cards the scans and routines write are stored as 「中文 / English」: only the reader's half belongs on screen.
  const one = (t: string | null | undefined) => pickCardLang(t, zh ? 'zh' : 'en')

  // Titles of the other conversations the waiting cards came from (one small query, only when needed).
  const otherIds = Array.from(new Set(waiting.map(cardThreadId).filter((t): t is string => !!t && t !== currentThreadId)))
  const idsKey = otherIds.sort().join(',')
  const [titles, setTitles] = useState<Record<string, string> | null>(null)
  useEffect(() => {
    if (!live || !visible || !idsKey) { setTitles({}); return }
    let cancelled = false
    supabase.from('agent_threads').select('id, title, custom_title').in('id', idsKey.split(','))
      .then(({ data }) => {
        if (cancelled) return
        const m: Record<string, string> = {}
        for (const r of (data ?? []) as { id: string; title: string | null; custom_title: string | null }[]) m[r.id] = r.custom_title?.trim() || cleanTitle(r.title) || (zh ? '一段对话' : 'a chat')
        setTitles(m)
      }, () => { if (!cancelled) setTitles({}) })
    return () => { cancelled = true }
  }, [live, visible, idsKey, zh])

  // The record: the person's own rows for this hat (RLS = self), explicit columns, read only while on screen.
  const [rows, setRows] = useState<ApprovalRow[] | null>(null)
  const [tick, setTick] = useState(0)
  const [openId, setOpenId] = useState<string | null>(null)
  useEffect(() => {
    const h = () => setTick((t) => t + 1)
    window.addEventListener(ACTIVITY_CHANGED_EVENT, h)
    return () => window.removeEventListener(ACTIVITY_CHANGED_EVENT, h)
  }, [])
  useEffect(() => {
    if (!live) { setRows([]); return }
    if (!visible) return
    let cancelled = false
    supabase.from('agent_pending_actions').select(APPROVAL_HISTORY_COLUMNS).eq('role', role).order('created_at', { ascending: false }).limit(60)
      .then(({ data }) => { if (!cancelled) setRows(approvalHistory((data ?? []) as ApprovalRow[], 20)) }, () => { if (!cancelled) setRows([]) })
    return () => { cancelled = true }
  }, [live, visible, role, tick])

  const link = 'inline-flex min-h-9 items-center text-[12.5px] font-semibold text-brand-strong hover:underline'
  const where = (a: PendingAction): ReactNode => {
    const tid = cardThreadId(a)
    if (a.status === 'approved') return <Link href={`/${role}/todo`} className={link}>{zh ? '已批准，尚未执行 · 去待办页处理 →' : 'Approved, not run yet · open To-do →'}</Link>
    if (tid && tid === currentThreadId) {
      return <button type="button" className={link} onClick={() => { onClose?.(); requestAnimationFrame(() => onScrollToCard?.(a.id)) }}>{zh ? '在这段对话里 ↓' : 'In this chat ↓'}</button>
    }
    if (tid && titles && titles[tid]) {
      const t = titles[tid].length > 18 ? `${titles[tid].slice(0, 17)}…` : titles[tid]
      return <button type="button" className={link} onClick={() => { onClose?.(); void onOpenThread(tid) }}>{zh ? `在对话「${t}」里 →` : `In the chat “${t}” →`}</button>
    }
    return <Link href={`/${role}/todo`} className={link}>{zh ? '去待办页处理 →' : 'Handle on To-do →'}</Link>
  }

  return (
    <div className="space-y-4">
      <PanelFold title={zh ? `等你点头 · ${waiting.length}` : `Waiting on you · ${waiting.length}`} testid="panel-waiting-fold">
        {waiting.length === 0 ? (
          <p className="pb-1 text-[13px] leading-relaxed text-body-3">{zh ? '没有等你点头的事。它提议的每件事都要你批准才执行。' : 'Nothing waiting on you. Everything it proposes runs only once you approve.'}</p>
        ) : (
          <ul className="divide-y divide-line-soft" data-testid="panel-waiting">
            {waiting.map((a) => (
              <li key={a.id} className="py-2.5">
                <div className="text-[13.5px] font-semibold leading-snug text-ink">{one(a.title)}</div>
                {a.summary && <div className="mt-0.5 line-clamp-1 text-[12px] leading-snug text-body-3">{one(a.summary)}</div>}
                <div className="mt-0.5">{where(a)}</div>
              </li>
            ))}
          </ul>
        )}
        <Link href={`/${role}/todo`} className="inline-flex min-h-9 items-center text-[12.5px] font-semibold text-brand-strong">{zh ? '全部待办 → 待办页' : 'All to-dos → To-do page'}</Link>
      </PanelFold>

      <PanelFold title={zh ? '批准记录' : 'Approvals history'} testid="panel-approvals">
        {!live ? (
          <p className="pb-1 text-[13px] leading-relaxed text-body-3">{zh ? '预览模式不留记录。登录后，它提议过的每件事和你的决定都记在这里。' : 'Preview keeps no record. Once signed in, everything it proposed and what you decided is kept here.'}</p>
        ) : rows === null ? (
          <p className="py-2 text-[12.5px] text-body-3">{zh ? '读取中…' : 'Loading…'}</p>
        ) : rows.length === 0 ? (
          <p className="pb-1 text-[13px] leading-relaxed text-body-3">{zh ? '还没有记录。它提议的事由你批准或拒绝之后，会列在这里。' : 'Nothing yet. Once you approve or decline something it proposes, it is listed here.'}</p>
        ) : (
          <ul data-testid="panel-approvals-list">
            {rows.map((r) => {
              const o = approvalOutcome(r)
              const when = approvalAt(r)
              const ago = agoLabel(when.at, zh)
              const open = openId === r.id
              const tid = cardThreadId(r)
              const tone = o === 'ran' ? 'text-success' : o === 'failed' ? 'text-danger' : 'text-body-3'
              return (
                <li key={r.id} data-outcome={o}>
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setOpenId(open ? null : r.id)}
                    className="-mx-2 flex w-[calc(100%+16px)] items-start gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-surface-chip/70"
                  >
                    <RowIcon>{FAMILY_ICON[approvalFamily(r.action_type)]}</RowIcon>
                    <span className="min-w-0 flex-1">
                      <span className={`text-[14px] font-semibold leading-snug text-ink ${open ? 'block' : 'line-clamp-2'}`}>{one(r.title)}</span>
                      {r.summary && <span className={`mt-0.5 text-[12.5px] leading-snug text-body-2 ${open ? 'block' : 'line-clamp-2'}`}>{one(r.summary)}</span>}
                      <span className={`mt-0.5 block text-[12px] leading-snug ${tone}`}>
                        {approvalOutcomeLabel(r, zh)}
                        <span className="text-body-3"> · {when.basis === 'proposed' ? (zh ? `${ago}提出` : `proposed ${ago}`) : ago}</span>
                      </span>
                    </span>
                    <span className={`mt-1 flex-none text-body-3 transition-transform ${open ? 'rotate-180' : ''}`}><ChevronIcon /></span>
                  </button>
                  {open && (
                    <dl className="mb-2 ml-12 space-y-0.5 text-[12px] leading-snug text-body-3" data-testid="approval-detail">
                      {r.recipient_label && <div><dt className="inline">{zh ? '对方：' : 'To: '}</dt><dd className="inline text-body-2">{r.recipient_label}</dd></div>}
                      <div><dt className="inline">{zh ? '提出：' : 'Proposed: '}</dt><dd className="inline text-body-2">{fmtWhen(r.created_at, zh)}</dd></div>
                      {r.decided_at && <div><dt className="inline">{zh ? '决定：' : 'Decided: '}</dt><dd className="inline text-body-2">{fmtWhen(r.decided_at, zh)}</dd></div>}
                      {r.executed_at && <div><dt className="inline">{zh ? '执行：' : 'Ran: '}</dt><dd className="inline text-body-2">{fmtWhen(r.executed_at, zh)}</dd></div>}
                      {tid && <div><button type="button" className={link} onClick={() => { onClose?.(); void onOpenThread(tid) }}>{zh ? '回到提出它的那段对话 →' : 'Back to the chat it came from →'}</button></div>}
                    </dl>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {live && (
          <p className="pt-1 text-[11.5px] leading-relaxed text-body-3">
            {zh ? '这里只是记录：批准和拒绝都在对话里的卡片上做。' : 'A record only: approving and declining happen on the cards in the conversation.'}{' '}
            <Link href={`/${role}/audit`} className="font-semibold text-brand-strong">{zh ? '完整审计 →' : 'Full audit →'}</Link>
          </p>
        )}
      </PanelFold>
    </div>
  )
}
