'use client'

// The AI Agent itself, beside the conversation (lg+) or in a sheet (below lg):
// who it is, what it is waiting on you for, what it knows about you, how it is
// set up. Muse web reference (2026-09-25); regrouped 2026-10-04 (user: 「重新
// 布置…更系统化、更友好」 → 「取消活动，对话只在左边」):
//   · the 活动 tab is gone — conversations are listed once, in the AI chats
//     list (ThreadList); what it finished for you sits under 待办 as
//     「最近替你办完」, and bookkeeping (a new avatar, file views, exports)
//     stays on the audit page;
//   · three tabs with their names written out: 待办 · 记忆 · 设置;
//   · 记忆 holds both what it learned (画像) and what it remembers.
// Nothing under the name: no status line, no hat marker (user 2026-09-25).
// Approvals still happen only on the cards in the conversation.
import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { useT } from '@/lib/i18n'
import { setAIName, invalidateAiName } from '@/lib/aiName'
import { auditActionLabel } from '@/lib/agent/ideas'
import { fmtRowTime } from '@/lib/agent/activityLog'
import { useRecentOutcomes } from '@/lib/agent/useActivityLog'
import { cardThreadId, waitingCards } from '@/lib/agent/threadCards'
import { cleanTitle } from '@/lib/agent/threadList'
import { AssistantAvatar, setStoredAvatar } from '@/lib/agent/avatars'
import AvatarPicker from './AvatarPicker'
import { saveAssistantAvatar, saveAssistantName } from '@/lib/agent/assistantProfile'
import type { AgentRole, MemoryItem, PendingAction } from '@/lib/agent/types'
import PrivateMemorySnapshot from './PrivateMemorySnapshot'
import AssistantSettings from './AssistantSettings'
import { AvatarIcon, MemoryIcon, PencilIcon, SlidersIcon, TodoTabIcon } from './panelIcons'

export type PanelTab = 'todo' | 'memory' | 'settings'
const TAB_ORDER: PanelTab[] = ['todo', 'memory', 'settings']
const TAB_KEY = 'sl-assistant-panel-tab'

export default function AssistantPanel({
  role, agentName, pendingActions, memories, live, avatar, onAvatarChange, currentThreadId, onOpenThread, onScrollToCard, onClose,
  variant = 'column', initialTab, onTabRequestUsed, visible = true,
}: {
  role: AgentRole
  agentName: string
  pendingActions: PendingAction[]
  memories: MemoryItem[]
  live: boolean
  avatar: string | null
  onAvatarChange: (key: string | null) => void
  currentThreadId: string | null
  onOpenThread: (id: string) => void | Promise<void>
  /** Bring a card in the open conversation into view (the page owns the chat). */
  onScrollToCard?: (id: string) => void
  onClose: () => void
  /** 'column' beside the chat (lg+); 'sheet' = the same panel in a bottom sheet (below lg). */
  variant?: 'column' | 'sheet'
  /** A tab the page asks for (a ?panel= link). One-shot: once shown, onTabRequestUsed hands it back. */
  initialTab?: PanelTab
  onTabRequestUsed?: () => void
  /** Mounted but off screen → fetch nothing. */
  visible?: boolean
}) {
  const { lang } = useT()
  const zh = lang === 'zh'
  const auth = useAuth()

  // Which tab: the caller's, else (column) the last one used, else 待办; the sheet opens on 记忆
  // because the phone's bottom bar already has 待办.
  const [tab, setTabState] = useState<PanelTab>(initialTab ?? (variant === 'sheet' ? 'memory' : 'todo'))
  // On mount only: the column reopens on the last tab used, unless the page asked for one.
  useEffect(() => {
    if (initialTab || variant === 'sheet') return
    try { const v = localStorage.getItem(TAB_KEY); if (v === 'todo' || v === 'memory' || v === 'settings') setTabState(v) } catch { /* private mode */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // The page asked for a tab: show it, move focus to it (a link said 「在记忆里」 — keyboard and screen-reader
  // users should land there, review 2026-10-05), and hand the request back so it is not replayed.
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  useEffect(() => {
    if (!initialTab) return
    setTabState(initialTab)
    const i = TAB_ORDER.indexOf(initialTab)
    requestAnimationFrame(() => tabRefs.current[i]?.focus({ preventScroll: true }))
    onTabRequestUsed?.()
  }, [initialTab, onTabRequestUsed])
  const setTab = useCallback((t: PanelTab) => {
    setTabState(t)
    if (variant === 'column') { try { localStorage.setItem(TAB_KEY, t) } catch { /* private mode */ } }
  }, [variant])

  const waiting = waitingCards(pendingActions)

  // Rename in place: the name is the account's (assistant_profiles RLS = self).
  const [renaming, setRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState(agentName)
  const [name, setName] = useState(agentName)
  useEffect(() => { setName(agentName); setNameDraft(agentName) }, [agentName])
  async function saveName() {
    const next = nameDraft.trim().slice(0, 20)
    setRenaming(false)
    if (!next || next === name) return
    setName(next)
    setAIName(next, live && auth.user ? auth.user.id : null)
    invalidateAiName()
    if (live && auth.user) await saveAssistantName(supabase, auth.user.id, next)
  }

  // Pencil → 换头像 / 改名 (as on Muse). Outside click / Esc closes the menu.
  const [picking, setPicking] = useState(false)
  const [menu, setMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!menu) return
    const onDown = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); setMenu(false) } }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [menu])
  async function chooseAvatar(key: string | null) {
    setPicking(false)
    onAvatarChange(key)
    setStoredAvatar(key ?? 'default')
    if (live && auth.user) await saveAssistantAvatar(supabase, auth.user.id, key)
  }

  const TABS: { key: PanelTab; label: string; icon: ReactNode; badge: number }[] = [
    { key: 'todo', label: zh ? '待办' : 'To-do', icon: <TodoTabIcon />, badge: waiting.length },
    { key: 'memory', label: zh ? '记忆' : 'Memory', icon: <MemoryIcon />, badge: 0 },
    { key: 'settings', label: zh ? '设置' : 'Settings', icon: <SlidersIcon />, badge: 0 },
  ]
  function onTabKey(e: ReactKeyboardEvent<HTMLButtonElement>, i: number) {
    const last = TABS.length - 1
    const to = e.key === 'ArrowRight' ? (i === last ? 0 : i + 1) : e.key === 'ArrowLeft' ? (i === 0 ? last : i - 1) : e.key === 'Home' ? 0 : e.key === 'End' ? last : -1
    if (to < 0) return
    e.preventDefault()
    setTab(TABS[to].key)
    tabRefs.current[to]?.focus()
  }
  const idp = variant === 'sheet' ? 'sheet' : 'col'
  const sheet = variant === 'sheet'

  const pencil = (
    <div ref={menuRef} className="absolute -bottom-1 -right-1">
      <button
        type="button"
        onClick={() => setMenu((v) => !v)}
        aria-label={zh ? '编辑 AI 助理' : 'Edit AI Agent'}
        title={zh ? '换头像 / 改名' : 'Change avatar / edit name'}
        aria-haspopup="menu"
        aria-expanded={menu}
        disabled={!live}
        data-testid={sheet ? 'sheet-pencil' : undefined}
        className="flex h-7 w-7 items-center justify-center rounded-full border border-line-divider bg-white text-body shadow-sm transition hover:border-line-strong disabled:hidden"
      >
        <PencilIcon />
      </button>
      {menu && (
        <div role="menu" className={`absolute top-full z-50 mt-1.5 w-[172px] overflow-hidden rounded-xl border border-line bg-white py-1 text-left shadow-xl ${sheet ? 'left-0' : 'left-1/2 -translate-x-1/2'}`}>
          <button type="button" role="menuitem" onClick={() => { setMenu(false); setPicking(true) }} className="flex w-full items-center gap-2.5 px-3 py-2 text-[13.5px] font-semibold text-ink transition hover:bg-surface"><AvatarIcon /> {zh ? '换头像' : 'Change avatar'}</button>
          <button type="button" role="menuitem" onClick={() => { setMenu(false); setRenaming(true) }} className="flex w-full items-center gap-2.5 px-3 py-2 text-[13.5px] font-semibold text-ink transition hover:bg-surface"><PencilIcon /> {zh ? '改名' : 'Edit name'}</button>
        </div>
      )}
    </div>
  )
  const nameEditor = (
    <form onSubmit={(e) => { e.preventDefault(); void saveName() }} className={`flex items-center gap-1.5 ${sheet ? 'max-w-[240px]' : 'mx-auto mt-2.5 max-w-[220px]'}`}>
      <input autoFocus value={nameDraft} maxLength={20} onChange={(e) => setNameDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); setNameDraft(name); setRenaming(false) } }} onBlur={() => void saveName()} aria-label={zh ? 'AI 助理名字' : 'AI Agent name'} className={`min-w-0 flex-1 rounded-lg border border-line-strong px-2.5 py-1 font-medium ${sheet ? 'text-[16px]' : 'text-center text-[18px]'}`} />
      <button type="submit" className="rounded-lg px-2.5 py-1 text-[12px] font-bold text-white" style={{ background: '#1B1B3C' }}>{zh ? '好' : 'OK'}</button>
    </form>
  )

  return (
    <div data-testid="assistant-panel" className={`flex h-full min-h-0 flex-col bg-white ${sheet ? 'overflow-y-auto overscroll-contain' : ''}`}>
      {sheet ? (
        <div className="relative flex flex-none items-center gap-3 border-b border-line-soft px-4 pb-3 pt-1">
          <div className="relative h-12 w-12 flex-none">
            <button type="button" onClick={() => live && setPicking((v) => !v)} aria-label={zh ? '换头像' : 'Change avatar'} disabled={!live} className="block h-full w-full rounded-full">
              <AssistantAvatar avatar={avatar} role={role} className="h-full w-full" fallback={live ? 'brand' : 'role'} />
            </button>
            {pencil}
          </div>
          <div className="min-w-0 flex-1">
            {renaming ? nameEditor : <div className="truncate text-[17px] font-medium tracking-tight text-ink">{name}</div>}
          </div>
          <button type="button" onClick={onClose} aria-label={zh ? '关闭' : 'Close'} className="flex h-11 w-11 flex-none items-center justify-center rounded-full text-[22px] text-body-3 transition hover:bg-surface-chip hover:text-body">×</button>
        </div>
      ) : (
        <div className="relative flex-none border-b border-line-soft px-5 pb-4 pt-6 text-center">
          <button type="button" onClick={onClose} aria-label={zh ? '收起 AI 助理面板' : 'Hide the AI Agent panel'} title={zh ? '收起（可从右上角头像重新打开）' : 'Hide (reopen from the avatar top-right)'} className="absolute right-3 top-2.5 flex h-10 w-10 items-center justify-center rounded-lg text-[20px] text-body-3 transition hover:bg-surface-chip hover:text-body">×</button>
          <div className="relative mx-auto h-[72px] w-[72px]">
            <button type="button" onClick={() => setPicking((v) => !v)} aria-label={zh ? '换头像' : 'Change avatar'} title={zh ? '换头像' : 'Change avatar'} className="block h-full w-full rounded-full shadow-[0_8px_24px_rgba(27,27,60,.18)] transition hover:scale-[1.03]">
              <AssistantAvatar avatar={avatar} role={role} className="h-full w-full" fallback={live ? 'brand' : 'role'} />
            </button>
            {pencil}
          </div>
          {renaming ? nameEditor : <div className="mt-3 text-[26px] font-medium leading-tight tracking-tight text-ink">{name}</div>}
        </div>
      )}
      {picking && <AvatarPicker role={role} avatar={avatar} live={live} zh={zh} onPick={(k) => void chooseAvatar(k)} className={`mx-auto mt-3 max-w-[300px] flex-none ${sheet ? 'px-4' : ''}`} />}

      {/* Three tabs, names written out (2026-10-04). */}
      <div className={`${sheet ? 'mx-4' : 'mx-5'} mt-3 flex flex-none items-center gap-1 rounded-full bg-surface-chip p-[3px]`} role="tablist" aria-label={zh ? 'AI 助理' : 'AI Agent'}>
        {TABS.map((t, i) => (
          <button
            key={t.key}
            ref={(el) => { tabRefs.current[i] = el }}
            type="button"
            role="tab"
            id={`${idp}-tab-${t.key}`}
            aria-selected={tab === t.key}
            aria-controls={`${idp}-panel-${t.key}`}
            tabIndex={tab === t.key ? 0 : -1}
            onClick={() => setTab(t.key)}
            onKeyDown={(e) => onTabKey(e, i)}
            data-testid={`panel-tab-${t.key}`}
            className={`relative flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full text-[13px] font-semibold transition ${tab === t.key ? 'bg-white text-ink shadow-[0_1px_3px_rgba(27,27,60,.1)]' : 'text-body-3 hover:text-body-2'}`}
          >
            {t.icon}
            <span>{t.label}</span>
            {t.badge > 0 && <span className="min-w-[16px] rounded-full bg-warning px-1 text-center text-[10px] font-extrabold leading-4 text-white">{t.badge > 99 ? '99+' : t.badge}</span>}
          </button>
        ))}
      </div>

      <div className={`${sheet ? 'flex-none px-4' : 'min-h-0 flex-1 overflow-y-auto px-5'} pb-5 pt-3.5`} role="tabpanel" id={`${idp}-panel-${tab}`} aria-labelledby={`${idp}-tab-${tab}`}>
        {/* Mounted but off screen (the column below lg) → render no tab body, so nothing fetches. */}
        {!visible ? null : tab === 'todo' && (
          <TodoTab role={role} live={live} waiting={waiting} currentThreadId={currentThreadId} onOpenThread={onOpenThread} onScrollToCard={onScrollToCard} onClose={variant === 'sheet' ? onClose : undefined} visible={visible} />
        )}
        {visible && tab === 'memory' && (
          <div className="space-y-3">
            <AssistantSettings role={role} live={live} view="profile" />
            <div className="rounded-2xl border border-line-divider bg-white p-4">
              <div className="mb-1 text-[13.5px] font-semibold text-ink">{zh ? '它记住的事' : 'What it remembers'}</div>
              <PrivateMemorySnapshot agentName={name} memories={memories} role={role} editable={live} />
            </div>
            <p className="px-1 text-[11.5px] text-body-3">{zh ? '画像和记忆跨身份共用一份，只有你能看到。' : 'One profile and one memory across your roles — only you can see them.'}</p>
          </div>
        )}
        {visible && tab === 'settings' && <AssistantSettings role={role} live={live} view="settings" />}
      </div>
    </div>
  )
}

/** 待办: what it is waiting on you for — and where to handle each one — then what it finished lately. */
function TodoTab({ role, live, waiting, currentThreadId, onOpenThread, onScrollToCard, onClose, visible }: {
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
  const outcomes = useRecentOutcomes(live, role, visible)

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
    <div className="space-y-5">
      <section>
        <h3 className="mb-1 text-[12.5px] font-semibold text-body-2">{zh ? `等你点头 · ${waiting.length}` : `Waiting on you · ${waiting.length}`}</h3>
        {waiting.length === 0 ? (
          <p className="py-2 text-[13px] leading-relaxed text-body-3">{zh ? '没有等你点头的事。它提议的每件事都要你批准才执行。' : 'Nothing waiting on you. Everything it proposes runs only once you approve.'}</p>
        ) : (
          <ul className="divide-y divide-line-soft" data-testid="panel-waiting">
            {waiting.map((a) => (
              <li key={a.id} className="py-2.5">
                <div className="text-[13.5px] font-semibold leading-snug text-ink">{a.title}</div>
                {a.summary && <div className="mt-0.5 line-clamp-1 text-[12px] leading-snug text-body-3">{a.summary}</div>}
                <div className="mt-0.5">{where(a)}</div>
              </li>
            ))}
          </ul>
        )}
        <Link href={`/${role}/todo`} className="mt-1 inline-flex min-h-9 items-center text-[12.5px] font-semibold text-brand-strong">{zh ? '全部待办 → 待办页' : 'All to-dos → To-do page'}</Link>
      </section>

      {live && (
        <section>
          <h3 className="mb-1 text-[12.5px] font-semibold text-body-2">{zh ? '最近替你办完' : 'Recently done for you'}</h3>
          {outcomes === null ? (
            <p className="py-2 text-[12.5px] text-body-3">{zh ? '读取中…' : 'Loading…'}</p>
          ) : outcomes.length === 0 ? (
            <p className="py-2 text-[13px] text-body-3">{zh ? '最近 7 天还没有替你办完的事。' : 'Nothing done for you in the last 7 days.'}</p>
          ) : (
            <ul className="space-y-0.5" data-testid="panel-outcomes">
              {outcomes.map((o) => {
                const tid = typeof o.metadata?.thread_id === 'string' ? (o.metadata.thread_id as string) : null
                const body = (
                  <>
                    <span className="mt-px flex-none text-success">✓</span>
                    <span className="min-w-0 flex-1 text-[13px] leading-snug text-body">{auditActionLabel(o.action, lang, o.metadata || undefined)}</span>
                    <span className="flex-none font-mono text-[10.5px] text-body-3">{fmtRowTime(o.created_at, lang)}</span>
                  </>
                )
                return (
                  <li key={o.id}>
                    {tid ? (
                      <button type="button" onClick={() => { onClose?.(); void onOpenThread(tid) }} title={zh ? '回到这段对话' : 'Back to this chat'} className="-mx-2 flex w-[calc(100%+16px)] items-start gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-surface-chip">{body}</button>
                    ) : (
                      <div className="-mx-2 flex items-start gap-2 px-2 py-1.5">{body}</div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          <Link href={`/${role}/audit`} className="mt-1 inline-flex min-h-9 items-center text-[12.5px] font-semibold text-brand-strong">{zh ? '完整审计 →' : 'Full audit →'}</Link>
        </section>
      )}
    </div>
  )
}
