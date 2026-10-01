'use client'

export const runtime = 'edge'

// /leases/import — bring an already-signed lease into Stayloop as a managed
// household. Any role uploads; counterparties get invited afterwards.
//
// Extraction is an accelerator, never a bypass: whatever the model reads from
// the lease lands in an editable confirm form, and only what the user
// confirms is persisted (create_household_import RPC → storage upload →
// attach RPC — that order, because the bucket's RLS needs the membership row
// the RPC creates).

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import WorkspaceShell from '@/components/WorkspaceShell'
import { activeHat, useHats } from '@/lib/useHats'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { useT } from '@/lib/i18n'
import type { LeaseImportExtraction } from '@/lib/household/importExtract'
import { sameTenancyAddress } from '@/lib/lease/householdMatch'

type Role = 'landlord' | 'tenant' | 'agent'
type Step = 'role' | 'files' | 'confirm' | 'invite' | 'done'

const ROLES: Array<{ id: Role; zh: string; en: string; descZh: string; descEn: string }> = [
  { id: 'tenant', zh: '我是租客', en: "I'm the tenant", descZh: '上传后邀请房东加入', descEn: 'Invite your landlord after import' },
  { id: 'landlord', zh: '我是房东', en: "I'm the landlord", descZh: '上传后邀请租客加入', descEn: 'Invite your tenant after import' },
  { id: 'agent', zh: '我是经纪', en: "I'm the agent", descZh: '上传后邀请房东与租客', descEn: 'Invite both parties after import' },
]

interface FormState {
  address: string; unit: string; city: string
  monthly_rent: string; rent_due_day: string
  start_date: string; end_date: string
  tenant_name: string; tenant_email: string
}

const EMPTY_FORM: FormState = {
  address: '', unit: '', city: '', monthly_rent: '', rent_due_day: '1',
  start_date: '', end_date: '', tenant_name: '', tenant_email: '',
}

// my_households_for_import(): households the caller is in, or invited to.
type MyHousehold = {
  id: string; address: string; unit: string | null; city: string | null; status: string; verified: boolean; source: string
  monthly_rent: number | null; rent_due_day: number | null; start_date: string | null; end_date: string | null
  relation: 'member' | 'invited'; my_role: string | null; is_creator: boolean; invite_token: string | null; lease_status: string | null
  tenant_name: string | null; tenant_email: string | null
  /** Another active member (the invitee, an agent or PM) — absent before the 20261001_A4 function. */
  others_joined?: boolean | null
}

/** The creator may correct an import until the other side joins (any other active member) and confirms it. */
const correctable = (h: MyHousehold) => h.relation === 'member' && h.is_creator && !h.verified && h.source === 'imported' && h.status === 'active' && !h.others_joined

export default function LeaseImportPage() {
  const { user, loading, role: rememberedRole } = useAuth()
  const hats = useHats()
  const shellRole = activeHat(hats, rememberedRole)
  const { lang } = useT()
  const zh = lang === 'zh'
  const router = useRouter()
  const fileInput = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<Step>('role')
  const [role, setRole] = useState<Role>('tenant')
  const [files, setFiles] = useState<File[]>([])
  const [extracting, setExtracting] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [creating, setCreating] = useState(false)
  const [householdId, setHouseholdId] = useState<string | null>(null)
  const [invites, setInvites] = useState<Array<{ email: string; role: string }>>([{ email: '', role: 'landlord' }])
  const [inviting, setInviting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Sweep 2026-10-01 (#18): the same tenancy already in Stayloop — re-importing, or the other
  // party importing the same lease, used to create a second household every time.
  const [matches, setMatches] = useState<MyHousehold[] | null>(null)
  // ?edit=<household>: correct an unconfirmed import instead of importing it again.
  const [editing, setEditing] = useState<MyHousehold | null>(null)
  const [corrected, setCorrected] = useState(false)

  useEffect(() => {
    if (!user) return
    const id = new URLSearchParams(window.location.search).get('edit')
    if (!id) return
    let cancelled = false
    void supabase.rpc('my_households_for_import').then(({ data }) => {
      if (cancelled) return
      const h = ((data ?? []) as MyHousehold[]).find((x) => x.id === id)
      if (!h || !correctable(h)) {
        setError(zh ? '这份在管租约不能在这里修改：只有导入它的人，在对方加入并确认之前可以更正。' : 'This tenancy cannot be corrected here: only the person who imported it can, before the other side joins and confirms.')
        return
      }
      setEditing(h)
      setForm(formFromHousehold(h))
      setStep('confirm')
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  function formFromHousehold(h: MyHousehold): FormState {
    return {
      address: h.address || '', unit: h.unit || '', city: h.city || '',
      monthly_rent: h.monthly_rent != null ? String(h.monthly_rent) : '',
      rent_due_day: h.rent_due_day != null ? String(h.rent_due_day) : '1',
      start_date: h.start_date || '', end_date: h.end_date || '',
      tenant_name: h.tenant_name || '', tenant_email: h.tenant_email || '',
    }
  }

  async function uploadInto(id: string, attach: boolean) {
    // Unique names: an existing household's earlier file is never overwritten.
    const stamp = Date.now().toString(36)
    for (let i = 0; i < files.length; i++) {
      const f = files[i]
      const ext = f.name.split('.').pop()?.toLowerCase() || 'pdf'
      const path = `${id}/lease-${stamp}-${i + 1}.${ext}`
      const { error: upErr } = await supabase.storage.from('tenancy-files').upload(path, f, { upsert: false })
      if (!upErr && i === 0 && attach) {
        await supabase.rpc('attach_household_lease_file', { p_household: id, p_path: path })
      }
    }
  }

  async function correctHousehold(h: MyHousehold) {
    setError(null)
    if (form.address.trim().length < 5) { setError(zh ? '请填写房屋地址' : 'Address is required'); return }
    setCreating(true)
    try {
      const { error: rpcErr } = await supabase.rpc('update_household_import', {
        p_household: h.id,
        p_address: form.address.trim(),
        p_unit: form.unit.trim() || null,
        p_city: form.city.trim() || null,
        p_monthly_rent: form.monthly_rent ? Number(form.monthly_rent) : null,
        p_rent_due_day: form.rent_due_day ? Number(form.rent_due_day) : null,
        p_start_date: form.start_date || null,
        p_end_date: form.end_date || null,
        p_tenant_name: form.tenant_name.trim() || null,
        p_tenant_email: form.tenant_email.trim() || null,
      })
      if (rpcErr) {
        // The other side joined (or confirmed) since this page loaded: the facts they saw stay as they are.
        if (/counterparty_joined|household_verified/.test(rpcErr.message)) {
          throw new Error(zh ? '对方已经加入这份在管租约，导入的信息不能再改；有出入请在租约对话里和对方说明。' : 'The other side has already joined this tenancy, so the imported details can no longer be changed — raise any difference with them in the tenancy conversation.')
        }
        throw new Error(rpcErr.message)
      }
      if (files.length) await uploadInto(h.id, h.lease_status === 'imported')
      setHouseholdId(h.id)
      setCorrected(true)
      setMatches(null)
      setStep('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'update failed')
    } finally {
      setCreating(false)
    }
  }

  async function attachFilesTo(h: MyHousehold) {
    setCreating(true); setError(null)
    try {
      await uploadInto(h.id, h.lease_status === 'imported' && h.source === 'imported')
      router.push(`/h/${h.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'upload failed')
    } finally {
      setCreating(false)
    }
  }

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }))
    if (k === 'address' || k === 'unit') setMatches(null)
  }

  async function runExtract(selected: File[]) {
    setFiles(selected)
    setError(null)
    setExtracting(true)
    setStep('confirm')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const fd = new FormData()
      for (const f of selected) fd.append('files', f)
      const res = await fetch('/api/household/extract', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token || ''}` },
        body: fd,
      })
      if (res.ok) {
        const { extraction } = (await res.json()) as { extraction: LeaseImportExtraction }
        setNote(extraction.note)
        setForm({
          address: extraction.address ?? '',
          unit: extraction.unit ?? '',
          city: extraction.city ?? '',
          monthly_rent: extraction.monthly_rent != null ? String(extraction.monthly_rent) : '',
          rent_due_day: extraction.rent_due_day != null ? String(extraction.rent_due_day) : '1',
          start_date: extraction.start_date ?? '',
          end_date: extraction.end_date ?? '',
          tenant_name: extraction.tenant_names.join(' & '),
          tenant_email: '',
        })
      }
      // Extraction failure is not an import failure — the form just starts blank.
    } catch { /* form starts blank */ } finally {
      setExtracting(false)
    }
  }

  async function createHousehold(force = false) {
    setError(null)
    if (form.address.trim().length < 5) {
      setError(zh ? '请填写房屋地址' : 'Address is required')
      return
    }
    if (editing) { await correctHousehold(editing); return }
    setCreating(true)
    try {
      if (!force) {
        const { data: mine } = await supabase.rpc('my_households_for_import')
        const same = ((mine ?? []) as MyHousehold[]).filter((h) => sameTenancyAddress({ address: form.address, unit: form.unit }, { address: h.address, unit: h.unit }))
        if (same.length) { setMatches(same); return }
      }
      const { data: hid, error: rpcErr } = await supabase.rpc('create_household_import', {
        p_address: form.address.trim(),
        p_unit: form.unit.trim() || null,
        p_city: form.city.trim() || null,
        p_monthly_rent: form.monthly_rent ? Number(form.monthly_rent) : null,
        p_rent_due_day: form.rent_due_day ? Number(form.rent_due_day) : null,
        p_start_date: form.start_date || null,
        p_end_date: form.end_date || null,
        p_creator_role: role,
        p_tenant_name: form.tenant_name.trim() || null,
        p_tenant_email: form.tenant_email.trim() || null,
      })
      if (rpcErr || !hid) throw new Error(rpcErr?.message || 'create failed')
      const id = hid as string
      setHouseholdId(id)
      setMatches(null)

      // Upload the lease file(s) now that membership exists, then link the
      // first one as the lease document.
      await uploadInto(id, true)

      const defaultInviteRole = role === 'tenant' ? 'landlord' : 'tenant'
      setInvites([{ email: '', role: defaultInviteRole }])
      setStep('invite')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'create failed')
    } finally {
      setCreating(false)
    }
  }

  async function sendInvites() {
    const valid = invites.filter((i) => /\S+@\S+\.\S+/.test(i.email))
    if (!valid.length || !householdId) { setStep('done'); return }
    setInviting(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/household/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
        body: JSON.stringify({ household_id: householdId, invites: valid }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'invite failed')
      }
      setStep('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'invite failed')
    } finally {
      setInviting(false)
    }
  }

  if (!loading && !user) {
    return (
      <div style={{ background: '#FFFFFF', minHeight: '100vh' }} className="flex flex-col">
        <Header variant="transparent" />
        <div className="flex flex-1 items-center justify-center px-5 text-center">
          <div>
            <h1 className="text-[22px] font-extrabold">{zh ? '导入已有租约' : 'Import an existing lease'}</h1>
            <p className="mt-2 text-[14px] text-body-2">{zh ? '请先登录后再导入。' : 'Please sign in first.'}</p>
            <Link href="/login?next=/leases/import" className="mt-5 inline-block rounded-lg px-5 py-2.5 text-[13px] font-bold text-white" style={{ background: '#00ACE4' }}>
              {zh ? '去登录' : 'Sign in'}
            </Link>
          </div>
        </div>
        <Footer />
      </div>
    )
  }

  const input = 'w-full rounded-lg border border-line-divider bg-white px-3 py-2.5 text-[14px]'
  const label = 'mb-1 mt-4 block text-[12px] font-semibold text-body-2'

  // Signed in: the import is a workbench task, framed by the hat the account is acting as
  // (external review 2026-09-26: the page was a bare marketing layout).
  return (
    <WorkspaceShell role={shellRole} hideAside>
      <div className="mx-auto w-full max-w-[680px]">
        <div className="font-mono text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: '#00ACE4' }}>
          {zh ? '在管租约 · 导入' : 'MANAGED TENANCY · IMPORT'}
        </div>
        <h1 className="mt-2 text-[26px] font-extrabold tracking-tight">
          {zh ? '把已签好的租约带进 Stayloop' : 'Bring a signed lease into Stayloop'}
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-body-2">
          {zh
            ? '上传租约,确认信息,邀请对方——之后对话、报修、租金提醒都在这里。'
            : 'Upload the lease, confirm the details, invite the other parties — then messaging, maintenance and rent reminders live here.'}
        </p>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">{error}</div>
        )}

        {step === 'role' && (
          <div className="mt-8 space-y-3">
            {ROLES.map((r) => (
              <button
                key={r.id}
                onClick={() => { setRole(r.id); setStep('files') }}
                className="w-full rounded-xl border border-line-divider bg-white px-5 py-4 text-left transition hover:border-[#00ACE4]"
              >
                <div className="text-[15px] font-bold">{zh ? r.zh : r.en}</div>
                <div className="mt-0.5 text-[12.5px] text-body-3">{zh ? r.descZh : r.descEn}</div>
              </button>
            ))}
          </div>
        )}

        {step === 'files' && (
          <div className="mt-8">
            <button
              onClick={() => fileInput.current?.click()}
              className="w-full rounded-xl border-2 border-dashed border-line-divider bg-white px-5 py-12 text-center transition hover:border-[#00ACE4]"
            >
              <div className="text-[15px] font-bold">{zh ? '选择租约文件' : 'Choose lease file(s)'}</div>
              <div className="mt-1 text-[12.5px] text-body-3">{zh ? 'PDF 或照片 · 最多 3 个 · 共 10MB' : 'PDF or photos · up to 3 files · 10MB total'}</div>
            </button>
            <input
              ref={fileInput}
              aria-label={zh ? '选择租约文件' : 'Choose lease file(s)'}
              type="file"
              accept="application/pdf,image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                const list = Array.from(e.target.files ?? []).slice(0, 3)
                if (list.length) void runExtract(list)
              }}
            />
            <button onClick={() => setStep('confirm')} className="mt-4 text-[12.5px] text-body-3 underline">
              {zh ? '没有电子版?跳过上传,手动填写' : 'No file at hand? Skip and fill in manually'}
            </button>
          </div>
        )}

        {step === 'confirm' && (
          <div className="mt-8 rounded-xl border border-line-divider bg-white p-6">
            {extracting ? (
              <div className="py-10 text-center">
                <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-[#00ACE4] border-t-transparent" />
                <p className="mt-3 text-[13px] text-body-3">{zh ? 'AI 正在读取租约…' : 'Reading the lease…'}</p>
              </div>
            ) : (
              <>
                <h2 className="text-[16px] font-extrabold">{zh ? '确认租约信息' : 'Confirm the details'}</h2>
                <p className="mt-1 text-[12.5px] text-body-3">
                  {zh ? 'AI 读出的内容仅供加速,请核对每一项——以你确认的为准。' : 'Extraction only speeds this up — what you confirm is what counts.'}
                </p>
                {note && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-800">⚠ {note}</p>}

                <label className={label}>{zh ? '房屋地址 *' : 'Address *'}</label>
                <input className={input} value={form.address} onChange={set('address')} placeholder={zh ? "例：88 Harbour St" : "e.g. 88 Harbour St"} />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={label}>{zh ? '单元号' : 'Unit'}</label>
                    <input className={input} value={form.unit} onChange={set('unit')} />
                  </div>
                  <div>
                    <label className={label}>{zh ? '城市' : 'City'}</label>
                    <input className={input} value={form.city} onChange={set('city')} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={label}>{zh ? '月租金 (CAD)' : 'Monthly rent (CAD)'}</label>
                    <input className={input} type="number" value={form.monthly_rent} onChange={set('monthly_rent')} />
                  </div>
                  <div>
                    <label className={label}>{zh ? '每月几号交租' : 'Rent due day'}</label>
                    <input className={input} type="number" min={1} max={31} value={form.rent_due_day} onChange={set('rent_due_day')} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={label}>{zh ? '起租日' : 'Start date'}</label>
                    <input className={input} type="date" value={form.start_date} onChange={set('start_date')} />
                  </div>
                  <div>
                    <label className={label}>{zh ? '固定租期到期日(月租可留空)' : 'End of fixed term (optional)'}</label>
                    <input className={input} type="date" value={form.end_date} onChange={set('end_date')} />
                  </div>
                </div>
                <label className={label}>{zh ? '租客姓名(按租约)' : 'Tenant name(s) as on lease'}</label>
                <input className={input} value={form.tenant_name} onChange={set('tenant_name')} />
                <label className={label}>{zh ? '租客邮箱(用于护照租金记录,可留空)' : 'Tenant email (optional)'}</label>
                <input className={input} type="email" value={form.tenant_email} onChange={set('tenant_email')} />

                {matches && matches.length > 0 && (
                  <div className="mt-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] text-amber-900" data-testid="import-existing">
                    <div className="font-semibold">{zh ? '这个地址和单元在 Stayloop 上已经有在管租约了' : 'This address and unit is already a managed tenancy on Stayloop'}</div>
                    <p className="mt-1 text-[12.5px]">{zh ? '同一份租约导入两次会出现两份在管租约，各自有对话、报修和租金记录。先看看是不是这一份：' : 'Importing the same lease twice makes two managed tenancies, each with its own chat, maintenance and rent records. Check whether it is this one first:'}</p>
                    <ul className="mt-2 space-y-2">
                      {matches.map((h) => (
                        <li key={h.id} className="rounded-md border border-amber-200 bg-white px-3 py-2">
                          <div className="text-[13px] font-semibold text-body">{h.address}{h.unit ? ` · ${h.unit}` : ''}</div>
                          <div className="text-[12px] text-body-3">
                            {h.relation === 'invited'
                              ? (zh ? '你已被邀请加入这份在管租约（还没接受）' : 'You were invited to this tenancy (not accepted yet)')
                              : h.verified
                                ? (zh ? '你在这份在管租约里 · 双方已确认' : 'You are in this tenancy · confirmed by both sides')
                                : h.is_creator
                                  ? (zh ? '你之前导入的 · 对方还没确认' : 'You imported it earlier · not yet confirmed by the other side')
                                  : (zh ? '你在这份在管租约里' : 'You are in this tenancy')}
                          </div>
                          <div className="mt-1.5 flex flex-wrap gap-3 text-[12.5px] font-semibold">
                            {h.relation === 'invited' && h.invite_token
                              ? <Link href={`/join/${h.invite_token}`} className="text-[#00ACE4] underline underline-offset-2">{zh ? '去接受邀请 →' : 'Accept the invitation →'}</Link>
                              : <Link href={`/h/${h.id}`} className="text-[#00ACE4] underline underline-offset-2">{zh ? '打开它 →' : 'Open it →'}</Link>}
                            {correctable(h) && (
                              <button onClick={() => void correctHousehold(h)} disabled={creating} className="text-[#00ACE4] underline underline-offset-2 disabled:opacity-50">
                                {zh ? '用这次确认的信息更正它' : 'Correct it with these details'}
                              </button>
                            )}
                            {h.relation === 'member' && files.length > 0 && !correctable(h) && (
                              <button onClick={() => void attachFilesTo(h)} disabled={creating} className="text-[#00ACE4] underline underline-offset-2 disabled:opacity-50">
                                {zh ? '把这次的文件附上去' : 'Attach this file to it'}
                              </button>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                    <button onClick={() => void createHousehold(true)} disabled={creating} className="mt-3 text-[12.5px] text-body-2 underline underline-offset-2 disabled:opacity-50">
                      {zh ? '不是同一份（例如这个单元的新租客）——仍然新建一份在管租约' : 'Not the same tenancy (e.g. a new tenant in this unit) — create a new one anyway'}
                    </button>
                  </div>
                )}

                <button
                  onClick={() => void createHousehold()}
                  disabled={creating}
                  className="mt-6 w-full rounded-lg py-3 text-[14px] font-bold text-white disabled:opacity-60"
                  style={{ background: '#00ACE4' }}
                >
                  {creating
                    ? (zh ? '处理中…' : 'Working…')
                    : editing
                      ? (zh ? '保存更正' : 'Save corrections')
                      : (zh ? '确认并创建' : 'Confirm & create')}
                </button>
              </>
            )}
          </div>
        )}

        {step === 'invite' && (
          <div className="mt-8 rounded-xl border border-line-divider bg-white p-6">
            <h2 className="text-[16px] font-extrabold">{zh ? '邀请相关方' : 'Invite the other parties'}</h2>
            <p className="mt-1 text-[12.5px] text-body-3">
              {zh ? '对方会收到邮件,看过租约信息后自行决定是否加入。' : "They'll get an email and decide after seeing the details."}
            </p>
            {invites.map((inv, i) => (
              <div key={i} className="mt-3 flex gap-2">
                <input
                  className={input}
                  type="email"
                  placeholder="email@example.com"
                  value={inv.email}
                  onChange={(e) => setInvites((a) => a.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))}
                />
                <select
                  className="rounded-lg border border-line-divider bg-white px-2 text-[13px]"
                  value={inv.role}
                  onChange={(e) => setInvites((a) => a.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)))}
                >
                  <option value="landlord">{zh ? '房东' : 'Landlord'}</option>
                  <option value="tenant">{zh ? '租客' : 'Tenant'}</option>
                  <option value="agent">{zh ? '经纪' : 'Agent'}</option>
                </select>
              </div>
            ))}
            {invites.length < 5 && (
              <button onClick={() => setInvites((a) => [...a, { email: '', role: 'tenant' }])} className="mt-2 text-[12.5px] text-body-3 underline">
                + {zh ? '再加一位' : 'Add another'}
              </button>
            )}
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => void sendInvites()}
                disabled={inviting}
                className="flex-1 rounded-lg py-3 text-[14px] font-bold text-white disabled:opacity-60"
                style={{ background: '#00ACE4' }}
              >
                {inviting ? (zh ? '发送中…' : 'Sending…') : (zh ? '发送邀请' : 'Send invites')}
              </button>
              <button onClick={() => setStep('done')} className="rounded-lg border border-line-divider px-5 text-[13px] text-body-2">
                {zh ? '稍后再邀' : 'Later'}
              </button>
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className="mt-8 rounded-xl border border-line-divider bg-white p-8 text-center">
            <div className="text-[40px]">✓</div>
            <h2 className="mt-2 text-[18px] font-extrabold">{corrected ? (zh ? '在管租约已更正' : 'Managed tenancy corrected') : (zh ? '在管租约已创建' : 'Managed tenancy created')}</h2>
            <p className="mt-1 text-[13px] text-body-3">
              {corrected
                ? (zh ? '没有另建一份；已发出的邀请仍然有效。' : 'No second tenancy was created; invitations already sent still work.')
                : (zh ? '对方加入后,对话、报修、租金记录都会在这里汇合。' : 'Once the others join, chat, maintenance and rent records all live here.')}
            </p>
            <button
              onClick={() => householdId && router.push(`/h/${householdId}`)}
              className="mt-5 rounded-lg px-6 py-3 text-[14px] font-bold text-white"
              style={{ background: '#00ACE4' }}
            >
              {zh ? '进入管理页' : 'Open the household'}
            </button>
          </div>
        )}
      </div>
    </WorkspaceShell>
  )
}
