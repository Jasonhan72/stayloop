'use client'

// The homepage's sign-in block. 2026-09-29, user:「首页这里的登录模块要尽可能的简化，
// 参考 muse 的」— so it is Muse's shape: no card, no tabs, centered under the
// headline, one field first.
//
//   1. 「登录或创建账户」 · email · 继续 — and Google one tap below it.
//   2. The password; 「继续」 signs in. A first-time visitor taps「第一次来？创建账户」
//      and the same step asks for the password twice instead.
//
// The methods are unchanged and all come from the shared useLoginForm hook
// (/login and /register render it too): Google, email + password sign-in,
// email + password registration with a verification email, forgot-password
// and resend-verification. No one-time email link (retired, user 2026-09-27).
// There is deliberately no "does this email have an account?" lookup between
// the steps: that would let anyone probe which addresses are registered.
import { useEffect, useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import GoogleIcon from '@/components/auth/GoogleIcon'
import { useLoginForm } from '@/lib/auth/useLoginForm'

type Step = 'email' | 'password' | 'create'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function LoginCard({ className = '' }: { className?: string }) {
  const f = useLoginForm('signin')
  const zh = f.zh
  const [step, setStep] = useState<Step>('email')
  const [emailErr, setEmailErr] = useState(false)
  const pwRef = useRef<HTMLInputElement>(null)

  // Focus the password field when the second step opens (not on first render).
  useEffect(() => {
    if (step !== 'email') pwRef.current?.focus()
  }, [step])

  const toEmail = () => { f.setTab('signin'); f.setPassword(''); f.setPassword2(''); setStep('email') }
  const toPassword = () => { f.setTab('signin'); setStep('password') }
  const toCreate = () => { f.setTab('register'); setStep('create') }
  const next = (e: FormEvent) => {
    e.preventDefault()
    if (!EMAIL_RE.test(f.email.trim())) { setEmailErr(true); return }
    setEmailErr(false)
    f.setEmail(f.email.trim())
    toPassword()
  }

  const root = `text-center ${className}`
  const input = 'sl-input !rounded-full !bg-white !px-5 !py-[13px] text-left'
  const primary = 'sl-btn-primary w-full !py-[13px] disabled:opacity-50'
  const label = 'text-[14px] text-body-2'
  const link = 'font-semibold text-brand hover:underline'

  if (f.sent) {
    const verify = f.sent === 'verify'
    return (
      <div id="login" data-testid="home-login" className={root}>
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand/15 text-brand" aria-hidden>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><polyline points="3 7 12 13 21 7" /></svg>
        </span>
        <h2 className="mt-3 text-[18px] font-extrabold tracking-tight">{verify ? (zh ? '验证你的邮箱' : 'Verify your email') : (zh ? '查收你的邮箱' : 'Check your email')}</h2>
        <p className="mt-2 text-[13.5px] leading-relaxed text-body-2">
          {verify ? (zh ? '验证链接已发到 ' : 'We sent a verification link to ') : (zh ? '重置密码的链接已发到 ' : 'We sent a password-reset link to ')}
          <b className="text-body">{f.email}</b>
          {verify ? (zh ? '。点开它完成注册，再回来登录。' : '. Open it to finish, then sign in.') : (zh ? '。点开它设置新密码。' : '. Open it to set a new password.')}
        </p>
        <button type="button" onClick={() => { f.back(); toPassword() }} className={`mt-4 text-[13px] ${link}`}>{zh ? '← 返回' : '← Back'}</button>
      </div>
    )
  }

  const errBox = f.err && (
    <div role="alert" className="rounded-2xl bg-danger/10 px-4 py-2.5 text-left text-[13px] text-danger">
      {f.err}
      {f.needsConfirm && (
        <button type="button" onClick={() => void f.resendConfirm()} className="mt-1 block font-semibold underline">{zh ? '重发验证邮件' : 'Resend verification email'}</button>
      )}
    </div>
  )

  // Steps 2 and 3 show whose account this is, with a way back to change it.
  const who = (
    <div className="text-[13.5px] text-body-2">
      <b className="font-semibold text-body">{f.email}</b>
      <span className="mx-1.5 text-body-3">·</span>
      <button type="button" onClick={toEmail} className={link}>{zh ? '更改' : 'Change'}</button>
    </div>
  )

  return (
    <div id="login" data-testid="home-login" className={root}>
      {step === 'email' && (
        <>
          <form onSubmit={next} noValidate className="space-y-3">
            <div className={label}>{zh ? '登录或创建账户' : 'Sign in or create an account'}</div>
            <input
              type="email"
              inputMode="email"
              value={f.email}
              onChange={(e) => { f.setEmail(e.target.value); setEmailErr(false) }}
              placeholder={zh ? '邮箱' : 'Email'}
              aria-label={zh ? '邮箱' : 'Email'}
              aria-invalid={emailErr || undefined}
              autoComplete="email"
              className={input}
            />
            {emailErr && <div role="alert" className="text-[13px] text-danger">{zh ? '请输入有效的邮箱' : 'Enter a valid email'}</div>}
            {/* always solid, like Muse's — an empty or malformed address is caught on submit */}
            <button type="submit" className={primary}>{zh ? '继续' : 'Continue'}</button>
          </form>
          <div className="my-4 flex items-center gap-3 text-[12px] text-body-3">
            <div className="h-px flex-1 bg-line-divider" />
            {zh ? '或' : 'or'}
            <div className="h-px flex-1 bg-line-divider" />
          </div>
          <button
            type="button"
            onClick={() => void f.signInWithGoogle()}
            className="flex w-full items-center justify-center gap-2 rounded-full border border-line-strong bg-white px-4 py-[12px] text-[14px] font-semibold transition hover:border-body-3 hover:bg-surface-chip"
          >
            <GoogleIcon />
            {zh ? '使用 Google 继续' : 'Continue with Google'}
          </button>
          {f.err && <div className="mt-3">{errBox}</div>}
          <p className="mt-4 text-[12px] text-body-3">{zh ? '注册免费 · 不要信用卡 · 租客永远免费' : 'Free to join · no credit card · free for tenants, always'}</p>
        </>
      )}

      {step === 'password' && (
        <form onSubmit={(e) => void f.signInWithPassword(e)} className="space-y-3">
          {who}
          <input
            ref={pwRef}
            type="password"
            required
            value={f.password}
            onChange={(e) => f.setPassword(e.target.value)}
            placeholder={zh ? '密码' : 'Password'}
            aria-label={zh ? '密码' : 'Password'}
            autoComplete="current-password"
            className={input}
          />
          {errBox}
          <button type="submit" disabled={f.loading || !f.password} className={primary}>
            {f.loading ? (zh ? '登录中…' : 'Signing in…') : (zh ? '继续' : 'Continue')}
          </button>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[13px]">
            <button type="button" onClick={() => void f.forgotPassword()} className={link}>{zh ? '忘记密码？' : 'Forgot password?'}</button>
            <button type="button" onClick={toCreate} className={link}>{zh ? '第一次来？创建账户' : 'New here? Create an account'}</button>
          </div>
        </form>
      )}

      {step === 'create' && (
        <form onSubmit={(e) => void f.signUpWithPassword(e)} className="space-y-3">
          {who}
          <div className={label}>{zh ? '创建账户 · 免费' : 'Create your account · free'}</div>
          <input
            ref={pwRef}
            type="password"
            required
            value={f.password}
            onChange={(e) => f.setPassword(e.target.value)}
            placeholder={zh ? '设置密码，至少 8 位' : 'Set a password, 8+ characters'}
            aria-label={zh ? '设置密码' : 'Set a password'}
            autoComplete="new-password"
            className={input}
          />
          <input
            type="password"
            required
            value={f.password2}
            onChange={(e) => f.setPassword2(e.target.value)}
            placeholder={zh ? '再输入一次' : 'Enter it again'}
            aria-label={zh ? '确认密码' : 'Confirm password'}
            autoComplete="new-password"
            className={input}
          />
          {errBox}
          <button type="submit" disabled={f.loading || !f.password || !f.password2} className={primary}>
            {f.loading ? (zh ? '创建中…' : 'Creating…') : (zh ? '创建账户' : 'Create account')}
          </button>
          <p className="text-[12px] leading-relaxed text-body-3">
            {zh ? '我们会发一封验证邮件 · ' : 'We email you a verification link · '}
            <button type="button" onClick={toPassword} className={link}>{zh ? '已有账户？输入密码登录' : 'Have an account? Sign in'}</button>
          </p>
          <p className="text-[11.5px] leading-relaxed text-body-3">
            {zh ? '创建即表示你同意 ' : 'By creating an account you agree to our '}
            <Link href="/terms" className="underline">{zh ? '服务条款' : 'Terms'}</Link>
            {zh ? ' 和 ' : ' and '}
            <Link href="/privacy" className="underline">{zh ? '隐私政策' : 'Privacy Policy'}</Link>
          </p>
        </form>
      )}
    </div>
  )
}
