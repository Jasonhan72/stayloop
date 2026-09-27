'use client'

// The agent's real client table (P2 2026-09-23): rows in agent_clients,
// own-only RLS. TRESA hygiene is the point of the two date columns — a
// written representation agreement and the RECO Information Guide are
// what RECO expects before any leasing work — so "发起筛查" stays disabled
// until both are recorded (prompts.ts SCREENING_RULES_AGENT precondition).
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { SectionCard, StatusPill, Table, Td, Tr } from '@/components/workspace'
import { STAGES, daysQuiet, paperworkComplete, type ClientRole, type ClientStage } from '@/lib/agent/clientBook'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { useReportLiveRows } from '@/lib/liveRows'
import ProposeDelegation from '@/components/delegations/ProposeDelegation'
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
  useReportLiveRows('agent_clients', rows ? rows.length : null)
  const load = useCallback(async () => {
    if (!user) { setRows([]); return }
    const [{ data }, { data: dl }] = await Promise.all([
      supabase.from('agent_clients').select('*').eq('agent_auth_id', user.id).order('updated_at', { ascending: false }).limit(200),
      supabase.from('delegations').select('id, principal_auth_id, principal_email, principal_name, delegate_auth_id, client_id, scope, allowed_actions, starts_at, expires_at, basis_version, status, confirmed_at, revoked_at, created_at').eq('delegate_auth_id', user.id).order('created_at', { ascending: false }).limit(200),
    ])
    const list = (data ?? []) as ClientRow[]
    setRows(list)
    setDelegs((dl ?? []) as DelegationRow[])
    onRows?.(list.length)
  }, [user, onRows])
  const delegFor = (clientId: string): DelegationRow | null => {
    const mine = delegs.filter((d) => d.client_id === clientId)
    return mine.find((d) => isDelegationLive(d)) ?? mine.find((d) => d.status === 'pending') ?? mine[0] ?? null
  }
  useEffect(() => { if (!loading) void load() }, [loading, load])

  async function add() {
    if (!user || !form.name.trim()) return
    setBusy(true)
    const { error } = await supabase.from('agent_clients').insert({
      agent_auth_id: user.id,
      name: form.name.trim().slice(0, 120),
      client_role: form.client_role,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      budget: form.budget.trim() || null,
      area: form.area.trim() || null,
      stage: form.stage,
      representation_agreement_at: form.representation_agreement_at || null,
      info_guide_given_at: form.info_guide_given_at || null,
      notes: form.notes.trim() || null,
      last_contact_at: new Date().toISOString(),
    })
    setErr(error ? error.message : null)
    if (!error) { setForm(EMPTY); setOpen(false); await load() }
    setBusy(false)
  }
  async function update(id: string, patch: Partial<ClientRow>) {
    setBusy(true)
    const { error } = await supabase.from('agent_clients').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
    setErr(error ? error.message : null)
    await load()
    setBusy(false)
  }

  if (!rows) return null
  const input = 'rounded-md border border-line-divider bg-white px-2.5 py-1.5 text-[12.5px]'
  const active = rows.filter((r) => r.stage !== 'closed')
  return (
    <div data-testid="client-book">
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
              {err && <span className="text-[12px] text-danger">{err}</span>}
            </div>
          </div>
        )}
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
                      <Link href={`/agent/agent?prompt=${encodeURIComponent(zh ? `客户 ${c.name}（${c.client_role === 'landlord' ? '房东' : '租客'}，${c.budget || '预算未填'}，${c.area || '区域未填'}）：` : `Client ${c.name} (${c.client_role}, ${c.budget || 'no budget'}, ${c.area || 'no area'}): `)}`} className="rounded-[8px] border border-line-strong bg-white px-2.5 py-[5px] text-[11.5px] font-semibold text-body hover:border-brand hover:text-brand">{zh ? '交给助手' : 'To the assistant'}</Link>
                      {(() => {
                        // 节点 5: screening for a client needs a LIVE delegation that allows it; the delegation needs the TRESA dates + an email.
                        const d = delegFor(c.id)
                        const live = !!d && isDelegationLive(d)
                        const st = d ? STATUS_LABEL[d.status] : null
                        return (<>
                          {d && st && <span data-testid="delegation-chip" className={'rounded-[8px] px-2 py-[5px] font-mono text-[10.5px] font-bold ' + (live ? 'bg-success/10 text-success' : st.tone === 'warn' ? 'bg-amber-50 text-amber-800' : st.tone === 'danger' ? 'bg-danger/10 text-danger' : 'bg-surface-chip text-body-3')}>{live ? (zh ? `委托有效至 ${d.expires_at.slice(0, 10)}` : `Delegated until ${d.expires_at.slice(0, 10)}`) : (zh ? st.zh : st.en)}</span>}
                          {live && allows(d, 'screen')
                            ? <Link href={`/screening/app?as=agent&delegation=${d.id}`} className="rounded-[8px] border border-agent/40 bg-agent/[0.06] px-2.5 py-[5px] text-[11.5px] font-semibold text-agent">{zh ? '发起筛查' : 'Screen'}</Link>
                            : d?.status === 'pending'
                              ? <span className="rounded-[8px] border border-line-divider px-2.5 py-[5px] text-[11.5px] text-body-3" title={zh ? '确认链接已发到客户邮箱；客户用该邮箱登录后确认' : 'The confirmation link went to the client’s email; they confirm while signed in with it'}>{zh ? `链接已发到 ${c.email || '客户邮箱'}` : `Link sent to ${c.email || 'the client'}`}</span>
                              : paper && c.email
                                ? <button type="button" onClick={() => setProposeFor(c.id)} className="rounded-[8px] border border-brand/40 bg-white px-2.5 py-[5px] text-[11.5px] font-semibold text-brand" data-testid="propose-delegation-button">{zh ? '发起委托' : 'Propose delegation'}</button>
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
      <p className="mb-4 text-[11px] text-body-3">{zh ? 'TRESA s.32 / O. Reg. 567/05：为客户做租赁工作前须有书面代表协议并交付 RECO Information Guide；在 Stayloop 上代客操作还需要客户确认的委托（范围 · 期限 · 可随时撤销）。备注里不要记录 OHRC 受保护特征。Stayloop 不做经纪业务、不结算佣金。' : 'TRESA s.32 / O. Reg. 567/05: a written representation agreement and the RECO Information Guide come before any leasing work. Keep OHRC-protected characteristics out of notes. Stayloop is not a brokerage and settles no commission.'}</p>
    </div>
  )
}
