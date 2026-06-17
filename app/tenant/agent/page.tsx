'use client'

// /tenant/agent — Luna's workspace. A Claude-style chat with the tenant's
// personal agent on the left; pending approvals, workflow progress, private
// memory and related pages on the right. Backed by the agent spine (lib/agent/*).
import WorkspaceShell from '@/components/WorkspaceShell'
import AgentChat from '@/components/agent/AgentChat'
import WorkflowStatusPanel from '@/components/agent/WorkflowStatusPanel'
import RecommendationDeck from '@/components/agent/RecommendationDeck'
import PendingActionsPanel from '@/components/agent/PendingActionsPanel'
import PrivateMemorySnapshot from '@/components/agent/PrivateMemorySnapshot'
import RelatedPagesCard from '@/components/agent/RelatedPagesCard'
import { useAgentSession } from '@/lib/agent/useAgentSession'

export default function TenantAgentPage() {
  const { loading, live, data, status, messages, decide, sendMessage } = useAgentSession('tenant')

  if (loading || !data) {
    return (
      <WorkspaceShell role="tenant" hideAside>
        <LoadingState />
      </WorkspaceShell>
    )
  }

  const { agent, workflow, memories, pendingActions, recommendations } = data

  return (
    <WorkspaceShell role="tenant" hideAside>
      {!live && <DemoBanner />}

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* Conversation */}
        <div className="lg:h-[calc(100vh-150px)]">
          <AgentChat
            role="tenant"
            agentName={agent.agent_name}
            status={status}
            messages={messages}
            onSend={sendMessage}
          />
        </div>

        {/* Controls — approvals · progress · memory · related */}
        <div className="space-y-6 lg:h-[calc(100vh-150px)] lg:overflow-y-auto lg:pr-1">
          {pendingActions.length > 0 && (
            <PendingActionsPanel actions={pendingActions} onDecide={decide} />
          )}
          <WorkflowStatusPanel role="tenant" workflow={workflow} />
          <PrivateMemorySnapshot agentName={agent.agent_name} memories={memories} />
          <RelatedPagesCard role="tenant" />
          <RecommendationDeck items={recommendations} />
        </div>
      </div>
    </WorkspaceShell>
  )
}

function DemoBanner() {
  return (
    <div className="mb-5 rounded-xl border border-line-strong bg-surface-chip px-4 py-3 font-mono text-[11px] leading-relaxed text-body-3">
      预览模式 · 登录后助手会读取你真实的记忆与待办,审批将写入审计 ·{' '}
      <a href="/login" className="font-bold text-brand">
        登录 →
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
