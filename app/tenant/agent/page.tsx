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
import { useAgentSession } from '@/lib/agent/useAgentSession'
import AssistantPanel from '@/components/agent/AssistantPanel'
import { assistantStatusLine } from '@/lib/agent/statusLine'
import { useAssistantPanel } from '@/lib/agent/useAssistantPanel'
import { ROLE_THEME } from '@/lib/roleTheme'
import { usePromptDeepLink } from '@/lib/agent/usePromptDeepLink'
import { useT } from '@/lib/i18n'

export default function TenantAgentPage() {
  const { loading, live, data, status, messages, decide, sendMessage, markListingsShown, scheduled, undo } = useAgentSession('tenant')
  const { lang } = useT()
  const [draft, setDraft] = useState<ComposerDraft | null>(null)
  const prefill = useCallback((t: string) => setDraft({ text: t, nonce: Date.now() }), [])
  usePromptDeepLink(loading, sendMessage, prefill)
  const { lifecycle } = useLifecycle('tenant')
  const [panelOpen, setPanelOpen] = useAssistantPanel()


  if (loading || !data) {
    return (
      <WorkspaceShell role="tenant" hideAside>
        <LoadingState />
      </WorkspaceShell>
    )
  }

  const { agent, workflow, memories, pendingActions } = data
  const zh = lang === 'zh'
  const stageLabel = lifecycle ? (zh ? lifecycle.phases.find((p) => p.key === lifecycle.current)?.title.zh ?? '' : lifecycle.phases.find((p) => p.key === lifecycle.current)?.title.en ?? '') : ''
  const pendingCount = pendingActions.filter((a) => a.status === 'pending').length
  const statusLine = assistantStatusLine({ status, pendingCount, hasApprovals: true, stageLabel, memoryCount: memories.length, zh })

  return (
    <WorkspaceShell role="tenant" hideAside phoneApp>

      {/* The assistant IS the screen (user 2026-09-24/25, phone and web):
          phone — [context strip] + [chat] between the 56px header and the 64px
          tab bar; lg+ — the Muse web layout: the conversation is the page and
          the assistant's own panel (avatar · name · status · 活动/待办/记忆)
          sits beside it, closable. 今日 lives on /x/todo, the 租前·租中·租后
          rail on /x/progress, recommendations on /x/ideas — nothing sits
          above the conversation. */}
      <div className="flex h-[calc(100dvh-121px)] flex-col md:h-[calc(100vh-66px)] md:flex-row">
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          {!live && <div className="flex-none px-5 pt-4 md:px-8 md:pt-4"><DemoBanner /></div>}
          {live && <div className="md:hidden"><ContextStrip lifecycle={lifecycle} pending={pendingActions.filter((a) => a.status === 'pending').map((a) => ({ id: a.id, action_type: a.action_type, title: a.title }))} todoHref="/tenant/todo" lang={lang} onPrompt={prefill} /></div>}
          {!panelOpen && (
            <button type="button" onClick={() => setPanelOpen(true)} aria-label={zh ? '打开助手面板' : 'Open the assistant panel'} className="absolute right-4 top-3 z-10 hidden items-center gap-2 rounded-full border border-line-divider bg-white py-1 pl-1 pr-3 text-[12.5px] font-bold text-body-2 shadow-sm transition hover:border-line-strong lg:flex">
              <span className="h-6 w-6 rounded-full" style={{ background: ROLE_THEME.tenant.avatarGradient }} />
              {agent.agent_name}{pendingCount > 0 ? (zh ? ` · 等你点头 ${pendingCount} 件` : ` · ${pendingCount} waiting`) : ''}
            </button>
          )}
          <div className="min-h-0 flex-1">
            <AgentChat
              hero
              phoneFill
              draft={draft}
              phaseLabel={stageLabel || null}
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
        </div>
        {panelOpen && (
          <aside className="hidden lg:flex lg:w-[360px] lg:flex-none lg:flex-col lg:border-l lg:border-line-divider">
            <AssistantPanel role="tenant" agentName={agent.agent_name} status={status} statusLine={statusLine} pendingActions={pendingActions} memories={memories} live={live} onClose={() => setPanelOpen(false)} />
          </aside>
        )}
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
