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

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { useT } from '@/lib/i18n'
import type { LeaseImportExtraction } from '@/lib/household/importExtract'

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

export default function LeaseImportPage() {
  const { user, loading } = useAuth()
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

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

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

  async function createHousehold() {
    setError(null)
    if (form.address.trim().length < 5) {
      setError(zh ? '请填写房屋地址' : 'Address is required')
      return
    }
    setCreating(true)
    try {
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

      // Upload the lease file(s) now that membership exists, then link the
      // first one as the lease document.
      for (let i = 0; i < files.length; i++) {
        const f = files[i]
        const ext = f.name.split('.').pop()?.toLowerCase() || 'pdf'
        const path = `${id}/lease-${i + 1}.${ext}`
        const { error: upErr } = await supabase.storage.from('tenancy-files').upload(path, f, { upsert: true })
        if (!upErr && i === 0) {
          await supabase.rpc('attach_household_lease_file', { p_household: id, p_path: path })
        }
      }

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
      <div style={{ background: '#FAF7EE', minHeight: '100vh' }} className="flex flex-col">
        <Header variant="transparent" />
        <div className="flex flex-1 items-center justify-center px-5 text-center">
          <div>
            <h1 className="text-[22px] font-extrabold">{zh ? '导入已有租约' : 'Import an existing lease'}</h1>
            <p className="mt-2 text-[14px] text-body-2">{zh ? '请先登录后再导入。' : 'Please sign in first.'}</p>
            <Link href="/login?next=/leases/import" className="mt-5 inline-block rounded-lg px-5 py-2.5 text-[13px] font-bold text-white" style={{ background: '#7C3AED' }}>
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

  return (
    <div style={{ background: '#FAF7EE', minHeight: '100vh' }} className="flex flex-col">
      <Header variant="transparent" />
      <div className="mx-auto w-full max-w-[680px] flex-1 px-5 py-12">
        <div className="font-mono text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: '#7C3AED' }}>
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
                className="w-full rounded-xl border border-line-divider bg-white px-5 py-4 text-left transition hover:border-[#7C3AED]"
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
              className="w-full rounded-xl border-2 border-dashed border-line-divider bg-white px-5 py-12 text-center transition hover:border-[#7C3AED]"
            >
              <div className="text-[15px] font-bold">{zh ? '选择租约文件' : 'Choose lease file(s)'}</div>
              <div className="mt-1 text-[12.5px] text-body-3">{zh ? 'PDF 或照片 · 最多 3 个 · 共 10MB' : 'PDF or photos · up to 3 files · 10MB total'}</div>
            </button>
            <input
              ref={fileInput}
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
                <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-[#7C3AED] border-t-transparent" />
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
                <input className={input} value={form.address} onChange={set('address')} placeholder="123 Main St" />
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

                <button
                  onClick={() => void createHousehold()}
                  disabled={creating}
                  className="mt-6 w-full rounded-lg py-3 text-[14px] font-bold text-white disabled:opacity-60"
                  style={{ background: '#7C3AED' }}
                >
                  {creating ? (zh ? '创建中…' : 'Creating…') : (zh ? '确认并创建' : 'Confirm & create')}
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
                style={{ background: '#7C3AED' }}
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
            <h2 className="mt-2 text-[18px] font-extrabold">{zh ? '在管租约已创建' : 'Managed tenancy created'}</h2>
            <p className="mt-1 text-[13px] text-body-3">
              {zh ? '对方加入后,对话、报修、租金记录都会在这里汇合。' : 'Once the others join, chat, maintenance and rent records all live here.'}
            </p>
            <button
              onClick={() => householdId && router.push(`/h/${householdId}`)}
              className="mt-5 rounded-lg px-6 py-3 text-[14px] font-bold text-white"
              style={{ background: '#7C3AED' }}
            >
              {zh ? '进入管理页' : 'Open the household'}
            </button>
          </div>
        )}
      </div>
      <Footer />
    </div>
  )
}
