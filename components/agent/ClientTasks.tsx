'use client'

// Real tasks on /agent/tasks, derived from the agent's own client table
// (lib/agent/clientBook.ts clientTasks — pure, no model). Three-role test
// report 2026-09-24, SL-A-04: the page was an empty state saying tasks "open
// once representation records ship" although the client table had shipped.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { SectionCard } from '@/components/workspace'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { useReportLiveRows } from '@/lib/liveRows'
import { clientTasks, type ClientTask } from '@/lib/agent/clientBook'
import MessageButton from '@/components/messages/MessageButton'
import { isDelegationLive } from '@/lib/delegations/shared'

export default function ClientTasks({ zh }: { zh: boolean }) {
  const { user, loading } = useAuth()
  const [tasks, setTasks] = useState<ClientTask[] | null>(null)
  const [clients, setClients] = useState(0)
  // 找得到人 2026-09-30: which clients can be reached at all (an email to relay to). Only a yes/no is kept — the address is never shown.
  const [reachable, setReachable] = useState<Record<string, boolean>>({})
  const [names, setNames] = useState<Record<string, string>>({})
  useReportLiveRows('agent_client_tasks', tasks ? tasks.length || clients : null)
  useEffect(() => {
    if (loading || !user) return
    // Same reachability rule as the client book: an email to relay to, or a live delegation (the client has an account).
    Promise.all([
      supabase.from('agent_clients').select('id, name, stage, client_role, representation_agreement_at, info_guide_given_at, last_contact_at, updated_at, area, budget, email').eq('agent_auth_id', user.id).limit(200),
      supabase.from('delegations').select('client_id, status, expires_at').eq('delegate_auth_id', user.id).eq('status', 'active'),
    ]).then(([{ data }, { data: dl }]) => {
        const rows = (data ?? []) as (Parameters<typeof clientTasks>[0][number] & { email: string | null })[]
        const live = new Set(((dl ?? []) as { client_id: string | null; status: 'active' | 'pending' | 'revoked' | 'expired'; expires_at: string }[]).filter((d) => d.client_id && isDelegationLive(d)).map((d) => d.client_id as string))
        setReachable(Object.fromEntries(rows.map((r) => [r.id, !!r.email || live.has(r.id)])))
        setNames(Object.fromEntries(rows.map((r) => [r.id, r.name])))
        setClients(rows.length); setTasks(clientTasks(rows))
      })
  }, [loading, user])
  if (!tasks || clients === 0) return null
  return (
    <SectionCard className="mb-4" title={zh ? '来自你客户表的任务' : 'Tasks from your client table'} meta={`${tasks.length}`}>
      {tasks.length === 0 ? (
        <p className="text-[13px] text-body-3">{zh ? `${clients} 位客户，文件齐全、近期都联系过——暂时没有待办。` : `${clients} clients, paperwork complete and recently contacted — nothing due.`}</p>
      ) : (
        <div data-testid="client-tasks" className="divide-y divide-line-divider">
          {tasks.map((t) => (
            <div key={t.id} className="flex flex-wrap items-center gap-2 py-2.5 text-[13px]">
              <span className={'h-2 w-2 flex-none rounded-full ' + (t.tone === 'warn' ? 'bg-amber-500' : 'bg-brand')} />
              <span className="min-w-0 flex-1">{zh ? t.zh : t.en}</span>
              {/* 找得到人 2026-09-30: the agent ↔ client conversation, resolved on click. */}
              {t.clientId && (reachable[t.clientId]
                ? <MessageButton target={{ kind: 'agent_client', ref: t.clientId }} zh={zh} label={names[t.clientId] ? (zh ? `发消息给 ${names[t.clientId]}` : `Message ${names[t.clientId]}`) : undefined} className="flex-none" testId="client-task-message" />
                : <>
                    <MessageButton target={{ kind: 'agent_client', ref: t.clientId }} zh={zh} className="flex-none" disabledReason={zh ? '先补邮箱才能发消息' : 'Add an email to message'} testId="client-task-message" />
                    {/* The email is added on the client table (「编辑资料」 on that row). */}
                    <Link href="/agent/clients#client-book" data-testid="client-task-add-email" className="flex-none text-[12px] font-semibold text-brand underline underline-offset-2">{zh ? '去客户表补邮箱' : 'Add it in the client table'}</Link>
                  </>)}
              {t.prompt
                ? <Link href={`/agent/agent?prompt=${encodeURIComponent(zh ? t.prompt.zh : t.prompt.en)}`} className="flex-none rounded-lg border border-line-divider px-2.5 py-1 text-[12px] font-semibold">{zh ? '交给 AI 助理' : 'Hand to the AI Agent'}</Link>
                : t.href ? <Link href={t.href} className="flex-none rounded-lg border border-line-divider px-2.5 py-1 text-[12px] font-semibold">{zh ? '去客户表' : 'Client table'}</Link> : null}
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}
