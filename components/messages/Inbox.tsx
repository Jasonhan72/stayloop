'use client'

// One place for conversations (three-role test report 2026-09-24, SL-T-07:
// "侧栏没有独立消息收件箱"). Stayloop's channels are: the conversation on each
// managed tenancy (household_messages), showing requests / questions a tenant
// sent (showing_intents, answered by the landlord by email), and — for
// landlords — requests still waiting in the to-do list. This page lists them
// with honest status; it does not invent a chat that does not exist.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import WorkspaceShell from '@/components/WorkspaceShell'
import { PageHeader, SectionCard, StatusPill } from '@/components/workspace'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { useT } from '@/lib/i18n'
import { isUnread } from '@/lib/household/readMarks'

type Thread = { hh: string; label: string; latest: { id: number; sender_id: string; body: string; created_at: string } | null }
type Intent = { id: string; kind: string | null; status: string | null; message: string | null; created_at: string; listing: { slug: string | null; address: string | null; unit: string | null } | null }

export default function Inbox({ role }: { role: 'tenant' | 'landlord' }) {
  const { lang } = useT()
  const zh = lang === 'zh'
  const { user, loading } = useAuth()
  const [threads, setThreads] = useState<Thread[] | null>(null)
  const [intents, setIntents] = useState<Intent[]>([])
  const [waiting, setWaiting] = useState(0)

  useEffect(() => {
    if (loading) return
    if (!user) { setThreads([]); return }
    let cancelled = false
    ;(async () => {
      const { data: mem } = await supabase.from('household_members').select('household_id').eq('user_id', user.id).eq('status', 'active').limit(50)
      const ids = (mem ?? []).map((m: { household_id: string }) => m.household_id)
      const [{ data: hhs }, { data: msgs }, intentsRes, waitingRes] = await Promise.all([
        ids.length ? supabase.from('households').select('id, address, unit').in('id', ids) : Promise.resolve({ data: [] as { id: string; address: string; unit: string | null }[] }),
        ids.length ? supabase.from('household_messages').select('id, household_id, sender_id, body, created_at').in('household_id', ids).order('id', { ascending: false }).limit(300) : Promise.resolve({ data: [] as never[] }),
        role === 'tenant' ? supabase.from('tenants').select('id').eq('auth_id', user.id).maybeSingle().then(async ({ data: t }) => t ? supabase.from('showing_intents').select('id, kind, status, message, created_at, listing:listings(slug, address, unit)').eq('tenant_id', (t as { id: string }).id).order('created_at', { ascending: false }).limit(30) : { data: [] }) : Promise.resolve({ data: [] }),
        role === 'landlord' ? supabase.from('agent_pending_actions').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'pending').in('action_type', ['showing_request', 'listing_inquiry']) : Promise.resolve({ count: 0 }),
      ])
      if (cancelled) return
      const latest = new Map<string, Thread['latest']>()
      for (const m of (msgs ?? []) as { id: number; household_id: string; sender_id: string; body: string; created_at: string }[]) if (!latest.has(m.household_id)) latest.set(m.household_id, m)
      const list = ((hhs ?? []) as { id: string; address: string; unit: string | null }[]).map((h) => ({ hh: h.id, label: `${h.address}${h.unit ? ` #${h.unit}` : ''}`, latest: latest.get(h.id) ?? null }))
      list.sort((a, b) => (b.latest?.id ?? 0) - (a.latest?.id ?? 0))
      setThreads(list)
      setIntents(((intentsRes as { data: unknown }).data ?? []) as Intent[])
      setWaiting((waitingRes as { count: number | null }).count ?? 0)
    })()
    return () => { cancelled = true }
  }, [loading, user, role])

  const fmt = (iso: string) => new Date(iso).toLocaleString(zh ? 'zh-CN' : 'en-CA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  const intentStatus = (s: string | null) => s === 'accepted' ? { zh: '房东已回复（见邮箱）', en: 'Landlord replied (see email)', tone: 'ok' as const } : s === 'declined' ? { zh: '房东婉拒', en: 'Declined', tone: 'neutral' as const } : { zh: '等房东回复', en: 'Waiting for the landlord', tone: 'warn' as const }

  return (
    <WorkspaceShell role={role} hideAside>
      <PageHeader title={zh ? '消息' : 'Messages'} sub={zh ? '在管租约里的对话、你发出的看房请求与提问都在这里。回复会同时发到对方邮箱。' : 'Conversations on your managed tenancies and the showing requests / questions you sent. Replies also reach the other side by email.'} />
      {role === 'landlord' && waiting > 0 && (
        <Link href="/landlord/todo" className="mb-4 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
          <span>{zh ? `${waiting} 条看房请求 / 提问等你回复` : `${waiting} showing requests / questions waiting for you`}</span><span className="font-bold">{zh ? '去回复 →' : 'Reply →'}</span>
        </Link>
      )}
      <SectionCard className="mb-4" title={zh ? '在管租约对话' : 'Tenancy conversations'} meta={threads ? `${threads.length}` : '…'}>
        {threads === null ? <p className="text-[13px] text-body-3">…</p> : threads.length === 0 ? (
          <p className="text-[13px] text-body-3">{zh ? '还没有在管租约。签约或导入已签租约后，房东和租客在这里对话。' : 'No managed tenancy yet. After signing or importing a lease, landlord and tenant talk here.'} <Link href="/leases/import" className="font-semibold text-brand">{zh ? '导入租约 →' : 'Import a lease →'}</Link></p>
        ) : (
          <div data-testid="inbox-threads" className="divide-y divide-line-divider">
            {threads.map((t) => {
              const unread = user ? isUnread(t.hh, t.latest, user.id) : false
              return (
                <Link key={t.hh} href={`/h/${t.hh}?tab=messages`} className="flex items-start gap-3 py-3 hover:bg-surface-chip">
                  <span className={'mt-1.5 h-2 w-2 flex-none rounded-full ' + (unread ? 'bg-brand' : 'bg-transparent')} aria-label={unread ? (zh ? '未读' : 'unread') : undefined} />
                  <div className="min-w-0 flex-1">
                    <div className={'truncate text-[13.5px] ' + (unread ? 'font-bold' : 'font-semibold')}>{t.label}</div>
                    <div className="truncate text-[12.5px] text-body-3">{t.latest ? `${t.latest.sender_id === user?.id ? (zh ? '我：' : 'Me: ') : ''}${t.latest.body}` : (zh ? '还没有消息' : 'No messages yet')}</div>
                  </div>
                  {t.latest && <span className="flex-none font-mono text-[11px] text-body-3">{fmt(t.latest.created_at)}</span>}
                </Link>
              )
            })}
          </div>
        )}
      </SectionCard>
      {role === 'tenant' && (
        <SectionCard title={zh ? '我发出的看房请求与提问' : 'Showing requests & questions I sent'} meta={`${intents.length}`}>
          {intents.length === 0 ? <p className="text-[13px] text-body-3">{zh ? '在房源页点「预约看房」或「向房东提问」后会出现在这里。' : 'Use “Book a showing” or “Ask the landlord” on a listing and it shows up here.'}</p> : (
            <div className="divide-y divide-line-divider">
              {intents.map((i) => { const st = intentStatus(i.status); return (
                <div key={i.id} className="flex flex-wrap items-center gap-2 py-2.5 text-[13px]">
                  <span className="font-semibold">{i.kind === 'question' ? (zh ? '提问' : 'Question') : (zh ? '看房' : 'Showing')}</span>
                  {i.listing?.slug ? <Link href={`/listings/${i.listing.slug}`} className="min-w-0 flex-1 truncate hover:underline">{i.listing.address}{i.listing.unit ? ` #${i.listing.unit}` : ''}</Link> : <span className="min-w-0 flex-1 truncate">{i.listing?.address ?? '—'}</span>}
                  <StatusPill tone={st.tone}>{zh ? st.zh : st.en}</StatusPill>
                  <span className="font-mono text-[11px] text-body-3">{fmt(i.created_at)}</span>
                </div>
              ) })}
            </div>
          )}
        </SectionCard>
      )}
    </WorkspaceShell>
  )
}
