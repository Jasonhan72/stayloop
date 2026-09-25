'use client'

// /landlord/agent — Logic's workspace. Claude-style chat + controls rail.
import WorkspaceShell from '@/components/WorkspaceShell'
import AgentChat from '@/components/agent/AgentChat'
import type { ComposerDraft } from '@/components/agent/AgentInputBar'
import ContextStrip from '@/components/mobile/ContextStrip'
import { useLifecycle } from '@/lib/lifecycle/useLifecycle'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAgentSession } from '@/lib/agent/useAgentSession'
import AssistantPanel from '@/components/agent/AssistantPanel'
import { assistantStatusLine } from '@/lib/agent/statusLine'
import { useAssistantPanel } from '@/lib/agent/useAssistantPanel'
import { AssistantAvatar, getStoredAvatar } from '@/lib/agent/avatars'
import { usePromptDeepLink } from '@/lib/agent/usePromptDeepLink'
import { useT } from '@/lib/i18n'

export default function LandlordAgentPage() {
  const { lang } = useT()
  const { loading, live, data, status, messages, decide, sendMessage, markListingsShown, scheduled, undo, threadId, threadLoading, openThread } = useAgentSession('landlord')
  const [draft, setDraft] = useState<ComposerDraft | null>(null)
  const prefill = useCallback((t: string) => setDraft({ text: t, nonce: Date.now() }), [])
  usePromptDeepLink(loading, sendMessage, prefill)
  const { lifecycle } = useLifecycle('landlord')
  const [panelOpen, setPanelOpen] = useAssistantPanel()
  // The assistant's face: the chosen preset (agent_configs.avatar, mirrored in localStorage) or the role orb.
  const [avatar, setAvatar] = useState<string | null>(null)
  const dbAvatar = data?.agent.avatar ?? null
  useEffect(() => { setAvatar(getStoredAvatar('landlord') ?? dbAvatar) }, [dbAvatar])

  if (loading || !data) {
    return (
      <WorkspaceShell role="landlord" hideAside>
        <div className="space-y-5">
          <div className="h-14 w-14 animate-pulse rounded-full bg-surface-muted" />
          <div className="h-10 w-3/4 animate-pulse rounded bg-surface-muted" />
          <div className="h-[60vh] animate-pulse rounded-2xl bg-surface-muted" />
        </div>
      </WorkspaceShell>
    )
  }

  const { agent, workflow, memories, pendingActions } = data
  const zh = lang === 'zh'
  const stageLabel = lifecycle ? (zh ? lifecycle.phases.find((p) => p.key === lifecycle.current)?.title.zh ?? '' : lifecycle.phases.find((p) => p.key === lifecycle.current)?.title.en ?? '') : ''
  const pendingCount = pendingActions.filter((a) => a.status === 'pending').length
  const statusLine = assistantStatusLine({ status, pendingCount, hasApprovals: true, stageLabel, memoryCount: memories.length, zh })

  return (
    <WorkspaceShell role="landlord" hideAside phoneApp>

      {/* The assistant IS the screen (user 2026-09-24/25, phone and web):
          phone — [context strip] + [chat] between the 56px header and the 64px
          tab bar; lg+ — the Muse web layout: the conversation is the page and
          the assistant's own panel (avatar · name · status · 活动/待办/记忆)
          sits beside it, closable. 今日 lives on /x/todo, the 租前·租中·租后
          rail on /x/progress, recommendations on /x/ideas — nothing sits
          above the conversation. */}
      <div className="flex h-[calc(100dvh-121px)] flex-col md:h-[calc(100vh-66px)] md:flex-row">
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          {!live && (
            <div className="mx-5 mb-3 mt-4 flex-none rounded-xl border border-line-strong bg-surface-chip px-4 py-3 font-mono text-[11px] leading-relaxed text-body-3 md:mx-8 md:mb-2 md:mt-4">
              {lang === 'zh'
                ? '预览模式 · 登录后助手会读取你真实的政策与申请,审批将写入审计 · '
                : 'Preview mode · once you sign in, your assistant reads your real policies and applications, and approvals are written to the audit log · '}
              <a href="/login" className="font-bold text-brand">{lang === 'zh' ? '登录 →' : 'Sign in →'}</a>
            </div>
          )}
          {live && <div className="md:hidden"><ContextStrip lifecycle={lifecycle} pending={pendingActions.filter((a) => a.status === 'pending').map((a) => ({ id: a.id, action_type: a.action_type, title: a.title }))} todoHref="/landlord/todo" lang={lang} onPrompt={prefill} /></div>}
          {!panelOpen && (
            <button type="button" onClick={() => setPanelOpen(true)} aria-label={zh ? '打开助手面板' : 'Open the assistant panel'} className="absolute right-4 top-3 z-10 hidden items-center gap-2 rounded-full border border-line-divider bg-white py-1 pl-1 pr-3 text-[12.5px] font-bold text-body-2 shadow-sm transition hover:border-line-strong lg:flex">
              <AssistantAvatar avatar={avatar} role="landlord" className="h-6 w-6" />
              {agent.agent_name}{pendingCount > 0 ? (zh ? ` · 等你点头 ${pendingCount} 件` : ` · ${pendingCount} waiting`) : ''}
            </button>
          )}
          <div className="min-h-0 flex-1">
            <AgentChat
              hero
              phoneFill
              draft={draft}
              phaseLabel={stageLabel || null}
              avatar={avatar}
              threadLoading={threadLoading}
              role="landlord"
              agentName={agent.agent_name}
              status={status}
              messages={messages}
              onSend={sendMessage}
              onListingsShown={markListingsShown}
              pendingActions={pendingActions}
              onDecide={decide}
              live={live}
              memoryCount={memories.length}
              workflow={workflow}
              scheduled={scheduled}
              onUndo={undo}
            />
          </div>
        </div>
        {panelOpen && (
          <aside className="hidden lg:flex lg:w-[360px] lg:flex-none lg:flex-col lg:border-l lg:border-line-divider">
            <AssistantPanel role="landlord" agentName={agent.agent_name} status={status} statusLine={statusLine} pendingActions={pendingActions} memories={memories} live={live} avatar={avatar} onAvatarChange={setAvatar} currentThreadId={threadId} onOpenThread={openThread} onClose={() => setPanelOpen(false)} />
          </aside>
        )}
      </div>
    </WorkspaceShell>
  )
}
