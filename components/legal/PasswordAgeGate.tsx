'use client'

// PropTx 8.06: a VOW consumer's password is valid for at most 90 days (renewable). Accounts that
// sign in with a password and whose user_metadata.password_changed_at is 90+ days old see this sheet
// and set a new password before continuing. Google-only accounts have no password and are skipped.
// Shown after the terms gate (which also starts the clock for accounts without a stamp).
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/useAuth'
import { useT } from '@/lib/i18n'
import { getSupabaseBrowser } from '@/lib/supabase'
import { writeAuditEvent } from '@/lib/agent/audit'
import { PASSWORD_MAX_AGE_DAYS, hasAcceptedCurrentTerms, passwordExpired, passwordStampMetadata } from '@/lib/legal/terms'
import { passwordErrorMessage } from '@/lib/auth/passwordError'

const EXEMPT = ['/login', '/register', '/auth/']

export default function PasswordAgeGate() {
  const auth = useAuth()
  const { lang } = useT()
  const pathname = usePathname() || '/'
  const zh = lang === 'zh'
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const exempt = EXEMPT.some((p) => pathname === p || pathname.startsWith(p))
  const show = !auth.loading && !!auth.user && hasAcceptedCurrentTerms(auth.user) && passwordExpired(auth.user) && !exempt && !done

  useEffect(() => {
    if (!show || typeof document === 'undefined') return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [show])

  if (!show) return null

  const save = async () => {
    if (saving) return
    if (pw.length < 8) { setErr(zh ? '密码至少 8 位' : 'Password must be at least 8 characters'); return }
    if (pw !== pw2) { setErr(zh ? '两次密码不一致' : 'Passwords do not match'); return }
    setSaving(true); setErr(null)
    try {
      const supabase = getSupabaseBrowser()
      const { error } = await supabase.auth.updateUser({ password: pw, data: passwordStampMetadata() })
      if (error) throw error
      if (auth.user) void writeAuditEvent(supabase, { actorId: auth.user.id, action: 'password_renewed', targetType: 'account', targetId: auth.user.id, metadata: { reason: 'max_age', max_age_days: PASSWORD_MAX_AGE_DAYS } }).catch(() => {})
      setDone(true)
    } catch (e) {
      setErr(passwordErrorMessage(e as Parameters<typeof passwordErrorMessage>[0], zh) ?? ((e as { message?: string })?.message || (zh ? '保存失败，请重试' : 'Could not save, please try again')))
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-[9000] flex items-end justify-center bg-ink/55 p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="pw-gate-title" data-testid="password-age-gate">
      <div className="w-full rounded-t-[20px] bg-white p-6 shadow-2xl sm:max-w-[480px] sm:rounded-[20px] sm:p-8">
        <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-brand">{zh ? '账号安全' : 'Account security'}</div>
        <h2 id="pw-gate-title" className="mt-2 text-[22px] font-bold leading-tight tracking-tight text-ink">{zh ? '请设置一个新密码' : 'Please set a new password'}</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-body-2">
          {zh
            ? `你的密码已使用超过 ${PASSWORD_MAX_AGE_DAYS} 天。按房源数据提供方的规则，登录密码每 ${PASSWORD_MAX_AGE_DAYS} 天需要更新一次；设置新密码后即可继续。`
            : `Your password is more than ${PASSWORD_MAX_AGE_DAYS} days old. Under the listing-data providers’ rules, sign-in passwords must be renewed every ${PASSWORD_MAX_AGE_DAYS} days; set a new one to continue.`}
        </p>
        <form onSubmit={(e) => { e.preventDefault(); void save() }} className="mt-4 space-y-3">
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" placeholder={zh ? '新密码，至少 8 位' : 'New password, 8+ characters'} aria-label={zh ? '新密码' : 'New password'} className="sl-input w-full" data-testid="pw-gate-new" />
          <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" placeholder={zh ? '再输入一次' : 'Enter it again'} aria-label={zh ? '确认新密码' : 'Confirm new password'} className="sl-input w-full" />
          {err && <p className="text-[13px] text-red-700">{err}</p>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <button type="button" onClick={() => void auth.signOut()} className="text-[13px] font-semibold text-body-3 hover:underline">{zh ? '稍后再说 · 退出登录' : 'Later · sign out'}</button>
            <button type="submit" disabled={saving || !pw || !pw2} className="sl-btn-primary !h-[44px] !px-6 !text-[15px] disabled:opacity-50" data-testid="pw-gate-save">{saving ? (zh ? '保存中…' : 'Saving…') : (zh ? '保存新密码' : 'Save new password')}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
