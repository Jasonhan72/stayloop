'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { getSupabaseBrowser } from '@/lib/supabase'
import { useT } from '@/lib/i18n'
import { useAuth } from '@/lib/useAuth'
import { ROLE_HOME } from '@/lib/useOnboarding'

type AuthTab = 'password' | 'magic-link'


// Post-login destination: useLandlord/guards bounce logged-out users to
// /login?redirect=<path>; the auth callback honors a `next` param. Bridge
// the two so bookmarked deep links survive the sign-in round-trip.
function callbackUrl(): string {
  if (typeof window === 'undefined') return '/auth/callback'
  const redirect = new URLSearchParams(window.location.search).get('redirect')
  const next = redirect && redirect.startsWith('/') && !redirect.startsWith('//')
    ? `?next=${encodeURIComponent(redirect)}`
    : ''
  return `${window.location.origin}/auth/callback${next}`
}

export default function LoginPage() {
  const { lang } = useT()
  const zh = lang === 'zh'
  const router = useRouter()
  const { loading: authLoading, user, role } = useAuth()

  // Already signed in → don't show the login form. Honor an explicit
  // ?redirect= target, else the user's workspace by active role.
  useEffect(() => {
    if (authLoading || !user) return
    const redirect = new URLSearchParams(window.location.search).get('redirect')
    const safe = redirect && redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : null
    router.replace(safe ?? (role ? ROLE_HOME[role] : '/dashboard'))
  }, [authLoading, user, role, router])

  const [tab, setTab] = useState<AuthTab>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const handlePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErr(null)
    try {
      const supabase = getSupabaseBrowser()
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        if (error.message?.includes('Invalid login credentials')) {
          throw new Error(zh ? '邮箱或密码错误' : 'Invalid email or password')
        }
        throw error
      }
      window.location.href = callbackUrl()
    } catch (e: unknown) {
      setErr((e as { message?: string })?.message || (zh ? '登录失败' : 'Sign-in failed'))
    } finally {
      setLoading(false)
    }
  }

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErr(null)
    try {
      const supabase = getSupabaseBrowser()
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo:
            typeof window !== 'undefined' ? callbackUrl() : undefined,
        },
      })
      if (error) throw error
      setSent(true)
    } catch (e: unknown) {
      setErr((e as { message?: string })?.message || (zh ? '发送失败' : 'Failed to send'))
    } finally {
      setLoading(false)
    }
  }

  const handleSocial = async (provider: 'google') => {
    setErr(null)
    try {
      const supabase = getSupabaseBrowser()
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo:
            typeof window !== 'undefined' ? callbackUrl() : undefined,
        },
      })
      if (error) throw error
    } catch (e: unknown) {
      setErr((e as { message?: string })?.message || (zh ? '登录失败' : 'Sign-in failed'))
    }
  }

  const handleForgotPassword = async () => {
    if (!email) {
      setErr(zh ? '请先输入邮箱' : 'Please enter your email first')
      return
    }
    setLoading(true)
    setErr(null)
    try {
      const supabase = getSupabaseBrowser()
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo:
          typeof window !== 'undefined' ? `${window.location.origin}/auth/reset-password` : undefined,
      })
      if (error) throw error
      setErr(null)
      setSent(true)
    } catch (e: unknown) {
      setErr((e as { message?: string })?.message || (zh ? '发送失败' : 'Failed to send'))
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
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
                <b className="text-body">{email}</b>
                {zh ? '。点击链接即可继续 — 链接 1 小时内有效。' : '. Click the link to continue — valid for 1 hour.'}
              </p>
              <button
                type="button"
                onClick={() => setSent(false)}
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
                onClick={() => handleSocial('google')}
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
                onClick={() => { setTab('password'); setErr(null) }}
                className={
                  'flex-1 rounded-md py-2 text-[13px] font-semibold transition ' +
                  (tab === 'password'
                    ? 'bg-white text-body shadow-sm'
                    : 'text-body-3 hover:text-body-2')
                }
              >
                {zh ? '密码登录' : 'Password'}
              </button>
              <button
                type="button"
                onClick={() => { setTab('magic-link'); setErr(null) }}
                className={
                  'flex-1 rounded-md py-2 text-[13px] font-semibold transition ' +
                  (tab === 'magic-link'
                    ? 'bg-white text-body shadow-sm'
                    : 'text-body-3 hover:text-body-2')
                }
              >
                {zh ? '邮箱链接' : 'Magic link'}
              </button>
            </div>

            {/* Password form */}
            {tab === 'password' && (
              <form onSubmit={handlePassword} className="space-y-4">
                <label className="block">
                  <span className="sl-eyebrow">{zh ? '邮箱' : 'Email'}</span>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
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
                      onClick={handleForgotPassword}
                      className="text-[11.5px] font-semibold text-brand hover:underline"
                    >
                      {zh ? '忘记密码？' : 'Forgot password?'}
                    </button>
                  </div>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={zh ? '输入密码' : 'Enter password'}
                    autoComplete="current-password"
                    className="sl-input mt-1"
                  />
                </label>
                {err && (
                  <div className="rounded-md bg-danger/10 px-3 py-2 text-[13px] text-danger">
                    {err}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={loading || !email || !password}
                  className="sl-btn-primary w-full !py-[14px] disabled:opacity-50"
                >
                  {loading ? (zh ? '登录中…' : 'Signing in…') : (zh ? '登录' : 'Sign in')}
                </button>
              </form>
            )}

            {/* Magic link form */}
            {tab === 'magic-link' && (
              <form onSubmit={handleMagicLink} className="space-y-4">
                <label className="block">
                  <span className="sl-eyebrow">{zh ? '邮箱' : 'Email'}</span>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    className="sl-input mt-1"
                  />
                </label>
                {err && (
                  <div className="rounded-md bg-danger/10 px-3 py-2 text-[13px] text-danger">
                    {err}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={loading || !email}
                  className="sl-btn-primary w-full !py-[14px] disabled:opacity-50"
                >
                  {loading ? (zh ? '发送中…' : 'Sending…') : (zh ? '发送登录链接' : 'Send sign-in link')}
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

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 001 12c0 1.77.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  )
}
