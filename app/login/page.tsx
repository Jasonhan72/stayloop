'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import GoogleIcon from '@/components/auth/GoogleIcon'
import { getSupabaseBrowser } from '@/lib/supabase'
import { useAuth, roleStorageKey } from '@/lib/useAuth'
import { useLoginForm } from '@/lib/auth/useLoginForm'
import { ROLE_HOME } from '@/lib/useOnboarding'
import { homeForHats, type HatsLite } from '@/lib/landlordHat'

// The state and the sign-in methods live in useLoginForm (V0.7, 2026-09-27) —
// the homepage's login card and /register render the same hook, so the
// entrances cannot drift apart. Regular methods only: Google and email +
// password (the one-time email link is retired — user decision 2026-09-27).
export default function LoginPage() {
  const router = useRouter()
  const { loading: authLoading, user, role } = useAuth()
  const f = useLoginForm('signin')
  const zh = f.zh

  // Already signed in → don't show the login form. Honor an explicit
  // ?redirect= target, else the user's workspace by active role.
  useEffect(() => {
    if (authLoading || !user) return
    // An ANONYMOUS session must not bounce away from the login form —
    // it used to make signing into a real account impossible after the
    // visitor had touched the (now retired) anonymous trial.
    if ((user as { is_anonymous?: boolean }).is_anonymous) return
    const q2 = new URLSearchParams(window.location.search)
    const redirect = q2.get('next') ?? q2.get('redirect')
    const safe = redirect && redirect.startsWith('/') && !redirect.startsWith('//') && !redirect.startsWith('/\\') ? redirect : null
    if (safe) { router.replace(safe); return }
    // Land on a workspace this account actually holds (SL-T-08).
    // The remembered hat is read raw: 'provider' is a landing hat that the Role type does not carry (2026-09-26).
    const remembered = (typeof window !== 'undefined' ? window.localStorage.getItem(roleStorageKey(user.id)) : null) ?? role
    void Promise.resolve(getSupabaseBrowser().rpc('my_hats')).then(({ data }) => router.replace(homeForHats(remembered, data as HatsLite)), () => router.replace(role ? ROLE_HOME[role] : '/tenant/agent'))
  }, [authLoading, user, role, router])

  if (f.sent) {
    const verify = f.sent === 'verify'
    return (
      <>
        <Header />
        <main className="bg-surface">
          <div className="mx-auto flex min-h-[calc(100vh-180px)] max-w-md flex-col justify-center px-5 py-12">
            <div className="sl-card p-8 sm:p-10 text-center">
              <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand/15 text-brand">
                <MailIcon />
              </span>
              <h1 className="mt-4 text-[22px] font-bold tracking-tight">
                {verify ? (zh ? '验证你的邮箱' : 'Verify your email') : (zh ? '查收你的邮箱' : 'Check your email')}
              </h1>
              <p className="mt-2 text-[14px] leading-relaxed text-body-2">
                {verify ? (zh ? '我们刚把验证链接发到 ' : 'We just sent a verification link to ') : (zh ? '我们刚把重置密码的链接发到 ' : 'We just sent a password-reset link to ')}
                <b className="text-body">{f.email}</b>
                {verify ? (zh ? '。点击链接完成注册，然后回来登录。' : '. Click it to finish registering, then sign in.') : (zh ? '。点击链接设置新密码。' : '. Click it to set a new password.')}
              </p>
              <button
                type="button"
                onClick={f.back}
                className="mt-5 text-[13px] font-semibold text-brand hover:underline"
              >
                {zh ? '← 返回登录' : '← Back to sign in'}
              </button>
            </div>
          </div>
        </main>
        <Footer />
      </>
    )
  }

  return (
    <>
      <Header />
      <main className="bg-surface">
        <div className="mx-auto flex min-h-[calc(100vh-180px)] max-w-md flex-col justify-center px-5 py-12">
          <div className="sl-card p-8 sm:p-10">
            <h1 className="text-[28px] font-bold tracking-tight">
              {zh ? '欢迎回来' : 'Welcome back'}
            </h1>
            <p className="mt-1.5 text-[14px] text-body-2">
              {zh ? '登录你的 Stayloop 账号' : 'Sign in to your Stayloop account'}
            </p>

            {/* Social login — Apple provider not enabled in Supabase; Google only */}
            <div className="mt-6">
              <button
                type="button"
                onClick={() => void f.signInWithGoogle()}
                className="flex w-full items-center justify-center gap-2 rounded-[10px] border border-line-strong bg-white px-4 py-[11px] text-[13.5px] font-semibold transition hover:border-body-3 hover:bg-surface-chip"
              >
                <GoogleIcon />
                {zh ? '使用 Google 登录' : 'Continue with Google'}
              </button>
            </div>

            {/* Divider */}
            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-line-divider" />
              <span className="text-[12px] text-body-3">{zh ? '或用邮箱 + 密码' : 'or with email + password'}</span>
              <div className="h-px flex-1 bg-line-divider" />
            </div>

            <form onSubmit={(e) => void f.signInWithPassword(e)} className="space-y-4">
              <label className="block">
                <span className="sl-eyebrow">{zh ? '邮箱' : 'Email'}</span>
                <input
                  type="email"
                  required
                  value={f.email}
                  onChange={(e) => f.setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  className="sl-input mt-1"
                />
              </label>
              <label className="block">
                <div className="flex items-center justify-between">
                  <span className="sl-eyebrow">{zh ? '密码' : 'Password'}</span>
                  <button
                    type="button"
                    onClick={() => void f.forgotPassword()}
                    className="text-[11.5px] font-semibold text-brand hover:underline"
                  >
                    {zh ? '忘记密码？' : 'Forgot password?'}
                  </button>
                </div>
                <input
                  type="password"
                  required
                  value={f.password}
                  onChange={(e) => f.setPassword(e.target.value)}
                  placeholder={zh ? '输入密码' : 'Enter password'}
                  autoComplete="current-password"
                  className="sl-input mt-1"
                />
              </label>
              {f.err && (
                <div className="rounded-md bg-danger/10 px-3 py-2 text-[13px] text-danger">
                  {f.err}
                  {f.needsConfirm && (
                    <button
                      type="button"
                      onClick={() => void f.resendConfirm()}
                      className="mt-1 block font-semibold underline"
                    >
                      {zh ? '重发验证邮件' : 'Resend verification email'}
                    </button>
                  )}
                </div>
              )}
              <button
                type="submit"
                disabled={f.loading || !f.email || !f.password}
                className="sl-btn-primary w-full !py-[14px] disabled:opacity-50"
              >
                {f.loading ? (zh ? '登录中…' : 'Signing in…') : (zh ? '登录' : 'Sign in')}
              </button>
            </form>

            {/* Register link */}
            <div className="mt-6 border-t border-line-divider pt-5 text-center text-[13px] text-body-2">
              {zh ? '还没有账号？' : "Don't have an account? "}{' '}
              <Link href="/register" className="font-semibold text-brand">
                {zh ? '免费注册 →' : 'Register free →'}
              </Link>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  )
}

function MailIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <polyline points="3 7 12 13 21 7" />
    </svg>
  )
}
