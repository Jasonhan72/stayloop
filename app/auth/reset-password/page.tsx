'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getSupabaseBrowser } from '@/lib/supabase'
import { useT } from '@/lib/i18n'

/**
 * Password recovery landing — target of resetPasswordForEmail's redirect.
 * Supabase (implicit flow) parses the recovery token from the URL hash and
 * fires PASSWORD_RECOVERY, giving us a short-lived session. We then let the
 * user set a new password via updateUser().
 */
export default function ResetPasswordPage() {
  const router = useRouter()
  const { lang } = useT()
  const zh = lang === 'zh'

  // 'checking' → verifying the recovery link; 'ready' → show form;
  // 'invalid' → no recovery session; 'done' → password updated.
  const [phase, setPhase] = useState<'checking' | 'ready' | 'invalid' | 'done'>('checking')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    const supabase = getSupabaseBrowser()
    let settled = false

    // The recovery session arrives either via the PASSWORD_RECOVERY event
    // (client parses the hash) or is already present by the time we check.
    const sub = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        settled = true
        setPhase('ready')
      }
    })

    supabase.auth.getSession().then(({ data }) => {
      if (settled) return
      // A valid recovery link establishes a session on this page.
      setPhase(data.session ? 'ready' : 'invalid')
    })

    return () => sub.data.subscription.unsubscribe()
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null)
    if (pw.length < 8) {
      setErr(zh ? '密码至少 8 位。' : 'Password must be at least 8 characters.')
      return
    }
    if (pw !== pw2) {
      setErr(zh ? '两次输入的密码不一致。' : 'Passwords do not match.')
      return
    }
    setSaving(true)
    try {
      const supabase = getSupabaseBrowser()
      const { error } = await supabase.auth.updateUser({ password: pw })
      if (error) throw error
      setPhase('done')
      // /auth/callback resolves the user's actual role (localStorage ->
      // agent_configs -> signup metadata); hardcoding /tenant/agent sent
      // landlords into the tenant workspace after every reset.
      setTimeout(() => router.replace('/auth/callback'), 1400)
    } catch (e: unknown) {
      setErr((e as { message?: string })?.message || (zh ? '重置失败，请重试。' : 'Reset failed, please try again.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-5">
      <div className="sl-card w-full max-w-md p-8 sm:p-10">
        {phase === 'checking' && (
          <div className="text-center">
            <span className="orb landlord pulse mx-auto h-14 w-14" style={{ color: '#047857' }} />
            <p className="mt-5 text-[14px] text-body-2">{zh ? '正在验证链接…' : 'Verifying link…'}</p>
          </div>
        )}

        {phase === 'invalid' && (
          <div className="text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-[20px] text-danger">
              ✗
            </span>
            <h1 className="mt-4 text-[18px] font-bold tracking-tight">
              {zh ? '链接已失效' : 'Link expired'}
            </h1>
            <p className="mt-2 text-[13.5px] leading-relaxed text-body-2">
              {zh
                ? '这个重置链接无效或已过期。请重新发起一次密码重置。'
                : 'This reset link is invalid or has expired. Please request a new one.'}
            </p>
            <Link href="/login" className="mt-5 inline-block text-[13px] font-semibold text-brand">
              {zh ? '返回登录 →' : 'Back to sign in →'}
            </Link>
          </div>
        )}

        {phase === 'done' && (
          <div className="text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand/15 text-[20px] text-brand">
              ✓
            </span>
            <h1 className="mt-4 text-[18px] font-bold tracking-tight">
              {zh ? '密码已更新' : 'Password updated'}
            </h1>
            <p className="mt-2 text-[13.5px] text-body-2">
              {zh ? '正在带你进入工作台…' : 'Taking you to your workspace…'}
            </p>
          </div>
        )}

        {phase === 'ready' && (
          <>
            <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-body-3">
              {zh ? '设置新密码' : 'SET A NEW PASSWORD'}
            </div>
            <h1 className="mt-2 text-[22px] font-bold tracking-tight">
              {zh ? '为账户设置新密码' : 'Choose a new password'}
            </h1>
            <form onSubmit={submit} className="mt-6 space-y-4">
              <div>
                <label className="mb-1.5 block text-[12.5px] font-semibold text-body-2">
                  {zh ? '新密码' : 'New password'}
                </label>
                <input
                  type="password"
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  autoComplete="new-password"
                  placeholder={zh ? '至少 8 位' : 'At least 8 characters'}
                  className="w-full rounded-lg border border-line-strong bg-white px-3.5 py-2.5 text-[14px] outline-none transition focus:border-brand"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[12.5px] font-semibold text-body-2">
                  {zh ? '确认新密码' : 'Confirm password'}
                </label>
                <input
                  type="password"
                  value={pw2}
                  onChange={(e) => setPw2(e.target.value)}
                  autoComplete="new-password"
                  className="w-full rounded-lg border border-line-strong bg-white px-3.5 py-2.5 text-[14px] outline-none transition focus:border-brand"
                />
              </div>
              {err && <p className="text-[12.5px] text-danger">{err}</p>}
              <button
                type="submit"
                disabled={saving}
                className="sl-btn-primary w-full !py-3 disabled:opacity-60"
              >
                {saving ? (zh ? '更新中…' : 'Updating…') : zh ? '更新密码' : 'Update password'}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  )
}
