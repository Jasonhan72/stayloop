'use client'

// /landlord/agent — Logic's workspace. Same Agent spine as Luna, role=landlord.
// Execution spec §18: copy the pattern once tenant runs end-to-end.
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

export default function LandlordAgentPage() {
  const { loading, live, data, status, decide, sendMessage } = useAgentSession('landlord')

  if (loading || !data) {
    return (
      <WorkspaceShell role="landlord" aside={<div className="h-40 animate-pulse rounded-xl bg-surface-muted" />}>
        <div className="space-y-5">
          <div className="h-14 w-14 animate-pulse rounded-full bg-surface-muted" />
          <div className="h-10 w-3/4 animate-pulse rounded bg-surface-muted" />
          <div className="h-40 animate-pulse rounded-2xl bg-surface-muted" />
        </div>
      </WorkspaceShell>
    )
  }

  const { agent, workflow, memories, pendingActions, recommendations, latestResult } = data
  const next = nextBestAction('landlord', workflow, pendingActions)
  const title = latestResult ? latestResult.title : <>我是 {agent.agent_name},你的尽调与决策助手。</>

  return (
    <WorkspaceShell
      role="landlord"
      aside={
        <div className="space-y-6">
          <PrivateMemorySnapshot agentName={agent.agent_name} memories={memories} />
          <RelatedPagesCard role="landlord" />
        </div>
      }
    >
      {!live && (
        <div className="mb-5 rounded-xl border border-line-strong bg-surface-chip px-4 py-3 font-mono text-[11px] leading-relaxed text-body-3">
          预览模式 · 登录后 Logic 会读取你真实的政策与申请,审批将写入审计 ·{' '}
          <a href="/login" className="font-bold text-brand">登录 →</a>
        </div>
      )}

      <AgentHeroStatus
        role="landlord"
        agentName={agent.agent_name}
        status={status}
        title={title}
        nextAction={latestResult ? latestResult.body : next}
      />

      <div className="mt-8 space-y-6">
        {pendingActions.length > 0 && <PendingActionsPanel actions={pendingActions} onDecide={decide} />}
        {latestResult && pendingActions.length === 0 && <AgentResultCard result={latestResult} />}
        <AgentInputBar agentName={agent.agent_name} onSend={sendMessage} />
        <WorkflowStatusPanel role="landlord" workflow={workflow} />
        <RecommendationDeck items={recommendations} />
      </div>
    </WorkspaceShell>
  )
}
