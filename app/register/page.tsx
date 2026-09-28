'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import GoogleIcon from '@/components/auth/GoogleIcon'
import { useT } from '@/lib/i18n'
import { useAuth } from '@/lib/useAuth'
import { useLoginForm } from '@/lib/auth/useLoginForm'
import { ROLE_HOME } from '@/lib/useOnboarding'

// Email + password registration (plus Google). The handlers are the shared
// useLoginForm hook's (V0.7 follow-up, 2026-09-27) — the homepage login card's
//「注册」tab is the same form, so the two cannot drift.
export default function RegisterPage() {
  const { lang } = useT()
  const zh = lang === 'zh'
  const router = useRouter()
  const { loading: authLoading, user, role } = useAuth()
  const f = useLoginForm('register')

  // Already signed in → no reason to see the register form; go to the
  // user's workspace (mirrors the /login behavior).
  useEffect(() => {
    if (authLoading || !user) return
    // An anonymous session (retired trial flow leftover) must be able to
    // reach the registration form — bouncing it away made creating a real
    // account impossible from that state.
    if ((user as { is_anonymous?: boolean }).is_anonymous) return
    router.replace(role ? ROLE_HOME[role] : '/dashboard')
  }, [authLoading, user, role, router])

  if (f.sent === 'verify') {
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
                {zh ? '验证你的邮箱' : 'Verify your email'}
              </h1>
              <p className="mt-2 text-[14px] leading-relaxed text-body-2">
                {zh ? '我们刚把验证链接发到 ' : 'We just sent a verification link to '}
                <b className="text-body">{f.email}</b>
                {zh ? '。点击链接完成注册。' : '. Click the link to complete registration.'}
              </p>
              <Link
                href="/login"
                className="mt-5 inline-block text-[13px] font-semibold text-brand hover:underline"
              >
                {zh ? '← 返回登录' : '← Back to sign in'}
              </Link>
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
              {zh ? '创建账号' : 'Create your account'}
            </h1>
            <p className="mt-1.5 text-[14px] text-body-2">
              {zh ? '租客永远免费 · 30 秒完成注册' : 'Free for tenants · 30 seconds to sign up'}
            </p>

            {/* Social — Apple provider not enabled in Supabase; Google only */}
            <div className="mt-6">
              <button
                type="button"
                onClick={() => void f.signInWithGoogle()}
                className="flex w-full items-center justify-center gap-2 rounded-[10px] border border-line-strong bg-white px-4 py-[11px] text-[13.5px] font-semibold transition hover:border-body-3 hover:bg-surface-chip"
              >
                <GoogleIcon />
                {zh ? '使用 Google 注册' : 'Continue with Google'}
              </button>
            </div>

            {/* Divider */}
            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-line-divider" />
              <span className="text-[12px] text-body-3">{zh ? '或用邮箱注册' : 'or with email'}</span>
              <div className="h-px flex-1 bg-line-divider" />
            </div>

            {/* Email + password form */}
            <form onSubmit={(e) => void f.signUpWithPassword(e)} className="space-y-4">
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
                <span className="sl-eyebrow">{zh ? '设置密码' : 'Password'}</span>
                <input
                  type="password"
                  required
                  value={f.password}
                  onChange={(e) => f.setPassword(e.target.value)}
                  placeholder={zh ? '至少 8 位' : 'At least 8 characters'}
                  autoComplete="new-password"
                  className="sl-input mt-1"
                />
              </label>
              <label className="block">
                <span className="sl-eyebrow">{zh ? '确认密码' : 'Confirm password'}</span>
                <input
                  type="password"
                  required
                  value={f.password2}
                  onChange={(e) => f.setPassword2(e.target.value)}
                  placeholder={zh ? '再输入一次' : 'Enter again'}
                  autoComplete="new-password"
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
                disabled={f.loading || !f.email || !f.password || !f.password2}
                className="sl-btn-primary w-full !py-[14px] disabled:opacity-50"
              >
                {f.loading ? (zh ? '注册中…' : 'Creating…') : (zh ? '注册' : 'Create account')}
              </button>
            </form>

            <p className="mt-4 text-center text-[11.5px] leading-relaxed text-body-3">
              {zh ? '注册即表示你同意 ' : 'By registering you agree to our '}
              <Link href="/terms" className="underline">{zh ? '服务条款' : 'Terms'}</Link>
              {zh ? ' 和 ' : ' and '}
              <Link href="/privacy" className="underline">{zh ? '隐私政策' : 'Privacy Policy'}</Link>
            </p>

            {/* Login link */}
            <div className="mt-5 border-t border-line-divider pt-5 text-center text-[13px] text-body-2">
              {zh ? '已有账号？' : 'Already have an account? '}{' '}
              <Link href="/login" className="font-semibold text-brand">
                {zh ? '登录 →' : 'Sign in →'}
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
