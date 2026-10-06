'use client'

export const runtime = 'edge'

import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useState, useEffect, useCallback } from 'react'
import WorkspaceShell from '@/components/WorkspaceShell'
import { SampleBanner } from '@/components/SampleNotice'
import OntarioLeaseDoc from '@/components/lease/OntarioLeaseDoc'
import TrrebLeaseDoc from '@/components/lease/TrrebLeaseDoc'
import type { OntarioLeaseTerms, LeaseSignature } from '@/lib/lease/ontario'
import type { TrrebLeaseTerms } from '@/lib/lease/trreb'
import { supabase } from '@/lib/supabase'
import { getSupabaseBrowser } from '@/lib/supabase'
import { useAIName } from '@/lib/aiName'
import { useT, type Lang } from '@/lib/i18n'
import { leaseActionErrorText, leaseErrorNeedsReload, leaseHasTerms, leaseIsEditableDraft, leaseIsRecordOnly, leaseIsSendable, leaseIsSignable, leaseIsWithdrawable, leaseTermsRenderable } from '@/lib/lease/leaseState'
import { provinceName } from '@/lib/listingDisplay'
import { leaseProvince, unitTermsOf } from '@/lib/provinces/lease'
import type { ProvinceCode, ProvinceRow } from '@/lib/provinces/detect'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ── Real lease detail (uuid ids): view · send for signing · countersign ·
//    download PDF backup · permanent tenant link ─────────────────────────────
type DbLease = {
  id: string
  form_type: string
  status: string
  terms: OntarioLeaseTerms | TrrebLeaseTerms
  tenant_name: string | null
  tenant_email: string | null
  unit_label: string | null
  sign_token: string | null
  sent_at: string | null
  landlord_signature: LeaseSignature | null
  tenant_signature: LeaseSignature | null
  signed_at: string | null
  pdf_path: string | null
  application_id: string | null
  listing_id: string | null
}

function RealLeaseDetail({ id }: { id: string }) {
  const { lang } = useT()
  const zh = lang === 'zh'
  const aiName = useAIName()
  const router = useRouter()
  const [lease, setLease] = useState<DbLease | null | 'missing'>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [signName, setSignName] = useState('')
  // The household this lease is the current terms of (its uploaded file lives in that household's folder).
  const [householdId, setHouseholdId] = useState<string | null>(null)
  const [fileUrl, setFileUrl] = useState<string | null | 'denied'>(null)
  // The province of the home (2026-10-02 · 「外省的要查外省的法规，不要用安省的法规和说法」): an imported
  // or quick-entered record for a home outside Ontario is not offered Ontario's standard lease.
  const [province, setProvince] = useState<ProvinceCode>('ON')

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('lease_documents')
      .select('id, form_type, status, terms, tenant_name, tenant_email, unit_label, sign_token, sent_at, landlord_signature, tenant_signature, signed_at, pdf_path, application_id, listing_id')
      .eq('id', id)
      .maybeSingle<DbLease>()
    if (error || !data) { setLease('missing'); return }
    // The household (its file folder and address) and the linked listing are read before the page
    // renders, so a record for a home outside Ontario never shows Ontario's lease wording first.
    const [{ data: hh }, { data: lst }] = await Promise.all([
      supabase.from('households').select('id, address, city').eq('current_lease_id', data.id).limit(1),
      data.listing_id ? supabase.from('listings').select('address, city, postal_code, province').eq('id', data.listing_id).maybeSingle() : Promise.resolve({ data: null }),
    ])
    const home = ((hh ?? []) as { id: string; address: string | null; city: string | null }[])[0] ?? null
    // One definition of a lease's province (lib/provinces/lease): the planner, the executor and the rail use the same chain.
    setProvince(leaseProvince({ listing: (lst as ProvinceRow | null) ?? null, household: home, unit: unitTermsOf(data.terms), unit_label: data.unit_label }))
    setHouseholdId(home?.id ?? null)
    setLease(data)
  }, [id])
  useEffect(() => { void load() }, [load])

  // The imported lease file (households migration stores it in lease_documents.pdf_path, which no page showed).
  const pdfPath = lease && lease !== 'missing' ? lease.pdf_path : null
  useEffect(() => {
    if (!pdfPath) { setFileUrl(null); return }
    let cancelled = false
    supabase.storage.from('tenancy-files').createSignedUrl(pdfPath, 600).then(({ data, error }) => {
      if (!cancelled) setFileUrl(error || !data?.signedUrl ? 'denied' : data.signedUrl)
    })
    return () => { cancelled = true }
  }, [pdfPath])

  const withToken = async (fn: (token: string) => Promise<void>) => {
    if (busy) return
    setBusy(true); setErr(null); setMsg(null)
    try {
      const { data: sess } = await getSupabaseBrowser().auth.getSession()
      const token = sess?.session?.access_token
      if (!token) { setErr(zh ? '请先登录' : 'Please sign in'); return }
      await fn(token)
    } finally {
      setBusy(false)
    }
  }

  const sendForSigning = () => withToken(async (token) => {
    const res = await fetch('/api/lease/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ lease_id: id }),
    })
    const j = (await res.json()) as { ok?: boolean; sent_to?: string; error?: string }
    if (j.ok) { setMsg(zh ? `✅ 签署邀请已发送至 ${j.sent_to}` : `✅ Signing invitation sent to ${j.sent_to}`); await load() }
    else {
      setErr(leaseActionErrorText(j.error || 'send failed', zh))
      if (leaseErrorNeedsReload(j.error)) await load()
    }
  })

  // An unsigned lease can be deleted (RLS: leases_landlord_delete). For a sent one this is a
  // withdrawal: the tenant's signing link stops working.
  const removeLease = async (sent: boolean) => {
    if (busy) return
    const ok = typeof window === 'undefined' || window.confirm(sent
      ? (zh ? '撤回并删除这份已发送、尚未签署的租约？租客手上的签署链接会失效。' : 'Withdraw and delete this sent, unsigned lease? The tenant’s signing link will stop working.')
      : (zh ? '删除这份草稿？' : 'Delete this draft?'))
    if (!ok) return
    setBusy(true); setErr(null); setMsg(null)
    const { data, error } = await supabase
      .from('lease_documents')
      .delete()
      .eq('id', id)
      .in('status', ['draft', 'sent'])
      .is('signed_at', null)
      .is('landlord_signature', null)
      .is('tenant_signature', null)
      .select('id')
    setBusy(false)
    if (error || !(data ?? []).length) { setErr(error?.message || (zh ? '没能删除：这份租约可能已被签署。' : 'Could not delete: the lease may have been signed.')); await load(); return }
    router.push('/landlord/leases')
  }

  const countersign = () => withToken(async (token) => {
    if (signName.trim().length < 2) { setErr(zh ? '请输入你的法定全名' : 'Enter your full legal name'); return }
    const res = await fetch('/api/lease/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ lease_id: id, name: signName.trim() }),
    })
    const j = (await res.json()) as { ok?: boolean; fully_executed?: boolean; error?: string }
    if (j.ok) {
      setMsg(j.fully_executed
        ? (zh ? '✅ 双方签署完成 — 租客已收到永久查看链接邮件' : '✅ Fully executed — the tenant was emailed their permanent link')
        : (zh ? '✅ 你已签字' : '✅ You have signed'))
      await load()
    } else {
      setErr(leaseActionErrorText(j.error || 'sign failed', zh))
      if (leaseErrorNeedsReload(j.error)) await load()
    }
  })

  if (lease === null) {
    return (
      <WorkspaceShell role="landlord" hideAside>
        <div className="flex min-h-[60vh] items-center justify-center">
          <span className="orb landlord pulse h-12 w-12" style={{ color: '#047857' }} />
        </div>
      </WorkspaceShell>
    )
  }
  if (lease === 'missing') {
    return (
      <WorkspaceShell role="landlord" hideAside>
        <div className="py-20 text-center">
          <h1 className="text-[24px] font-bold">{zh ? '租约未找到' : 'Lease not found'}</h1>
          <Link href="/landlord/leases" className="mt-4 inline-block font-semibold text-brand hover:underline">
            {zh ? '← 返回租约列表' : '← Back to leases'}
          </Link>
        </div>
      </WorkspaceShell>
    )
  }

  const l = lease
  const fullySigned = !!l.landlord_signature && !!l.tenant_signature
  const tenantLink = l.sign_token ? `${typeof window !== 'undefined' ? window.location.origin : 'https://www.stayloop.ai'}/lease/sign/${l.sign_token}` : null
  // A document only when the form's renderer can draw it: every nested block it reads must be
  // there (site test 2026-10-02 — a row without `contact` crashed the page). Anything less falls
  // back to the record-only view below, never to the renderer.
  const hasTerms = leaseTermsRenderable(l.terms, l.form_type)
  // Terms that name a landlord and a rent but are missing blocks: not a quick entry, an incomplete document.
  const incompleteTerms = leaseHasTerms(l.terms) && !hasTerms
  // What this row allows (lib/lease/leaseState): imported and quick-entered records have no
  // document to send or sign — they get their file and a "draft a standard lease" action instead.
  const sendable = leaseIsSendable(l) && hasTerms
  const signable = leaseIsSignable(l) && hasTerms
  const editableDraft = leaseIsEditableDraft(l)
  const withdrawable = leaseIsWithdrawable(l)
  const recordOnly = leaseIsRecordOnly(l) || !hasTerms
  // Unknown/legacy form_type falls back to the Ontario renderer (back-compat).
  const isTrreb = l.form_type === 'trreb'
  // A record (no Stayloop document) for a home outside Ontario: no Ontario form named, no "draft the
  // standard lease" offer — the new-lease page shows that province's lease-form rules instead.
  const outside = recordOnly && province !== 'ON'
  const provName = provinceName(province, zh)

  return (
    <WorkspaceShell role="landlord" hideAside>
      <div className="mx-auto max-w-[900px] print:max-w-none">
        <div className="print:hidden">
          <Link href="/landlord/leases" className="font-mono text-[12px] text-body-3 hover:text-body">
            {zh ? '← 所有租约' : '← All leases'}
          </Link>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-landlord">
                {outside ? `${provName} · ${zh ? '租约记录' : 'LEASE RECORD'}` : <>{isTrreb ? 'TRREB FORM 400' : 'ONTARIO STANDARD LEASE'} · {l.status.toUpperCase()}</>}
              </div>
              <h1 className="mt-1 text-[22px] font-bold tracking-tight sm:text-[28px]">
                {l.tenant_name || '—'} · {l.unit_label || '—'}
              </h1>
            </div>
            <div className="flex flex-wrap gap-2">
              {hasTerms && (
                <button
                  onClick={() => window.print()}
                  className="rounded-[10px] border border-line-strong bg-white px-4 py-[10px] text-[13px] font-semibold text-body transition hover:border-brand hover:text-brand"
                >
                  {zh ? '下载 PDF 备份' : 'Download PDF backup'}
                </button>
              )}
              {editableDraft && (
                <Link href={`/landlord/leases/${l.id}/edit`} className="rounded-[10px] border border-line-strong bg-white px-4 py-[10px] text-[13px] font-semibold text-body transition hover:border-brand hover:text-brand" data-testid="lease-edit-draft">
                  {zh ? '编辑草稿' : 'Edit draft'}
                </Link>
              )}
              {withdrawable && (
                <button onClick={() => void removeLease(!!l.sent_at)} disabled={busy} className="rounded-[10px] border border-line-strong bg-white px-4 py-[10px] text-[13px] font-semibold text-body-3 transition hover:border-red-400 hover:text-red-600 disabled:opacity-40" data-testid="lease-delete">
                  {l.sent_at ? (zh ? '撤回并删除' : 'Withdraw & delete') : (zh ? '删除草稿' : 'Delete draft')}
                </button>
              )}
              {sendable && (
                <button onClick={sendForSigning} disabled={busy || !l.tenant_email} className="sl-btn-primary !px-5 !py-[10px] !text-[13px] disabled:opacity-40">
                  {busy ? '…' : l.sent_at ? (zh ? '重发签署邀请' : 'Resend signing invite') : (zh ? '发送给租客签署 →' : 'Send to tenant for signing →')}
                </button>
              )}
            </div>
          </div>

          {recordOnly && (
            <div className="mt-4 rounded-lg border border-line-strong bg-white px-4 py-3 text-[13px] text-body" data-testid="lease-record-only">
              <div className="font-semibold">{l.status === 'imported' ? (zh ? '这是导入的已签租约记录' : 'This is an imported record of a signed lease') : incompleteTerms ? (zh ? '这份租约的条款文档不完整，无法在这里显示' : 'This lease’s terms document is incomplete and cannot be shown here') : (zh ? '这是快速录入的租约记录' : 'This is a quick-entered lease record')}</div>
              <p className="mt-1 text-[12.5px] text-body-2">
                {outside ? (zh ? `它没有在 Stayloop 上签署的条款文档。这套房源在${provName}，Stayloop 不能为它在线起草或电子签署租约；${provName}的租约规定见下面的链接。` : `It has no terms document signed on Stayloop. This home is in ${provName}: Stayloop cannot draft or e-sign a lease for it online — ${provName}'s lease rules are behind the link below.`) : incompleteTerms ? (zh ? '条款缺少部分内容（例如通知地址或水电费由谁支付），所以不能在线显示、发送或签署。租约状态与签署记录照常保留。要给租客一份完整、可在线签署的安省标准租约，从这份记录起草一份即可（会预填租客、地址、租金和日期）。' : 'Parts of the terms are missing (for example the notice address or who pays utilities), so the document cannot be shown, sent or signed online. The lease status and signature record are kept as they are. To give the tenant a complete Ontario standard lease to sign online, draft one from this record (tenant, address, rent and dates are prefilled).') : zh ? '它没有在 Stayloop 上签署的条款文档，所以不能在线发送或签署。要给租客一份可在线签署的安省标准租约，从这份记录起草一份即可（会预填租客、地址、租金和日期）。' : 'It has no terms document signed on Stayloop, so it cannot be sent or signed online. To give the tenant an Ontario standard lease to sign online, draft one from this record (tenant, address, rent and dates are prefilled).'}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                {l.pdf_path && (
                  fileUrl && fileUrl !== 'denied'
                    ? <a href={fileUrl} target="_blank" rel="noreferrer" className="font-semibold text-brand underline underline-offset-2" data-testid="lease-imported-file">{zh ? '打开导入的租约文件 ↗' : 'Open the imported lease file ↗'}</a>
                    : fileUrl === 'denied'
                      ? <span className="text-[12.5px] text-body-3">{zh ? '导入的文件只对在管租约的成员可见' : 'The imported file is visible to members of the managed tenancy only'}{householdId ? <> · <Link href={`/h/${householdId}`} className="text-brand underline underline-offset-2">{zh ? '打开在管租约' : 'Open the tenancy'}</Link></> : null}</span>
                      : <span className="text-[12.5px] text-body-3">{zh ? '正在准备文件…' : 'Preparing the file…'}</span>
                )}
                <Link href={`/landlord/leases/new?from_lease=${l.id}`} className="sl-btn-primary !px-4 !py-[8px] !text-[12.5px]" data-testid="lease-draft-standard">
                  {outside ? (zh ? `${provName}的租约规定 →` : `${provName}'s lease rules →`) : zh ? '起草这份租约的标准租约 →' : 'Draft a standard lease for this tenancy →'}
                </Link>
              </div>
            </div>
          )}

          {sendable && !l.tenant_email && !l.tenant_signature && (
            <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-[12.5px] text-amber-800">
              {zh ? '此租约没有租客邮箱，无法发送在线签署邀请。' : 'This lease has no tenant email on file — online signing invitation can’t be sent.'}
            </div>
          )}
          {msg && <div className="mt-3 rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 text-[12.5px] text-green-800">{msg}</div>}
          {err && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-[12.5px] text-red-700">{err}</div>}

          {/* Landlord countersign — only a real document in the signing flow */}
          {signable && !l.landlord_signature && (l.tenant_signature || l.status !== 'draft') && (
            <div className="mt-4 sl-card border-2 border-landlord p-4">
              <div className="text-[14px] font-bold">
                {l.tenant_signature
                  ? (zh ? '租客已签字 — 回签以完成签约' : 'Tenant has signed — countersign to complete')
                  : (zh ? '你可以先行签字' : 'You can sign first')}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <input
                  value={signName}
                  onChange={(e) => setSignName(e.target.value)}
                  placeholder={zh ? '法定全名' : 'Full legal name'}
                  className="min-w-[220px] flex-1 rounded-[10px] border border-line-strong bg-white px-3 py-[10px] font-serif text-[15px] italic outline-none focus:border-landlord"
                />
                <button onClick={countersign} disabled={busy} className="sl-btn-primary !px-5 !py-[10px] !text-[13px]">
                  {busy ? '…' : (zh ? '签字' : 'Sign')}
                </button>
              </div>
            </div>
          )}

          {tenantLink && (
            <div className="mt-4 rounded-lg bg-surface-chip px-4 py-3 text-[12px] text-body-2">
              <span className="font-mono font-bold uppercase tracking-eyebrow text-body-3">{zh ? '租客永久链接' : 'Tenant permanent link'}</span>
              <div className="mt-1 break-all font-mono text-[11.5px]">{tenantLink}</div>
              <div className="mt-1 text-body-3">
                {zh ? '签署前用于签字；签署后长期有效，租客可随时查看与下载。' : 'Used for signing before execution; stays valid forever for viewing and downloads after.'}
              </div>
            </div>
          )}
          {fullySigned && (
            <div className="mt-4 rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-[13px] text-green-800">
              {zh ? `✓ 双方已签署（${l.signed_at?.slice(0, 10)}）· 文档已永久在线保存` : `✓ Fully executed (${l.signed_at?.slice(0, 10)}) · document retained online permanently`}
            </div>
          )}
        </div>

        <div className="mt-6 sl-card overflow-hidden !p-0 print:mt-0 print:border-none print:shadow-none">
          {hasTerms ? (
            isTrreb ? (
              <TrrebLeaseDoc
                terms={l.terms as TrrebLeaseTerms}
                landlordSignature={l.landlord_signature}
                tenantSignature={l.tenant_signature}
                status={l.status}
              />
            ) : (
              <OntarioLeaseDoc
                terms={l.terms as OntarioLeaseTerms}
                landlordSignature={l.landlord_signature}
                tenantSignature={l.tenant_signature}
                status={l.status}
              />
            )
          ) : (
            <div className="p-8 text-center text-[13.5px] text-body-3">
              {outside
                ? (zh ? `这份租约没有完整的条款文档（导入或快速录入的记录）。${aiName} 用它跟踪租期。` : `This lease has no full terms document (an imported or quick-entered record). ${aiName} uses it to track the term.`)
                : zh
                ? `这份租约没有完整的条款文档${incompleteTerms ? '' : '（导入或快速录入的记录）'}。${aiName} 用它跟踪租期与续约窗口；如需可在线签署的标准租约，请用上面的「起草这份租约的标准租约」。`
                : `This lease has no full terms document${incompleteTerms ? '' : ' (an imported or quick-entered record)'}. ${aiName} uses it to track the term and renewal window; for a standard lease to sign online, use “Draft a standard lease for this tenancy” above.`}
            </div>
          )}
        </div>
      </div>
    </WorkspaceShell>
  )
}

const LEASES: Record<string, {
  id: string; tenant: string; unit: string; rent: number
  start: string; end: string; status: string; onTime: string
  email: string; phone: string
  terms: { zh: string; en: string }[]
  payments: { date: string; amount: number; status: 'paid' | 'late' | 'pending' }[]
}> = {
  'L-202': {
    id: 'L-202', tenant: 'Mia Chen', unit: 'Unit 1207 · King West',
    rent: 2800, start: '2025-08-01', end: '2026-07-31', status: 'active',
    onTime: '11/11', email: 'm.chen@email.com', phone: '(416) 555-0142',
    terms: [
      { zh: 'Ontario LTB 标准租约', en: 'Ontario LTB Standard Lease' },
      { zh: '月租 $2,800 · 每月 1 日到期', en: 'Monthly rent $2,800 · due on the 1st' },
      { zh: '含 1 个车位（P2-117）', en: 'Includes 1 parking spot (P2-117)' },
      { zh: '不允许转租（未经书面同意）', en: 'No subletting without written consent' },
      { zh: '宠物：允许（≤25lb）', en: 'Pets: allowed (≤25lb)' },
    ],
    payments: [
      { date: '2026-05-01', amount: 2800, status: 'paid' },
      { date: '2026-04-01', amount: 2800, status: 'paid' },
      { date: '2026-03-01', amount: 2800, status: 'paid' },
      { date: '2026-02-01', amount: 2800, status: 'paid' },
      { date: '2026-01-01', amount: 2800, status: 'paid' },
      { date: '2025-12-01', amount: 2800, status: 'paid' },
    ],
  },
  'L-205': {
    id: 'L-205', tenant: 'Thompson', unit: 'Liberty Village 2B',
    rent: 3200, start: '2025-07-01', end: '2026-06-30', status: 'active',
    onTime: '12/12', email: 'thompson@email.com', phone: '(416) 555-0298',
    terms: [
      { zh: 'Ontario LTB 标准租约', en: 'Ontario LTB Standard Lease' },
      { zh: '月租 $3,200 · 每月 1 日到期', en: 'Monthly rent $3,200 · due on the 1st' },
      { zh: '含储物柜 B-22', en: 'Includes storage locker B-22' },
      { zh: '不允许吸烟', en: 'No smoking' },
      { zh: '宠物：不允许', en: 'Pets: not allowed' },
    ],
    payments: [
      { date: '2026-06-01', amount: 3200, status: 'paid' },
      { date: '2026-05-01', amount: 3200, status: 'paid' },
      { date: '2026-04-01', amount: 3200, status: 'paid' },
      { date: '2026-03-01', amount: 3200, status: 'paid' },
      { date: '2026-02-01', amount: 3200, status: 'paid' },
      { date: '2026-01-01', amount: 3200, status: 'paid' },
    ],
  },
  'L-198': {
    id: 'L-198', tenant: 'Kevin Tran', unit: '15 Hanna Ave Loft 312',
    rent: 2890, start: '2025-04-01', end: '2026-03-31', status: 'expired',
    onTime: '12/12', email: 'kevin.tran@email.com', phone: '(647) 555-0183',
    terms: [
      { zh: 'Ontario LTB 标准租约（已转月租）', en: 'Ontario LTB Standard Lease (now month-to-month)' },
      { zh: '月租 $2,890 → $2,970（+$80 已同意）', en: 'Monthly rent $2,890 → $2,970 (+$80 agreed)' },
      { zh: '含 1 个车位', en: 'Includes 1 parking spot' },
      { zh: '宠物：允许', en: 'Pets: allowed' },
    ],
    payments: [
      { date: '2026-05-01', amount: 2970, status: 'paid' },
      { date: '2026-04-01', amount: 2970, status: 'paid' },
      { date: '2026-03-01', amount: 2890, status: 'paid' },
      { date: '2026-02-01', amount: 2890, status: 'paid' },
      { date: '2026-01-01', amount: 2890, status: 'paid' },
      { date: '2025-12-01', amount: 2890, status: 'paid' },
    ],
  },
  'L-209': {
    id: 'L-209', tenant: 'Anna L.', unit: '432 Brunswick Ave',
    rent: 4250, start: '2026-06-01', end: '2027-05-31', status: 'pending',
    onTime: '-', email: 'anna.l@email.com', phone: '(416) 555-0377',
    terms: [
      { zh: 'Ontario LTB 标准租约（待签字）', en: 'Ontario LTB Standard Lease (awaiting signature)' },
      { zh: '月租 $4,250 · 每月 1 日到期', en: 'Monthly rent $4,250 · due on the 1st' },
      { zh: '含 2 个车位', en: 'Includes 2 parking spots' },
      { zh: '宠物：允许（≤30lb）', en: 'Pets: allowed (≤30lb)' },
      { zh: '首月 + 末月预付', en: 'First and last month prepaid' },
    ],
    payments: [],
  },
}

export default function LeaseDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { lang } = useT()
  const zh = lang === 'zh'

  // Real leases carry uuid ids → the live Ontario-Standard-Lease detail
  // (view / send for signing / countersign / PDF download). The L-xxx demo
  // fixtures below stay for the design-canon walkthrough.
  if (UUID_RE.test(id)) return <RealLeaseDetail id={id} />

  const lease = LEASES[id]

  if (!lease) {
    return (
      <WorkspaceShell role="landlord">
        <div className="py-20 text-center">
          <h1 className="text-[24px] font-bold">{zh ? '租约未找到' : 'Lease not found'}</h1>
          <p className="mt-2 text-body-2">{zh ? '请检查租约编号是否正确。' : 'Please check the lease ID.'}</p>
          <Link href="/landlord/leases" className="mt-4 inline-block text-brand font-semibold hover:underline">
            {zh ? '← 返回租约列表' : '← Back to leases'}
          </Link>
        </div>
      </WorkspaceShell>
    )
  }

  const statusMap: Record<string, { bg: string; fg: string; label: { zh: string; en: string } }> = {
    active: { bg: 'rgba(4,120,87,0.10)', fg: '#047857', label: { zh: '生效中', en: 'Active' } },
    pending: { bg: 'rgba(217,119,6,0.10)', fg: '#B45309', label: { zh: '待签字', en: 'Pending' } },
    expired: { bg: 'rgba(113,113,122,0.10)', fg: '#52525B', label: { zh: '已到期', en: 'Expired' } },
  }
  const st = statusMap[lease.status]
  const totalPaid = lease.payments.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0)

  return (
    <WorkspaceShell role="landlord" aside={<DetailAside lease={lease} lang={lang} />}>
      <SampleBanner
        zh={zh}
        note={{ zh: '这是设计样例租约；录入真实租约后，详情页会显示可签署、可下载的安省标准租约。', en: 'This is a design-canon sample lease; once you enter a real lease, its detail page shows the signable, downloadable Ontario Standard Lease.' }}
      />
      <div className="mb-4">
        <Link href="/landlord/leases" className="text-[13px] text-brand font-semibold hover:underline">
          {zh ? '← 所有租约' : '← All leases'}
        </Link>
      </div>

      <div className="mb-9">
        <div className="flex flex-wrap items-center gap-3">
          <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-landlord">
            LEASE · {lease.id}
          </div>
          <span
            className="font-mono"
            style={{ background: st.bg, color: st.fg, padding: '3px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, letterSpacing: '0.10em' }}
          >
            {st.label[lang]}
          </span>
        </div>
        <h1 className="mt-2 text-[24px] font-bold tracking-tight sm:text-[36px]">
          {lease.tenant} · {lease.unit}
        </h1>
        <p className="mt-1 text-[13.5px] text-body-2">
          {lease.start} → {lease.end} · ${lease.rent.toLocaleString()}/{zh ? '月' : 'mo'}
        </p>
      </div>

      {/* KPI strip */}
      <div className="grid gap-3 sm:grid-cols-4">
        <KpiCard label={zh ? '月租' : 'Monthly rent'} value={`$${lease.rent.toLocaleString()}`} accent="#047857" />
        <KpiCard label={zh ? '按时率' : 'On-time rate'} value={lease.onTime} accent="#171717" />
        <KpiCard label={zh ? '累计已收' : 'Total collected'} value={`$${totalPaid.toLocaleString()}`} accent="#2563EB" />
        <KpiCard label={zh ? '剩余月数' : 'Months left'} value={lease.status === 'expired' ? (zh ? '月租中' : 'M-to-M') : `${Math.max(0, monthsBetween(new Date().toISOString().slice(0, 10), lease.end))}`} accent="#B45309" />
      </div>

      {/* Lease terms */}
      <section className="mt-10 sl-card p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
              {zh ? '租约条款' : 'Lease terms'}
            </div>
            <h2 className="mt-1 text-[20px] font-bold tracking-tight">
              {zh ? 'Ontario LTB 标准租约' : 'Ontario LTB Standard Lease'}
            </h2>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => window.print()}
              className="rounded-[10px] border border-line-strong bg-white px-4 py-[8px] text-[12.5px] font-semibold text-body transition hover:border-brand hover:text-brand"
            >
              {zh ? '下载 PDF' : 'Download PDF'}
            </button>
            {lease.status === 'active' && (
              <Link
                href={`/landlord/agent?prompt=${encodeURIComponent(zh ? `帮我起草 ${lease.tenant} 的续约函，当前月租 $${lease.rent}` : `Help me draft a renewal letter for ${lease.tenant}, current rent $${lease.rent}`)}&send=1`}
                className="sl-btn-primary !px-4 !py-[8px] !text-[12.5px]"
              >
                {zh ? '起草续约 →' : 'Draft renewal →'}
              </Link>
            )}
          </div>
        </div>
        <ul className="mt-5 space-y-2 border-t border-line-divider pt-4">
          {lease.terms.map((t, i) => (
            <li key={i} className="flex items-start gap-2 text-[13.5px]">
              <span className="mt-[3px] flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[10px]" style={{ background: 'rgba(4,120,87,0.12)', color: '#047857' }}>✓</span>
              <span>{t[lang]}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Payment history */}
      <section className="mt-10 sl-card overflow-hidden">
        <div className="border-b border-line-divider px-6 py-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-[16px] font-bold tracking-tight">{zh ? '缴租记录' : 'Payment history'}</h3>
          <span className="font-mono text-[11px] uppercase tracking-eyebrow text-body-3">
            {zh ? `共 ${lease.payments.length} 笔` : `${lease.payments.length} total`}
          </span>
        </div>
        {lease.payments.length === 0 ? (
          <div className="px-6 py-8 text-center text-[13.5px] text-body-3">
            {zh ? '暂无缴租记录 — 租约签字后自动开始。' : 'No payment records yet — starts after lease is signed.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[400px] text-[13.5px]">
              <thead className="bg-surface-chip">
                <tr>
                  <th className="px-6 py-3 text-left font-mono text-[10.5px] font-bold uppercase tracking-eyebrow text-body-3">{zh ? '日期' : 'Date'}</th>
                  <th className="px-6 py-3 text-right font-mono text-[10.5px] font-bold uppercase tracking-eyebrow text-body-3">{zh ? '金额' : 'Amount'}</th>
                  <th className="px-6 py-3 text-right font-mono text-[10.5px] font-bold uppercase tracking-eyebrow text-body-3">{zh ? '状态' : 'Status'}</th>
                </tr>
              </thead>
              <tbody>
                {lease.payments.map((p, i) => (
                  <tr key={i} className="border-t border-line-divider">
                    <td className="px-6 py-3 font-mono">{p.date}</td>
                    <td className="px-6 py-3 text-right font-mono font-bold">${p.amount.toLocaleString()}</td>
                    <td className="px-6 py-3 text-right">
                      <span
                        className="font-mono"
                        style={{
                          background: p.status === 'paid' ? 'rgba(4,120,87,0.10)' : p.status === 'late' ? 'rgba(220,38,38,0.10)' : 'rgba(217,119,6,0.10)',
                          color: p.status === 'paid' ? '#047857' : p.status === 'late' ? '#DC2626' : '#B45309',
                          padding: '3px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, letterSpacing: '0.10em',
                        }}
                      >
                        {p.status === 'paid' ? 'PAID' : p.status === 'late' ? 'LATE' : 'PENDING'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* RTA notice */}
      <div className="mt-6 rounded-lg border border-landlord/20 bg-landlord/5 px-4 py-3 text-[12.5px] leading-relaxed text-body-2">
        {zh
          ? <>所有租约条款均以 Ontario RTA (Residential Tenancies Act) 为准。任何与 RTA 冲突的条款自动无效。如需帮助，请咨询 <Link href="/disputes" className="text-brand font-semibold hover:underline">争议解决中心</Link>。</>
          : <>All lease terms are governed by the Ontario RTA (Residential Tenancies Act). Any clause conflicting with the RTA is automatically void. For help, visit the <Link href="/disputes" className="text-brand font-semibold hover:underline">dispute resolution center</Link>.</>
        }
      </div>
    </WorkspaceShell>
  )
}

function monthsBetween(a: string, b: string): number {
  const da = new Date(a), db = new Date(b)
  return Math.max(0, (db.getFullYear() - da.getFullYear()) * 12 + db.getMonth() - da.getMonth())
}

function KpiCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="sl-card p-5">
      <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">{label}</div>
      <div className="mt-1.5 text-[24px] font-extrabold tracking-tight" style={{ color: accent }}>{value}</div>
    </div>
  )
}

function DetailAside({ lease, lang }: { lease: typeof LEASES[string]; lang: Lang }) {
  const zh = lang === 'zh'
  const aiName = useAIName()
  return (
    <div>
      <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
        {zh ? '租客信息' : 'Tenant info'}
      </div>
      <div className="mt-3 sl-card p-4">
        <div className="text-[15px] font-bold">{lease.tenant}</div>
        <div className="mt-2 space-y-1.5 text-[12.5px] text-body-2">
          <div>{lease.email}</div>
          <div>{lease.phone}</div>
          <div className="font-mono text-[10.5px] uppercase tracking-eyebrow text-body-3">
            {zh ? `按时率 ${lease.onTime}` : `On-time ${lease.onTime}`}
          </div>
        </div>
        <Link
          href={`/landlord/agent?prompt=${encodeURIComponent(zh ? `查看 ${lease.tenant} 的完整租客档案` : `Show ${lease.tenant}'s full tenant profile`)}&send=1`}
          className="mt-3 block w-full rounded-[8px] border border-line-strong bg-white py-[8px] text-center text-[12.5px] font-semibold transition hover:border-brand hover:text-brand"
        >
          {zh ? '查看完整档案 →' : 'View full profile →'}
        </Link>
      </div>

      <div className="mt-6 font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
        {zh ? '快捷操作' : 'Quick actions'}
      </div>
      <div className="mt-3 space-y-2">
        <Link
          href={`/landlord/agent?prompt=${encodeURIComponent(zh ? `给 ${lease.tenant} 发送催租提醒` : `Send a rent reminder to ${lease.tenant}`)}&send=1`}
          className="block w-full rounded-[8px] border border-line-strong bg-white py-[8px] text-center text-[12.5px] font-semibold transition hover:border-brand hover:text-brand"
        >
          {zh ? '发送催租提醒' : 'Send rent reminder'}
        </Link>
        <Link
          href={`/landlord/agent?prompt=${encodeURIComponent(zh ? `起草 ${lease.tenant} 的 N1 涨租通知` : `Draft an N1 rent increase notice for ${lease.tenant}`)}&send=1`}
          className="block w-full rounded-[8px] border border-line-strong bg-white py-[8px] text-center text-[12.5px] font-semibold transition hover:border-brand hover:text-brand"
        >
          {zh ? '起草 N1 涨租通知' : 'Draft N1 rent increase'}
        </Link>
        <Link
          href="/landlord/maintenance"
          className="block w-full rounded-[8px] border border-line-strong bg-white py-[8px] text-center text-[12.5px] font-semibold transition hover:border-brand hover:text-brand"
        >
          {zh ? '报修记录' : 'Maintenance records'}
        </Link>
      </div>

      <div className="mt-6 rounded-lg border border-landlord/20 bg-landlord/5 px-3 py-3">
        <div className="flex items-start gap-2">
          <span className="h-5 w-5 flex-shrink-0 rounded-full" style={{ background: 'radial-gradient(circle at 35% 35%, #6EE7B7, #047857 70%)' }} />
          <p className="text-[12px] leading-relaxed text-body-2">
            {zh
              ? <>{aiName}: {lease.tenant} 的信用历史在同类租客中排名前 15%。建议续约。</>
              : <>{aiName}: {lease.tenant}'s credit history ranks in the top 15% among comparable tenants. Renewal recommended.</>
            }
          </p>
        </div>
      </div>
    </div>
  )
}
