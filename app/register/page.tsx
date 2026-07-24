'use client'

import Link from 'next/link'
import { useState } from 'react'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { getSupabaseBrowser } from '@/lib/supabase'
import { useT } from '@/lib/i18n'

export default function RegisterPage() {
  const { lang } = useT()
  const zh = lang === 'zh'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null)
    if (password.length < 8) {
      setErr(zh ? '密码至少 8 位' : 'Password must be at least 8 characters')
      return
    }
    if (password !== password2) {
      setErr(zh ? '两次密码不一致' : 'Passwords do not match')
      return
    }
    setLoading(true)
    try {
      const supabase = getSupabaseBrowser()
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo:
            typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : undefined,
        },
      })
      if (error) {
        if (error.message?.includes('already registered')) {
          throw new Error(zh ? '该邮箱已注册，请直接登录' : 'This email is already registered — please sign in')
        }
        throw error
      }
      // With email confirmation ON, signUp for an already-registered address
      // returns success with an empty identities array (anti-enumeration).
      if (data.user && data.user.identities?.length === 0) {
        throw new Error(zh ? '该邮箱已注册，请直接登录' : 'This email is already registered — please sign in')
      }
      // Session returned only when autoconfirm is on; otherwise the user
      // must click the verification link first.
      if (data.session) {
        window.location.href = '/auth/callback'
        return
      }
      setDone(true)
    } catch (e: unknown) {
      setErr((e as { message?: string })?.message || (zh ? '注册失败' : 'Registration failed'))
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
            typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : undefined,
        },
      })
      if (error) throw error
    } catch (e: unknown) {
      setErr((e as { message?: string })?.message || (zh ? '注册失败' : 'Registration failed'))
    }
  }

  if (done) {
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
                <b className="text-body">{email}</b>
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
                onClick={() => handleSocial('google')}
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
            <form onSubmit={submit} className="space-y-4">
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
                <span className="sl-eyebrow">{zh ? '设置密码' : 'Password'}</span>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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
                  value={password2}
                  onChange={(e) => setPassword2(e.target.value)}
                  placeholder={zh ? '再输入一次' : 'Enter again'}
                  autoComplete="new-password"
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
                {loading ? (zh ? '注册中…' : 'Creating…') : (zh ? '注册' : 'Create account')}
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
