'use client'

export const runtime = 'edge'

// Draft a lease on the Ontario Standard Form of Lease (system #1 of two —
// RECO/TRREB forms come later behind the same form_type switch). Saving
// creates a draft lease_documents row; the detail page then sends it to the
// tenant for online signing.
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import WorkspaceShell from '@/components/WorkspaceShell'
import OntarioLeaseDoc from '@/components/lease/OntarioLeaseDoc'
import { emptyOntarioTerms, checkAdditionalTerms, type OntarioLeaseTerms } from '@/lib/lease/ontario'
import { supabase } from '@/lib/supabase'
import { useLandlord } from '@/lib/useLandlord'
import { useT } from '@/lib/i18n'

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

export default function NewLeasePage() {
  const router = useRouter()
  const { lang } = useT()
  const zh = lang === 'zh'
  const { landlord, loading: authLoading } = useLandlord()

  const [t, setT] = useState<OntarioLeaseTerms>(emptyOntarioTerms())
  const [tenantEmail, setTenantEmail] = useState('')
  const [preview, setPreview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [termIssues, setTermIssues] = useState<{ zh: string; en: string }[]>([])

  const patch = (p: Partial<OntarioLeaseTerms>) => setT((prev) => ({ ...prev, ...p }))

  const save = async () => {
    if (saving || !landlord) return
    if (!t.landlord_legal_name.trim() || !t.tenant_names[0]?.trim() || !t.unit.street.trim() || !t.rent.amount || !t.term.start_date) {
      setErr(zh ? '请填写：房东法定名称、租客姓名、地址、月租、起租日' : 'Required: landlord legal name, tenant name, address, rent, start date')
      return
    }
    if (t.term.type === 'fixed' && !t.term.end_date) {
      setErr(zh ? '固定期限租约需要到期日' : 'A fixed-term lease needs an end date')
      return
    }
    // RTA/OHRC guardrail on the free-text terms — void terms don't get drafted.
    const check = checkAdditionalTerms(t.additional_terms || '')
    if (!check.ok) {
      setTermIssues(check.issues)
      setErr(zh ? '附加条款包含无效/违法内容，请修改后再保存（见下方说明）' : 'Additional terms contain void/illegal content — fix them first (see below)')
      return
    }
    setErr(null)
    setTermIssues([])
    setSaving(true)
    const { data, error } = await supabase
      .from('lease_documents')
      .insert({
        landlord_id: landlord.landlordId,
        form_type: 'ontario_standard',
        status: 'draft',
        terms: t,
        tenant_name: t.tenant_names.filter(Boolean).join(', '),
        tenant_email: tenantEmail.trim() || null,
        unit_label: [t.unit.unit ? `Unit ${t.unit.unit}` : null, t.unit.street].filter(Boolean).join(' · '),
        monthly_rent: t.rent.amount,
        start_date: t.term.start_date,
        end_date: t.term.type === 'fixed' ? t.term.end_date : null,
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
              ONTARIO STANDARD LEASE · {zh ? '起草' : 'DRAFT'}
            </div>
            <h1 className="mt-1 text-[24px] font-bold tracking-tight sm:text-[30px]">
              {zh ? '起草安省标准租约' : 'Draft an Ontario Standard Lease'}
            </h1>
            <p className="mt-1 text-[13px] text-body-2">
              {zh
                ? '按安省法定标准租约（2229E）结构填写。保存后可发送给租客在线签署，签完双方可随时下载 PDF 备份。'
                : 'Follows the mandatory Ontario Standard Form of Lease (2229E). Save, send to your tenant for online signing, then both parties can download PDF backups anytime.'}
            </p>
          </div>
          <button
            onClick={() => setPreview((v) => !v)}
            className="rounded-[10px] border border-line-strong bg-white px-4 py-[10px] text-[13px] font-semibold text-body transition hover:border-brand hover:text-brand"
          >
            {preview ? (zh ? '← 继续编辑' : '← Keep editing') : (zh ? '预览文档' : 'Preview document')}
          </button>
        </div>

        {preview ? (
          <div className="mt-6 sl-card overflow-hidden !p-0">
            <OntarioLeaseDoc terms={t} status="draft" />
          </div>
        ) : (
          <div className="mt-6 grid gap-4">
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
