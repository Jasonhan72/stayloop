'use client'

// The three phone tabs next to the conversation (2026-09-22, Muse
// benchmark items D/E): 待办 (what waits on you), 想法 (what the assistant
// can do next, with a reason each), 进度 (what it is tracking + your
// numbers + what it remembers). All three read the same session the chat
// uses, so they work on desktop too — there they simply sit inside the
// workspace shell.
import Link from 'next/link'
import { useEffect, useState } from 'react'
import WorkspaceShell from '@/components/WorkspaceShell'
import PendingActionsPanel from '@/components/agent/PendingActionsPanel'
import StatusOverview from '@/components/agent/StatusOverview'
import WorkflowStatusPanel from '@/components/agent/WorkflowStatusPanel'
import LifecycleRail from '@/components/lifecycle/LifecycleRail'
import { useLifecycle } from '@/lib/lifecycle/useLifecycle'
import PrivateMemorySnapshot from '@/components/agent/PrivateMemorySnapshot'
import RelatedPagesCard from '@/components/agent/RelatedPagesCard'
import PushSettingsCard from '@/components/mobile/PushSettingsCard'
import { useAgentSession } from '@/lib/agent/useAgentSession'
import { buildIdeas } from '@/lib/agent/ideas'
import { useT } from '@/lib/i18n'
import type { AgentRole } from '@/lib/agent/types'

function ScheduledLine({ id, title, executeAt, onUndo, zh }: { id: string; title: string; executeAt: number; onUndo: (id: string) => void | Promise<void>; zh: boolean }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])
  const left = Math.max(0, Math.ceil((executeAt - now) / 1000))
  return (
    <div className="flex items-center gap-2 rounded-xl border border-brand/40 bg-white px-3.5 py-2.5 text-[13px] text-body-2">
      <span className="text-success">✓</span>
      <span className="min-w-0 flex-1 truncate">{zh ? `已批准 · ${left} 秒后执行` : `Approved · runs in ${left}s`} · {title}</span>
      <button type="button" onClick={() => onUndo(id)} className="flex-none rounded-full border border-line-strong bg-white px-3 py-1 text-[12px] font-semibold hover:border-danger hover:text-danger">{zh ? '撤销' : 'Undo'}</button>
    </div>
  )
}

function Skeleton({ role }: { role: AgentRole }) {
  return (
    <WorkspaceShell role={role} hideAside>
      <div className="space-y-4">
        <div className="h-8 w-40 animate-pulse rounded bg-surface-muted" />
        <div className="h-32 animate-pulse rounded-2xl bg-surface-muted" />
        <div className="h-32 animate-pulse rounded-2xl bg-surface-muted" />
      </div>
    </WorkspaceShell>
  )
}

function PageHead({ eyebrow, title, sub }: { eyebrow: string; title: string; sub?: string }) {
  return (
    <div className="mb-5">
      <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">{eyebrow}</div>
      <h1 className="mt-1 text-[22px] font-bold tracking-tight">{title}</h1>
      {sub && <p className="mt-1 text-[13px] text-body-3">{sub}</p>}
    </div>
  )
}

export function TodoPage({ role }: { role: AgentRole }) {
  const { lang } = useT()
  const zh = lang === 'zh'
  const { loading, live, data, decide, scheduled, undo } = useAgentSession(role)
  if (loading || !data) return <Skeleton role={role} />
  const pending = data.pendingActions.filter((a) => a.status === 'pending')
  const waiting = Object.entries(scheduled)
  return (
    <WorkspaceShell role={role} hideAside>
      <PageHead eyebrow="TO-DO" title={zh ? '等你点头的' : 'Waiting on you'} sub={zh ? `${data.agent.agent_name} 不会替你决定；这里的每一件都要你批准才执行。` : `${data.agent.agent_name} never decides for you; nothing here runs until you approve.`} />
      {!live && (
        <div className="mb-4 rounded-xl border border-line-strong bg-surface-chip px-4 py-3 text-[12.5px] text-body-3">
          {zh ? '预览模式：登录后这里是你真实的待办。' : 'Preview mode: sign in to see your real to-dos.'} <Link href="/login" className="font-bold text-brand">{zh ? '登录 →' : 'Sign in →'}</Link>
        </div>
      )}
      {waiting.length > 0 && (
        <div className="mb-4 space-y-2">
          {waiting.map(([id, w]) => (
            <ScheduledLine key={id} id={id} title={w.title} executeAt={w.executeAt} onUndo={undo} zh={zh} />
          ))}
        </div>
      )}
      {pending.length === 0 ? (
        <div className="rounded-2xl border border-line-divider bg-white px-6 py-14 text-center">
          <div className="text-[28px]">✓</div>
          <p className="mt-2 text-[14px] text-body-2">{zh ? '没有等你点头的事。' : 'Nothing waiting on you.'}</p>
          <p className="mt-1 text-[12.5px] text-body-3">{zh ? '助手有新的提议时会出现在这里，底栏会有红点。' : 'New proposals from the assistant land here, with a badge on the tab.'}</p>
          <Link href={`/${role}/ideas`} className="mt-5 inline-block text-[13px] font-semibold text-brand">{zh ? '看看它现在能替你做什么 ›' : 'See what it can do for you now ›'}</Link>
        </div>
      ) : (
        <PendingActionsPanel actions={pending} onDecide={decide} />
      )}
    </WorkspaceShell>
  )
}

export function IdeasPage({ role }: { role: AgentRole }) {
  const { lang } = useT()
  const zh = lang === 'zh'
  const { loading, data } = useAgentSession(role)
  if (loading || !data) return <Skeleton role={role} />
  const ideas = buildIdeas({
    role,
    lang,
    agentName: data.agent.agent_name,
    memories: data.memories,
    workflow: data.workflow,
    pendingActions: data.pendingActions,
    recommendations: data.recommendations,
  })
  return (
    <WorkspaceShell role={role} hideAside>
      <PageHead eyebrow="IDEAS" title={zh ? `${data.agent.agent_name} 可以替你做` : `${data.agent.agent_name} can do for you`} sub={zh ? '每一条都写了为什么。点一条，就是把那句话发给它。' : 'Each one says why. Tap one and it is sent to the conversation.'} />
      <div className="divide-y divide-line-divider rounded-2xl border border-line-divider bg-white">
        {ideas.length === 0 && (
          <div className="px-5 py-10 text-center text-[13.5px] text-body-3">
            {zh ? '还不了解你——先在对话里说一句你想做什么，想法会从那里来。' : 'It does not know you yet — say what you want in the conversation and ideas follow from there.'}
          </div>
        )}
        {ideas.map((i) => {
          const href = i.href ?? `/${role}/agent?prompt=${encodeURIComponent(i.prompt || i.text)}`
          return (
            <Link key={i.id} href={href} className="flex items-start gap-3 px-4 py-3.5 transition hover:bg-surface">
              <span className={'mt-[3px] h-[18px] w-[18px] flex-none rounded-[5px] border-[1.5px] ' + (i.kind === 'pending' ? 'border-brand bg-brand/10' : 'border-line-strong')} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold leading-snug text-body">{i.text}</span>
                <span className="mt-0.5 block text-[12px] leading-snug text-body-3">{i.why}</span>
              </span>
              <span className="flex-none pt-0.5 text-[16px] font-bold text-brand">›</span>
            </Link>
          )
        })}
      </div>
      <p className="mt-4 text-[11.5px] leading-relaxed text-body-3">
        {zh ? '这些想法由你的记忆、当前进度和待办按规则生成，不调用模型；不会猜测你的家庭状况、国籍或收入来源。' : 'Generated by rule from your memories, stage and to-dos — no model call; nothing is inferred about family status, nationality or source of income.'}
      </p>
    </WorkspaceShell>
  )
}

export function ProgressPage({ role }: { role: AgentRole }) {
  const { lang } = useT()
  const zh = lang === 'zh'
  const { loading, live, data } = useAgentSession(role)
  const { lifecycle } = useLifecycle(role)
  if (loading || !data) return <Skeleton role={role} />
  const pending = data.pendingActions.filter((a) => a.status === 'pending').length
  return (
    <WorkspaceShell role={role} hideAside>
      <PageHead eyebrow="PROGRESS" title={zh ? '正在跟的' : 'Tracking'} sub={zh ? '流程走到哪、你手上有什么、它记住了什么。' : 'Where the flow stands, what you have on hand, what it remembers.'} />
      <div className="space-y-5">
        {live && lifecycle ? (
          <div>
            <div className="mb-2 font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">{zh ? '租前 · 租中 · 租后' : 'BEFORE · DURING · AFTER'}</div>
            <LifecycleRail lifecycle={lifecycle} lang={lang} full />
          </div>
        ) : (
          <WorkflowStatusPanel role={role} workflow={data.workflow} />
        )}
        <div>
          <div className="mb-2 font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">{zh ? '你的事' : 'YOUR NUMBERS'}</div>
          <StatusOverview role={role} live={live} pendingCount={pending} />
        </div>
        <div id="memory" className="scroll-mt-20">
          <PrivateMemorySnapshot agentName={data.agent.agent_name} memories={data.memories} role={role} editable={live} />
        </div>
        <PushSettingsCard live={live} />
        <RelatedPagesCard role={role} />
      </div>
    </WorkspaceShell>
  )
}
