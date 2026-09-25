'use client'

// The assistant's own panel beside the conversation on the web (Muse web
// reference, design/muse-web-blueprint-2026-09.html, user 2026-09-25 "按蓝本改"):
// who it is (avatar, name, status), then 活动 · 待办 · 记忆. Not a dashboard —
// the workbench tiles live on /x/progress and the recommendations on /x/ideas.
// Closable; the page remembers the choice in localStorage.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { useT } from '@/lib/i18n'
import { ROLE_THEME } from '@/lib/roleTheme'
import { setAIName } from '@/lib/aiName'
import { auditActionLabel } from '@/lib/agent/ideas'
import { activityGroups, activityIcon, fmtActivityTime, useActivityLog } from '@/lib/agent/useActivityLog'
import type { AgentRole, AgentStatus, MemoryItem, PendingAction } from '@/lib/agent/types'
import PrivateMemorySnapshot from './PrivateMemorySnapshot'

type Segment = 'activity' | 'todo' | 'memory'

export default function AssistantPanel({ role, agentName, status, statusLine, pendingActions, memories, live, onClose }: {
  role: AgentRole
  agentName: string
  status: AgentStatus
  statusLine: string
  pendingActions: PendingAction[]
  memories: MemoryItem[]
  live: boolean
  onClose: () => void
}) {
  const { lang } = useT()
  const zh = lang === 'zh'
  const auth = useAuth()
  const [seg, setSeg] = useState<Segment>('activity')
  const pending = pendingActions.filter((a) => a.status === 'pending')
  const rows = useActivityLog(live)
  const groups = rows ? activityGroups(rows, lang) : []

  // Rename in place: the name is the user's (agent_configs RLS = self); the
  // page's own copy refreshes on the next load, the local cache right away.
  const [renaming, setRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState(agentName)
  const [name, setName] = useState(agentName)
  useEffect(() => { setName(agentName); setNameDraft(agentName) }, [agentName])
  async function saveName() {
    const next = nameDraft.trim().slice(0, 20)
    setRenaming(false)
    if (!next || next === name) return
    setName(next)
    setAIName(next, role)
    if (live && auth.user) await supabase.from('agent_configs').update({ agent_name: next }).eq('user_id', auth.user.id).eq('role', role)
  }

  const working = status === 'working' || status === 'understanding'
  return (
    <div data-testid="assistant-panel" className="flex h-full flex-col bg-white">
      <div className="relative flex-none border-b border-line-soft px-5 pb-4 pt-6 text-center">
        <button type="button" onClick={onClose} aria-label={zh ? '收起助手面板' : 'Hide the assistant panel'} title={zh ? '收起（可从右上角头像重新打开）' : 'Hide (reopen from the avatar top-right)'} className="absolute right-3 top-2.5 flex h-8 w-8 items-center justify-center rounded-lg text-[20px] text-body-3 transition hover:bg-surface-chip hover:text-body">×</button>
        <div className="relative mx-auto h-[72px] w-[72px]">
          <div className="h-full w-full rounded-full shadow-[0_8px_24px_rgba(27,27,60,.18)]" style={{ background: ROLE_THEME[role].avatarGradient }} />
          <button type="button" onClick={() => setRenaming(true)} aria-label={zh ? '改名' : 'Rename'} title={zh ? `给 ${name} 改名` : `Rename ${name}`} className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full border border-line-divider bg-white text-[11px] shadow-sm">✎</button>
        </div>
        {renaming ? (
          <form onSubmit={(e) => { e.preventDefault(); void saveName() }} className="mx-auto mt-2.5 flex max-w-[220px] items-center gap-1.5">
            <input autoFocus value={nameDraft} maxLength={20} onChange={(e) => setNameDraft(e.target.value)} onBlur={() => void saveName()} aria-label={zh ? '助手名字' : 'Assistant name'} className="min-w-0 flex-1 rounded-lg border border-line-strong px-2.5 py-1 text-center text-[15px] font-bold" />
            <button type="submit" className="rounded-lg px-2.5 py-1 text-[12px] font-bold text-white" style={{ background: '#1B1B3C' }}>{zh ? '好' : 'OK'}</button>
          </form>
        ) : (
          <div className="mt-2.5 text-[18px] font-extrabold tracking-tight">{name}</div>
        )}
        <div className="mt-1 flex items-center justify-center gap-1.5 font-mono text-[11px] text-body-3">
          <span className={`h-[7px] w-[7px] flex-none rounded-full ${working ? 'animate-pulse' : ''}`} style={{ background: pending.length ? '#F59E0B' : '#34D399' }} />
          <span className="truncate">{statusLine}</span>
        </div>
      </div>

      <div className="mx-5 mt-3.5 grid flex-none grid-cols-3 rounded-[10px] bg-surface-chip p-[3px]" role="tablist">
        {([
          ['activity', zh ? '活动' : 'Activity', 0],
          ['todo', zh ? '待办' : 'To-do', pending.length],
          ['memory', zh ? '记忆' : 'Memory', 0],
        ] as [Segment, string, number][]).map(([k, label, n]) => (
          <button key={k} type="button" role="tab" aria-selected={seg === k} onClick={() => setSeg(k)} className={`rounded-lg py-1.5 text-[12.5px] font-bold transition ${seg === k ? 'bg-white text-body shadow-[0_1px_3px_rgba(27,27,60,.1)]' : 'text-body-3'}`}>
            {label}{n > 0 && <span className="ml-1 rounded-full bg-warning px-[5px] text-[10px] text-white">{n}</span>}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-3.5">
        {seg === 'activity' && (
          <div>
            {rows === null && <div className="py-4 text-[13px] text-body-3">{zh ? '读取中…' : 'Loading…'}</div>}
            {rows && rows.length === 0 && (
              <div className="py-4 text-[13px] leading-relaxed text-body-3">
                {live ? (zh ? '还没有后台动作。它替你做的每件事都会记在这里。' : 'No background actions yet. Everything it does for you is listed here.') : (zh ? '预览模式没有日志。登录后这里会列出助手做过的事。' : 'Preview mode has no log. Sign in and the assistant’s actions are listed here.')}
              </div>
            )}
            {groups.map((g) => (
              <div key={g.key} className="mb-2">
                <div className="mb-1 mt-1.5 text-[12px] font-extrabold">{g.label}</div>
                {g.rows.map((r) => (
                  <div key={r.id} className="flex gap-2.5 py-2">
                    <span className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full bg-surface-chip text-[13px]">{activityIcon(r.action)}</span>
                    <span className="min-w-0">
                      <span className="block text-[13px] leading-snug text-body">{auditActionLabel(r.action, lang, r.metadata || undefined)}{r.actor_type === 'user' && <span className="ml-1 text-[11px] text-body-3">{zh ? '· 你' : '· you'}</span>}</span>
                      <span className="block font-mono text-[10.5px] text-body-3">{fmtActivityTime(r.created_at, lang)}</span>
                    </span>
                  </div>
                ))}
              </div>
            ))}
            {live && <Link href={`/${role}/audit`} className="mt-2 inline-block text-[12.5px] font-bold text-brand-strong">{zh ? '完整审计 →' : 'Full audit →'}</Link>}
          </div>
        )}
        {seg === 'todo' && (
          <div>
            {pending.length === 0 ? (
              <div className="py-4 text-[13px] leading-relaxed text-body-3">{zh ? '没有等你点头的事。它提议的每件事都会先出现在对话里，批准才执行。' : 'Nothing waiting on you. Everything it proposes appears in the conversation first and runs only once you approve.'}</div>
            ) : (
              <div className="divide-y divide-line-soft">
                {pending.map((a) => (
                  <div key={a.id} className="py-2.5">
                    <div className="text-[13px] font-semibold leading-snug">{a.title}</div>
                    {a.summary && <div className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-body-3">{a.summary}</div>}
                  </div>
                ))}
              </div>
            )}
            <p className="mt-2 text-[11.5px] text-body-3">{zh ? '批准 / 拒绝在对话里的卡片上操作，或去' : 'Approve or reject on the cards in the conversation, or open '}<Link href={`/${role}/todo`} className="font-bold text-brand-strong">{zh ? '待办页 →' : 'the to-do page →'}</Link></p>
          </div>
        )}
        {seg === 'memory' && <PrivateMemorySnapshot agentName={name} memories={memories} role={role} editable={live} />}
      </div>
    </div>
  )
}
