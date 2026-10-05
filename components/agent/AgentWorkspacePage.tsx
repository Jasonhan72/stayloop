'use client'

// The assistant page for every hat — /tenant/agent (Luna), /landlord/agent
// (Logic), /agent/agent (Brief): one component, three thin routes (user
// 2026-09-25: "把三个助手页抽成共享组件"; until then the three files were 95%
// identical and a guard test compared them byte for byte).
//
// The assistant IS the screen (user 2026-09-24/25, phone and web). Regrouped
// 2026-10-04 (「重新布置…更系统化、更友好」): left = where to go and what you
// talked about (the icon rail with ＋ 新对话, then the AI chats list — a column
// from xl, a drawer below), middle = this conversation, right = the AI Agent
// itself (待办 · 记忆 · 设置; a sheet below lg, opened from the chat head).
// Each thing appears once. Phone: [context strip] + [chat] between the 56px
// header and the 64px tab bar. 今日 lives on /x/todo, the 租前·租中·租后 rail on
// /x/progress — nothing sits above the conversation.
import { useCallback, useEffect, useRef, useState } from 'react'
import WorkspaceShell from '@/components/WorkspaceShell'
import AgentChat from '@/components/agent/AgentChat'
import type { ComposerDraft } from '@/components/agent/AgentInputBar'
import AssistantPanel, { type PanelTab } from '@/components/agent/AssistantPanel'
import ThreadList, { SidebarIcon } from '@/components/agent/ThreadList'
import AssistantSheet from '@/components/mobile/AssistantSheet'
import { useMinWidth } from '@/lib/ui/useMinWidth'
import { useModalA11y } from '@/lib/ui/useModalA11y'
import { stripUrlParams } from '@/lib/ui/stripUrlParams'
import { waitingCards } from '@/lib/agent/threadCards'
import ContextStrip from '@/components/mobile/ContextStrip'
import { useLifecycle } from '@/lib/lifecycle/useLifecycle'
import { useAgentSession } from '@/lib/agent/useAgentSession'
import { useAssistantPanel } from '@/lib/agent/useAssistantPanel'
import { AssistantAvatar, getStoredAvatar, setStoredAvatar } from '@/lib/agent/avatars'
import { usePromptDeepLink } from '@/lib/agent/usePromptDeepLink'
import { useT } from '@/lib/i18n'
import { useAuth } from '@/lib/useAuth'
import { useHats } from '@/lib/useHats'
import { displayAiName } from '@/lib/agent/assistantName'
import type { AgentRole } from '@/lib/agent/types'

/** The one line that differs per hat: what the assistant reads once the visitor signs in. */
const PREVIEW_READS: Record<AgentRole, { zh: string; en: string }> = {
  tenant: { zh: '记忆与待办', en: 'memory and to-dos' },
  landlord: { zh: '政策与申请', en: 'policies and applications' },
  agent: { zh: '任务与客户', en: 'tasks and clients' },
}

export default function AgentWorkspacePage({ role }: { role: AgentRole }) {
  const auth = useAuth()
  const hats = useHats()
  // A signed-in account without the landlord hat must never start a landlord
  // session (bootstrap RPC, agent_configs bump, *_session_started audit) on its
  // way to /landlord/become — the session hook used to run before the shell's
  // guard could redirect (site test 2026-10-02, L6 D5). Until the hats are
  // known only the shell renders; it redirects a hat-less account once.
  const signedIn = !!auth.user && !(auth.user as { is_anonymous?: boolean }).is_anonymous
  const landlordHatUnknownOrMissing = role === 'landlord' && (auth.loading || (signedIn && (hats.loading || !hats.landlord)))
  if (landlordHatUnknownOrMissing) {
    return (
      <WorkspaceShell role={role} hideAside>
        <LoadingState />
      </WorkspaceShell>
    )
  }
  return <AgentWorkspaceInner role={role} />
}

function AgentWorkspaceInner({ role }: { role: AgentRole }) {
  const { lang } = useT()
  const { loading, live, data, status, messages, decide, sendMessage, markListingsShown, scheduled, undo, threadId, threadLoading, openThread, newThread } = useAgentSession(role)
  const [draft, setDraft] = useState<ComposerDraft | null>(null)
  const prefill = useCallback((t: string) => setDraft({ text: t, nonce: Date.now() }), [])
  usePromptDeepLink(loading, sendMessage, prefill)
  const { lifecycle } = useLifecycle(role)
  const [panelOpen, setPanelOpen] = useAssistantPanel()
  // Conversation list (2026-10-04): an inline column from xl (remembered open /
  // closed per browser), a drawer over the chat below that.
  const [listPref, setListPrefState] = useState<'open' | 'closed'>('open')
  useEffect(() => {
    try { if (localStorage.getItem('sl-thread-list') === 'closed') setListPrefState('closed') } catch { /* private mode */ }
  }, [])
  const setListPref = useCallback((v: 'open' | 'closed') => {
    setListPrefState(v)
    try { localStorage.setItem('sl-thread-list', v) } catch { /* private mode */ }
  }, [])
  const [listDrawer, setListDrawer] = useState(false)
  // Hidden surfaces never mount or fetch (2026-10-04): the list column only from xl, the panel column only from lg.
  const xlUp = useMinWidth(1280)
  const lgUp = useMinWidth(1024)
  // Keyboard focus follows the column (review 2026-10-04): into its search box when it opens, back to
  // the 「AI 对话」 pill when it closes — it used to drop to <body>.
  const pillRef = useRef<HTMLButtonElement>(null)
  const [focusColumn, setFocusColumn] = useState(false)
  const openList = useCallback(() => {
    if (xlUp) { setListPref('open'); setFocusColumn(true) }
    else setListDrawer(true)
  }, [setListPref, xlUp])
  const closeColumn = useCallback(() => {
    setListPref('closed')
    requestAnimationFrame(() => pillRef.current?.focus())
  }, [setListPref])
  const drawerRef = useRef<HTMLDivElement>(null)
  const closeDrawer = useCallback(() => setListDrawer(false), [])
  useModalA11y(listDrawer, closeDrawer, drawerRef)
  // Below lg the chat head opens the same AI Agent panel as a sheet.
  const [sheetOpen, setSheetOpen] = useState(false)
  useEffect(() => { if (lgUp) setSheetOpen(false) }, [lgUp])
  // /x/agent?panel=todo|memory|settings (2026-10-05, the progress page's 「记忆」 line): open the AI Agent on
  // that tab — the column from lg, the sheet below — and drop the parameter. Read after mount only. The request
  // is one-shot: whichever surface shows it hands it back (clearTabRequest), so closing and reopening the panel
  // returns to the tab the person last used.
  const [requestedTab, setRequestedTab] = useState<PanelTab | null>(null)
  const clearTabRequest = useCallback(() => setRequestedTab(null), [])
  useEffect(() => {
    try {
      const want = new URLSearchParams(window.location.search).get('panel')
      if (want !== 'todo' && want !== 'memory' && want !== 'settings') return
      stripUrlParams(['panel'])
      setRequestedTab(want)
      const wide = typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 1024px)').matches
      if (wide) setPanelOpen(true)
      else setSheetOpen(true)
    } catch { /* no window.location (tests) */ }
    // once, on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // The panel's 「在这段对话里 ↓」: scroll the chat's own thread (never the page) to the card and focus it.
  const scrollToCard = useCallback((id: string) => {
    const thread = document.querySelector<HTMLElement>('[data-chat-thread]')
    const card = thread?.querySelector<HTMLElement>(`[data-card-id="${CSS.escape(id)}"]`)
    if (!thread || !card) return
    const top = card.getBoundingClientRect().top - thread.getBoundingClientRect().top + thread.scrollTop - 16
    thread.scrollTo({ top, behavior: 'smooth' })
    card.focus({ preventScroll: true })
  }, [])
  // The assistant's face: the chosen preset (agent_configs.avatar, mirrored in localStorage) or the role orb.
  const [avatar, setAvatar] = useState<string | null>(null)
  const dbAvatar = data?.agent.avatar ?? null
  // Live: the account's saved choice wins and is mirrored locally — it used to be the other way round,
  // so a choice made on another device never showed (review 2026-09-25). Demo sessions use the browser's.
  const hasData = !!data
  useEffect(() => {
    if (live && hasData) { setAvatar(dbAvatar); setStoredAvatar(dbAvatar ?? 'default') }
    else setAvatar(getStoredAvatar() ?? dbAvatar)
  }, [dbAvatar, live, hasData])

  if (loading || !data) {
    return (
      <WorkspaceShell role={role} hideAside>
        <LoadingState />
      </WorkspaceShell>
    )
  }

  const { agent, workflow, memories, pendingActions } = data
  const zh = lang === 'zh'
  const shownName = displayAiName(agent.agent_name, lang)
  const stageLabel = lifecycle ? (zh ? lifecycle.phases.find((p) => p.key === lifecycle.current)?.title.zh ?? '' : lifecycle.phases.find((p) => p.key === lifecycle.current)?.title.en ?? '') : ''
  // Approved-but-not-run cards on the list (stalled: 现在执行 / 放弃) are waiting on you too.
  // Preview (not signed in): the demo approval cards explain the approval step under the greeting, but
  // once the visitor asks their own question — the homepage's ask box sends people straight here — a
  // sample card about Sarah Wang's Unit 1207 under it would read as the AI's answer (2026-10-01). The
  // chat, the panel's to-do tab and the reopen pill all read the same list.
  const chatCards = live || !messages.some((m) => m.role === 'user') ? pendingActions : []
  const pending = waitingCards(chatCards)
  const pendingCount = pending.length
  const reads = PREVIEW_READS[role]

  return (
    <WorkspaceShell role={role} hideAside phoneApp>
      <div className="sl-phone-col flex flex-col md:h-[calc(100vh-66px)] md:flex-row">
        {live && xlUp && listPref === 'open' && (
          <aside className="flex w-[248px] flex-none flex-col border-r border-line-divider 2xl:w-[260px]" style={{ background: '#F3F8FC' }} aria-label={zh ? 'AI 对话' : 'AI chats'}>
            <ThreadList role={role} live={live} currentThreadId={threadId} onOpenThread={openThread} onNewThread={newThread} onClose={closeColumn} variant="column" focusSearch={focusColumn} onFocused={() => setFocusColumn(false)} />
          </aside>
        )}
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          {!live && (
            <div className="mx-5 mb-3 mt-4 flex-none rounded-xl border border-line-strong bg-surface-chip px-4 py-3 font-mono text-[11px] leading-relaxed text-body-3 md:mx-8 md:mb-2 md:mt-4">
              {zh
                ? `预览模式 · 登录后 AI 助理会读取你真实的${reads.zh},审批将写入审计 · `
                : `Preview mode · once you sign in, your AI Agent reads your real ${reads.en}, and approvals are written to the audit log · `}
              <a href="/login" className="whitespace-nowrap font-bold text-brand">{zh ? '登录 →' : 'Sign in →'}</a>
            </div>
          )}
          {live && <div className="md:hidden"><ContextStrip lifecycle={lifecycle} pending={pending.map((a) => ({ id: a.id, action_type: a.action_type, title: a.title }))} todoHref={`/${role}/todo`} lang={lang} onPrompt={prefill} /></div>}
          {!panelOpen && (
            <button type="button" onClick={() => setPanelOpen(true)} aria-label={zh ? '打开 AI 助理面板' : 'Open the AI Agent panel'} className="absolute right-4 top-3 z-10 hidden items-center gap-2 rounded-full border border-line-divider bg-white py-1 pl-1 pr-3 text-[12.5px] font-bold text-body-2 shadow-sm transition hover:border-line-strong lg:flex">
              <AssistantAvatar avatar={avatar} role={role} className="h-6 w-6" fallback={live ? 'brand' : 'role'} />
              {shownName}{pendingCount > 0 ? (zh ? ` · 等你点头 ${pendingCount} 件` : ` · ${pendingCount} waiting`) : ''}
            </button>
          )}
          <div className="relative min-h-0 flex-1">
            {live && (
              <button
                ref={pillRef}
                type="button"
                onClick={openList}
                aria-label={zh ? '查看全部 AI 对话' : 'All AI chats'}
                title={zh ? '全部 AI 对话' : 'All AI chats'}
                aria-expanded={listDrawer}
                data-testid="thread-list-toggle"
                className={`absolute left-3 top-3 z-10 flex h-11 items-center md:h-9 gap-1.5 rounded-full border border-line-divider bg-white px-2.5 text-[12.5px] font-semibold text-body-2 shadow-sm transition hover:border-line-strong hover:text-ink ${listPref === 'open' ? 'xl:hidden' : ''}`}
              >
                <SidebarIcon /> <span>{zh ? 'AI 对话' : 'AI chats'}</span>
              </button>
            )}
            <AgentChat
              hero
              phoneFill
              draft={draft}
              phaseLabel={stageLabel || null}
              avatar={avatar}
              avatarFallback={live ? 'brand' : 'role'}
              onAvatarChange={setAvatar}
              threadLoading={threadLoading} currentThreadId={threadId} onOpenThread={openThread}
              threadScopedCards={live}
              todoHref={`/${role}/todo`}
              onOpenAssistant={() => setSheetOpen(true)}
              role={role}
              agentName={shownName}
              status={status}
              messages={messages}
              onSend={sendMessage}
              onListingsShown={markListingsShown}
              pendingActions={chatCards}
              onDecide={decide}
              live={live}
              memoryCount={memories.length}
              workflow={workflow}
              scheduled={scheduled}
              onUndo={undo}
            />
          </div>
        </div>
        {live && listDrawer && (
          <div className="fixed inset-0 z-[60] xl:hidden">
            <button type="button" aria-label={zh ? '关闭' : 'Close'} tabIndex={-1} className="absolute inset-0 bg-black/30" onClick={closeDrawer} />
            <div ref={drawerRef} role="dialog" aria-modal="true" aria-label={zh ? 'AI 对话' : 'AI chats'} className="absolute inset-y-0 left-0 flex w-[300px] max-w-[85vw] flex-col shadow-xl" style={{ background: '#F3F8FC' }}>
              <ThreadList role={role} live={live} currentThreadId={threadId} onOpenThread={openThread} onNewThread={newThread} onClose={closeDrawer} variant="drawer" />
            </div>
          </div>
        )}
        {panelOpen && (
          <aside className="hidden lg:flex lg:w-[320px] lg:flex-none lg:flex-col lg:border-l lg:border-line-divider 2xl:w-[360px]">
            <AssistantPanel role={role} agentName={shownName} pendingActions={chatCards} memories={memories} live={live} avatar={avatar} onAvatarChange={setAvatar} currentThreadId={threadId} onOpenThread={openThread} onScrollToCard={scrollToCard} onClose={() => setPanelOpen(false)} visible={lgUp} initialTab={requestedTab ?? undefined} onTabRequestUsed={clearTabRequest} />
          </aside>
        )}
        {sheetOpen && !lgUp && (
          <AssistantSheet role={role} agentName={shownName} pendingActions={chatCards} memories={memories} live={live} avatar={avatar} onAvatarChange={setAvatar} currentThreadId={threadId} onOpenThread={openThread} onScrollToCard={scrollToCard} initialTab={requestedTab ?? undefined} onTabRequestUsed={clearTabRequest} onClose={() => setSheetOpen(false)} />
        )}
      </div>
    </WorkspaceShell>
  )
}

function LoadingState() {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <div className="h-14 w-14 animate-pulse rounded-full bg-surface-muted" />
        <div className="space-y-2">
          <div className="h-6 w-32 animate-pulse rounded bg-surface-muted" />
          <div className="h-3 w-24 animate-pulse rounded bg-surface-muted" />
        </div>
      </div>
      <div className="h-10 w-3/4 animate-pulse rounded bg-surface-muted" />
      <div className="h-[60vh] animate-pulse rounded-2xl bg-surface-muted" />
    </div>
  )
}
