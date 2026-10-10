'use client'

// One-time consent gate (2026-10-10): a signed-in account that has not accepted the current
// Terms version (lib/legal/terms TERMS_VERSION — the listing-data rules were added that day)
// sees a blocking sheet with a checkbox. Accepting writes user_metadata.terms_version +
// terms_accepted_at (so every device sees it) and an audit row. Google sign-ups never pass a
// sign-up form, and existing accounts predate the clauses — this is how both get asked once.
// Not shown on /terms and /privacy (so the documents can be read first) or on auth pages.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/useAuth'
import { useT } from '@/lib/i18n'
import { getSupabaseBrowser } from '@/lib/supabase'
import { writeAuditEvent } from '@/lib/agent/audit'
import { LISTING_DATA_CLAUSES, TERMS_VERSION, hasAcceptedCurrentTerms, termsAcceptanceMetadata } from '@/lib/legal/terms'

const EXEMPT = ['/terms', '/privacy', '/login', '/register', '/auth/']

export default function TermsConsentGate() {
  const auth = useAuth()
  const { lang } = useT()
  const pathname = usePathname() || '/'
  const zh = lang === 'zh'
  const [agree, setAgree] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const exempt = EXEMPT.some((p) => pathname === p || pathname.startsWith(p))
  const show = !auth.loading && !!auth.user && !hasAcceptedCurrentTerms(auth.user) && !exempt && !done

  useEffect(() => {
    if (!show || typeof document === 'undefined') return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [show])

  if (!show) return null

  const accept = async () => {
    if (!agree || saving) return
    setSaving(true)
    setErr(null)
    try {
      const supabase = getSupabaseBrowser()
      const meta = termsAcceptanceMetadata()
      const { error } = await supabase.auth.updateUser({ data: meta })
      if (error) throw error
      if (auth.user) {
        void writeAuditEvent(supabase, { actorId: auth.user.id, action: 'terms_accepted', targetType: 'terms', targetId: TERMS_VERSION, metadata: meta }).catch(() => {})
      }
      setDone(true)
    } catch (e) {
      setErr((e as { message?: string })?.message || (zh ? '保存失败，请重试' : 'Could not save, please try again'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[9000] flex items-end justify-center bg-ink/55 p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="terms-gate-title" data-testid="terms-consent-gate">
      <div className="max-h-[92dvh] w-full overflow-y-auto rounded-t-[20px] bg-white p-6 shadow-2xl sm:max-w-[560px] sm:rounded-[20px] sm:p-8">
        <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-brand">{zh ? '服务条款更新' : 'Terms update'}</div>
        <h2 id="terms-gate-title" className="mt-2 text-[22px] font-bold leading-tight tracking-tight text-ink">
          {zh ? '继续之前，请确认房源信息的使用规则' : 'Before you continue, please confirm the listing-data rules'}
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-body-2">
          {zh
            ? '为了接入经纪公司与房地产协会授权的房源数据，服务条款新增了下面这些规则。它们只约束房源信息的使用，不收取任何费用，也不建立任何代理关系。'
            : 'To carry listing data licensed from brokerages and real estate associations, the Terms now include the rules below. They only govern how listing information may be used; nothing here charges a fee or creates representation.'}
        </p>
        <ol className="mt-4 max-h-[36dvh] list-decimal space-y-2 overflow-y-auto rounded-[12px] bg-surface px-4 py-3 pl-8 text-[13px] leading-relaxed text-body-2 sm:max-h-[260px]">
          {LISTING_DATA_CLAUSES.map((c, i) => <li key={i}>{zh ? c.zh : c.en}</li>)}
        </ol>
        <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-[13.5px] leading-relaxed text-ink">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-[3px] h-4 w-4 shrink-0 accent-[#00ACE4]" data-testid="terms-gate-checkbox" />
          <span>
            {zh ? '我已阅读并同意 ' : 'I have read and agree to the '}
            <Link href="/terms" target="_blank" className="font-semibold text-brand underline">{zh ? '服务条款' : 'Terms of Service'}</Link>
            {zh ? '（' : ' (version '}{TERMS_VERSION}{zh ? ' 版）和 ' : ') and the '}
            <Link href="/privacy" target="_blank" className="font-semibold text-brand underline">{zh ? '隐私政策' : 'Privacy Policy'}</Link>
          </span>
        </label>
        {err && <p className="mt-3 text-[13px] text-red-700">{err}</p>}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" onClick={() => void auth.signOut()} className="text-[13px] font-semibold text-body-3 hover:underline">
            {zh ? '不同意 · 退出登录' : 'Decline · sign out'}
          </button>
          <button type="button" onClick={() => void accept()} disabled={!agree || saving} className="sl-btn-primary !h-[44px] !px-6 !text-[15px] disabled:opacity-50" data-testid="terms-gate-accept">
            {saving ? (zh ? '保存中…' : 'Saving…') : (zh ? '同意并继续' : 'Agree and continue')}
          </button>
        </div>
      </div>
    </div>
  )
}
