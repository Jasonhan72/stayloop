'use client'

// /landlord/agent — Logic's workspace. Claude-style chat + controls rail.
import WorkspaceShell from '@/components/WorkspaceShell'
import AgentChat from '@/components/agent/AgentChat'
import type { ComposerDraft } from '@/components/agent/AgentInputBar'
import LifecycleRail from '@/components/lifecycle/LifecycleRail'
import TodayCard from '@/components/lifecycle/TodayCard'
import { useLifecycle } from '@/lib/lifecycle/useLifecycle'
import WorkflowStatusPanel from '@/components/agent/WorkflowStatusPanel'
import RecommendationDeck from '@/components/agent/RecommendationDeck'
import PendingActionsPanel from '@/components/agent/PendingActionsPanel'
import StatusOverview from '@/components/agent/StatusOverview'
import PrivateMemorySnapshot from '@/components/agent/PrivateMemorySnapshot'
import RelatedPagesCard from '@/components/agent/RelatedPagesCard'
import { useEffect, useRef, useState, useCallback } from 'react'
import { useAgentSession } from '@/lib/agent/useAgentSession'
import { usePromptDeepLink } from '@/lib/agent/usePromptDeepLink'
import { useT } from '@/lib/i18n'

export default function LandlordAgentPage() {
  const { lang } = useT()
  const { loading, live, data, status, messages, decide, sendMessage, markListingsShown, scheduled, undo } = useAgentSession('landlord')
  const [draft, setDraft] = useState<ComposerDraft | null>(null)
  const prefill = useCallback((t: string) => setDraft({ text: t, nonce: Date.now() }), [])
  usePromptDeepLink(loading, sendMessage, prefill)
  const { lifecycle } = useLifecycle('landlord')

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

  const { agent, workflow, memories, pendingActions, recommendations } = data

  return (
    <WorkspaceShell role="landlord" hideAside>
      {!live && (
        <div className="mb-5 rounded-xl border border-line-strong bg-surface-chip px-4 py-3 font-mono text-[11px] leading-relaxed text-body-3">
          {lang === 'zh'
            ? '预览模式 · 登录后助手会读取你真实的政策与申请,审批将写入审计 · '
            : 'Preview mode · once you sign in, your assistant reads your real policies and applications, and approvals are written to the audit log · '}
          <a href="/login" className="font-bold text-brand">{lang === 'zh' ? '登录 →' : 'Sign in →'}</a>
        </div>
      )}

      {live && (
        <div className="mb-4"><TodayCard lifecycle={lifecycle} pending={pendingActions.filter((a) => a.status === 'pending').map((a) => ({ id: a.id, action_type: a.action_type, title: a.title }))} todoHref="/landlord/todo" lang={lang} onPrompt={prefill} /></div>
      )}
      {live && lifecycle && (
        <>
          <div className="mb-5 hidden md:block"><LifecycleRail lifecycle={lifecycle} lang={lang} onPrompt={prefill} /></div>
          <div className="mb-3 md:hidden"><LifecycleRail lifecycle={lifecycle} lang={lang} compact onPrompt={prefill} /></div>
        </>
      )}
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* Phone (Muse benchmark 2026-09-22): the chat bleeds edge to edge,
            approvals sit at the top of the thread, and the controls column
            below is replaced by the 待办 / 想法 / 进度 tabs. lg+ unchanged. */}
        <div className="-mx-5 min-w-0 sm:mx-0 lg:h-[calc(100vh-150px)]">
          <AgentChat
            draft={draft}
            phaseLabel={lifecycle ? (lang === 'zh' ? lifecycle.phases.find((p) => p.key === lifecycle.current)?.title.zh ?? null : lifecycle.phases.find((p) => p.key === lifecycle.current)?.title.en ?? null) : null}
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

        <div className="hidden min-w-0 space-y-6 md:block lg:h-[calc(100vh-150px)] lg:overflow-y-auto lg:pr-1">
          {pendingActions.length > 0 && (
            <div id="sl-approvals" className="hidden scroll-mt-24 lg:block">
              <PendingActionsPanel actions={pendingActions} onDecide={decide} />
            </div>
          )}
          <StatusOverview role="landlord" live={live} pendingCount={pendingActions.length} />
          <WorkflowStatusPanel role="landlord" workflow={workflow} />
          <RecommendationDeck items={recommendations} />
          <PrivateMemorySnapshot agentName={agent.agent_name} memories={memories} />
          <RelatedPagesCard role="landlord" />
        </div>
      </div>
    </WorkspaceShell>
  )
}
