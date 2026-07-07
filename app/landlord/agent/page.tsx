'use client'

// /landlord/agent — Logic's workspace. Claude-style chat + controls rail.
import WorkspaceShell from '@/components/WorkspaceShell'
import AgentChat from '@/components/agent/AgentChat'
import WorkflowStatusPanel from '@/components/agent/WorkflowStatusPanel'
import RecommendationDeck from '@/components/agent/RecommendationDeck'
import PendingActionsPanel from '@/components/agent/PendingActionsPanel'
import PrivateMemorySnapshot from '@/components/agent/PrivateMemorySnapshot'
import RelatedPagesCard from '@/components/agent/RelatedPagesCard'
import { useEffect, useRef } from 'react'
import { useAgentSession } from '@/lib/agent/useAgentSession'
import { useT } from '@/lib/i18n'

export default function LandlordAgentPage() {
  const { lang } = useT()
  const { loading, live, data, status, messages, decide, sendMessage } = useAgentSession('landlord')

  // Deep-link tasks: workspace CTAs ("起草新租约", "N1 涨租通知"…) navigate
  // here with ?prompt=<task>. Auto-send it once the session settles, then
  // strip the param so a refresh doesn't resend. window.location (not
  // useSearchParams) avoids the Suspense-boundary requirement.
  const promptSent = useRef(false)
  useEffect(() => {
    if (loading || promptSent.current) return
    const p = new URLSearchParams(window.location.search).get('prompt')
    if (!p || !p.trim()) return
    promptSent.current = true
    window.history.replaceState({}, '', window.location.pathname)
    void sendMessage(p.trim())
  }, [loading, sendMessage])

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

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="lg:h-[calc(100vh-150px)]">
          <AgentChat
            role="landlord"
            agentName={agent.agent_name}
            status={status}
            messages={messages}
            onSend={sendMessage}
          />
        </div>

        <div className="space-y-6 lg:h-[calc(100vh-150px)] lg:overflow-y-auto lg:pr-1">
          {pendingActions.length > 0 && <PendingActionsPanel actions={pendingActions} onDecide={decide} />}
          <WorkflowStatusPanel role="landlord" workflow={workflow} />
          <PrivateMemorySnapshot agentName={agent.agent_name} memories={memories} />
          <RelatedPagesCard role="landlord" />
          <RecommendationDeck items={recommendations} />
        </div>
      </div>
    </WorkspaceShell>
  )
}
