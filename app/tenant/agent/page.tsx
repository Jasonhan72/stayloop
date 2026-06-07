'use client'

// /tenant/agent — Luna's workspace. The tenant's personal rental command
// center: agent status + active workflow + pending approvals + private memory.
// Backed by the agent spine (lib/agent/*). Execution spec §4–§5.
import WorkspaceShell from '@/components/WorkspaceShell'
import AgentHeroStatus from '@/components/agent/AgentHeroStatus'
import WorkflowStatusPanel from '@/components/agent/WorkflowStatusPanel'
import AgentResultCard from '@/components/agent/AgentResultCard'
import AgentInputBar from '@/components/agent/AgentInputBar'
import RecommendationDeck from '@/components/agent/RecommendationDeck'
import PendingActionsPanel from '@/components/agent/PendingActionsPanel'
import PrivateMemorySnapshot from '@/components/agent/PrivateMemorySnapshot'
import RelatedPagesCard from '@/components/agent/RelatedPagesCard'
import { useAgentSession } from '@/lib/agent/useAgentSession'
import { nextBestAction } from '@/lib/agent/orchestrator'

export default function TenantAgentPage() {
  const { loading, live, data, status, decide, sendMessage } = useAgentSession('tenant')

  if (loading || !data) {
    return (
      <WorkspaceShell role="tenant" aside={<div className="h-40 animate-pulse rounded-xl bg-surface-muted" />}>
        <LoadingState />
      </WorkspaceShell>
    )
  }

  const { agent, workflow, memories, pendingActions, recommendations, latestResult } = data
  const next = nextBestAction('tenant', workflow, pendingActions)

  const title = latestResult ? (
    latestResult.title
  ) : (
    <>
      你好,我是 {agent.agent_name}。<br />告诉我你想找什么样的家。
    </>
  )

  return (
    <WorkspaceShell
      role="tenant"
      aside={
        <div className="space-y-6">
          <PrivateMemorySnapshot agentName={agent.agent_name} memories={memories} />
          <RelatedPagesCard role="tenant" />
        </div>
      }
    >
      {!live && <DemoBanner />}

      <AgentHeroStatus
        role="tenant"
        agentName={agent.agent_name}
        status={status}
        title={title}
        nextAction={latestResult ? latestResult.body : next}
      />

      <div className="mt-8 space-y-6">
        {pendingActions.length > 0 && (
          <PendingActionsPanel actions={pendingActions} onDecide={decide} />
        )}

        {latestResult && pendingActions.length === 0 && <AgentResultCard result={latestResult} />}

        <AgentInputBar agentName={agent.agent_name} onSend={sendMessage} />

        <WorkflowStatusPanel role="tenant" workflow={workflow} />

        <RecommendationDeck items={recommendations} />
      </div>
    </WorkspaceShell>
  )
}

function DemoBanner() {
  return (
    <div className="mb-5 rounded-xl border border-line-strong bg-surface-chip px-4 py-3 font-mono text-[11px] leading-relaxed text-body-3">
      预览模式 · 登录后 Luna 会读取你真实的记忆与待办,审批将写入审计 ·{' '}
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
      <div className="h-40 animate-pulse rounded-2xl bg-surface-muted" />
    </div>
  )
}
