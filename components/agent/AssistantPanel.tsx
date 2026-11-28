'use client'

// The AI Agent itself, beside the conversation (lg+) or in a sheet (below lg): who it is, what it
// does for you and when, what it asked you and what you said, what arrives for you.
//
// 2026-11-27 (user: 「把我们 agent 的控制页面也改成和这个类似，尤其是功能上」, with four
// screenshots of the Muse panel): four tabs, after that panel —
//   任务  例行任务 (what it does on a schedule) · 今天 (what it did today) · 更早办完的
//   批准  等你点头 · 批准记录 (every card it proposed and what became of it)
//   身份  name · 风格 · 人设 · 记忆 · what it runs with (对话模型 · 推送)
//   收件  what other people wrote to you (the message centre's threads)
// Under the name: what it is doing right now while a reply is on its way, else what it is
// connected to. Each tab's body lives in its own file (PanelTasksTab …); this file is the head
// and the tab bar.
//
// What did not change: approvals happen only on the cards in the conversation — the panel shows
// where each waiting card is and keeps the record, it never decides; the full list of
// conversations is the AI chats list on the left (2026-10-04) and 今天 lists today's only; the
// tabs have their names written out (2026-10-04); no hat marker under the name (2026-09-25).
// Before this: 待办 · 记忆 · 设置 (2026-10-04), and four icon-only tabs before that (2026-09-25).
import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { useOnChange } from '@/lib/ui/useOnChange'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { useT } from '@/lib/i18n'
import { setAIName, invalidateAiName } from '@/lib/aiName'
import { waitingCards } from '@/lib/agent/threadCards'
import { AssistantAvatar, setStoredAvatar } from '@/lib/agent/avatars'
import AvatarPicker from './AvatarPicker'
import { saveAssistantAvatar, saveAssistantName } from '@/lib/agent/assistantProfile'
import { useUnreadMessages } from '@/lib/messages/unread'
import { PANEL_TABS, isPanelTab, tabOfRequest, type PanelRequest, type PanelTab } from '@/lib/agent/panelTabs'
import type { AgentRole, AgentStatus, MemoryItem, PendingAction } from '@/lib/agent/types'
import PanelTasksTab from './PanelTasksTab'
import PanelApprovalsTab from './PanelApprovalsTab'
import PanelIdentityTab, { type IdentityPage } from './PanelIdentityTab'
import PanelInboxTab from './PanelInboxTab'
import { ApprovalsIcon, AvatarIcon, IdentityIcon, InboxIcon, PencilIcon, TasksIcon } from './panelIcons'

export type { PanelRequest, PanelTab } from '@/lib/agent/panelTabs'
const TAB_ORDER = PANEL_TABS
const STATUS_READS: Record<string, { zh: string; en: string }> = {
  tenant: { zh: '你的记忆、待办与租约', en: 'your memory, to-dos and lease' },
  landlord: { zh: '你的申请、租约与房源', en: 'your applications, leases and listings' },
  agent: { zh: '你的客户与任务', en: 'your clients and tasks' },
}
const TAB_KEY = 'sl-assistant-panel-tab'

export default function AssistantPanel({
  role, agentName, pendingActions, memories, live, avatar, onAvatarChange, currentThreadId, onOpenThread, onScrollToCard, onClose,
  variant = 'column', initialTab, onTabRequestUsed, visible = true, status,
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
  /** A tab the page asks for (a ?panel= link; 'memory' = 身份 opened on its 记忆 page). One-shot: once shown, onTabRequestUsed hands it back. */
  initialTab?: PanelRequest
  onTabRequestUsed?: () => void
  /** Mounted but off screen → fetch nothing. */
  visible?: boolean
  /** What the conversation is doing right now — the line under the name follows it. */
  status?: AgentStatus
}) {
  const { lang } = useT()
  const zh = lang === 'zh'
  const auth = useAuth()

  // Which tab: the caller's, else (column) the last one used, else 任务.
  const [tab, setTabState] = useState<PanelTab>(initialTab ? tabOfRequest(initialTab) : 'tasks')
  // 身份 has pages (home · 人设 · 记忆); a ?panel=memory link lands on 记忆.
  const [identityPage, setIdentityPage] = useState<IdentityPage>(initialTab === 'memory' ? 'memory' : 'home')
  // On mount only: the column reopens on the last tab used, unless the page asked for one.
  useEffect(() => {
    if (initialTab || variant === 'sheet') return
    try { const v = localStorage.getItem(TAB_KEY); if (isPanelTab(v)) setTabState(v) } catch { /* private mode */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // The page asked for a tab: show it, move focus to it (a link said 「在记忆里」 — keyboard and screen-reader
  // users should land there, review 2026-10-05), and hand the request back so it is not replayed.
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  useEffect(() => {
    if (!initialTab) return
    const want = tabOfRequest(initialTab)
    setTabState(want)
    setIdentityPage(initialTab === 'memory' ? 'memory' : 'home')
    const i = TAB_ORDER.indexOf(want)
    // Directly, not in requestAnimationFrame: a tab opened in the background runs no frames, and in the sheet
    // this lands before the dialog's own first-focus (which then leaves it alone).
    tabRefs.current[i]?.focus({ preventScroll: true })
    onTabRequestUsed?.()
  }, [initialTab, onTabRequestUsed])
  // A new tab, or a new page of 身份, starts at its top: the scroll position belonged to what was there before
  // (the column scrolls its tab body, the sheet scrolls as a whole).
  const rootRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = variant === 'sheet' ? rootRef.current : bodyRef.current
    if (el) el.scrollTop = 0
  }, [tab, identityPage, variant])
  const setTab = useCallback((t: PanelTab) => {
    setTabState(t)
    // Tapping 身份 always shows its first page — also when it is already the tab on screen.
    if (t === 'identity') setIdentityPage('home')
    if (variant === 'column') { try { localStorage.setItem(TAB_KEY, t) } catch { /* private mode */ } }
  }, [variant])

  const waiting = waitingCards(pendingActions)
  // 名片状态: what it is doing right now while a reply is on its way (2026-11-27, the Muse panel's
  // 「Explaining plan C」 line); otherwise connected and reading what, or preview (第一批 ③, 2026-10-25).
  const busyLine = status === 'understanding'
    ? (zh ? '正在读你的消息…' : 'Reading your message…')
    : status === 'working' ? (zh ? '正在处理你的请求…' : 'Working on your request…') : null
  const statusLine = busyLine ?? (live
    ? (zh ? `已连接 · 读取${STATUS_READS[role].zh}` : `Connected · reads ${STATUS_READS[role].en}`)
    : (zh ? '预览 · 未登录，只看不记' : 'Preview · not signed in, nothing is saved'))
  const statusNode = (
    <>
      {busyLine && <span aria-hidden className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-brand align-middle" />}
      {statusLine}
    </>
  )
  // 收件's badge: unread messages from people (the same count as the rail's 消息).
  const unreadMessages = useUnreadMessages(live && visible)

  // Rename in place: the name is the account's (assistant_profiles RLS = self).
  const [renaming, setRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState(agentName)
  const [name, setName] = useState(agentName)
  useOnChange(agentName, () => { setName(agentName); setNameDraft(agentName) })
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
    { key: 'tasks', label: zh ? '任务' : 'Tasks', icon: <TasksIcon />, badge: 0 },
    { key: 'approvals', label: zh ? '批准' : 'Approvals', icon: <ApprovalsIcon />, badge: waiting.length },
    { key: 'identity', label: zh ? '身份' : 'Identity', icon: <IdentityIcon />, badge: 0 },
    { key: 'inbox', label: zh ? '收件' : 'Inbox', icon: <InboxIcon />, badge: unreadMessages },
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
    <div ref={rootRef} data-testid="assistant-panel" className={`flex h-full min-h-0 flex-col bg-white ${sheet ? 'overflow-y-auto overscroll-contain' : ''}`}>
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
            <div data-testid="assistant-status" data-busy={busyLine ? 'true' : undefined} aria-live="polite" className="truncate text-[11px] text-body-3">{statusNode}</div>
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
          <div data-testid="assistant-status" data-busy={busyLine ? 'true' : undefined} aria-live="polite" className="mt-1 text-[11.5px] text-body-3">{statusNode}</div>
        </div>
      )}
      {picking && <AvatarPicker role={role} avatar={avatar} live={live} zh={zh} onPick={(k) => void chooseAvatar(k)} className={`mx-auto mt-3 max-w-[300px] flex-none ${sheet ? 'px-4' : ''}`} />}

      {/* Four tabs (2026-11-27), names written out (2026-10-04). Each takes the room its name needs and they
          share what is left (flex-auto, not four equal quarters): in a 320px column 「Approvals」 with its icon
          is wider than a quarter, and an equal split squeezed the icon out. */}
      <div className={`${sheet ? 'mx-4' : 'mx-4 2xl:mx-5'} mt-3 flex flex-none items-center gap-0.5 rounded-full bg-surface-chip p-[3px]`} role="tablist" aria-label={zh ? 'AI 助理' : 'AI Agent'}>
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
            className={`relative flex h-10 flex-auto items-center justify-center gap-1 whitespace-nowrap rounded-full px-1 text-[12.5px] font-semibold transition [&>svg]:flex-none ${tab === t.key ? 'bg-white text-ink shadow-[0_1px_3px_rgba(27,27,60,.1)]' : 'text-body-3 hover:text-body-2'}`}
          >
            {t.icon}
            <span>{t.label}</span>
            {t.badge > 0 && <span data-testid={`panel-badge-${t.key}`} className="absolute -top-0.5 right-0 min-w-[16px] rounded-full bg-warning px-1 text-center text-[10px] font-extrabold leading-4 text-white">{t.badge > 99 ? '99+' : t.badge}</span>}
          </button>
        ))}
      </div>

      <div ref={bodyRef} className={`${sheet ? 'flex-none px-4' : 'min-h-0 flex-1 overflow-y-auto px-5'} pb-5 pt-3.5`} role="tabpanel" id={`${idp}-panel-${tab}`} aria-labelledby={`${idp}-tab-${tab}`}>
        {/* Mounted but off screen (the column below lg) → render no tab body, so nothing fetches. */}
        {visible && tab === 'tasks' && (
          <PanelTasksTab role={role} live={live} visible={visible} onOpenThread={onOpenThread} onClose={variant === 'sheet' ? onClose : undefined} />
        )}
        {visible && tab === 'approvals' && (
          <PanelApprovalsTab role={role} live={live} waiting={waiting} currentThreadId={currentThreadId} onOpenThread={onOpenThread} onScrollToCard={onScrollToCard} onClose={variant === 'sheet' ? onClose : undefined} visible={visible} />
        )}
        {visible && tab === 'identity' && (
          <PanelIdentityTab role={role} live={live} name={name} memories={memories} visible={visible} page={identityPage} onPage={setIdentityPage} />
        )}
        {visible && tab === 'inbox' && <PanelInboxTab live={live} visible={visible} />}
      </div>
    </div>
  )
}
