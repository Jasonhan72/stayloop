'use client'

export const runtime = 'edge'

// Draft a lease on one of two form systems keyed by form_type:
// the Ontario Standard Form of Lease ('ontario_standard') or the TRREB
// Agreement to Lease — Residential, Form 400 style ('trreb'). Saving creates
// a draft lease_documents row; the detail page then sends it to the tenant
// for online signing. Arriving with ?application_id=<uuid> prefills the form
// from that application + its listing (one-click draft from an applicant).
import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import WorkspaceShell from '@/components/WorkspaceShell'
import OntarioLeaseDoc from '@/components/lease/OntarioLeaseDoc'
import TrrebLeaseDoc from '@/components/lease/TrrebLeaseDoc'
import { emptyOntarioTerms, checkAdditionalTerms, type OntarioLeaseTerms } from '@/lib/lease/ontario'
import { emptyTrrebTerms, type TrrebLeaseTerms } from '@/lib/lease/trreb'
import { supabase } from '@/lib/supabase'
import { useLandlord } from '@/lib/useLandlord'
import { useT } from '@/lib/i18n'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type FormType = 'ontario_standard' | 'trreb'

function Input({ label, value, onChange, type = 'text', placeholder = '', required = false }: {
  label: string; value: string; onChange: (v: string) => void
  type?: string; placeholder?: string; required?: boolean
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-semibold text-body-2">{label}{required && ' *'}</span>
      <input
        type={type} value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-[10px] border border-line-strong bg-white px-3 py-[10px] text-[13.5px] outline-none focus:border-landlord"
      />
    </label>
  )
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="sl-card p-5">
      <div className="mb-3 font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-landlord">{title}</div>
      <div className="grid gap-3">{children}</div>
    </div>
  )
}

// Prefill source: an application row joined to its listing.
type PrefillApplication = {
  id: string
  first_name: string
  last_name: string
  email: string
  move_in_date: string | null
  num_occupants: number | null
  listing_id: string | null
  listing: {
    address: string
    unit: string | null
    city: string | null
    postal_code: string | null
    monthly_rent: number
    parking: string | null
  } | null
}

function NewLeasePageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { lang } = useT()
  const zh = lang === 'zh'
  const { landlord, loading: authLoading } = useLandlord()

  const [formType, setFormType] = useState<FormType>('ontario_standard')
  const [t, setT] = useState<OntarioLeaseTerms>(emptyOntarioTerms())
  const [tt, setTt] = useState<TrrebLeaseTerms>(emptyTrrebTerms())
  const [tenantEmail, setTenantEmail] = useState('')
  const [preview, setPreview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [termIssues, setTermIssues] = useState<{ zh: string; en: string }[]>([])

  // ?application_id= → one-click draft from an applicant
  const applicationParam = searchParams.get('application_id')
  const [applicationId, setApplicationId] = useState<string | null>(null)
  const [listingId, setListingId] = useState<string | null>(null)
  const [prefillNote, setPrefillNote] = useState<{ kind: 'ok' | 'fail'; text: string } | null>(null)

  useEffect(() => {
    if (authLoading || !landlord) return
    if (!applicationParam || !UUID_RE.test(applicationParam)) return
    let cancelled = false
    const run = async () => {
      const { data, error } = await supabase
        .from('applications')
        .select('id, first_name, last_name, email, move_in_date, num_occupants, listing_id, listing:listings(address, unit, city, postal_code, monthly_rent, parking)')
        .eq('id', applicationParam)
        .maybeSingle<PrefillApplication>()
      if (cancelled) return
      if (error || !data) {
        setPrefillNote({
          kind: 'fail',
          text: zh ? '未找到该申请（或无权限查看），已回退到空白表单。' : 'Application not found (or no access) — starting from a blank form.',
        })
        return
      }
      const tenantName = [data.first_name, data.last_name].filter(Boolean).join(' ').trim()
      const li = data.listing
      setApplicationId(data.id)
      setListingId(data.listing_id)
      setTenantEmail(data.email || '')
      // Prefill BOTH form models so switching form type keeps the data.
      setT((prev) => ({
        ...prev,
        tenant_names: [tenantName, ...prev.tenant_names.slice(1)],
        unit: {
          ...prev.unit,
          street: li?.address || prev.unit.street,
          unit: li?.unit || prev.unit.unit,
          city: li?.city || prev.unit.city,
          postal: li?.postal_code || prev.unit.postal,
          parking: li?.parking || prev.unit.parking,
        },
        term: { ...prev.term, start_date: data.move_in_date || prev.term.start_date },
        rent: { ...prev.rent, amount: li?.monthly_rent ?? prev.rent.amount },
      }))
      setTt((prev) => ({
        ...prev,
        tenant_names: [tenantName, ...prev.tenant_names.slice(1)],
        premises: {
          ...prev.premises,
          street: li?.address || prev.premises.street,
          unit: li?.unit || prev.premises.unit,
          city: li?.city || prev.premises.city,
          postal: li?.postal_code || prev.premises.postal,
        },
        term: { ...prev.term, start_date: data.move_in_date || prev.term.start_date },
        rent: { ...prev.rent, amount: li?.monthly_rent ?? prev.rent.amount },
        parking: li?.parking || prev.parking,
        use: { ...prev.use, occupant_count: data.num_occupants ?? prev.use.occupant_count },
      }))
      setPrefillNote({
        kind: 'ok',
        text: zh
          ? `已从 ${tenantName || '申请'} 的租房申请预填 — 请核对后补全剩余字段。`
          : `Prefilled from ${tenantName || 'the'} application — review and complete the remaining fields.`,
      })
    }
    void run()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, landlord, applicationParam])

  const patch = (p: Partial<OntarioLeaseTerms>) => setT((prev) => ({ ...prev, ...p }))
  const patchT = (p: Partial<TrrebLeaseTerms>) => setTt((prev) => ({ ...prev, ...p }))

  const save = async () => {
    if (saving || !landlord) return
    const isTrreb = formType === 'trreb'
    if (isTrreb) {
      if (!tt.landlord_legal_name.trim() || !tt.tenant_names[0]?.trim() || !tt.premises.street.trim() || !tt.rent.amount || !tt.term.start_date) {
        setErr(zh ? '请填写：房东法定名称、租客姓名、地址、月租、起租日' : 'Required: landlord legal name, tenant name, address, rent, start date')
        return
      }
      if (!tt.term.end_date) {
        setErr(zh ? 'TRREB 协议需要租期到期日' : 'A TRREB agreement needs a term end date')
        return
      }
    } else {
      if (!t.landlord_legal_name.trim() || !t.tenant_names[0]?.trim() || !t.unit.street.trim() || !t.rent.amount || !t.term.start_date) {
        setErr(zh ? '请填写：房东法定名称、租客姓名、地址、月租、起租日' : 'Required: landlord legal name, tenant name, address, rent, start date')
        return
      }
      if (t.term.type === 'fixed' && !t.term.end_date) {
        setErr(zh ? '固定期限租约需要到期日' : 'A fixed-term lease needs an end date')
        return
      }
    }
    // RTA/OHRC guardrail on the free-text terms — void terms don't get drafted.
    // The same check covers Ontario §15 additional terms and TRREB Schedule A.
    const check = checkAdditionalTerms((isTrreb ? tt.schedule_a : t.additional_terms) || '')
    if (!check.ok) {
      setTermIssues(check.issues)
      setErr(zh ? '附加条款包含无效/违法内容，请修改后再保存（见下方说明）' : 'Additional terms contain void/illegal content — fix them first (see below)')
      return
    }
    setErr(null)
    setTermIssues([])
    setSaving(true)
    // Derived columns (tenant_name / unit_label / monthly_rent / start_date /
    // end_date) are populated for BOTH form types — proactive renewal
    // scanning reads those columns, not the terms jsonb.
    const derived = isTrreb
      ? {
          tenant_name: tt.tenant_names.filter(Boolean).join(', '),
          unit_label: [tt.premises.unit ? `Unit ${tt.premises.unit}` : null, tt.premises.street].filter(Boolean).join(' · '),
          monthly_rent: tt.rent.amount,
          start_date: tt.term.start_date,
          end_date: tt.term.end_date,
        }
      : {
          tenant_name: t.tenant_names.filter(Boolean).join(', '),
          unit_label: [t.unit.unit ? `Unit ${t.unit.unit}` : null, t.unit.street].filter(Boolean).join(' · '),
          monthly_rent: t.rent.amount,
          start_date: t.term.start_date,
          end_date: t.term.type === 'fixed' ? t.term.end_date : null,
        }
    const { data, error } = await supabase
      .from('lease_documents')
      .insert({
        landlord_id: landlord.landlordId,
        form_type: formType,
        status: 'draft',
        terms: isTrreb ? tt : t,
        tenant_email: tenantEmail.trim() || null,
        application_id: applicationId,
        listing_id: listingId,
        ...derived,
      })
      .select('id')
      .single()
    setSaving(false)
    if (error || !data) { setErr(error?.message || 'save failed'); return }
    router.push(`/landlord/leases/${data.id}`)
  }

  if (authLoading || !landlord) {
    return (
      <WorkspaceShell role="landlord" hideAside>
        <div className="flex min-h-[60vh] items-center justify-center">
          <span className="orb landlord pulse h-12 w-12" style={{ color: '#047857' }} />
        </div>
      </WorkspaceShell>
    )
  }

  return (
    <WorkspaceShell role="landlord" hideAside>
      <div className="mx-auto max-w-[860px]">
        <Link href="/landlord/leases" className="font-mono text-[12px] text-body-3 hover:text-body">
          {zh ? '← 返回租约管理' : '← Back to leases'}
        </Link>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-landlord">
              {formType === 'trreb' ? 'TRREB FORM 400' : 'ONTARIO STANDARD LEASE'} · {zh ? '起草' : 'DRAFT'}
            </div>
            <h1 className="mt-1 text-[24px] font-bold tracking-tight sm:text-[30px]">
              {formType === 'trreb'
                ? (zh ? '起草 TRREB 租赁协议' : 'Draft a TRREB Agreement to Lease')
                : (zh ? '起草安省标准租约' : 'Draft an Ontario Standard Lease')}
            </h1>
            <p className="mt-1 text-[13px] text-body-2">
              {formType === 'trreb'
                ? (zh
                    ? '按 TRREB Form 400（Agreement to Lease — Residential）结构填写。保存后可发送给租客在线签署，签完双方可随时下载 PDF 备份。'
                    : 'Follows the TRREB Form 400 (Agreement to Lease — Residential) structure. Save, send to your tenant for online signing, then both parties can download PDF backups anytime.')
                : (zh
                    ? '按安省法定标准租约（2229E）结构填写。保存后可发送给租客在线签署，签完双方可随时下载 PDF 备份。'
                    : 'Follows the mandatory Ontario Standard Form of Lease (2229E). Save, send to your tenant for online signing, then both parties can download PDF backups anytime.')}
            </p>
          </div>
          <button
            onClick={() => setPreview((v) => !v)}
            className="rounded-[10px] border border-line-strong bg-white px-4 py-[10px] text-[13px] font-semibold text-body transition hover:border-brand hover:text-brand"
          >
            {preview ? (zh ? '← 继续编辑' : '← Keep editing') : (zh ? '预览文档' : 'Preview document')}
          </button>
        </div>

        {prefillNote && (
          <div
            className={`mt-4 flex items-start justify-between gap-3 rounded-lg border px-4 py-2.5 text-[12.5px] ${
              prefillNote.kind === 'ok' ? 'border-green-200 bg-green-50 text-green-800' : 'border-amber-300 bg-amber-50 text-amber-800'
            }`}
          >
            <span>{prefillNote.text}</span>
            <button onClick={() => setPrefillNote(null)} aria-label={zh ? '关闭' : 'Dismiss'} className="font-bold opacity-60 transition hover:opacity-100">✕</button>
          </div>
        )}

        {preview ? (
          <div className="mt-6 sl-card overflow-hidden !p-0">
            {formType === 'trreb'
              ? <TrrebLeaseDoc terms={tt} status="draft" />
              : <OntarioLeaseDoc terms={t} status="draft" />}
          </div>
        ) : (
          <div className="mt-6 grid gap-4">
            {/* Form type selector — two systems share the lease_documents row shape */}
            <div className="grid gap-3 sm:grid-cols-2">
              {([
                ['ontario_standard', zh ? '安省标准租约' : 'Ontario Standard Lease', zh ? '法定标准租约（2229E）· 大多数租赁的默认选择' : 'Mandatory standard form (2229E) · the default for most tenancies'],
                ['trreb', zh ? 'TRREB 协议 Form 400' : 'TRREB Form 400', zh ? 'Agreement to Lease — Residential · 经纪交易常用' : 'Agreement to Lease — Residential · common in brokered deals'],
              ] as const).map(([ft, title, sub]) => (
                <button
                  key={ft}
                  onClick={() => { setFormType(ft); setErr(null); setTermIssues([]) }}
                  className={`rounded-[12px] border-2 bg-white p-4 text-left transition ${
                    formType === ft ? 'border-landlord bg-landlord/[0.04]' : 'border-line-strong hover:border-landlord/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[14px] font-bold">{title}</span>
                    {formType === ft && <span className="text-[13px] font-bold text-landlord">✓</span>}
                  </div>
                  <div className="mt-1 text-[12px] text-body-2">{sub}</div>
                </button>
              ))}
            </div>

            {formType === 'ontario_standard' ? (
              <>
                <SectionCard title={zh ? '1 · 当事人' : '1 · Parties'}>
                  <Input label={zh ? '房东法定名称' : 'Landlord legal name'} value={t.landlord_legal_name} onChange={(v) => patch({ landlord_legal_name: v })} required placeholder="e.g. 1000123 Ontario Inc. / Jason Han" />
                  <Input label={zh ? '租客姓名' : 'Tenant name'} value={t.tenant_names[0] || ''} onChange={(v) => patch({ tenant_names: [v, ...(t.tenant_names.slice(1))] })} required placeholder="e.g. Aanchal Bajaj" />
                  <Input label={zh ? '第二位租客（可选）' : 'Second tenant (optional)'} value={t.tenant_names[1] || ''} onChange={(v) => patch({ tenant_names: [t.tenant_names[0] || '', v] })} placeholder="e.g. Karaan Mehrottra" />
                  <Input label={zh ? '租客邮箱（发送签署邀请）' : 'Tenant email (signing invitation)'} value={tenantEmail} onChange={setTenantEmail} type="email" placeholder="tenant@email.com" />
                </SectionCard>

                <SectionCard title={zh ? '2 · 租赁单元' : '2 · Rental unit'}>
                  <Input label={zh ? '街道地址' : 'Street address'} value={t.unit.street} onChange={(v) => patch({ unit: { ...t.unit, street: v } })} required placeholder="100 Western Battery Rd" />
                  <div className="grid grid-cols-2 gap-3">
                    <Input label={zh ? '单元号' : 'Unit'} value={t.unit.unit || ''} onChange={(v) => patch({ unit: { ...t.unit, unit: v } })} placeholder="1207" />
                    <Input label={zh ? '城市' : 'City'} value={t.unit.city} onChange={(v) => patch({ unit: { ...t.unit, city: v } })} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Input label={zh ? '邮编' : 'Postal code'} value={t.unit.postal || ''} onChange={(v) => patch({ unit: { ...t.unit, postal: v } })} placeholder="M6K 0E5" />
                    <Input label={zh ? '车位' : 'Parking'} value={t.unit.parking || ''} onChange={(v) => patch({ unit: { ...t.unit, parking: v } })} placeholder={zh ? '例如 P2-117 一个' : 'e.g. 1 spot, P2-117'} />
                  </div>
                  <label className="flex items-center gap-2 text-[13px]">
                    <input type="checkbox" checked={!!t.unit.is_condo} onChange={(e) => patch({ unit: { ...t.unit, is_condo: e.target.checked } })} />
                    {zh ? '该单元为 condo（租客须遵守 condo 规约）' : 'Unit is in a condominium (tenant must comply with condo rules)'}
                  </label>
                </SectionCard>

                <SectionCard title={zh ? '3 · 期限与租金' : '3 · Term & rent'}>
                  <div className="grid grid-cols-2 gap-3">
                    <Input label={zh ? '起租日' : 'Start date'} value={t.term.start_date} onChange={(v) => patch({ term: { ...t.term, start_date: v } })} type="date" required />
                    <label className="block">
                      <span className="mb-1 block text-[12px] font-semibold text-body-2">{zh ? '租期类型' : 'Term type'}</span>
                      <select
                        value={t.term.type}
                        onChange={(e) => patch({ term: { ...t.term, type: e.target.value as 'fixed' | 'monthly' } })}
                        className="w-full rounded-[10px] border border-line-strong bg-white px-3 py-[10px] text-[13.5px]"
                      >
                        <option value="fixed">{zh ? '固定期限（常见 12 个月）' : 'Fixed term (usually 12 months)'}</option>
                        <option value="monthly">{zh ? '月租（month-to-month）' : 'Month-to-month'}</option>
                      </select>
                    </label>
                  </div>
                  {t.term.type === 'fixed' && (
                    <Input label={zh ? '到期日' : 'End date'} value={t.term.end_date || ''} onChange={(v) => patch({ term: { ...t.term, end_date: v } })} type="date" required />
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <Input label={zh ? '月租 (CAD)' : 'Monthly rent (CAD)'} value={t.rent.amount ? String(t.rent.amount) : ''} onChange={(v) => patch({ rent: { ...t.rent, amount: parseFloat(v) || 0 } })} type="number" required placeholder="2800" />
                    <Input label={zh ? '车位月费（可选）' : 'Parking / month (optional)'} value={t.rent.parking_amount ? String(t.rent.parking_amount) : ''} onChange={(v) => patch({ rent: { ...t.rent, parking_amount: parseFloat(v) || undefined } })} type="number" />
                  </div>
                  <Input label={zh ? '收款方' : 'Payable to'} value={t.rent.payable_to || ''} onChange={(v) => patch({ rent: { ...t.rent, payable_to: v } })} placeholder={t.landlord_legal_name || ''} />
                  <Input label={zh ? '付款方式' : 'Payment method'} value={t.rent.methods || ''} onChange={(v) => patch({ rent: { ...t.rent, methods: v } })} placeholder="e-Transfer / PAD" />
                </SectionCard>

                <SectionCard title={zh ? '4 · 水电与服务' : '4 · Utilities & services'}>
                  <div className="grid grid-cols-3 gap-3">
                    {(['electricity', 'heat', 'water'] as const).map((u) => (
                      <label key={u} className="block">
                        <span className="mb-1 block text-[12px] font-semibold text-body-2">
                          {u === 'electricity' ? (zh ? '电费' : 'Electricity') : u === 'heat' ? (zh ? '暖气' : 'Heat') : (zh ? '水费' : 'Water')}
                        </span>
                        <select
                          value={t.utilities[u]}
                          onChange={(e) => patch({ utilities: { ...t.utilities, [u]: e.target.value as 'landlord' | 'tenant' } })}
                          className="w-full rounded-[10px] border border-line-strong bg-white px-3 py-[10px] text-[13.5px]"
                        >
                          <option value="landlord">{zh ? '房东付' : 'Landlord'}</option>
                          <option value="tenant">{zh ? '租客付' : 'Tenant'}</option>
                        </select>
                      </label>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-4 text-[13px]">
                    {([['air_conditioning', zh ? '空调' : 'A/C'], ['laundry_in_unit', zh ? 'in-unit 洗衣' : 'In-unit laundry'], ['storage', zh ? '储物' : 'Storage'], ['guest_parking', zh ? '访客车位' : 'Guest parking']] as const).map(([k, label]) => (
                      <label key={k} className="flex items-center gap-1.5">
                        <input type="checkbox" checked={!!t.services[k]} onChange={(e) => patch({ services: { ...t.services, [k]: e.target.checked } })} />
                        {label}
                      </label>
                    ))}
                  </div>
                </SectionCard>

                <SectionCard title={zh ? '5 · 押金 · 保险 · 附加条款' : '5 · Deposits · insurance · additional terms'}>
                  <div className="grid grid-cols-2 gap-3">
                    <Input label={zh ? '末月租金押金 LMR（可选，≤1 个月租）' : "Rent deposit / LMR (optional, ≤ 1 month)"} value={t.rent_deposit ? String(t.rent_deposit) : ''} onChange={(v) => patch({ rent_deposit: parseFloat(v) || null })} type="number" />
                    <Input label={zh ? '钥匙押金（可退，≤实际成本）' : 'Key deposit (refundable, ≤ actual cost)'} value={t.key_deposit ? String(t.key_deposit) : ''} onChange={(v) => patch({ key_deposit: parseFloat(v) || null })} type="number" />
                  </div>
                  <label className="flex items-center gap-2 text-[13px]">
                    <input type="checkbox" checked={!!t.tenant_insurance_required} onChange={(e) => patch({ tenant_insurance_required: e.target.checked })} />
                    {zh ? '要求租客持有租客责任保险' : 'Require tenant liability insurance'}
                  </label>
                  <Input label={zh ? '吸烟规则（可选）' : 'Smoking rules (optional)'} value={t.smoking_rules || ''} onChange={(v) => patch({ smoking_rules: v })} placeholder={zh ? '例如：单元内及阳台禁烟' : 'e.g. No smoking in the unit or on the balcony'} />
                  <label className="block">
                    <span className="mb-1 block text-[12px] font-semibold text-body-2">{zh ? '附加条款（与 RTA 冲突的条款无效）' : 'Additional terms (terms conflicting with the RTA are void)'}</span>
                    <textarea
                      value={t.additional_terms || ''}
                      onChange={(e) => { patch({ additional_terms: e.target.value }); setTermIssues([]) }}
                      rows={4}
                      className="w-full rounded-[10px] border border-line-strong bg-white px-3 py-[10px] text-[13.5px] outline-none focus:border-landlord"
                      placeholder={zh ? '例如：租客负责铲雪；宠物造成的损坏由租客修复……' : 'e.g. Tenant handles snow removal; pet damage repaired by tenant…'}
                    />
                  </label>
                  {termIssues.length > 0 && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                      <div className="text-[12.5px] font-bold text-red-700">{zh ? '⚠ 以下内容不能写进安省租约：' : '⚠ These cannot go into an Ontario lease:'}</div>
                      <ul className="mt-1 list-disc pl-5 text-[12px] text-red-700">
                        {termIssues.map((i, n) => <li key={n}>{zh ? i.zh : i.en}</li>)}
                      </ul>
                    </div>
                  )}
                </SectionCard>
              </>
            ) : (
              <>
                <SectionCard title={zh ? '1 · 当事人' : '1 · Parties'}>
                  <Input label={zh ? '房东法定名称（Lessor）' : 'Landlord legal name (Lessor)'} value={tt.landlord_legal_name} onChange={(v) => patchT({ landlord_legal_name: v })} required placeholder="e.g. 1000123 Ontario Inc. / Jason Han" />
                  <Input label={zh ? '租客姓名（Lessee）' : 'Tenant name (Lessee)'} value={tt.tenant_names[0] || ''} onChange={(v) => patchT({ tenant_names: [v, ...(tt.tenant_names.slice(1))] })} required placeholder="e.g. Aanchal Bajaj" />
                  <Input label={zh ? '第二位租客（可选）' : 'Second tenant (optional)'} value={tt.tenant_names[1] || ''} onChange={(v) => patchT({ tenant_names: [tt.tenant_names[0] || '', v] })} placeholder="e.g. Karaan Mehrottra" />
                  <Input label={zh ? '租客邮箱（发送签署邀请）' : 'Tenant email (signing invitation)'} value={tenantEmail} onChange={setTenantEmail} type="email" placeholder="tenant@email.com" />
                </SectionCard>

                <SectionCard title={zh ? '2 · 租赁物业' : '2 · Premises'}>
                  <Input label={zh ? '街道地址' : 'Street address'} value={tt.premises.street} onChange={(v) => patchT({ premises: { ...tt.premises, street: v } })} required placeholder="100 Western Battery Rd" />
                  <div className="grid grid-cols-2 gap-3">
                    <Input label={zh ? '单元号' : 'Unit'} value={tt.premises.unit || ''} onChange={(v) => patchT({ premises: { ...tt.premises, unit: v } })} placeholder="1207" />
                    <Input label={zh ? '城市' : 'City'} value={tt.premises.city} onChange={(v) => patchT({ premises: { ...tt.premises, city: v } })} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Input label={zh ? '邮编' : 'Postal code'} value={tt.premises.postal || ''} onChange={(v) => patchT({ premises: { ...tt.premises, postal: v } })} placeholder="M6K 0E5" />
                    <Input label={zh ? '车位' : 'Parking'} value={tt.parking || ''} onChange={(v) => patchT({ parking: v })} placeholder={zh ? '例如 P2-117 一个' : 'e.g. 1 spot, P2-117'} />
                  </div>
                  <Input label={zh ? '储物柜（可选）' : 'Locker (optional)'} value={tt.locker || ''} onChange={(v) => patchT({ locker: v })} placeholder="e.g. B-22" />
                </SectionCard>

                <SectionCard title={zh ? '3 · 期限与租金' : '3 · Term & rent'}>
                  <div className="grid grid-cols-2 gap-3">
                    <Input label={zh ? '起租日' : 'Start date'} value={tt.term.start_date} onChange={(v) => patchT({ term: { ...tt.term, start_date: v } })} type="date" required />
                    <Input label={zh ? '到期日' : 'End date'} value={tt.term.end_date} onChange={(v) => patchT({ term: { ...tt.term, end_date: v } })} type="date" required />
                  </div>
                  <Input label={zh ? '租期描述（可选）' : 'Term description (optional)'} value={tt.term.duration_text || ''} onChange={(v) => patchT({ term: { ...tt.term, duration_text: v } })} placeholder={zh ? '例如 one (1) year' : 'e.g. one (1) year'} />
                  <div className="grid grid-cols-2 gap-3">
                    <Input label={zh ? '月租 (CAD)' : 'Monthly rent (CAD)'} value={tt.rent.amount ? String(tt.rent.amount) : ''} onChange={(v) => patchT({ rent: { ...tt.rent, amount: parseFloat(v) || 0 } })} type="number" required placeholder="2800" />
                    <Input label={zh ? '首笔租金支付日（可选）' : 'First rental payment date (optional)'} value={tt.rent.first_payment_date || ''} onChange={(v) => patchT({ rent: { ...tt.rent, first_payment_date: v } })} type="date" />
                  </div>
                  <Input label={zh ? '收款方' : 'Payable to'} value={tt.rent.payable_to || ''} onChange={(v) => patchT({ rent: { ...tt.rent, payable_to: v } })} placeholder={tt.landlord_legal_name || ''} />
                  <Input label={zh ? '付款方式' : 'Payment method'} value={tt.rent.methods || ''} onChange={(v) => patchT({ rent: { ...tt.rent, methods: v } })} placeholder="e-Transfer / PAD" />
                  <Input label={zh ? '要约有效期至（irrevocability，可选）' : 'Offer irrevocable until (optional)'} value={tt.irrevocability_date || ''} onChange={(v) => patchT({ irrevocability_date: v })} type="date" />
                </SectionCard>

                <SectionCard title={zh ? '4 · 押金与用途' : '4 · Deposit & use'}>
                  <div className="grid grid-cols-2 gap-3">
                    <Input label={zh ? '押金金额（≤1 个月租，抵首末月租）' : 'Deposit (≤ 1 month, toward first & last)'} value={tt.deposit.amount ? String(tt.deposit.amount) : ''} onChange={(v) => patchT({ deposit: { ...tt.deposit, amount: parseFloat(v) || null } })} type="number" />
                    <Input label={zh ? '押金持有方（Deposit Holder）' : 'Deposit Holder'} value={tt.deposit.holder || ''} onChange={(v) => patchT({ deposit: { ...tt.deposit, holder: v } })} placeholder={zh ? '例如 挂牌经纪公司 in trust' : 'e.g. listing brokerage, in trust'} />
                  </div>
                  <label className="flex items-center gap-2 text-[13px]">
                    <input type="checkbox" checked={tt.deposit.applied_to_first_last !== false} onChange={(e) => patchT({ deposit: { ...tt.deposit, applied_to_first_last: e.target.checked } })} />
                    {zh ? '押金抵作首月及末月租金' : 'Deposit credited toward first and last month\'s rent'}
                  </label>
                  <label className="flex items-center gap-2 text-[13px]">
                    <input type="checkbox" checked={tt.use.residential_only !== false} onChange={(e) => patchT({ use: { ...tt.use, residential_only: e.target.checked } })} />
                    {zh ? '仅限住宅用途' : 'Residential use only'}
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <Input label={zh ? '入住人（可选，默认为租客）' : 'Occupant names (optional, defaults to tenants)'} value={tt.use.occupant_names || ''} onChange={(v) => patchT({ use: { ...tt.use, occupant_names: v } })} />
                    <Input label={zh ? '入住人数' : 'Number of occupants'} value={tt.use.occupant_count ? String(tt.use.occupant_count) : ''} onChange={(v) => patchT({ use: { ...tt.use, occupant_count: parseInt(v) || undefined } })} type="number" />
                  </div>
                  <label className="flex items-center gap-2 text-[13px]">
                    <input type="checkbox" checked={tt.references_credit_ack !== false} onChange={(e) => patchT({ references_credit_ack: e.target.checked })} />
                    {zh ? '含推荐人与信用调查条款（以房东核准为条件）' : 'Include references & credit check clause (conditional on landlord approval)'}
                  </label>
                </SectionCard>

                <SectionCard title={zh ? '5 · 服务 · 物品 · Schedule A' : '5 · Services · chattels · Schedule A'}>
                  <div>
                    <span className="mb-1 block text-[12px] font-semibold text-body-2">{zh ? '租金包含的服务（勾选 = 房东付）' : 'Services included in rent (checked = landlord pays)'}</span>
                    <div className="flex flex-wrap gap-4 text-[13px]">
                      {([['gas', zh ? '燃气' : 'Gas'], ['hydro', zh ? '电费' : 'Hydro'], ['water', zh ? '水费' : 'Water'], ['heat', zh ? '暖气' : 'Heat'], ['air_conditioning', zh ? '空调' : 'A/C'], ['cable_tv', zh ? '有线电视' : 'Cable TV'], ['internet', zh ? '网络' : 'Internet'], ['laundry', zh ? '洗衣' : 'Laundry'], ['snow_removal', zh ? '铲雪' : 'Snow removal'], ['landscaping', zh ? '园艺' : 'Landscaping']] as const).map(([k, label]) => (
                        <label key={k} className="flex items-center gap-1.5">
                          <input type="checkbox" checked={!!tt.services[k]} onChange={(e) => patchT({ services: { ...tt.services, [k]: e.target.checked } })} />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>
                  <Input label={zh ? '包含的物品（chattels）' : 'Chattels included'} value={tt.chattels_included || ''} onChange={(v) => patchT({ chattels_included: v })} placeholder={zh ? '例如：冰箱、灶台、洗碗机、洗衣机、烘干机' : 'e.g. Fridge, stove, dishwasher, washer, dryer'} />
                  <Input label={zh ? '租用的固定装置（fixtures）' : 'Fixtures rented'} value={tt.fixtures_rented || ''} onChange={(v) => patchT({ fixtures_rented: v })} placeholder={zh ? '例如：热水器（租赁）' : 'e.g. Hot water tank (rental)'} />
                  <label className="block">
                    <span className="mb-1 block text-[12px] font-semibold text-body-2">{zh ? 'Schedule A 附加条款（与 RTA 冲突的条款无效）' : 'Schedule A — additional terms (terms conflicting with the RTA are void)'}</span>
                    <textarea
                      value={tt.schedule_a || ''}
                      onChange={(e) => { patchT({ schedule_a: e.target.value }); setTermIssues([]) }}
                      rows={4}
                      className="w-full rounded-[10px] border border-line-strong bg-white px-3 py-[10px] text-[13.5px] outline-none focus:border-landlord"
                      placeholder={zh ? '例如：租客负责铲雪；宠物造成的损坏由租客修复……' : 'e.g. Tenant handles snow removal; pet damage repaired by tenant…'}
                    />
                  </label>
                  {termIssues.length > 0 && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                      <div className="text-[12.5px] font-bold text-red-700">{zh ? '⚠ 以下内容不能写进安省租约：' : '⚠ These cannot go into an Ontario lease:'}</div>
                      <ul className="mt-1 list-disc pl-5 text-[12px] text-red-700">
                        {termIssues.map((i, n) => <li key={n}>{zh ? i.zh : i.en}</li>)}
                      </ul>
                    </div>
                  )}
                </SectionCard>
              </>
            )}

            {err && <div className="rounded-lg bg-red-50 px-4 py-3 text-[13px] text-red-700">{err}</div>}

            <div className="flex gap-2">
              <button onClick={save} disabled={saving} className="sl-btn-primary !px-6 !py-[12px] !text-[14px]">
                {saving ? (zh ? '保存中…' : 'Saving…') : (zh ? '保存草稿 → 下一步发送签署' : 'Save draft → next: send for signing')}
              </button>
            </div>
          </div>
        )}
      </div>
    </WorkspaceShell>
  )
}

export default function NewLeasePage() {
  return (
    <Suspense>
      <NewLeasePageInner />
    </Suspense>
  )
}
