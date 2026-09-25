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

export default function ClientTasks({ zh }: { zh: boolean }) {
  const { user, loading } = useAuth()
  const [tasks, setTasks] = useState<ClientTask[] | null>(null)
  const [clients, setClients] = useState(0)
  useReportLiveRows('agent_client_tasks', tasks ? tasks.length || clients : null)
  useEffect(() => {
    if (loading || !user) return
    supabase.from('agent_clients').select('id, name, stage, client_role, representation_agreement_at, info_guide_given_at, last_contact_at, updated_at, area, budget').eq('agent_auth_id', user.id).limit(200)
      .then(({ data }) => { const rows = (data ?? []) as Parameters<typeof clientTasks>[0]; setClients(rows.length); setTasks(clientTasks(rows)) })
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
              {t.prompt
                ? <Link href={`/agent/agent?prompt=${encodeURIComponent(zh ? t.prompt.zh : t.prompt.en)}`} className="flex-none rounded-lg border border-line-divider px-2.5 py-1 text-[12px] font-semibold">{zh ? '交给 Brief' : 'Hand to Brief'}</Link>
                : t.href ? <Link href={t.href} className="flex-none rounded-lg border border-line-divider px-2.5 py-1 text-[12px] font-semibold">{zh ? '去客户表' : 'Client table'}</Link> : null}
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}
