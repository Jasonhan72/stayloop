'use client'

// The assistant page for every hat — /tenant/agent (Luna), /landlord/agent
// (Logic), /agent/agent (Brief): one component, three thin routes (user
// 2026-09-25: "把三个助手页抽成共享组件"; until then the three files were 95%
// identical and a guard test compared them byte for byte).
//
// The assistant IS the screen (user 2026-09-24/25, phone and web): phone —
// [context strip] + [chat] between the 56px header and the 64px tab bar; lg+ —
// the Muse web layout: the conversation is the page and the assistant's own
// panel (avatar · name · status · 活动/待办/记忆) sits beside it, closable. 今日
// lives on /x/todo, the 租前·租中·租后 rail on /x/progress, recommendations on
// /x/ideas — nothing sits above the conversation.
import { useCallback, useEffect, useState } from 'react'
import WorkspaceShell from '@/components/WorkspaceShell'
import AgentChat from '@/components/agent/AgentChat'
import type { ComposerDraft } from '@/components/agent/AgentInputBar'
import AssistantPanel from '@/components/agent/AssistantPanel'
import ContextStrip from '@/components/mobile/ContextStrip'
import { useLifecycle } from '@/lib/lifecycle/useLifecycle'
import { useAgentSession } from '@/lib/agent/useAgentSession'
import { assistantStatusLine } from '@/lib/agent/statusLine'
import { useAssistantPanel } from '@/lib/agent/useAssistantPanel'
import { AssistantAvatar, getStoredAvatar, setStoredAvatar } from '@/lib/agent/avatars'
import { usePromptDeepLink } from '@/lib/agent/usePromptDeepLink'
import { useT } from '@/lib/i18n'
import type { AgentRole } from '@/lib/agent/types'

/** The one line that differs per hat: what the assistant reads once the visitor signs in. */
const PREVIEW_READS: Record<AgentRole, { zh: string; en: string }> = {
  tenant: { zh: '记忆与待办', en: 'memory and to-dos' },
  landlord: { zh: '政策与申请', en: 'policies and applications' },
  agent: { zh: '任务与客户', en: 'tasks and clients' },
}

export default function AgentWorkspacePage({ role }: { role: AgentRole }) {
  const { lang } = useT()
  const { loading, live, data, status, messages, decide, sendMessage, markListingsShown, scheduled, undo, threadId, threadLoading, openThread } = useAgentSession(role)
  const [draft, setDraft] = useState<ComposerDraft | null>(null)
  const prefill = useCallback((t: string) => setDraft({ text: t, nonce: Date.now() }), [])
  usePromptDeepLink(loading, sendMessage, prefill)
  const { lifecycle } = useLifecycle(role)
  const [panelOpen, setPanelOpen] = useAssistantPanel()
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
  const stageLabel = lifecycle ? (zh ? lifecycle.phases.find((p) => p.key === lifecycle.current)?.title.zh ?? '' : lifecycle.phases.find((p) => p.key === lifecycle.current)?.title.en ?? '') : ''
  const pending = pendingActions.filter((a) => a.status === 'pending')
  const pendingCount = pending.length
  const statusLine = assistantStatusLine({ status, pendingCount, hasApprovals: true, stageLabel, memoryCount: memories.length, zh })
  const reads = PREVIEW_READS[role]

  return (
    <WorkspaceShell role={role} hideAside phoneApp>
      <div className="sl-phone-col flex flex-col md:h-[calc(100vh-66px)] md:flex-row">
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          {!live && (
            <div className="mx-5 mb-3 mt-4 flex-none rounded-xl border border-line-strong bg-surface-chip px-4 py-3 font-mono text-[11px] leading-relaxed text-body-3 md:mx-8 md:mb-2 md:mt-4">
              {zh
                ? `预览模式 · 登录后助手会读取你真实的${reads.zh},审批将写入审计 · `
                : `Preview mode · once you sign in, your assistant reads your real ${reads.en}, and approvals are written to the audit log · `}
              <a href="/login" className="font-bold text-brand">{zh ? '登录 →' : 'Sign in →'}</a>
            </div>
          )}
          {live && <div className="md:hidden"><ContextStrip lifecycle={lifecycle} pending={pending.map((a) => ({ id: a.id, action_type: a.action_type, title: a.title }))} todoHref={`/${role}/todo`} lang={lang} onPrompt={prefill} /></div>}
          {!panelOpen && (
            <button type="button" onClick={() => setPanelOpen(true)} aria-label={zh ? '打开助手面板' : 'Open the assistant panel'} className="absolute right-4 top-3 z-10 hidden items-center gap-2 rounded-full border border-line-divider bg-white py-1 pl-1 pr-3 text-[12.5px] font-bold text-body-2 shadow-sm transition hover:border-line-strong lg:flex">
              <AssistantAvatar avatar={avatar} role={role} className="h-6 w-6" fallback={live ? 'brand' : 'role'} />
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
              avatarFallback={live ? 'brand' : 'role'}
              threadLoading={threadLoading} currentThreadId={threadId} onOpenThread={openThread}
              role={role}
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
            <AssistantPanel role={role} agentName={agent.agent_name} status={status} statusLine={statusLine} pendingActions={pendingActions} memories={memories} live={live} avatar={avatar} onAvatarChange={setAvatar} currentThreadId={threadId} onOpenThread={openThread} onClose={() => setPanelOpen(false)} />
          </aside>
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
