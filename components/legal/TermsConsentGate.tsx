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
import { LISTING_DATA_CLAUSES, TERMS_VERSION, accountName, hasAcceptedCurrentTerms, passwordAgeDays, passwordStampMetadata, termsAcceptanceMetadata, usesPassword } from '@/lib/legal/terms'

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
  const [name, setName] = useState('')

  const exempt = EXEMPT.some((p) => pathname === p || pathname.startsWith(p))
  const accepted = !!auth.user && hasAcceptedCurrentTerms(auth.user)
  const show = !auth.loading && !!auth.user && !accepted && !exempt && !done
  const needsName = !!auth.user && !accountName(auth.user)

  // 8.05(b): once the account has accepted the current version, send ONE confirmation email for
  // that version (the server marks user_metadata.terms_confirm_sent_version so it never repeats).
  useEffect(() => {
    if (auth.loading || !auth.user || !accepted) return
    if (auth.user.user_metadata?.terms_confirm_sent_version === TERMS_VERSION) return
    const token = auth.session?.access_token
    if (!token) return
    void fetch('/api/legal/terms-confirmation', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => {})
  }, [auth.loading, auth.user, auth.session?.access_token, accepted])

  useEffect(() => {
    if (!show || typeof document === 'undefined') return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [show])

  if (!show) return null

  const accept = async () => {
    if (!agree || saving) return
    if (needsName && name.trim().length < 2) { setErr(zh ? '请填写你的姓名' : 'Please enter your name'); return }
    setSaving(true)
    setErr(null)
    try {
      const supabase = getSupabaseBrowser()
      // The password-age clock (8.06) starts here for accounts that predate it; a stamp already on record is kept.
      const stamp = usesPassword(auth.user) && passwordAgeDays(auth.user) == null ? passwordStampMetadata() : {}
      const meta = { ...termsAcceptanceMetadata(), ...stamp, ...(needsName ? { full_name: name.trim().slice(0, 80) } : {}) }
      const { error } = await supabase.auth.updateUser({ data: meta })
      if (error) throw error
      if (auth.user) {
        // target_id is a uuid column: the account is the target, the version travels in metadata
        void writeAuditEvent(supabase, { actorId: auth.user.id, action: 'terms_accepted', targetType: 'account', targetId: auth.user.id, metadata: meta }).catch(() => {})
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
          {zh ? '继续之前，请确认更新后的服务条款' : 'Before you continue, please confirm the updated Terms'}
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-body-2">
          {zh
            ? '我们更新了服务条款，你需要确认后才能继续使用。下面是其中关于房源信息的使用规则，它们只约束房源信息的使用，不收取任何费用，也不建立任何代理关系。'
            : 'We updated the Terms and need your confirmation before you continue. Below are the rules on how listing information may be used; they only govern listing information, charge no fee and create no representation.'}
        </p>
        <ol className="mt-4 max-h-[36dvh] list-decimal space-y-2 overflow-y-auto rounded-[12px] bg-surface px-4 py-3 pl-8 text-[13px] leading-relaxed text-body-2 sm:max-h-[260px]">
          {LISTING_DATA_CLAUSES.map((c, i) => <li key={i}>{zh ? c.zh : c.en}</li>)}
        </ol>
        <p className="mt-2 text-[12.5px] leading-relaxed text-body-3">
          {zh
            ? <>本版新增第 7 节「API 使用规则」，只对接入 Stayloop API 或 MCP 端点的开发者生效：<a href="/terms" target="_blank" rel="noreferrer" className="text-brand hover:underline">查看条款 ↗</a></>
            : <>This version adds section 7, the API usage rules, which apply only if you call the Stayloop API or MCP endpoint: <a href="/terms" target="_blank" rel="noreferrer" className="text-brand hover:underline">read the Terms ↗</a></>}
        </p>
        {needsName && (
          <label className="mt-4 block text-[13px] text-body-2">
            {zh ? '你的姓名（我们需要记录每位用户的姓名）' : 'Your name (we keep each user’s name on record)'}
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className="sl-input mt-1 w-full" placeholder={zh ? '姓名' : 'Name'} data-testid="terms-gate-name" />
          </label>
        )}
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
