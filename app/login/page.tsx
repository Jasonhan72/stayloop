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

// The state and the three sign-in methods live in useLoginForm (V0.7,
// 2026-09-27) — the homepage's login card renders the same hook, so the two
// entrances cannot drift apart.
export default function LoginPage() {
  const router = useRouter()
  const { loading: authLoading, user, role } = useAuth()
  const f = useLoginForm('password')
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
                {zh ? '查收你的邮箱' : 'Check your email'}
              </h1>
              <p className="mt-2 text-[14px] leading-relaxed text-body-2">
                {zh ? '我们刚把链接发到 ' : 'We just sent a link to '}
                <b className="text-body">{f.email}</b>
                {zh ? '。点击链接即可继续 — 链接 1 小时内有效。' : '. Click the link to continue — valid for 1 hour.'}
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
              <span className="text-[12px] text-body-3">{zh ? '或用邮箱' : 'or with email'}</span>
              <div className="h-px flex-1 bg-line-divider" />
            </div>

            {/* Tab switch */}
            <div className="flex rounded-lg bg-surface-chip p-1 mb-5">
              <button
                type="button"
                onClick={() => f.setTab('password')}
                className={
                  'flex-1 rounded-md py-2 text-[13px] font-semibold transition ' +
                  (f.tab === 'password'
                    ? 'bg-white text-body shadow-sm'
                    : 'text-body-3 hover:text-body-2')
                }
              >
                {zh ? '密码登录' : 'Password'}
              </button>
              <button
                type="button"
                onClick={() => f.setTab('magic-link')}
                className={
                  'flex-1 rounded-md py-2 text-[13px] font-semibold transition ' +
                  (f.tab === 'magic-link'
                    ? 'bg-white text-body shadow-sm'
                    : 'text-body-3 hover:text-body-2')
                }
              >
                {zh ? '邮箱链接' : 'Magic link'}
              </button>
            </div>

            {/* Password form */}
            {f.tab === 'password' && (
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
            )}

            {/* Magic link form */}
            {f.tab === 'magic-link' && (
              <form onSubmit={(e) => void f.sendMagicLink(e)} className="space-y-4">
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
                {f.err && (
                  <div className="rounded-md bg-danger/10 px-3 py-2 text-[13px] text-danger">
                    {f.err}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={f.loading || !f.email}
                  className="sl-btn-primary w-full !py-[14px] disabled:opacity-50"
                >
                  {f.loading ? (zh ? '发送中…' : 'Sending…') : (zh ? '发送登录链接' : 'Send sign-in link')}
                </button>
                <p className="text-center text-[12px] text-body-3">
                  {zh
                    ? '我们会发送一次性链接到你的邮箱，点击即可登录，无需密码。'
                    : "We’ll send a one-time link to your email. Click it to sign in — no password needed."}
                </p>
              </form>
            )}

            {/* Register link */}
            <div className="mt-6 border-t border-line-divider pt-5 text-center text-[13px] text-body-2">
              {zh ? '还没有账号？' : "Don't have an account? "}{' '}
              <Link href="/register" className="font-semibold text-brand">
                {zh ? '注册 →' : 'Register →'}
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
