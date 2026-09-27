'use client'

// One place for conversations (three-role test report 2026-09-24, SL-T-07).
// Since 节点 4 (2026-09-26) every conversation is a thread on a matter
// (threads / thread_messages: tenancy · work order · application); this page
// lists the threads the account is a party to, with the unread count from
// the account's own read marks (message_reads — no browser storage), plus the
// showing requests / questions a tenant sent (answered by email) and, for
// landlords, requests still waiting in the to-do list.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import WorkspaceShell from '@/components/WorkspaceShell'
import { PageHeader, SectionCard, StatusPill } from '@/components/workspace'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { useT } from '@/lib/i18n'
import { KIND_LABEL, threadHref, type ThreadKind } from '@/lib/threads/shared'

type ThreadRow = { id: string; kind: ThreadKind; ref_id: string; household_id: string | null; title: string | null }
type Latest = { id: number; thread_id: string; sender_id: string | null; sender_kind: string; body: string; kind: string; created_at: string }
type Item = { t: ThreadRow; latest: Latest | null; unread: number }
type Intent = { id: string; kind: string | null; status: string | null; message: string | null; created_at: string; listing: { slug: string | null; address: string | null; unit: string | null; active?: boolean } | null }

export default function Inbox({ role }: { role: 'tenant' | 'landlord' }) {
  const { lang } = useT()
  const zh = lang === 'zh'
  const { user, loading } = useAuth()
  const [items, setItems] = useState<Item[] | null>(null)
  const [intents, setIntents] = useState<Intent[]>([])
  const [waiting, setWaiting] = useState(0)

  useEffect(() => {
    if (loading) return
    if (!user) { setItems([]); return }
    let cancelled = false
    ;(async () => {
      const { data: th } = await supabase.from('threads').select('id, kind, ref_id, household_id, title').order('created_at', { ascending: false }).limit(100)
      const threads = (th ?? []) as ThreadRow[]
      const ids = threads.map((t) => t.id)
      const [{ data: msgs }, { data: reads }, intentsRes, waitingRes] = await Promise.all([
        ids.length ? supabase.from('thread_messages').select('id, thread_id, sender_id, sender_kind, body, kind, created_at').in('thread_id', ids).neq('kind', 'retraction').order('id', { ascending: false }).limit(400) : Promise.resolve({ data: [] as never[] }),
        ids.length ? supabase.from('message_reads').select('thread_id, last_opened_id').eq('user_id', user.id).in('thread_id', ids) : Promise.resolve({ data: [] as never[] }),
        // my_showing_intents = the tenant's own rows with a listing snapshot the public RLS would hide once the listing is off market (review 2026-09-25).
        role === 'tenant'
          ? supabase.from('my_showing_intents').select('id, kind, status, message, created_at, listing_slug, listing_address, listing_unit, listing_active').order('created_at', { ascending: false }).limit(30)
              .then(({ data }) => ({ data: ((data ?? []) as { id: string; kind: string | null; status: string | null; message: string | null; created_at: string; listing_slug: string | null; listing_address: string | null; listing_unit: string | null; listing_active: boolean | null }[]).map((r) => ({
                id: r.id, kind: r.kind, status: r.status, message: r.message, created_at: r.created_at,
                listing: r.listing_address ? { slug: r.listing_active !== false ? r.listing_slug : null, address: r.listing_address, unit: r.listing_unit, active: r.listing_active !== false } : null,
              })) }))
          : Promise.resolve({ data: [] }),
        role === 'landlord' ? supabase.from('agent_pending_actions').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'pending').in('action_type', ['showing_request', 'listing_inquiry']) : Promise.resolve({ count: 0 }),
      ])
      if (cancelled) return
      const latest = new Map<string, Latest>()
      const unread = new Map<string, number>()
      const opened = new Map<string, number>()
      for (const r of (reads ?? []) as { thread_id: string; last_opened_id: number }[]) opened.set(r.thread_id, r.last_opened_id)
      for (const m of (msgs ?? []) as Latest[]) {
        if (!latest.has(m.thread_id)) latest.set(m.thread_id, m)
        if (m.sender_id !== user.id && m.id > (opened.get(m.thread_id) ?? 0)) unread.set(m.thread_id, (unread.get(m.thread_id) ?? 0) + 1)
      }
      // A thread with no message yet is not a conversation (viewing never creates one since 2026-09-27; older empties were removed).
      const list: Item[] = threads.map((t) => ({ t, latest: latest.get(t.id) ?? null, unread: unread.get(t.id) ?? 0 })).filter((i) => i.latest)
      list.sort((a, b) => (b.latest?.id ?? 0) - (a.latest?.id ?? 0))
      setItems(list)
      setIntents(((intentsRes as { data: unknown }).data ?? []) as Intent[])
      setWaiting((waitingRes as { count: number | null }).count ?? 0)
    })()
    return () => { cancelled = true }
  }, [loading, user, role])

  const fmt = (iso: string) => new Date(iso).toLocaleString(zh ? 'zh-CN' : 'en-CA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  const intentStatus = (s: string | null) => s === 'accepted' ? { zh: '房东已回复（见邮箱）', en: 'Landlord replied (see email)', tone: 'ok' as const } : s === 'declined' ? { zh: '房东婉拒', en: 'Declined', tone: 'neutral' as const } : { zh: '等房东回复', en: 'Waiting for the landlord', tone: 'warn' as const }
  const who = (m: Latest) => (m.sender_id === user?.id ? (zh ? '我' : 'Me') : m.sender_kind === 'system' ? (zh ? '系统' : 'System') : m.sender_kind === 'landlord' ? (zh ? '房东' : 'Landlord') : m.sender_kind === 'tenant' ? (zh ? '租客' : 'Tenant') : m.sender_kind === 'provider' || m.sender_kind === 'external' ? (zh ? '服务商' : 'Provider') : m.sender_kind)

  return (
    <WorkspaceShell role={role} hideAside>
      <PageHeader title={zh ? '消息' : 'Messages'} sub={role === 'landlord'
        ? (zh ? '每件事一条对话：在管租约、维修工单（租客 · 房东 · 服务商）、申请。记录只追加、带服务器时间与发送身份；对方会收到推送（按其通知设置）。租客发来的看房请求与提问在待办里回复（回复会发到对方邮箱）。' : 'One thread per matter: tenancies, work orders (tenant · landlord · provider), applications. Append-only, server-timed, with the sender’s hat; the other side is pushed per their settings. Showing requests and questions are answered from your to-do list (the reply is emailed).')
        : (zh ? '每件事一条对话：在管租约、维修工单（租客 · 房东 · 服务商）、你的申请。记录只追加、带服务器时间与发送身份；对方会收到推送（按其通知设置）。看房请求的回复会发到你的邮箱。' : 'One thread per matter: your tenancy, work orders (tenant · landlord · provider), your applications. Append-only, server-timed, with the sender’s hat; the other side is pushed per their settings. Replies to showing requests arrive by email.')} />
      {role === 'landlord' && waiting > 0 && (
        <Link href="/landlord/todo" className="mb-4 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
          <span>{zh ? `${waiting} 条看房请求 / 提问等你回复` : `${waiting} showing requests / questions waiting for you`}</span><span className="font-bold">{zh ? '去回复 →' : 'Reply →'}</span>
        </Link>
      )}
      <SectionCard className="mb-4" title={zh ? '对话' : 'Threads'} meta={items ? `${items.length}` : '…'}>
        {items === null ? <p className="text-[13px] text-body-3">…</p> : items.length === 0 ? (
          <p className="text-[13px] text-body-3">{zh ? '还没有对话。签约或导入租约后有租约对话；派出或收到维修工单后有工单对话；申请有申请对话。' : 'No threads yet. A tenancy thread opens when a lease is signed or imported; a work-order thread when a repair is dispatched; an application thread with each application.'} <Link href="/leases/import" className="font-semibold text-brand">{zh ? '导入租约 →' : 'Import a lease →'}</Link></p>
        ) : (
          <div data-testid="inbox-threads" className="divide-y divide-line-divider">
            {items.map(({ t, latest, unread }) => (
              <Link key={t.id} href={threadHref(t.kind, t.ref_id, t.household_id, role)} className="flex items-start gap-3 py-3 hover:bg-surface-chip">
                <span className={'mt-1.5 h-2 w-2 flex-none rounded-full ' + (unread ? 'bg-brand' : 'bg-transparent')} aria-label={unread ? (zh ? '未读' : 'unread') : undefined} />
                <div className="min-w-0 flex-1">
                  <div className={'flex flex-wrap items-baseline gap-x-2 text-[13.5px] ' + (unread ? 'font-bold' : 'font-semibold')}>
                    <span className="truncate">{t.title || '—'}</span>
                    <span className="font-mono text-[10.5px] font-bold uppercase text-body-3">{zh ? KIND_LABEL[t.kind].zh : KIND_LABEL[t.kind].en}</span>
                    {unread > 0 && <span className="rounded-full bg-brand px-1.5 font-mono text-[10px] font-bold text-white">{unread}</span>}
                  </div>
                  <div className="truncate text-[12.5px] text-body-3">{latest ? `${who(latest)}: ${latest.body}` : (zh ? '还没有消息' : 'No messages yet')}</div>
                </div>
                {latest && <span className="flex-none font-mono text-[11px] text-body-3">{fmt(latest.created_at)}</span>}
              </Link>
            ))}
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
                  {i.listing?.slug ? <Link href={`/listings/${i.listing.slug}`} className="min-w-0 flex-1 truncate hover:underline">{i.listing.address}{i.listing.unit ? ` #${i.listing.unit}` : ''}</Link> : <span className="min-w-0 flex-1 truncate text-body-3">{i.listing?.address ? `${i.listing.address}${i.listing.unit ? ` #${i.listing.unit}` : ''}${i.listing.active === false ? (zh ? ' · 已下架' : ' · off market') : ''}` : (zh ? '房源已下架' : 'Listing no longer available')}</span>}
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
