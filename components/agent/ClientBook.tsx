'use client'

// The agent's real client table (P2 2026-09-23): rows in agent_clients,
// own-only RLS. TRESA hygiene is the point of the two date columns — a
// written representation agreement and the RECO Information Guide are
// what RECO expects before any leasing work. "发起筛查" is on every row: a
// verified agent screens directly (user 2026-09-29:「经纪可以直接筛选，这个
// 本来就是经纪的工作，客户默认委托了这个的」). A confirmed delegation is
// optional — it records the screening under the client too, so the landlord
// sees the report in their own account.
//
// V1.0 阶段 2 · 丙 (2026-10-16):
//   #13 intake links — every LANDLORD client row (and the header) can mint
//       /intake/<token>; what arrives through it shows as「材料已到 · 一键筛查 →」
//       (the screening is the agent's own; submissions stay server side).
//   #15 TRESA paperwork in full: agreement signed + EXPIRES, Information Guide
//       given + how it was delivered, multiple-representation consent date.
//   #16 lease end date (90 / 30-day tasks on /agent/tasks) and the showing pack
//       hand-off that moves a searching client to「看房中」.
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { SectionCard, StatusPill, Table, Td, Tr } from '@/components/workspace'
import { STAGES, daysQuiet, daysUntil, paperworkComplete, type ClientRole, type ClientStage } from '@/lib/agent/clientBook'
import { intakeLinkState, intakeScreeningHref } from '@/lib/agent/intakeLinks'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { useReportLiveRows } from '@/lib/liveRows'
import ProposeDelegation from '@/components/delegations/ProposeDelegation'
import MessageButton from '@/components/messages/MessageButton'
import { allows, isDelegationLive, STATUS_LABEL, type DelegationRow } from '@/lib/delegations/shared'
import { isUndeliverableEmailDomain, type EmailFailureReason } from '@/lib/emailDeliverability'

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
  // #15 / #16 — null until the 20261016 migration columns are filled; undefined before it is applied.
  representation_agreement_expires_at?: string | null
  info_guide_delivered_at?: string | null
  info_guide_delivery_note?: string | null
  multi_rep_consent_at?: string | null
  lease_end_date?: string | null
}

type IntakeLink = { id: string; client_id: string | null; token: string; label: string | null; expires_at: string; revoked_at: string | null; used_count: number; created_at: string; url: string }
type IntakeSubmission = { id: string; link_id: string; applicant_name: string; move_in_date: string | null; screening_id: string | null; created_at: string; screening: { id: string; status: string; ai_score: number | null; v3_tier: string | null } | null }
const INTAKE_ERR: Record<string, { zh: string; en: string }> = {
  registration_not_live: { zh: '你的 RECO 注册未处于有效状态，不能生成收件链接。', en: 'Your RECO registration is not live; intake links need it.' },
  landlord_client_required: { zh: '收件链接只给房东客户（替房东收申请）。', en: 'Intake links are for landlord clients (they collect applications for a landlord).' },
  rate_limited: { zh: '生成太频繁，请稍后再试。', en: 'Too many links created; try again later.' },
}

const EMPTY: { name: string; client_role: ClientRole; email: string; phone: string; budget: string; area: string; stage: ClientStage; representation_agreement_at: string; info_guide_given_at: string; notes: string } = { name: '', client_role: 'tenant', email: '', phone: '', budget: '', area: '', stage: 'searching', representation_agreement_at: '', info_guide_given_at: '', notes: '' }
// The same check the server makes before it will send a delegation link (/api/delegations).
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
type ContactForm = { name: string; email: string; phone: string; budget: string; area: string; notes: string }
const sameEmail = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase()
// example.com / *.test / *.invalid / localhost: nothing is ever delivered there, so the row is refused before it
// can produce a delegation whose link "did not go out" (四角色审计 2026-10-12 · P1-4).
const RESERVED_DOMAIN_MSG = { zh: '这是测试用的保留域名，邮件发不到；请填客户真实邮箱。', en: 'That is a reserved test domain (example.com, .test, …); mail cannot be delivered there. Enter the client’s real email.' }
const UNDELIVERABLE_MSG = { zh: '这个邮箱域名无法投递（example.com 这类测试域名收不到信）。改成客户真实的邮箱后再重发。', en: 'This email domain cannot receive mail (test domains like example.com never get delivered). Change it to the client’s real email, then resend.' }

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
  // #13: the agent's intake links and what came through them (GET /api/agent/intake-links; the
  // submissions table is service-role only, so this is the only way the table learns「材料已到」).
  const [intake, setIntake] = useState<{ links: IntakeLink[]; submissions: IntakeSubmission[] }>({ links: [], submissions: [] })
  const [copied, setCopied] = useState<string | null>(null)
  const [confirmIntakeRevoke, setConfirmIntakeRevoke] = useState<string | null>(null)
  useReportLiveRows('agent_clients', rows ? rows.length : null)
  const loadIntake = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    const jwt = data.session?.access_token
    if (!jwt) return
    const res = await fetch('/api/agent/intake-links', { headers: { Authorization: `Bearer ${jwt}` }, cache: 'no-store' })
    if (!res.ok) return
    const j = (await res.json().catch(() => null)) as { links?: IntakeLink[]; submissions?: IntakeSubmission[] } | null
    if (j) setIntake({ links: j.links ?? [], submissions: j.submissions ?? [] })
  }, [])
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
    void loadIntake()
  }, [user, onRows, loadIntake])
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
    if (email && !EMAIL_RE.test(email)) { setErr(zh ? '邮箱格式不对（例如 name@gmail.com）。' : 'That email does not look right (e.g. name@gmail.com).'); return }
    if (email && isUndeliverableEmailDomain(email)) { setErr(zh ? RESERVED_DOMAIN_MSG.zh : RESERVED_DOMAIN_MSG.en); return }
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
  // The client whose email change is waiting for its inline second click (no native confirm —
  // audit 2026-10-12 NEW-2: window.confirm froze the automated browser, same as NEW-1).
  const [confirmEmail, setConfirmEmail] = useState<string | null>(null)
  async function saveEdit(c: ClientRow, ackEmail = false) {
    const f = { name: editForm.name.trim().slice(0, 120), email: editForm.email.trim().slice(0, 200), phone: editForm.phone.trim().slice(0, 40), budget: editForm.budget.trim().slice(0, 80), area: editForm.area.trim().slice(0, 160), notes: editForm.notes.trim().slice(0, 2000) }
    if (!f.name) { setErr(zh ? '姓名不能为空。' : 'The name cannot be empty.'); return }
    if (f.email && !EMAIL_RE.test(f.email)) { setErr(zh ? '邮箱格式不对（例如 name@gmail.com）。' : 'That email does not look right (e.g. name@gmail.com).'); return }
    if (f.email && isUndeliverableEmailDomain(f.email)) { setErr(zh ? RESERVED_DOMAIN_MSG.zh : RESERVED_DOMAIN_MSG.en); return }
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
      if (c.email && !ackEmail) { setConfirmEmail(c.id); return }
    }
    setConfirmEmail(null)
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
  // The delegation whose「撤回」is waiting for its second click (inline confirm, see delegationAction).
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null)
  async function delegationAction(d: DelegationRow, action: 'resend' | 'revoke') {
    // No native confirm() here: it blocks the renderer (audit 2026-10-12 NEW-1: an automated browser
    // reported the page unresponsive) — the confirmation is an inline second click instead.
    setConfirmRevoke(null)
    setBusy(true); setErr(null); setNotice(null)
    try {
      const { data } = await supabase.auth.getSession()
      const res = await fetch(`/api/delegations/${d.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` }, body: JSON.stringify({ action }) })
      const j = (await res.json().catch(() => ({}))) as { error?: string; emailed?: boolean; reason?: EmailFailureReason; detail?: string }
      if (!res.ok) {
        const map: Record<string, { zh: string; en: string }> = {
          rate_limited: { zh: '操作太频繁，请稍后再试。', en: 'Too many attempts; try again later.' },
          registration_not_live: { zh: '你的 RECO 注册未处于有效状态。', en: 'Your RECO registration is not live.' },
          client_email_changed: { zh: '客户邮箱已经改过，这份委托还绑定在原邮箱上。请撤回后用新邮箱重新发起。', en: 'The client’s email has changed; this delegation is still bound to the old address. Withdraw it and propose again.' },
        }
        const m = j.error && map[j.error]
        setErr(m ? (zh ? m.zh : m.en) : /^status_/.test(j.error || '') ? (zh ? '这份委托已不是待确认状态。' : 'This delegation is no longer pending.') : j.error || `HTTP ${res.status}`)
      } else if (action === 'resend') {
        // The route says why it did not leave (P1-4 2026-10-12): a reserved test domain is the agent's to fix,
        // not something to retry; a provider error carries the provider's own words.
        const reason: EmailFailureReason | undefined = j.reason ?? (isUndeliverableEmailDomain(d.principal_email) ? 'undeliverable_domain' : undefined)
        const detail = j.detail ? ` ${zh ? '邮件服务返回：' : 'Mail service said: '}${j.detail}` : ''
        setNotice(j.emailed
          ? (zh ? `确认链接已重新发到 ${d.principal_email}。` : `The confirmation link was sent again to ${d.principal_email}.`)
          : reason === 'undeliverable_domain'
            ? (zh ? `还是没有发出去。${UNDELIVERABLE_MSG.zh}（${d.principal_email}）` : `It still did not go out. ${UNDELIVERABLE_MSG.en} (${d.principal_email})`)
            : reason === 'rate_limited'
              ? (zh ? `还是没有发出去（邮件服务限流）。请过一会儿再点「重发链接」。${detail}` : `It still did not go out (the mail service is rate-limiting). Try 「Resend link」 again in a little while.${detail}`)
              : (zh ? `还是没有发出去（邮件服务出错）。请稍后再试，或撤回后检查邮箱 ${d.principal_email} 是否正确。${detail}` : `It still did not go out (mail service error). Try later, or withdraw and check ${d.principal_email}.${detail}`))
      } else {
        setNotice(zh ? '已撤回。' : 'Withdrawn.')
      }
      await load()
    } finally {
      setBusy(false)
    }
  }

  async function intakeAction(action: 'create' | 'revoke', arg: { clientId?: string | null; id?: string }) {
    setConfirmIntakeRevoke(null)
    setBusy(true); setErr(null); setNotice(null)
    try {
      const { data } = await supabase.auth.getSession()
      const body = action === 'revoke' ? { action: 'revoke', id: arg.id } : { client_id: arg.clientId ?? null }
      const res = await fetch('/api/agent/intake-links', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` }, body: JSON.stringify(body) })
      const j = (await res.json().catch(() => ({}))) as { error?: string; link?: IntakeLink }
      if (!res.ok) {
        const m = j.error && INTAKE_ERR[j.error]
        setErr(m ? (zh ? m.zh : m.en) : j.error || `HTTP ${res.status}`)
      } else if (action === 'create' && j.link) {
        setNotice(zh ? `收件链接已生成（14 天有效）：${j.link.url}` : `Intake link created (valid 14 days): ${j.link.url}`)
        void copyText(j.link.url, j.link.id)
      } else {
        setNotice(zh ? '收件链接已撤回；用它上传的材料不受影响。' : 'Intake link withdrawn; documents already received are unaffected.')
      }
      await loadIntake()
    } finally {
      setBusy(false)
    }
  }
  async function copyText(text: string, id: string) {
    try { await navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied((v) => (v === id ? null : v)), 2000) } catch { /* clipboard blocked: the URL is on screen */ }
  }
  /** #16: the showing pack goes to the AI Agent with the client's facts; a searching client moves to「看房中」. */
  async function showingPack(c: ClientRow) {
    if (c.stage === 'searching') await update(c.id, { stage: 'showing' })
  }
  const liveIntakeFor = (clientId: string): IntakeLink | null => intake.links.find((l) => l.client_id === clientId && intakeLinkState(l) === 'active') ?? null
  const submissionsFor = (clientId: string): IntakeSubmission[] => { const ids = new Set(intake.links.filter((l) => l.client_id === clientId).map((l) => l.id)); return intake.submissions.filter((s) => ids.has(s.link_id)) }
  const generalLinks = intake.links.filter((l) => !l.client_id && intakeLinkState(l) === 'active')
  const generalSubs = intake.submissions.filter((s) => intake.links.some((l) => l.id === s.link_id && !l.client_id))

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
        action={<span className="inline-flex flex-wrap items-center gap-2">
          <button type="button" disabled={busy} onClick={() => void intakeAction('create', { clientId: null })} data-testid="intake-link-new" title={zh ? '不挂房源的申请入口：申请人自己上传材料并在线授权，材料直接进你的筛查' : 'An application entry point without a listing: the applicant uploads and authorises online; it lands in your screening'} className="rounded-full border border-line-strong bg-white px-4 py-2 text-[12px] font-semibold text-body hover:border-brand hover:text-brand disabled:opacity-50">{zh ? '收件链接' : 'Intake link'}</button>
          <button type="button" onClick={() => setOpen((v) => !v)} className="sl-btn-primary !px-4 !py-2 !text-[12px]">{open ? (zh ? '收起' : 'Close') : (zh ? '+ 加客户' : '+ Add client')}</button>
        </span>}
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
                {confirmEmail === c.id ? (
                  <span className="inline-flex flex-wrap items-center gap-2" data-testid="client-email-change-confirm">
                    <span className="text-[12px] text-body-2">{zh ? '改邮箱后，新邮箱的持有人会看到你和这位客户已有的对话。只在修正填错的邮箱时改；换了联系人请新建一位客户。' : 'Whoever holds the new email will see your existing conversation with this client. Only correct a mistyped email this way; for a different person add a new client.'}</span>
                    <button type="button" disabled={busy} onClick={() => void saveEdit(c, true)} className="rounded-full bg-brand px-4 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-50">{zh ? '确认修改邮箱' : 'Confirm the new email'}</button>
                    <button type="button" disabled={busy} onClick={() => setConfirmEmail(null)} className="rounded-full border border-line-divider bg-white px-3 py-1.5 text-[12.5px] text-body-3">{zh ? '取消' : 'Cancel'}</button>
                  </span>
                ) : (
                  <button type="button" disabled={busy || !editForm.name.trim()} onClick={() => void saveEdit(c)} className="rounded-full bg-brand px-4 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-50">{zh ? '保存修改' : 'Save changes'}</button>
                )}
                <button type="button" onClick={() => { setEditingId(null); setErr(null) }} className="text-[12px] text-body-3 underline">{zh ? '取消' : 'Cancel'}</button>
              </div>
            </div>
          )
        })()}
        {proposeFor && (() => { const c = rows.find((r) => r.id === proposeFor); return c ? <ProposeDelegation client={{ id: c.id, name: c.name, email: c.email, client_role: c.client_role }} zh={zh} onDone={load} onCancel={() => setProposeFor(null)} /> : null })()}
        {(generalLinks.length > 0 || generalSubs.length > 0) && (
          <div className="border-b border-line-divider px-4 py-3 text-[12.5px]" data-testid="intake-general">
            <div className="font-semibold">{zh ? '收件链接（未指定客户）' : 'Intake links (no client)'}</div>
            {generalLinks.map((l) => (
              <div key={l.id} className="mt-1 flex flex-wrap items-center gap-2">
                <code className="min-w-0 truncate rounded bg-surface-chip px-1.5 py-0.5 font-mono text-[11px]">{l.url}</code>
                <button type="button" onClick={() => void copyText(l.url, l.id)} className="text-[11.5px] text-brand underline underline-offset-2">{copied === l.id ? (zh ? '已复制' : 'Copied') : (zh ? '复制' : 'Copy')}</button>
                <span className="text-[11px] text-body-3">{zh ? `有效至 ${l.expires_at.slice(0, 10)} · 已收 ${l.used_count}` : `until ${l.expires_at.slice(0, 10)} · ${l.used_count} received`}</span>
                {confirmIntakeRevoke === l.id
                  ? <span className="inline-flex items-center gap-1.5"><button type="button" disabled={busy} onClick={() => void intakeAction('revoke', { id: l.id })} className="rounded-[8px] bg-danger px-2 py-[3px] text-[11px] font-semibold text-white">{zh ? '确认撤回' : 'Confirm'}</button><button type="button" onClick={() => setConfirmIntakeRevoke(null)} className="text-[11px] text-body-3 underline">{zh ? '取消' : 'Cancel'}</button></span>
                  : <button type="button" onClick={() => setConfirmIntakeRevoke(l.id)} className="text-[11.5px] text-danger underline underline-offset-2">{zh ? '撤回' : 'Withdraw'}</button>}
              </div>
            ))}
            {generalSubs.map((sb) => (
              <div key={sb.id} className="mt-1 flex flex-wrap items-center gap-2">
                <span>{sb.applicant_name} · {sb.created_at.slice(0, 10)}</span>
                {sb.screening_id && <Link href={intakeScreeningHref(sb.screening_id)} className="rounded-[8px] border border-agent/40 bg-agent/[0.06] px-2.5 py-[3px] text-[11.5px] font-semibold text-agent">{sb.screening?.status === 'scored' ? (zh ? '查看筛查报告 →' : 'Open the report →') : (zh ? '材料已到 · 一键筛查 →' : 'Documents in · screen now →')}</Link>}
              </div>
            ))}
          </div>
        )}
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
                      {/* #15 — expiry (s.13.4), how the Guide was delivered (a record only, Bulletin 2.1), multi-rep consent (s.22), lease end (#16). */}
                      {(() => { const d = daysUntil(c.representation_agreement_expires_at); const tone = d === null ? 'text-body-3' : d < 0 ? 'text-danger' : d <= 30 ? 'text-amber-700' : 'text-success'; return (
                        <label className="flex items-center gap-1.5"><span className={tone}>{d === null ? '·' : d < 0 ? '✗' : '✓'}</span>{zh ? '协议到期' : 'Expires'}<input type="date" value={c.representation_agreement_expires_at ?? ''} onChange={(e) => void update(c.id, { representation_agreement_expires_at: e.target.value || null })} className="rounded border border-line-divider px-1 text-[11px]" aria-label="agreement expiry" />{d !== null && d >= 0 && d <= 30 && <span className="text-[10.5px] text-amber-700">{zh ? `${d} 天` : `${d}d`}</span>}</label>
                      ) })()}
                      <label className="flex items-center gap-1.5"><span className={c.info_guide_delivery_note ? 'text-success' : 'text-body-3'}>{c.info_guide_delivery_note ? '✓' : '·'}</span>{zh ? 'Guide 送达' : 'Guide delivery'}<input type="text" defaultValue={c.info_guide_delivery_note ?? ''} placeholder={zh ? '方式与对象（邮件 / 当面 / 链接）' : 'how & to whom (email / in person / link)'} maxLength={200} onBlur={(e) => { const v = e.target.value.trim().slice(0, 200); if (v !== (c.info_guide_delivery_note ?? '')) void update(c.id, { info_guide_delivery_note: v || null, info_guide_delivered_at: v ? (c.info_guide_delivered_at ?? new Date().toISOString()) : null }) }} className="w-[150px] rounded border border-line-divider px-1 text-[11px]" aria-label="guide delivery note" /></label>
                      <label className="flex items-center gap-1.5"><span className={c.multi_rep_consent_at ? 'text-success' : 'text-body-3'}>{c.multi_rep_consent_at ? '✓' : '·'}</span>{zh ? '多重代表同意' : 'Multi-rep consent'}<input type="date" value={c.multi_rep_consent_at ?? ''} onChange={(e) => void update(c.id, { multi_rep_consent_at: e.target.value || null })} className="rounded border border-line-divider px-1 text-[11px]" aria-label="multiple representation consent date" title={zh ? 'O. Reg. 567/05 s.22(1)：同一交易代表双方须先披露并取得双方书面同意' : 'O. Reg. 567/05 s.22(1): representing both sides needs disclosure and written consent from each'} /></label>
                      <label className="flex items-center gap-1.5"><span className="text-body-3">·</span>{zh ? '租约到期' : 'Lease ends'}<input type="date" value={c.lease_end_date ?? ''} onChange={(e) => void update(c.id, { lease_end_date: e.target.value || null })} className="rounded border border-line-divider px-1 text-[11px]" aria-label="lease end date" title={zh ? '到期前 90 / 30 天在任务里提醒你联系客户（由你自己发）' : 'Reminds you 90 / 30 days out to contact the client (you send it yourself)'} /></label>
                    </div>
                  </Td>
                  <Td>
                    <StatusPill tone={q >= 5 ? 'danger' : q >= 3 ? 'warn' : 'neutral'}>{zh ? `${q} 天` : `${q}d`}</StatusPill>
                    <button type="button" onClick={() => void update(c.id, { last_contact_at: new Date().toISOString() })} className="mt-1 block text-[11px] text-brand underline underline-offset-2">{zh ? '今天联系过' : 'Contacted today'}</button>
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1.5">
                      <Link href={`/agent/agent?prompt=${encodeURIComponent(zh ? `客户 ${c.name}（${c.client_role === 'landlord' ? '房东' : '租客'}，${c.budget || '预算未填'}，${c.area || '区域未填'}）：` : `Client ${c.name} (${c.client_role}, ${c.budget || 'no budget'}, ${c.area || 'no area'}): `)}`} className="rounded-[8px] border border-line-strong bg-white px-2.5 py-[5px] text-[11.5px] font-semibold text-body hover:border-brand hover:text-brand">{zh ? '交给 AI 助理' : 'To the AI Agent'}</Link>
                      {/* #16: the showing pack with this client's facts pre-filled; a searching client moves to「看房中」 on click. */}
                      <Link href={`/agent/agent?prompt=${encodeURIComponent(zh ? `帮我为客户 ${c.name}（${c.client_role === 'landlord' ? '房东' : '租客'}${c.budget ? `，预算 ${c.budget}` : ''}${c.area ? `，区域 ${c.area}` : ''}）准备带看准备包：带看时间、哪套房、房东授权我回答哪些问题（租金区间、入住日、宠物、水电、租期）。` : `Prepare a showing pack for my client ${c.name} (${c.client_role}${c.budget ? `, budget ${c.budget}` : ''}${c.area ? `, area ${c.area}` : ''}): time, which unit, and what the landlord authorises me to answer (rent range, move-in, pets, utilities, term).`)}`} onClick={() => void showingPack(c)} data-testid="client-showing-pack" className="rounded-[8px] border border-line-strong bg-white px-2.5 py-[5px] text-[11.5px] font-semibold text-body hover:border-brand hover:text-brand">{zh ? '带看准备包' : 'Showing pack'}</Link>
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
                          {/* #13: the intake link for this landlord client, and what came through it. */}
                          {c.client_role === 'landlord' && (() => {
                            const il = liveIntakeFor(c.id)
                            const subs = submissionsFor(c.id)
                            return (<>
                              {il
                                ? <span className="inline-flex max-w-full flex-wrap items-center gap-1.5" data-testid="client-intake-link">
                                    <code className="max-w-[220px] truncate rounded bg-surface-chip px-1.5 py-[3px] font-mono text-[10.5px]" title={il.url}>{il.url}</code>
                                    <button type="button" onClick={() => void copyText(il.url, il.id)} className="text-[11.5px] text-brand underline underline-offset-2">{copied === il.id ? (zh ? '已复制' : 'Copied') : (zh ? '复制收件链接' : 'Copy intake link')}</button>
                                    <span className="text-[10.5px] text-body-3">{zh ? `至 ${il.expires_at.slice(0, 10)}` : `until ${il.expires_at.slice(0, 10)}`}</span>
                                    {confirmIntakeRevoke === il.id
                                      ? <span className="inline-flex items-center gap-1.5"><button type="button" disabled={busy} onClick={() => void intakeAction('revoke', { id: il.id })} className="rounded-[8px] bg-danger px-2 py-[3px] text-[11px] font-semibold text-white">{zh ? '确认撤回' : 'Confirm'}</button><button type="button" onClick={() => setConfirmIntakeRevoke(null)} className="text-[11px] text-body-3 underline">{zh ? '取消' : 'Cancel'}</button></span>
                                      : <button type="button" onClick={() => setConfirmIntakeRevoke(il.id)} className="text-[11px] text-danger underline underline-offset-2">{zh ? '撤回' : 'Withdraw'}</button>}
                                  </span>
                                : <button type="button" disabled={busy} onClick={() => void intakeAction('create', { clientId: c.id })} data-testid="client-intake-new" title={zh ? '申请人自己上传材料并在线授权（O. Reg. 290/98 范围），直接进你的筛查；委托有效时房东客户同看' : 'The applicant uploads and authorises online (O. Reg. 290/98 scope); it lands in your screening, and the landlord client sees it while a delegation is live'} className="rounded-[8px] border border-line-strong bg-white px-2.5 py-[5px] text-[11.5px] font-semibold text-body hover:border-brand hover:text-brand disabled:opacity-50">{zh ? '收件链接' : 'Intake link'}</button>}
                              {subs.map((sb) => sb.screening_id && (
                                <Link key={sb.id} href={intakeScreeningHref(sb.screening_id)} data-testid="client-intake-screen" className={'rounded-[8px] px-2.5 py-[5px] text-[11.5px] font-semibold ' + (sb.screening?.status === 'scored' ? 'border border-line-divider bg-white text-body' : 'border border-success/40 bg-success/10 text-success')} title={`${sb.applicant_name} · ${sb.created_at.slice(0, 10)}`}>
                                  {sb.screening?.status === 'scored' ? (zh ? `${sb.applicant_name} · 查看报告 →` : `${sb.applicant_name} · report →`) : (zh ? `${sb.applicant_name} 材料已到 · 一键筛查 →` : `${sb.applicant_name} · documents in · screen →`)}
                                </Link>
                              ))}
                            </>)
                          })()}
                          {d && st && <span data-testid="delegation-chip" className={'rounded-[8px] px-2 py-[5px] font-mono text-[10.5px] font-bold ' + (live ? 'bg-success/10 text-success' : st.tone === 'warn' ? 'bg-amber-50 text-amber-800' : st.tone === 'danger' ? 'bg-danger/10 text-danger' : 'bg-surface-chip text-body-3')}>{live ? (zh ? `委托有效至 ${d.expires_at.slice(0, 10)}` : `Delegated until ${d.expires_at.slice(0, 10)}`) : (zh ? st.zh : st.en)}</span>}
                          {shared
                            ? null
                            : d?.status === 'pending'
                              ? (() => {
                                  // Only claim 「已发到」 when the send is recorded as delivered to the mail service (sweep 2026-10-01).
                                  const li = linkInfo[d.id]
                                  const moved = !!c.email && !sameEmail(c.email, d.principal_email)
                                  // unknown (rows from before the send was recorded): the 待客户确认 chip says enough
                                  const undeliverable = isUndeliverableEmailDomain(d.principal_email)
                                  const label = moved
                                    ? (zh ? '客户邮箱已改 · 撤回后重新发起' : 'Email changed · withdraw and propose again')
                                    : li?.emailed === false
                                      ? undeliverable
                                        ? (zh ? '确认邮件未发出 · 邮箱域名无法投递' : 'Link email not sent · domain cannot receive mail')
                                        : (zh ? '确认邮件未发出' : 'Link email not sent')
                                      : li?.emailed
                                        ? (zh ? `链接已发到客户邮箱${li.at ? ` · ${li.at.slice(0, 10)}` : ''}` : `Link sent to the client’s email${li.at ? ` · ${li.at.slice(0, 10)}` : ''}`)
                                        : null
                                  return (<>
                                    {label && <span data-testid="delegation-link-status" className={'rounded-[8px] border px-2.5 py-[5px] text-[11.5px] ' + (li?.emailed === false || moved ? 'border-danger/40 text-danger' : 'border-line-divider text-body-3')} title={li?.emailed === false && undeliverable ? (zh ? UNDELIVERABLE_MSG.zh : UNDELIVERABLE_MSG.en) : zh ? `确认链接发往 ${d.principal_email}；客户用该邮箱登录后确认` : `The confirmation link goes to ${d.principal_email}; they confirm while signed in with it`}>{label}</span>}
                                    {!moved && <button type="button" disabled={busy} onClick={() => void delegationAction(d, 'resend')} data-testid="delegation-resend" className="rounded-[8px] border border-line-strong bg-white px-2.5 py-[5px] text-[11.5px] font-semibold text-body hover:border-brand hover:text-brand disabled:opacity-50">{zh ? '重发链接' : 'Resend link'}</button>}
                                    {confirmRevoke === d.id ? (
                                      <span className="inline-flex items-center gap-1.5" data-testid="delegation-withdraw-confirm">
                                        <span className="text-[11.5px] text-body-2">{zh ? '撤回后客户收到的链接会失效。' : 'The link the client has will stop working.'}</span>
                                        <button type="button" disabled={busy} onClick={() => void delegationAction(d, 'revoke')} className="rounded-[8px] bg-danger px-2.5 py-[5px] text-[11.5px] font-semibold text-white disabled:opacity-50">{zh ? '确认撤回' : 'Confirm withdraw'}</button>
                                        <button type="button" disabled={busy} onClick={() => setConfirmRevoke(null)} className="rounded-[8px] border border-line-divider bg-white px-2.5 py-[5px] text-[11.5px] text-body-3">{zh ? '取消' : 'Cancel'}</button>
                                      </span>
                                    ) : (
                                      <button type="button" disabled={busy} onClick={() => setConfirmRevoke(d.id)} data-testid="delegation-withdraw" className="rounded-[8px] border border-danger/40 bg-white px-2.5 py-[5px] text-[11.5px] font-semibold text-danger disabled:opacity-50">{zh ? '撤回' : 'Withdraw'}</button>
                                    )}
                                  </>)
                                })()
                              : paper && c.email && isUndeliverableEmailDomain(c.email)
                                ? <span data-testid="propose-delegation-undeliverable" className="rounded-[8px] border border-danger/40 px-2.5 py-[5px] text-[11.5px] text-danger" title={zh ? UNDELIVERABLE_MSG.zh : UNDELIVERABLE_MSG.en}>{zh ? '委托（邮箱域名无法投递 · 请改邮箱）' : 'Delegation (domain cannot receive mail · fix the email)'}</span>
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
      <p className="mb-4 text-[11px] text-body-3">{zh ? 'TRESA s.32 / O. Reg. 567/05：为客户做租赁工作前须有书面代表协议并交付 RECO Information Guide。筛查可以直接发起；客户确认委托后（范围 · 期限 · 可随时撤销），报告也会出现在客户自己的账号里。协议到期日、Information Guide 的送达方式、多重代表同意（s.22）与租约到期日在这里只是记录——送达、讲解与提醒客户都由你自己完成。收件链接让申请人自己上传材料并在 O. Reg. 290/98 范围内在线授权。备注里不要记录 OHRC 受保护特征。Stayloop 不做经纪业务、不结算佣金。' : 'TRESA s.32 / O. Reg. 567/05: a written representation agreement and the RECO Information Guide come before any leasing work. Screening can start directly; once the client confirms a delegation (scope · term · revocable), reports also appear in their own account. The agreement expiry, how the Information Guide was delivered, multiple-representation consent (s.22) and the lease end date are records only — delivering, explaining and reminding the client stay with you. Intake links let applicants upload their own documents and authorise online within the O. Reg. 290/98 scope. Keep OHRC-protected characteristics out of notes. Stayloop is not a brokerage and settles no commission.'}</p>
    </div>
  )
}
