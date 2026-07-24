'use client'

export const runtime = 'edge'

// Public token-capability page: the tenant reviews and signs the Ontario
// Standard Lease here — no account needed. After signing, the SAME link
// becomes their permanent read-only access: view anytime, download a PDF
// backup anytime (browser print → save as PDF).
import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import OntarioLeaseDoc from '@/components/lease/OntarioLeaseDoc'
import TrrebLeaseDoc from '@/components/lease/TrrebLeaseDoc'
import type { OntarioLeaseTerms, LeaseSignature } from '@/lib/lease/ontario'
import type { TrrebLeaseTerms } from '@/lib/lease/trreb'
import { useT } from '@/lib/i18n'

type ViewLease = {
  id: string
  form_type: string
  status: string
  terms: OntarioLeaseTerms | TrrebLeaseTerms
  tenant_name: string | null
  unit_label: string | null
  landlord_signature: LeaseSignature | null
  tenant_signature: LeaseSignature | null
  signed_at: string | null
}

export default function LeaseSignPage() {
  const { token } = useParams<{ token: string }>()
  const { lang } = useT()
  const zh = lang === 'zh'
  const [lease, setLease] = useState<ViewLease | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [agree, setAgree] = useState(false)
  const [signing, setSigning] = useState(false)
  const [signErr, setSignErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/lease/view?token=${encodeURIComponent(token)}`)
      if (!res.ok) {
        setLoadErr(res.status === 404 || res.status === 400 ? (zh ? '链接无效或已撤回。' : 'This link is invalid or was revoked.') : (zh ? '加载失败，请刷新重试。' : 'Failed to load — please refresh.'))
        return
      }
      const j = (await res.json()) as { lease: ViewLease }
      setLease(j.lease)
    } catch {
      setLoadErr(zh ? '网络错误，请刷新重试。' : 'Network error — please refresh.')
    }
  }, [token, zh])
  useEffect(() => { void load() }, [load])

  const sign = async () => {
    if (signing || !agree || !name.trim()) return
    setSigning(true)
    setSignErr(null)
    try {
      const res = await fetch('/api/lease/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, name: name.trim() }),
      })
      const j = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok || !j.ok) {
        setSignErr(j.error || (zh ? '签署失败，请重试。' : 'Signing failed — please retry.'))
      } else {
        await load()
      }
    } catch {
      setSignErr(zh ? '网络错误，请重试。' : 'Network error — please retry.')
    } finally {
      setSigning(false)
    }
  }

  if (loadErr) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface p-6">
        <div className="sl-card max-w-md p-8 text-center">
          <div className="text-[36px]">📄</div>
          <p className="mt-3 text-[14px] text-body-2">{loadErr}</p>
        </div>
      </main>
    )
  }
  if (!lease) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface">
        <span className="orb tenant pulse h-12 w-12" style={{ color: '#7C3AED' }} />
      </main>
    )
  }

  const canSign = !lease.tenant_signature && (lease.status === 'sent' || lease.status === 'draft')
  const fullySigned = !!lease.tenant_signature && !!lease.landlord_signature

  return (
    <main className="min-h-screen bg-surface pb-24">
      {/* Chrome (hidden when printing) */}
      <div className="border-b border-line-divider bg-white px-5 py-4 print:hidden">
        <div className="mx-auto flex max-w-[820px] flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-brand">
              STAYLOOP · {zh ? '在线租约签署' : 'Online lease signing'}
            </div>
            <div className="text-[15px] font-bold tracking-tight">
              {lease.unit_label || (zh ? '住宅租约' : 'Residential lease')}
            </div>
          </div>
          <button
            onClick={() => window.print()}
            className="rounded-[10px] border border-line-strong bg-white px-4 py-[9px] text-[13px] font-semibold text-body transition hover:border-brand hover:text-brand"
          >
            {zh ? '下载 PDF 备份' : 'Download PDF backup'}
          </button>
        </div>
        <div className="mx-auto mt-2 max-w-[820px] text-[12px] text-body-3">
          {fullySigned
            ? (zh ? '✓ 双方已签署 · 本页链接长期有效，可随时回来查看或下载。' : '✓ Fully signed · this link stays valid — come back anytime to view or download.')
            : lease.tenant_signature
              ? (zh ? '你已签署 · 等待房东回签。完成后会邮件通知你，本链接长期有效。' : 'You have signed · awaiting the landlord’s countersignature. You’ll be emailed when complete; this link stays valid.')
              : (zh ? '请仔细阅读整份租约后在页面底部签署。' : 'Please read the full agreement, then sign at the bottom.')}
        </div>
      </div>

      {/* The document */}
      <div className="mx-auto mt-6 max-w-[860px] px-5 print:mt-0 print:max-w-none print:px-0">
        <div className="sl-card overflow-hidden !p-0 print:border-none print:shadow-none">
          {/* Unknown/legacy form_type falls back to the Ontario renderer (back-compat). */}
          {lease.form_type === 'trreb' ? (
            <TrrebLeaseDoc
              terms={lease.terms as TrrebLeaseTerms}
              landlordSignature={lease.landlord_signature}
              tenantSignature={lease.tenant_signature}
              status={lease.status}
            />
          ) : (
            <OntarioLeaseDoc
              terms={lease.terms as OntarioLeaseTerms}
              landlordSignature={lease.landlord_signature}
              tenantSignature={lease.tenant_signature}
              status={lease.status}
            />
          )}
        </div>
      </div>

      {/* Signing panel */}
      {canSign && (
        <div className="mx-auto mt-6 max-w-[860px] px-5 print:hidden">
          <div className="sl-card border-2 border-brand p-6">
            <h3 className="text-[16px] font-bold tracking-tight">{zh ? '电子签署' : 'Sign electronically'}</h3>
            <p className="mt-1 text-[12.5px] leading-relaxed text-body-2">
              {zh
                ? '输入你的法定全名作为电子签名。签署即表示你已阅读并同意上述全部条款（安省《电子商务法》承认电子签名效力）。'
                : 'Type your full legal name as your electronic signature. Signing means you have read and agree to all terms above (electronic signatures are valid under Ontario’s Electronic Commerce Act, 2000).'}
            </p>
            <label className="mt-4 flex items-start gap-2 text-[13px] leading-relaxed">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5" />
              <span>{zh ? '我已阅读整份租约，并同意以电子方式签署本协议。' : 'I have read the full agreement and consent to signing it electronically.'}</span>
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={zh ? '法定全名，例如 Aanchal Bajaj' : 'Full legal name, e.g. Aanchal Bajaj'}
                className="min-w-[240px] flex-1 rounded-[10px] border border-line-strong bg-white px-3 py-[11px] font-serif text-[16px] italic outline-none focus:border-brand"
              />
              <button
                onClick={sign}
                disabled={signing || !agree || name.trim().length < 2}
                className="sl-btn-primary !px-6 !py-[11px] !text-[14px] disabled:opacity-40"
              >
                {signing ? (zh ? '签署中…' : 'Signing…') : (zh ? '签署租约' : 'Sign the lease')}
              </button>
            </div>
            {signErr && <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[12.5px] text-red-700">{signErr}</div>}
          </div>
        </div>
      )}

      <div className="mx-auto mt-8 max-w-[860px] px-5 text-center text-[11px] text-body-3 print:hidden">
        {zh
          ? '本文档由 Stayloop 长期在线保存 · 双方可随时通过各自链接查看与下载 · 所有签署事件均有审计记录'
          : 'This document is retained online permanently by Stayloop · both parties can view and download it anytime · every signing event is audited'}
      </div>
    </main>
  )
}
