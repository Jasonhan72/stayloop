'use client'

import { useCallback, useState } from 'react'

// /tenant/agent — Luna's workspace. A Claude-style chat with the tenant's
// personal agent on the left; pending approvals, workflow progress, private
// memory and related pages on the right. Backed by the agent spine (lib/agent/*).
import WorkspaceShell from '@/components/WorkspaceShell'
import AgentChat from '@/components/agent/AgentChat'
import type { ComposerDraft } from '@/components/agent/AgentInputBar'
import ContextStrip from '@/components/mobile/ContextStrip'
import { useLifecycle } from '@/lib/lifecycle/useLifecycle'
import WorkflowStatusPanel from '@/components/agent/WorkflowStatusPanel'
import RecommendationDeck from '@/components/agent/RecommendationDeck'
import PendingActionsPanel from '@/components/agent/PendingActionsPanel'
import StatusOverview from '@/components/agent/StatusOverview'
import PrivateMemorySnapshot from '@/components/agent/PrivateMemorySnapshot'
import RelatedPagesCard from '@/components/agent/RelatedPagesCard'
import { useAgentSession } from '@/lib/agent/useAgentSession'
import { usePromptDeepLink } from '@/lib/agent/usePromptDeepLink'
import { useT } from '@/lib/i18n'

export default function TenantAgentPage() {
  const { loading, live, data, status, messages, decide, sendMessage, markListingsShown, scheduled, undo } = useAgentSession('tenant')
  const { lang } = useT()
  const [draft, setDraft] = useState<ComposerDraft | null>(null)
  const prefill = useCallback((t: string) => setDraft({ text: t, nonce: Date.now() }), [])
  usePromptDeepLink(loading, sendMessage, prefill)
  const { lifecycle } = useLifecycle('tenant')


  if (loading || !data) {
    return (
      <WorkspaceShell role="tenant" hideAside>
        <LoadingState />
      </WorkspaceShell>
    )
  }

  const { agent, workflow, memories, pendingActions, recommendations } = data

  return (
    <WorkspaceShell role="tenant" hideAside phoneApp>
      {!live && <div className="px-5 pt-4 md:px-0 md:pt-0"><DemoBanner /></div>}

      {/* The assistant IS the screen (user 2026-09-24, both phone and web):
          phone — a fixed column of [context strip] + [chat] between the 56px
          header and the 64px tab bar, 今日 and the rail folded into the strip;
          md+ — the chat as the hero with the controls column beside it. 今日
          lives on /x/todo and the 租前·租中·租后 rail on /x/progress; neither
          sits above the conversation here. */}
      <div className="flex h-[calc(100dvh-121px)] flex-col md:grid md:h-auto md:gap-6 lg:grid-cols-[1fr_380px]">
        {live && <div className="md:hidden"><ContextStrip lifecycle={lifecycle} pending={pendingActions.filter((a) => a.status === 'pending').map((a) => ({ id: a.id, action_type: a.action_type, title: a.title }))} todoHref="/tenant/todo" lang={lang} onPrompt={prefill} /></div>}
        {/* Conversation */}
        {/* Phone (Muse benchmark 2026-09-22): the chat bleeds edge to edge,
            approvals sit at the top of the thread, and the controls column
            below is replaced by the 待办 / 想法 / 进度 tabs. lg+ unchanged. */}
        <div className="min-h-0 min-w-0 flex-1 lg:h-[calc(100vh-150px)]">
          <AgentChat
            phoneFill
            draft={draft}
            phaseLabel={lifecycle ? (lang === 'zh' ? lifecycle.phases.find((p) => p.key === lifecycle.current)?.title.zh ?? null : lifecycle.phases.find((p) => p.key === lifecycle.current)?.title.en ?? null) : null}
            role="tenant"
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

        {/* Controls — approvals · progress · memory · related */}
        <div className="hidden min-w-0 space-y-6 md:block lg:h-[calc(100vh-150px)] lg:overflow-y-auto lg:pr-1">
          {pendingActions.length > 0 && (
            <div className="hidden lg:block"><PendingActionsPanel actions={pendingActions} onDecide={decide} /></div>
          )}
          <StatusOverview role="tenant" live={live} pendingCount={pendingActions.length} />
          <WorkflowStatusPanel role="tenant" workflow={workflow} />
          <RecommendationDeck items={recommendations} />
          <PrivateMemorySnapshot agentName={agent.agent_name} memories={memories} />
          <RelatedPagesCard role="tenant" />
        </div>
      </div>
    </WorkspaceShell>
  )
}

function DemoBanner() {
  const { lang } = useT()
  return (
    <div className="mb-5 rounded-xl border border-line-strong bg-surface-chip px-4 py-3 font-mono text-[11px] leading-relaxed text-body-3">
      {lang === 'zh'
        ? '预览模式 · 登录后助手会读取你真实的记忆与待办,审批将写入审计 · '
        : 'Preview mode · once you sign in, your assistant reads your real memory and to-dos, and approvals are written to the audit log · '}
      <a href="/login" className="font-bold text-brand">
        {lang === 'zh' ? '登录 →' : 'Sign in →'}
      </a>
    </div>
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
