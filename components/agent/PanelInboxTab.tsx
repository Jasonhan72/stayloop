'use client'

// 收件 — the panel's fourth tab (2026-11-27, after the Muse panel's 「Inbox」). The Muse inbox is
// mail sent to the assistant's own address; this assistant has no address of its own, so the tab
// shows what does arrive for the person: the message centre's threads (the same my_threads RPC,
// under the caller's RLS), newest first, unread ones marked. The assistant reads the unread ones
// each turn to remind the person (lib/agent/foldedSources.ts) and never answers them — the note
// under the list says so. Opening a row goes to the message centre; nothing is sent from here.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { useT } from '@/lib/i18n'
import { MESSAGES_CHANGED_EVENT } from '@/lib/messages/unread'
import { counterpartLine } from '@/lib/threads/shared'
import { pickCardLang } from '@/lib/ui/cardLang'
import { agoLabel } from '@/lib/agent/approvalHistory'
import { RowIcon } from './PanelFold'
import { MailIcon } from './panelIcons'

type InboxRow = {
  id: string; kind: string; party: string; last_at: string; last_body: string | null; last_sender_id: string | null
  unread: number; counterpart_names: string[] | null; counterpart_roles: string[] | null
}
/** How many threads the tab lists; the rest are one tap away in the message centre. */
const KEEP = 8

export default function PanelInboxTab({ live, visible }: { live: boolean; visible: boolean }) {
  const { lang } = useT()
  const zh = lang === 'zh'
  const auth = useAuth()
  const uid = live ? auth.user?.id ?? null : null
  const [rows, setRows] = useState<InboxRow[] | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const h = () => setTick((t) => t + 1)
    window.addEventListener(MESSAGES_CHANGED_EVENT, h)
    return () => window.removeEventListener(MESSAGES_CHANGED_EVENT, h)
  }, [])
  useEffect(() => {
    if (!uid) { setRows([]); return }
    if (!visible) return
    let cancelled = false
    supabase.rpc('my_threads').then(({ data }) => {
      if (cancelled) return
      // Unread threads first, then newest first — an unread one from last month must not fall off the end of the list.
      const all = ((data ?? []) as InboxRow[]).slice().sort((a, b) => (Number(b.unread > 0) - Number(a.unread > 0)) || String(b.last_at).localeCompare(String(a.last_at)))
      setRows(all)
    }, () => { if (!cancelled) setRows([]) })
    return () => { cancelled = true }
  }, [uid, visible, tick])

  const nameLine = (r: InboxRow) => r.kind === 'support' && r.party !== 'admin' ? (zh ? 'Stayloop 客服' : 'Stayloop support') : counterpartLine(r.counterpart_names ?? [], r.counterpart_roles ?? [], zh)
  const unread = (rows ?? []).reduce((n, r) => n + (r.unread > 0 ? 1 : 0), 0)

  return (
    <div data-testid="panel-inbox">
      <h3 className="flex min-h-10 items-baseline justify-between gap-2 pt-2 text-[15px] font-semibold tracking-tight text-ink">
        <span>{zh ? '写给你的消息' : 'Messages to you'}</span>
        {unread > 0 && <span className="text-[12px] font-semibold text-brand-strong" data-testid="panel-inbox-unread">{zh ? `${unread} 段有未读` : `${unread} with unread`}</span>}
      </h3>
      {!live ? (
        <p className="pb-1 text-[13px] leading-relaxed text-body-3">{zh ? '预览模式没有消息。登录后，房东、租客、经纪和服务商写给你的消息会列在这里。' : 'Preview has no messages. Once signed in, what landlords, tenants, agents and service providers write to you is listed here.'}</p>
      ) : rows === null ? (
        <p className="py-2 text-[12.5px] text-body-3">{zh ? '读取中…' : 'Loading…'}</p>
      ) : rows.length === 0 ? (
        <p className="pb-1 text-[13px] leading-relaxed text-body-3">{zh ? '还没有人给你写消息。' : 'Nobody has written to you yet.'}</p>
      ) : (
        <ul data-testid="panel-inbox-list">
          {rows.slice(0, KEEP).map((r) => {
            // System lines (a cancelled work order, a decision notice) are stored as 「中文 / English」.
            const body = pickCardLang((r.last_body ?? '').replace(/\s+/g, ' ').trim(), zh ? 'zh' : 'en')
            const mine = !!uid && r.last_sender_id === uid
            return (
              <li key={r.id}>
                <Link href={`/messages?t=${r.id}`} className="-mx-2 flex w-[calc(100%+16px)] items-start gap-3 rounded-xl px-2 py-2 transition hover:bg-surface-chip/70">
                  <RowIcon><MailIcon /></RowIcon>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className={`min-w-0 flex-1 truncate text-[14px] leading-snug text-ink ${r.unread > 0 ? 'font-bold' : 'font-semibold'}`}>{nameLine(r)}</span>
                      <span className="flex-none font-mono text-[10.5px] text-body-3">{agoLabel(r.last_at, zh)}</span>
                    </span>
                    <span className="mt-0.5 flex items-start gap-2">
                      <span className={`line-clamp-2 min-w-0 flex-1 text-[12.5px] leading-snug ${r.unread > 0 ? 'text-body' : 'text-body-3'}`}>{mine ? (zh ? '你：' : 'You: ') : ''}{body || (zh ? '（没有文字）' : '(no text)')}</span>
                      {r.unread > 0 && <span className="mt-0.5 flex-none rounded-full bg-brand px-1.5 font-mono text-[10px] font-bold leading-4 text-white" aria-label={zh ? `${r.unread} 条未读` : `${r.unread} unread`}>{r.unread}</span>}
                    </span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
      {live && (
        <>
          <Link href="/messages" className="inline-flex min-h-9 items-center text-[12.5px] font-semibold text-brand-strong">{rows && rows.length > KEEP ? (zh ? `全部 ${rows.length} 段对话 → 消息` : `All ${rows.length} threads → Messages`) : (zh ? '打开消息 →' : 'Open Messages →')}</Link>
          <p className="mt-1 text-[11.5px] leading-relaxed text-body-3">
            {zh ? '这是别人写给你的。AI 助理每次对话会读其中没读的几条来提醒你，不会替你回复——回复由你在「消息」里自己发。' : 'These are written to you. Your AI Agent reads the unread ones each time you talk, to remind you — it never replies for you; you reply yourself in Messages.'}
          </p>
        </>
      )}
    </div>
  )
}
