'use client'
// 新消息 (消息系统 A 期; people-first since 找得到人 2026-09-30).
//   1. 发给谁？   — the people you share a matter with, named (never an address),
//                   grouped (房东 / 租客 / 申请人 / 服务商 / 经纪 · 客户), Stayloop
//                   pinned, one card per audience; search matches names, role
//                   words, addresses and ticket titles.
//   2. 关于哪件事？ — only when that audience shares more than one matter; the
//                   latest open one first, finished ones folded.
//   3. 写消息     — an existing conversation opens directly (composer focused);
//                   otherwise compose here, with a line naming everyone who will
//                   read it (one thread per matter, no private side-channel).
// A deep link (?new=<kind>:<ref>) starts at step 3 for that matter.
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import {
  audienceLine, counterpartGroup, counterpartLine, COUNTERPART_GROUP_LABEL, fmtSize, initialOf, KIND_TAG, PERSON_ROLE, ROLE_ACCENT, roleLabel,
  type Attachment, type Person, type ThreadKind,
} from '@/lib/threads/shared'
import { notifyMessagesChanged } from '@/lib/messages/unread'
import { takeDraft } from '@/lib/messages/openThread'

export type Target = {
  kind: ThreadKind; ref_id: string; title: string | null; subtitle: string | null; party: string; thread_id: string | null; at: string
  listing_id: string | null; subject_user: string | null; status: string | null; people_names: string[]; people_roles: string[]; reachable: boolean
}
type Card = { key: string; group: string; names: string[]; roles: string[]; targets: Target[] }

const ICON: Record<ThreadKind, string> = { tenancy: '🏠', application: '📝', work_order: '🔧', dispute: '⚖️', listing_inquiry: '🔑', agent_client: '💼', support: '💬' }
const CLOSED = new Set(['closed', 'cancelled', 'declined', 'paid', 'ended', 'archived', 'withdrawn'])
const GROUP_ORDER: Record<string, string[]> = {
  tenant: ['landlord', 'provider', 'agent', 'tenant', 'applicant', 'other'],
  landlord: ['tenant', 'applicant', 'provider', 'agent', 'landlord', 'other'],
  agent: ['agent', 'landlord', 'tenant', 'applicant', 'provider', 'other'],
  provider: ['landlord', 'tenant', 'provider', 'agent', 'applicant', 'other'],
}

async function jwt() { return (await supabase.auth.getSession()).data.session?.access_token ?? null }

export function matterLine(t: Pick<Target, 'kind' | 'title' | 'subtitle' | 'status'>, zh: boolean): string {
  const tag = zh ? KIND_TAG[t.kind].zh : KIND_TAG[t.kind].en
  if (t.kind === 'support') return zh ? '账号、付款、争议，或任何问题' : 'Account, billing, disputes, anything'
  if (t.kind === 'agent_client') return tag
  return [t.title, t.kind === 'work_order' ? t.subtitle : null, tag].filter(Boolean).join(' · ')
}

export default function NewMessage({ zh, hat, initial, onClose, onSent, onOpenThread }: {
  zh: boolean
  hat: 'tenant' | 'landlord' | 'agent' | 'provider'
  /** Deep link "?new=<kind>:<ref>": compose for that matter directly. */
  initial?: { kind: string; ref: string } | null
  onClose: () => void
  onSent: (threadId: string) => void
  /** The chosen matter already has a conversation: open it with the composer focused. */
  onOpenThread: (threadId: string) => void
}) {
  const auth = useAuth()
  const [targets, setTargets] = useState<Target[] | null>(null)
  const [card, setCard] = useState<Card | null>(null)
  const [target, setTarget] = useState<Target | null>(null)
  const [people, setPeople] = useState<Person[] | null>(null)
  const [peopleErr, setPeopleErr] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [files, setFiles] = useState<Attachment[]>([])
  const [threadId, setThreadId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [showClosed, setShowClosed] = useState(false)

  useEffect(() => {
    if (auth.loading || !auth.user) return
    let on = true
    supabase.rpc('my_message_targets').then(({ data }) => {
      if (!on) return
      const rows = ((data ?? []) as Target[]).filter((t) => t.party)
      setTargets(rows)
      if (initial) {
        const hit = rows.find((r) => r.kind === initial.kind && r.ref_id === initial.ref)
        setTarget(hit ?? { kind: initial.kind as ThreadKind, ref_id: initial.ref, title: null, subtitle: null, party: '', thread_id: null, at: '', listing_id: null, subject_user: initial.kind === 'support' ? initial.ref : null, status: null, people_names: [], people_roles: [], reachable: true })
        const d = takeDraft(initial.kind, initial.ref)
        if (d) setDraft(d)
      }
    })
    return () => { on = false }
  }, [auth.loading, auth.user, initial])

  // People of the chosen matter (names + roles, never an address).
  useEffect(() => {
    if (!target) return
    let on = true
    setPeople(null); setPeopleErr(null)
    ;(async () => {
      const token = await jwt()
      const qs = target.thread_id ? `thread_id=${target.thread_id}` : `kind=${target.kind}&ref=${target.ref_id}${target.listing_id ? `&listing=${target.listing_id}` : ''}${target.subject_user ? `&subject=${target.subject_user}` : ''}`
      const res = await fetch(`/api/threads/participants?${qs}`, { headers: token ? { Authorization: `Bearer ${token}` } : undefined })
      const j = (await res.json().catch(() => ({}))) as { people?: Person[]; error?: string }
      if (!on) return
      if (!res.ok) setPeopleErr(j.error || `HTTP ${res.status}`); else setPeople(j.people ?? [])
    })()
    return () => { on = false }
  }, [target])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // One card per audience (the same people across several matters collapse into one card).
  const cards = useMemo(() => {
    const map = new Map<string, Card>()
    for (const t of targets ?? []) {
      // Merge matters only when every person on the other side is named (the same names ⇒ the same
      // people); an unnamed 「租客」 in one matter is not the unnamed 「租客」 in another (review 2026-09-30).
      const allNamed = t.people_names.length > 0 && t.people_names.every((n) => !!n)
      const key = t.kind === 'support' ? 'stayloop' : allNamed ? t.people_names.map((n, i) => `${n}|${t.people_roles[i]}`).sort().join('+') : `solo:${t.kind}:${t.ref_id}`
      const c = map.get(key) ?? { key, group: counterpartGroup(t.kind, t.people_roles), names: t.people_names, roles: t.people_roles, targets: [] }
      c.targets.push(t)
      map.set(key, c)
    }
    for (const c of map.values()) c.targets.sort((a, b) => Number(CLOSED.has(a.status ?? '')) - Number(CLOSED.has(b.status ?? '')) || (b.at || '').localeCompare(a.at || ''))
    return Array.from(map.values())
  }, [targets])

  const grouped = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const match = (c: Card) => !needle || [
      ...c.names, ...c.roles.map((r) => `${PERSON_ROLE[r]?.zh ?? ''} ${PERSON_ROLE[r]?.en ?? ''}`), COUNTERPART_GROUP_LABEL[c.group]?.zh ?? '', COUNTERPART_GROUP_LABEL[c.group]?.en ?? '',
      ...c.targets.flatMap((t) => [t.title ?? '', t.subtitle ?? '', KIND_TAG[t.kind].zh, KIND_TAG[t.kind].en]),
      c.key === 'stayloop' ? '客服 support stayloop 联系' : '',
    ].join(' ').toLowerCase().includes(needle)
    const list = cards.filter(match)
    const order = GROUP_ORDER[hat] ?? GROUP_ORDER.tenant
    const pinned = list.filter((c) => c.key === 'stayloop')
    const rest = list.filter((c) => c.key !== 'stayloop')
    const groups = order.map((g) => ({ g, rows: rest.filter((c) => c.group === g).sort((a, b) => (b.targets[0]?.at || '').localeCompare(a.targets[0]?.at || '')) })).filter((x) => x.rows.length)
    return { pinned, groups }
  }, [cards, q, hat])

  function choose(t: Target) {
    if (t.thread_id) { onOpenThread(t.thread_id); return }
    setTarget(t); setThreadId(null)
  }
  function pickCard(c: Card) {
    if (c.targets.length === 1) { choose(c.targets[0]); return }
    setShowClosed(false)
    setCard(c)
  }

  async function ensureThread(): Promise<string | null> {
    if (threadId) return threadId
    if (!target) return null
    if (target.thread_id) { setThreadId(target.thread_id); return target.thread_id }
    const { data, error } = await supabase.rpc('open_thread', { p_kind: target.kind, p_ref: target.ref_id })
    if (error || !data) { setErr(/not_a_party/.test(error?.message || '') ? (zh ? '你不是这件事的当事人。' : 'You are not a party to this matter.') : (error?.message || 'thread unavailable')); return null }
    setThreadId(String(data))
    return String(data)
  }

  async function upload(list: FileList | null) {
    if (!list) return
    setErr(null); setBusy(true)
    const id = await ensureThread()
    const token = await jwt()
    if (id) for (const f of Array.from(list).slice(0, 6 - files.length)) {
      const fd = new FormData(); fd.append('thread_id', id); fd.append('file', f)
      const res = await fetch('/api/threads/upload', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : undefined, body: fd })
      const j = (await res.json().catch(() => ({}))) as { attachment?: Attachment; error?: string }
      if (!res.ok || !j.attachment) { setErr(j.error === 'file_type' ? (zh ? '只支持图片、PDF、Word 与文本文件。' : 'Images, PDF, Word and text files only.') : j.error === 'file_size' ? (zh ? '单个文件不能超过 25 MB。' : 'Files must be under 25 MB.') : (j.error || `HTTP ${res.status}`)); break }
      setFiles((p) => [...p, j.attachment!])
    }
    setBusy(false)
  }

  const nobodyElse = !!people && people.filter((p) => !p.is_me).length === 0
  const sendingRef = useRef(false)
  async function send() {
    if (sendingRef.current) return
    const body = draft.trim()
    if (!auth.user || (!body && !files.length) || nobodyElse) return
    sendingRef.current = true
    setBusy(true); setErr(null)
    try {
      const id = await ensureThread()
      if (!id) return
      const acting = hat === 'provider' ? 'provider' : hat
      const { data, error } = await supabase.from('thread_messages').insert({ thread_id: id, sender_id: auth.user.id, sender_kind: 'tenant', acting_role: acting, kind: 'message', body: body || (zh ? '（附件）' : '(attachment)'), attachments: files }).select('id').single()
      if (error) { setErr(error.message); return }
      // Announce exactly this message (sweep 2026-10-01).
      const token = await jwt()
      if (token) void fetch('/api/threads/notify', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ thread_id: id, message_id: data ? Number((data as { id: number }).id) : null }) }).catch(() => undefined)
      notifyMessagesChanged()
      onSent(id)
    } finally {
      sendingRef.current = false
      setBusy(false)
    }
  }

  const step: 'who' | 'which' | 'write' = target ? 'write' : card ? 'which' : 'who'
  const heading = step === 'who' ? (zh ? '发给谁？' : 'Who is it for?') : step === 'which' ? (zh ? '关于哪件事？' : 'Which matter is it about?') : (zh ? '写消息' : 'Write your message')
  const back = () => { setErr(null); if (step === 'write' && !initial) { setTarget(null); setPeople(null) } else if (step === 'which') setCard(null) }
  const others = (people ?? []).filter((p) => !p.is_me)
  const toLine = target ? (target.kind === 'support' ? 'Stayloop' : others.length ? counterpartLine(others.map((p) => p.name ?? ''), others.map((p) => p.role), zh, 3) : counterpartLine(target.people_names, target.people_roles, zh, 3)) : ''

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={zh ? '新消息' : 'New message'} data-testid="new-message" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="flex max-h-[92dvh] w-full max-w-[560px] flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
        <div className="flex items-center gap-2 border-b border-line-divider px-4 py-3.5 sm:px-5">
          {step !== 'who' && !(step === 'write' && initial) && <button type="button" onClick={back} className="-ml-1 flex h-9 w-9 flex-none items-center justify-center rounded-full text-[18px] hover:bg-surface-chip" aria-label={zh ? '上一步' : 'Back'}>‹</button>}
          <div className="min-w-0 flex-1 text-[16px] font-bold text-ink" data-testid="new-message-step" data-step={step}>{heading}</div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-[18px] text-body-3 hover:bg-surface-chip" aria-label={zh ? '关闭' : 'Close'}>×</button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {step === 'who' && (
            <>
              <input className="sl-input mb-3 w-full" value={q} onChange={(e) => setQ(e.target.value)} placeholder={zh ? '搜索名字、房东 / 租客 / 维修、地址' : 'Search a name, landlord / tenant / repair, an address'} aria-label={zh ? '搜索' : 'Search'} autoFocus />
              {targets === null ? <p className="text-[13px] text-body-3">…</p> : (
                <>
                  {grouped.pinned.map((c) => <PersonCard key={c.key} c={c} zh={zh} onPick={() => pickCard(c)} />)}
                  {grouped.groups.map(({ g, rows }) => (
                    <div key={g} className="mb-3 mt-3">
                      <div className="mb-1.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.1em] text-body-3">{zh ? COUNTERPART_GROUP_LABEL[g].zh : COUNTERPART_GROUP_LABEL[g].en}</div>
                      {rows.map((c) => <PersonCard key={c.key} c={c} zh={zh} onPick={() => pickCard(c)} />)}
                    </div>
                  ))}
                  {grouped.groups.length === 0 && grouped.pinned.length === 0 && <p className="text-[13px] text-body-3">{zh ? '没有找到。' : 'Nothing found.'}</p>}
                </>
              )}
              <p className="mt-2 text-[11.5px] leading-relaxed text-body-3">{zh ? '这里只有和你在同一件事里的人。向房东咨询一套房源，请在房源页点「向房东提问」或「预约看房」。' : 'Only people who share a matter with you. To ask about a listing, use “Ask the landlord” or “Request a viewing” on the listing page.'}</p>
            </>
          )}

          {step === 'which' && card && (
            <>
              <div className="mb-3 flex items-center gap-2.5 rounded-xl bg-surface-chip px-3 py-2">
                <Avatar name={card.names[0]} role={card.roles[0] ?? 'member'} zh={zh} />
                <div className="min-w-0 text-[13.5px] font-semibold">{counterpartLine(card.names, card.roles, zh, 3)}</div>
              </div>
              {card.targets.filter((t) => showClosed || !CLOSED.has(t.status ?? '')).map((t) => (
                <button key={`${t.kind}:${t.ref_id}`} type="button" data-testid="target" onClick={() => choose(t)} className="mb-1.5 flex w-full items-start gap-3 rounded-xl border border-line-divider px-3 py-2.5 text-left hover:border-brand hover:bg-[#F0FAFE]">
                  <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-surface-chip text-[15px]" aria-hidden="true">{ICON[t.kind]}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold text-ink">{matterLine(t, zh)}</span>
                    <span className="block truncate text-[12px] text-body-3">{t.thread_id ? (zh ? '已有对话 · 打开继续' : 'Existing conversation · continue') : (zh ? '还没有对话 · 发第一条' : 'No conversation yet · send the first message')}</span>
                  </span>
                </button>
              ))}
              {!showClosed && card.targets.some((t) => CLOSED.has(t.status ?? '')) && (
                <button type="button" onClick={() => setShowClosed(true)} className="mt-1 text-[12.5px] font-semibold text-brand">{zh ? `已结束的事（${card.targets.filter((t) => CLOSED.has(t.status ?? '')).length}）` : `Finished (${card.targets.filter((t) => CLOSED.has(t.status ?? '')).length})`}</button>
              )}
            </>
          )}

          {step === 'write' && target && (
            <>
              <div className="mb-3 rounded-xl border border-line-divider px-3 py-2.5" data-testid="recipients-card">
                <div className="text-[13.5px]"><span className="text-body-3">{zh ? '发给 ' : 'To '}</span><b data-testid="compose-to">{toLine || (peopleErr ? '—' : '…')}</b></div>
                {target.title || target.kind !== 'support' ? <div className="mt-0.5 truncate text-[12px] text-body-3">{zh ? '关于：' : 'About: '}{target.title ? matterLine(target, zh) : (zh ? KIND_TAG[target.kind].zh : KIND_TAG[target.kind].en)}</div> : null}
                {people && <div className="mt-1.5 text-[11.5px] leading-relaxed text-body-2" data-testid="audience-line">{audienceLine(people, zh)}{others.some((p) => p.channel === 'email') ? (zh ? '。没开 App 的一方会收到经 Stayloop 转发的邮件，回复邮件也会进这里。' : '. Anyone not in the app gets it by relayed email and can reply by email.') : ''}</div>}
                {peopleErr && <div className="mt-1 text-[12px] text-danger">{peopleErr === 'not_a_party' ? (zh ? '你不是这件事的当事人。' : 'You are not a party to this matter.') : peopleErr}</div>}
              </div>
              {nobodyElse && <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900" data-testid="nobody-else">{zh ? '这件事里还没有其他人能收到消息（例如对方还没加入或没有邮箱）。' : 'Nobody else in this matter can receive messages yet (they have not joined, or there is no email).'}</p>}
              <textarea className="sl-input min-h-[140px] w-full resize-y" value={draft} onChange={(e) => setDraft(e.target.value.slice(0, 4000))} placeholder={zh ? '写消息…' : 'Write a message…'} aria-label={zh ? '消息内容' : 'Message'} autoFocus />
              {files.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{files.map((a) => <span key={a.path} className="rounded-full bg-surface-chip px-2 py-[2px] text-[11.5px]">{a.name} <span className="text-body-3">{fmtSize(a.size)}</span></span>)}</div>}
              <div className="mt-2.5 flex flex-wrap items-center gap-3 text-[12px] text-body-2">
                <label className="flex cursor-pointer items-center gap-1.5 rounded-full border border-line-divider px-3 py-1.5">
                  <span aria-hidden="true">📎</span> <span>{busy ? '…' : zh ? '附件' : 'Attach'}</span>
                  <input type="file" className="hidden" multiple accept="image/*,.heic,.heif,application/pdf,.txt,.doc,.docx" onChange={(e) => void upload(e.target.files)} disabled={busy || files.length >= 6} />
                </label>
                <span className="text-body-3">{zh ? '发出后不可删改；10 分钟内可撤回（原文保留）' : 'Cannot be edited once sent; retract within 10 min (original kept)'}</span>
              </div>
            </>
          )}
          {err && <p className="mt-2 text-[12.5px] text-danger">{err}</p>}
        </div>
        {step === 'write' && (
          <div className="flex items-center gap-2 border-t border-line-divider px-4 py-3 sm:px-5">
            <div className="flex-1" />
            <button type="button" data-testid="new-message-send" disabled={busy || (!draft.trim() && !files.length) || nobodyElse || !!peopleErr} onClick={() => void send()} className="sl-btn-primary disabled:opacity-50">{busy ? '…' : zh ? '发送' : 'Send'}</button>
          </div>
        )}
      </div>
    </div>
  )
}

function Avatar({ name, role, zh, size = 32 }: { name: string | null | undefined; role: string; zh: boolean; size?: number }) {
  const c = ROLE_ACCENT[role] ?? '#6E6E8A'
  return <span className="flex flex-none items-center justify-center rounded-full font-bold" style={{ width: size, height: size, background: `${c}1F`, color: c, fontSize: size * 0.42 }} aria-hidden="true">{initialOf(name, role, zh)}</span>
}
export { Avatar as PersonAvatar }

function PersonCard({ c, zh, onPick }: { c: Card; zh: boolean; onPick: () => void }) {
  const stay = c.key === 'stayloop'
  const first = c.targets[0]
  const unreachable = c.targets.every((t) => !t.reachable)
  return (
    <button type="button" data-testid="person-card" onClick={onPick} disabled={unreachable && !stay}
      className={'mb-1.5 flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left ' + (unreachable && !stay ? 'cursor-not-allowed border-dashed border-line-divider opacity-60' : 'border-line-divider hover:border-brand hover:bg-[#F0FAFE]')}>
      <Avatar name={stay ? 'Stayloop' : c.names[0]} role={stay ? 'admin' : c.roles[0] ?? 'member'} zh={zh} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[14px] font-semibold text-ink">{stay ? (zh ? 'Stayloop 客服' : 'Stayloop support') : counterpartLine(c.names, c.roles, zh)}</span>
          {!stay && c.roles.length > 0 && c.names[0] && <span className="flex-none rounded-full bg-surface-chip px-1.5 text-[10.5px] font-bold text-body-2">{roleLabel(c.roles[0], zh)}</span>}
        </span>
        <span className="block truncate text-[12px] text-body-3">
          {unreachable && !stay ? (zh ? '还不能发：对方没加入也没有邮箱' : 'Cannot reach yet: not joined and no email')
            : c.targets.length > 1 ? (zh ? `${matterLine(first, zh)} 等 ${c.targets.length} 件事` : `${matterLine(first, zh)} +${c.targets.length - 1}`)
            : `${matterLine(first, zh)}${first.thread_id ? (zh ? ' · 已有对话' : ' · existing') : ''}`}
        </span>
      </span>
      <span className="flex-none text-body-3" aria-hidden="true">›</span>
    </button>
  )
}
