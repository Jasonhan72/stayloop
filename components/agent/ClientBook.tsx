'use client'

// The agent's real client table (P2 2026-09-23): rows in agent_clients,
// own-only RLS. TRESA hygiene is the point of the two date columns — a
// written representation agreement and the RECO Information Guide are
// what RECO expects before any leasing work. "发起筛查" is on every row: a
// verified agent screens directly (user 2026-09-29:「经纪可以直接筛选，这个
// 本来就是经纪的工作，客户默认委托了这个的」). A confirmed delegation is
// optional — it records the screening under the client too, so the landlord
// sees the report in their own account.
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { SectionCard, StatusPill, Table, Td, Tr } from '@/components/workspace'
import { STAGES, daysQuiet, paperworkComplete, type ClientRole, type ClientStage } from '@/lib/agent/clientBook'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { useReportLiveRows } from '@/lib/liveRows'
import ProposeDelegation from '@/components/delegations/ProposeDelegation'
import MessageButton from '@/components/messages/MessageButton'
import { allows, isDelegationLive, STATUS_LABEL, type DelegationRow } from '@/lib/delegations/shared'

export type ClientRow = {
  id: string
  name: string
  client_role: ClientRole
  email: string | null
  phone: string | null
  budget: string | null
  area: string | null
  stage: ClientStage
  representation_agreement_at: string | null
  info_guide_given_at: string | null
  last_contact_at: string | null
  notes: string | null
  updated_at: string
}

const EMPTY: { name: string; client_role: ClientRole; email: string; phone: string; budget: string; area: string; stage: ClientStage; representation_agreement_at: string; info_guide_given_at: string; notes: string } = { name: '', client_role: 'tenant', email: '', phone: '', budget: '', area: '', stage: 'searching', representation_agreement_at: '', info_guide_given_at: '', notes: '' }
// The same check the server makes before it will send a delegation link (/api/delegations).
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
type ContactForm = { name: string; email: string; phone: string; budget: string; area: string; notes: string }
const sameEmail = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase()

export default function ClientBook({ zh, onRows }: { zh: boolean; onRows?: (n: number) => void }) {
  const { user, loading } = useAuth()
  const [rows, setRows] = useState<ClientRow[] | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  // 节点 5: delegations per client (own rows as the delegate); the screening hand-off needs a live one with 'screen'.
  const [delegs, setDelegs] = useState<DelegationRow[]>([])
  const [proposeFor, setProposeFor] = useState<string | null>(null)
  // Whether each pending delegation's confirmation email actually left (link_emailed; unknown before the A8 migration).
  const [linkInfo, setLinkInfo] = useState<Record<string, { emailed: boolean | null; at: string | null }>>({})
  const [notice, setNotice] = useState<string | null>(null)
  // Editing a client's details (sweep 2026-10-01: email / name / phone / budget / area / notes could not be
  // changed after creation, so the only fix was a duplicate row with its own thread).
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<ContactForm>({ name: '', email: '', phone: '', budget: '', area: '', notes: '' })
  useReportLiveRows('agent_clients', rows ? rows.length : null)
  const load = useCallback(async () => {
    if (!user) { setRows([]); return }
    const [{ data }, { data: dl }, { data: ls, error: lsErr }] = await Promise.all([
      supabase.from('agent_clients').select('*').eq('agent_auth_id', user.id).order('updated_at', { ascending: false }).limit(200),
      supabase.from('delegations').select('id, principal_auth_id, principal_email, principal_name, delegate_auth_id, client_id, scope, allowed_actions, starts_at, expires_at, basis_version, status, confirmed_at, revoked_at, created_at').eq('delegate_auth_id', user.id).order('created_at', { ascending: false }).limit(200),
      // separate, best-effort: before the A8 migration these columns do not exist and the table above must still load
      supabase.from('delegations').select('id, link_emailed, link_emailed_at').eq('delegate_auth_id', user.id).eq('status', 'pending').limit(200),
    ])
    const list = (data ?? []) as ClientRow[]
    setRows(list)
    setDelegs((dl ?? []) as DelegationRow[])
    const info: Record<string, { emailed: boolean | null; at: string | null }> = {}
    if (!lsErr) for (const r of (ls ?? []) as { id: string; link_emailed: boolean | null; link_emailed_at: string | null }[]) info[r.id] = { emailed: r.link_emailed, at: r.link_emailed_at }
    setLinkInfo(info)
    onRows?.(list.length)
  }, [user, onRows])
  const delegFor = (clientId: string): DelegationRow | null => {
    const mine = delegs.filter((d) => d.client_id === clientId)
    return mine.find((d) => isDelegationLive(d)) ?? mine.find((d) => d.status === 'pending') ?? mine[0] ?? null
  }
  useEffect(() => { if (!loading) void load() }, [loading, load])

  const errText = (msg: string): string =>
    /client_email_taken/.test(msg) ? (zh ? '已有一位客户用这个邮箱；请在那一行点「编辑资料」。' : 'Another client already has this email; use 「Edit details」 on that row.') : msg
  async function add() {
    if (!user || !form.name.trim()) return
    setNotice(null)
    const email = form.email.trim()
    if (email && !EMAIL_RE.test(email)) { setErr(zh ? '邮箱格式不对（例如 name@example.com）。' : 'That email does not look right (e.g. name@example.com).'); return }
    // One row per client: re-adding someone to fix their email made a second row with its own thread.
    const dup = email ? rows?.find((r) => sameEmail(r.email, email)) : null
    if (dup) { setErr(zh ? `「${dup.name}」已经用这个邮箱记在客户表里了；要改资料请在那一行点「编辑资料」。` : `${dup.name} is already in your client table with this email; use 「Edit details」 on that row.`); return }
    setBusy(true)
    const { error } = await supabase.from('agent_clients').insert({
      agent_auth_id: user.id,
      name: form.name.trim().slice(0, 120),
      client_role: form.client_role,
      email: email || null,
      phone: form.phone.trim() || null,
      budget: form.budget.trim() || null,
      area: form.area.trim() || null,
      stage: form.stage,
      representation_agreement_at: form.representation_agreement_at || null,
      info_guide_given_at: form.info_guide_given_at || null,
      notes: form.notes.trim() || null,
      last_contact_at: new Date().toISOString(),
    })
    setErr(error ? errText(error.message) : null)
    if (!error) { setForm(EMPTY); setOpen(false); await load() }
    setBusy(false)
  }
  async function update(id: string, patch: Partial<ClientRow>): Promise<boolean> {
    setBusy(true)
    const { error } = await supabase.from('agent_clients').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
    setErr(error ? errText(error.message) : null)
    await load()
    setBusy(false)
    return !error
  }
  function startEdit(c: ClientRow) {
    setErr(null); setNotice(null); setProposeFor(null)
    setEditForm({ name: c.name, email: c.email ?? '', phone: c.phone ?? '', budget: c.budget ?? '', area: c.area ?? '', notes: c.notes ?? '' })
    setEditingId(c.id)
  }
  async function saveEdit(c: ClientRow) {
    const f = { name: editForm.name.trim().slice(0, 120), email: editForm.email.trim().slice(0, 200), phone: editForm.phone.trim().slice(0, 40), budget: editForm.budget.trim().slice(0, 80), area: editForm.area.trim().slice(0, 160), notes: editForm.notes.trim().slice(0, 2000) }
    if (!f.name) { setErr(zh ? '姓名不能为空。' : 'The name cannot be empty.'); return }
    if (f.email && !EMAIL_RE.test(f.email)) { setErr(zh ? '邮箱格式不对（例如 name@example.com）。' : 'That email does not look right (e.g. name@example.com).'); return }
    const dup = f.email ? rows?.find((r) => r.id !== c.id && sameEmail(r.email, f.email)) : null
    if (dup) { setErr(zh ? `「${dup.name}」已经用这个邮箱记在客户表里了。` : `${dup.name} already has this email in your client table.`); return }
    const emailChanged = (c.email ?? '').trim().toLowerCase() !== f.email.toLowerCase()
    if (emailChanged) {
      // A confirmed delegation is bound to the account that confirmed it, and a pending one to the address its
      // link went to — whoever holds the old address could still confirm and join this client's conversation.
      const bound = delegs.find((x) => x.client_id === c.id && (isDelegationLive(x) || x.status === 'pending'))
      if (bound && bound.status === 'pending') { setErr(zh ? '这位客户有待确认的委托，请先撤回再改邮箱（确认链接绑定在原邮箱上）。' : 'This client has a pending delegation. Withdraw it before changing the email (the confirmation link is bound to the old address).'); return }
      if (bound) { setErr(zh ? '有效委托期间不能改这位客户的邮箱（委托绑定在客户确认时的账号上）。确需更换请先撤回委托。' : 'The email cannot change while a delegation is active (it is bound to the account that confirmed). Withdraw it first if you must.'); return }
      // Whoever holds the new address becomes the other side of the existing agent ↔ client conversation.
      if (c.email && !window.confirm(zh ? '改邮箱后，新邮箱的持有人会看到你和这位客户已有的对话。只在修正填错的邮箱时改；换了联系人请新建一位客户。继续？' : 'Whoever holds the new email will see your existing conversation with this client. Only correct a mistyped email this way; for a different person add a new client. Continue?')) return
    }
    const patch: Partial<ClientRow> = {}
    if (f.name !== c.name) patch.name = f.name
    if (emailChanged) patch.email = f.email || null
    if (f.phone !== (c.phone ?? '')) patch.phone = f.phone || null
    if (f.budget !== (c.budget ?? '')) patch.budget = f.budget || null
    if (f.area !== (c.area ?? '')) patch.area = f.area || null
    if (f.notes !== (c.notes ?? '')) patch.notes = f.notes || null
    if (!Object.keys(patch).length) { setEditingId(null); return }
    if (await update(c.id, patch)) setEditingId(null)
  }
  async function delegationAction(d: DelegationRow, action: 'resend' | 'revoke') {
    if (action === 'revoke' && !window.confirm(zh ? '撤回这份待确认的委托？客户收到的链接会失效。' : 'Withdraw this pending delegation? The link the client has stops working.')) return
    setBusy(true); setErr(null); setNotice(null)
    try {
      const { data } = await supabase.auth.getSession()
      const res = await fetch(`/api/delegations/${d.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` }, body: JSON.stringify({ action }) })
      const j = (await res.json().catch(() => ({}))) as { error?: string; emailed?: boolean }
      if (!res.ok) {
        const map: Record<string, { zh: string; en: string }> = {
          rate_limited: { zh: '操作太频繁，请稍后再试。', en: 'Too many attempts; try again later.' },
          registration_not_live: { zh: '你的 RECO 注册未处于有效状态。', en: 'Your RECO registration is not live.' },
          client_email_changed: { zh: '客户邮箱已经改过，这份委托还绑定在原邮箱上。请撤回后用新邮箱重新发起。', en: 'The client’s email has changed; this delegation is still bound to the old address. Withdraw it and propose again.' },
        }
        const m = j.error && map[j.error]
        setErr(m ? (zh ? m.zh : m.en) : /^status_/.test(j.error || '') ? (zh ? '这份委托已不是待确认状态。' : 'This delegation is no longer pending.') : j.error || `HTTP ${res.status}`)
      } else if (action === 'resend') {
        setNotice(j.emailed
          ? (zh ? `确认链接已重新发到 ${d.principal_email}。` : `The confirmation link was sent again to ${d.principal_email}.`)
          : (zh ? `还是没有发出去（邮件服务出错）。请稍后再试，或撤回后检查邮箱 ${d.principal_email} 是否正确。` : `It still did not go out (mail service error). Try later, or withdraw and check ${d.principal_email}.`))
      } else {
        setNotice(zh ? '已撤回。' : 'Withdrawn.')
      }
      await load()
    } finally {
      setBusy(false)
    }
  }

  if (!rows) return null
  const input = 'rounded-md border border-line-divider bg-white px-2.5 py-1.5 text-[12.5px]'
  const active = rows.filter((r) => r.stage !== 'closed')
  return (
    <div data-testid="client-book" id="client-book" className="scroll-mt-24">
      <SectionCard
        className="mb-4"
        padded={false}
        title={zh ? `我的客户 · 真实记录` : 'My clients · live'}
        meta={`${active.length}`}
        action={<button type="button" onClick={() => setOpen((v) => !v)} className="sl-btn-primary !px-4 !py-2 !text-[12px]">{open ? (zh ? '收起' : 'Close') : (zh ? '+ 加客户' : '+ Add client')}</button>}
      >
        {open && (
          <div className="grid gap-2 border-b border-line-divider p-4 sm:grid-cols-3">
            <input className={input} placeholder={zh ? '姓名 *' : 'Name *'} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <select className={input} value={form.client_role} onChange={(e) => setForm({ ...form, client_role: e.target.value as 'tenant' | 'landlord' })}>
              <option value="tenant">{zh ? '租客客户' : 'Tenant client'}</option>
              <option value="landlord">{zh ? '房东客户' : 'Landlord client'}</option>
            </select>
            <select className={input} value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value as ClientRow['stage'] })}>
              {STAGES.map((s) => <option key={s.key} value={s.key}>{zh ? s.zh : s.en}</option>)}
            </select>
            <input className={input} placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <input className={input} placeholder={zh ? '电话' : 'Phone'} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <input className={input} placeholder={zh ? '预算（如 $2,200–2,600）' : 'Budget (e.g. $2,200–2,600)'} value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} />
            <input className={input} placeholder={zh ? '目标区域' : 'Target area'} value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} />
            <label className="flex flex-col text-[11px] text-body-3">{zh ? '代表协议签署日（TRESA）' : 'Representation agreement date (TRESA)'}<input type="date" className={input} value={form.representation_agreement_at} onChange={(e) => setForm({ ...form, representation_agreement_at: e.target.value })} /></label>
            <label className="flex flex-col text-[11px] text-body-3">{zh ? 'RECO Information Guide 交付日' : 'RECO Information Guide given on'}<input type="date" className={input} value={form.info_guide_given_at} onChange={(e) => setForm({ ...form, info_guide_given_at: e.target.value })} /></label>
            <input className={input + ' sm:col-span-3'} placeholder={zh ? '备注（不要写受保护特征）' : 'Notes (no protected characteristics)'} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            <div className="sm:col-span-3 flex items-center gap-3">
              <button type="button" disabled={busy || !form.name.trim()} onClick={() => void add()} className="rounded-full bg-brand px-4 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-50">{zh ? '保存' : 'Save'}</button>
            </div>
          </div>
        )}
        {(err || notice) && (
          <div role={err ? 'alert' : 'status'} data-testid="client-book-message" className={'border-b border-line-divider px-4 py-2 text-[12.5px] ' + (err ? 'text-danger' : 'text-success')}>{err ? `⚠ ${err}` : `✓ ${notice}`}</div>
        )}
        {editingId && (() => {
          const c = rows.find((r) => r.id === editingId)
          if (!c) return null
          return (
            <div className="grid gap-2 border-b border-line-divider bg-surface-chip/60 p-4 sm:grid-cols-3" data-testid="client-edit-form">
              <div className="text-[13px] font-bold sm:col-span-3">{zh ? `编辑 ${c.name}` : `Edit ${c.name}`}</div>
              <input className={input} aria-label={zh ? '姓名' : 'Name'} placeholder={zh ? '姓名 *' : 'Name *'} value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
              <input className={input} aria-label="Email" type="email" placeholder="Email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
              <input className={input} aria-label={zh ? '电话' : 'Phone'} type="tel" placeholder={zh ? '电话' : 'Phone'} value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
              <input className={input} aria-label={zh ? '预算' : 'Budget'} placeholder={zh ? '预算（如 $2,200–2,600）' : 'Budget (e.g. $2,200–2,600)'} value={editForm.budget} onChange={(e) => setEditForm({ ...editForm, budget: e.target.value })} />
              <input className={input} aria-label={zh ? '目标区域' : 'Target area'} placeholder={zh ? '目标区域' : 'Target area'} value={editForm.area} onChange={(e) => setEditForm({ ...editForm, area: e.target.value })} />
              <input className={input + ' sm:col-span-3'} aria-label={zh ? '备注' : 'Notes'} placeholder={zh ? '备注（不要写受保护特征）' : 'Notes (no protected characteristics)'} value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
              <div className="flex items-center gap-3 sm:col-span-3">
                <button type="button" disabled={busy || !editForm.name.trim()} onClick={() => void saveEdit(c)} className="rounded-full bg-brand px-4 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-50">{zh ? '保存修改' : 'Save changes'}</button>
                <button type="button" onClick={() => { setEditingId(null); setErr(null) }} className="text-[12px] text-body-3 underline">{zh ? '取消' : 'Cancel'}</button>
              </div>
            </div>
          )
        })()}
        {proposeFor && (() => { const c = rows.find((r) => r.id === proposeFor); return c ? <ProposeDelegation client={{ id: c.id, name: c.name, email: c.email, client_role: c.client_role }} zh={zh} onDone={load} onCancel={() => setProposeFor(null)} /> : null })()}
        {rows.length === 0 ? (
          <div className="px-4 py-8 text-center text-[13px] text-body-3">{zh ? '还没有客户记录。加第一位客户，并记录代表协议与 Information Guide 的日期。' : 'No clients yet. Add the first one and record the agreement and Information Guide dates.'}</div>
        ) : (
          <Table head={[zh ? '客户' : 'Client', zh ? '阶段' : 'Stage', zh ? '预算 · 区域' : 'Budget · area', zh ? 'TRESA 文件' : 'TRESA paperwork', zh ? '静默' : 'Quiet', zh ? '操作' : 'Actions']}>
            {rows.map((c) => {
              const st = STAGES.find((s) => s.key === c.stage)!
              const paper = paperworkComplete(c)
              const q = daysQuiet(c)
              return (
                <Tr key={c.id}>
                  <Td>
                    <div className="font-semibold">{c.name} <span className="font-mono text-[10px] text-body-3">{c.client_role === 'landlord' ? (zh ? '房东' : 'LL') : (zh ? '租客' : 'T')}</span></div>
                    <div className="text-[11px] text-body-3">{[c.email, c.phone].filter(Boolean).join(' · ') || '—'}</div>
                    <button type="button" onClick={() => startEdit(c)} data-testid="client-edit" className="mt-0.5 text-[11px] text-brand underline underline-offset-2">{zh ? '编辑资料' : 'Edit details'}</button>
                  </Td>
                  <Td>
                    <select value={c.stage} onChange={(e) => void update(c.id, { stage: e.target.value as ClientRow['stage'] })} className="rounded-md border border-line-divider bg-white px-2 py-1 text-[12px]" aria-label="stage">
                      {STAGES.map((s) => <option key={s.key} value={s.key}>{zh ? s.zh : s.en}</option>)}
                    </select>
                    <div className="mt-1"><StatusPill tone={st.tone}>{zh ? st.zh : st.en}</StatusPill></div>
                  </Td>
                  <Td muted>
                    <div>{c.budget || '—'}</div>
                    <div className="text-[11.5px]">{c.area || '—'}</div>
                  </Td>
                  <Td>
                    <div className="flex flex-col gap-1 text-[11.5px]">
                      <label className="flex items-center gap-1.5"><span className={c.representation_agreement_at ? 'text-success' : 'text-danger'}>{c.representation_agreement_at ? '✓' : '✗'}</span>{zh ? '代表协议' : 'Agreement'}<input type="date" value={c.representation_agreement_at ?? ''} onChange={(e) => void update(c.id, { representation_agreement_at: e.target.value || null })} className="rounded border border-line-divider px-1 text-[11px]" aria-label="agreement date" /></label>
                      <label className="flex items-center gap-1.5"><span className={c.info_guide_given_at ? 'text-success' : 'text-danger'}>{c.info_guide_given_at ? '✓' : '✗'}</span>{zh ? 'Info Guide' : 'Info Guide'}<input type="date" value={c.info_guide_given_at ?? ''} onChange={(e) => void update(c.id, { info_guide_given_at: e.target.value || null })} className="rounded border border-line-divider px-1 text-[11px]" aria-label="guide date" /></label>
                    </div>
                  </Td>
                  <Td>
                    <StatusPill tone={q >= 5 ? 'danger' : q >= 3 ? 'warn' : 'neutral'}>{zh ? `${q} 天` : `${q}d`}</StatusPill>
                    <button type="button" onClick={() => void update(c.id, { last_contact_at: new Date().toISOString() })} className="mt-1 block text-[11px] text-brand underline underline-offset-2">{zh ? '今天联系过' : 'Contacted today'}</button>
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1.5">
                      <Link href={`/agent/agent?prompt=${encodeURIComponent(zh ? `客户 ${c.name}（${c.client_role === 'landlord' ? '房东' : '租客'}，${c.budget || '预算未填'}，${c.area || '区域未填'}）：` : `Client ${c.name} (${c.client_role}, ${c.budget || 'no budget'}, ${c.area || 'no area'}): `)}`} className="rounded-[8px] border border-line-strong bg-white px-2.5 py-[5px] text-[11.5px] font-semibold text-body hover:border-brand hover:text-brand">{zh ? '交给 AI 助理' : 'To the AI Agent'}</Link>
                      {(() => {
                        // Screening is always available to the (verified) agent; a live delegation that allows it also records
                        // the screening under the client. The delegation itself needs the TRESA dates + an email.
                        const d = delegFor(c.id)
                        const live = !!d && isDelegationLive(d)
                        const st = d ? STATUS_LABEL[d.status] : null
                        const shared = live && allows(d, 'screen')
                        const screenHref = shared ? `/screening/app?as=agent&delegation=${d.id}` : '/screening/app?as=agent'
                        return (<>
                          {/* screening is of a landlord client's applicants; for a tenant client the agent is on the other side */}
                          {/* 消息系统 A 期 / 找得到人 2026-09-30: the agent ↔ client conversation (two-party, so it names the client;
                              relayed by email when the client has no account). Without an email or a live delegation there is
                              nobody to reach — the chip says so instead of disappearing. Resolves on click (find_thread).
                              The email / phone shown under each client name are the agent's own client-book entries, visible
                              only to that agent (RLS agent_auth_id = auth.uid()) — a documented exception to the relay rule. */}
                          {c.email || live
                            ? <MessageButton target={{ kind: 'agent_client', ref: c.id }} zh={zh} label={zh ? `发消息给 ${c.name}` : `Message ${c.name}`} testId="client-message" />
                            : <MessageButton target={{ kind: 'agent_client', ref: c.id }} zh={zh} disabledReason={zh ? '先补邮箱才能发消息' : 'Add an email to message'} testId="client-message" />}
                          {c.client_role === 'landlord' && <Link href={screenHref} data-testid="client-screen" className="rounded-[8px] border border-agent/40 bg-agent/[0.06] px-2.5 py-[5px] text-[11.5px] font-semibold text-agent">{zh ? '发起筛查' : 'Screen'}</Link>}
                          {d && st && <span data-testid="delegation-chip" className={'rounded-[8px] px-2 py-[5px] font-mono text-[10.5px] font-bold ' + (live ? 'bg-success/10 text-success' : st.tone === 'warn' ? 'bg-amber-50 text-amber-800' : st.tone === 'danger' ? 'bg-danger/10 text-danger' : 'bg-surface-chip text-body-3')}>{live ? (zh ? `委托有效至 ${d.expires_at.slice(0, 10)}` : `Delegated until ${d.expires_at.slice(0, 10)}`) : (zh ? st.zh : st.en)}</span>}
                          {shared
                            ? null
                            : d?.status === 'pending'
                              ? (() => {
                                  // Only claim 「已发到」 when the send is recorded as delivered to the mail service (sweep 2026-10-01).
                                  const li = linkInfo[d.id]
                                  const moved = !!c.email && !sameEmail(c.email, d.principal_email)
                                  // unknown (rows from before the send was recorded): the 待客户确认 chip says enough
                                  const label = moved
                                    ? (zh ? '客户邮箱已改 · 撤回后重新发起' : 'Email changed · withdraw and propose again')
                                    : li?.emailed === false
                                      ? (zh ? '确认邮件未发出' : 'Link email not sent')
                                      : li?.emailed
                                        ? (zh ? `链接已发到客户邮箱${li.at ? ` · ${li.at.slice(0, 10)}` : ''}` : `Link sent to the client’s email${li.at ? ` · ${li.at.slice(0, 10)}` : ''}`)
                                        : null
                                  return (<>
                                    {label && <span data-testid="delegation-link-status" className={'rounded-[8px] border px-2.5 py-[5px] text-[11.5px] ' + (li?.emailed === false || moved ? 'border-danger/40 text-danger' : 'border-line-divider text-body-3')} title={zh ? `确认链接发往 ${d.principal_email}；客户用该邮箱登录后确认` : `The confirmation link goes to ${d.principal_email}; they confirm while signed in with it`}>{label}</span>}
                                    {!moved && <button type="button" disabled={busy} onClick={() => void delegationAction(d, 'resend')} data-testid="delegation-resend" className="rounded-[8px] border border-line-strong bg-white px-2.5 py-[5px] text-[11.5px] font-semibold text-body hover:border-brand hover:text-brand disabled:opacity-50">{zh ? '重发链接' : 'Resend link'}</button>}
                                    <button type="button" disabled={busy} onClick={() => void delegationAction(d, 'revoke')} data-testid="delegation-withdraw" className="rounded-[8px] border border-danger/40 bg-white px-2.5 py-[5px] text-[11.5px] font-semibold text-danger disabled:opacity-50">{zh ? '撤回' : 'Withdraw'}</button>
                                  </>)
                                })()
                              : paper && c.email && EMAIL_RE.test(c.email.trim())
                                ? <button type="button" onClick={() => setProposeFor(c.id)} title={zh ? '客户确认后，筛查报告也会出现在客户自己的账号里' : 'Once the client confirms, screening reports also appear in their own account'} className="rounded-[8px] border border-brand/40 bg-white px-2.5 py-[5px] text-[11.5px] font-semibold text-brand" data-testid="propose-delegation-button">{zh ? '发起委托' : 'Propose delegation'}</button>
                                : <span className="rounded-[8px] border border-line-divider px-2.5 py-[5px] text-[11.5px] text-body-3" title={zh ? '先记录代表协议与 Information Guide，并填客户邮箱' : 'Record the agreement and Information Guide dates and an email first'}>{zh ? '委托（缺文件 / 邮箱）' : 'Delegation (paperwork / email)'}</span>}
                        </>)
                      })()}
                    </div>
                  </Td>
                </Tr>
              )
            })}
          </Table>
        )}
      </SectionCard>
      <p className="mb-4 text-[11px] text-body-3">{zh ? 'TRESA s.32 / O. Reg. 567/05：为客户做租赁工作前须有书面代表协议并交付 RECO Information Guide。筛查可以直接发起；客户确认委托后（范围 · 期限 · 可随时撤销），报告也会出现在客户自己的账号里。备注里不要记录 OHRC 受保护特征。Stayloop 不做经纪业务、不结算佣金。' : 'TRESA s.32 / O. Reg. 567/05: a written representation agreement and the RECO Information Guide come before any leasing work. Screening can start directly; once the client confirms a delegation (scope · term · revocable), reports also appear in their own account. Keep OHRC-protected characteristics out of notes. Stayloop is not a brokerage and settles no commission.'}</p>
    </div>
  )
}
