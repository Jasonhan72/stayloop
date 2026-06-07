'use client'

// /agent/agent — Brief's workspace. Same Agent spine, role=agent.
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

export default function FieldAgentPage() {
  const { loading, live, data, status, decide, sendMessage } = useAgentSession('agent')

  if (loading || !data) {
    return (
      <WorkspaceShell role="agent" aside={<div className="h-40 animate-pulse rounded-xl bg-surface-muted" />}>
        <div className="space-y-5">
          <div className="h-14 w-14 animate-pulse rounded-full bg-surface-muted" />
          <div className="h-10 w-3/4 animate-pulse rounded bg-surface-muted" />
          <div className="h-40 animate-pulse rounded-2xl bg-surface-muted" />
        </div>
      </WorkspaceShell>
    )
  }

  const { agent, workflow, memories, pendingActions, recommendations, latestResult } = data
  const next = nextBestAction('agent', workflow, pendingActions)
  const title = latestResult ? latestResult.title : <>我是 {agent.agent_name},帮你把行政杂活理顺。</>

  return (
    <WorkspaceShell
      role="agent"
      aside={
        <div className="space-y-6">
          <PrivateMemorySnapshot agentName={agent.agent_name} memories={memories} />
          <RelatedPagesCard role="agent" />
        </div>
      }
    >
      {!live && (
        <div className="mb-5 rounded-xl border border-line-strong bg-surface-chip px-4 py-3 font-mono text-[11px] leading-relaxed text-body-3">
          预览模式 · 登录后 Brief 会读取你真实的任务与客户,审批将写入审计 ·{' '}
          <a href="/login" className="font-bold text-brand">登录 →</a>
        </div>
      )}

      <AgentHeroStatus
        role="agent"
        agentName={agent.agent_name}
        status={status}
        title={title}
        nextAction={latestResult ? latestResult.body : next}
      />

      <div className="mt-8 space-y-6">
        {pendingActions.length > 0 && <PendingActionsPanel actions={pendingActions} onDecide={decide} />}
        {latestResult && pendingActions.length === 0 && <AgentResultCard result={latestResult} />}
        <AgentInputBar agentName={agent.agent_name} onSend={sendMessage} />
        <WorkflowStatusPanel role="agent" workflow={workflow} />
        <RecommendationDeck items={recommendations} />
      </div>
    </WorkspaceShell>
  )
}
