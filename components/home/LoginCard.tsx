'use client'

// The homepage's sign-in block. 2026-09-29, user:「首页这里的登录模块要尽可能的简化，
// 参考 muse 的」— so it is Muse's shape: no card, no tabs, centered under the
// headline, one field first.
//
//   1. 「登录或创建账户」 · email · 继续 — and Google one tap below it.
//   2. 「继续」 looks the email up (lib/auth/emailStatus, user 2026-09-29
//      「当然要加上这个判断」) and routes like Muse does:
//        an account with a password → the password step;
//        a new email                → create-account (the password twice);
//        an account without one     → Google if it has Google, else an email
//                                     to set a password.
//      If the lookup fails (rate limit, network), the password step opens with
//      「第一次来？创建账户」 as before — the visitor picks.
//
// The methods are unchanged and all come from the shared useLoginForm hook
// (/login and /register render it too): Google, email + password sign-in,
// email + password registration with a verification email, forgot-password
// and resend-verification. No one-time email link (retired, user 2026-09-27).
//
// Also the sign-in gate of the naming step (/onboarding/name, 2026-09-29):
// `next` is where every method lands afterwards — the password sign-in, the
// verification link in the sign-up email, and Google. And /login and
// /register render it too (via components/auth/SignInBlock); `intent` only
// decides where a FAILED email lookup falls back to — create-account on
// /register, the password everywhere else.
import { useEffect, useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import GoogleIcon from '@/components/auth/GoogleIcon'
import { useLoginForm } from '@/lib/auth/useLoginForm'
import { EMAIL_RE, lookupEmailStatus, routeForEmail } from '@/lib/auth/emailStatus'

type Step = 'email' | 'password' | 'create' | 'nopassword'

export default function LoginCard({ className = '', next, intent = 'signin' }: { className?: string; next?: string; intent?: 'signin' | 'register' }) {
  const f = useLoginForm('signin', { next })
  const zh = f.zh
  const [step, setStep] = useState<Step>('email')
  const [emailErr, setEmailErr] = useState(false)
  const [checking, setChecking] = useState(false)
  // `known`: the lookup answered, so the cross-links that only make sense when
  // we cannot tell (「第一次来？」 / 「已有账户？」) are hidden. `google`: the
  // account also signs in with Google.
  const [known, setKnown] = useState(false)
  const [google, setGoogle] = useState(false)
  const pwRef = useRef<HTMLInputElement>(null)
  const actRef = useRef<HTMLButtonElement>(null)

  // Focus the step's first control when it opens (not on first render).
  useEffect(() => {
    if (step === 'password' || step === 'create') pwRef.current?.focus()
    else if (step === 'nopassword') actRef.current?.focus()
  }, [step])

  const toEmail = () => { setKnown(false); setGoogle(false); f.setTab('signin'); f.setPassword(''); f.setPassword2(''); setStep('email') }
  const toPassword = () => { f.setTab('signin'); setStep('password') }
  const toCreate = () => { f.setTab('register'); setStep('create') }
  const continueWithEmail = async (e: FormEvent) => {
    e.preventDefault()
    if (checking) return
    const email = f.email.trim()
    if (!EMAIL_RE.test(email)) { setEmailErr(true); return }
    setEmailErr(false)
    f.setEmail(email)
    setChecking(true)
    const route = routeForEmail(await lookupEmailStatus(email))
    setChecking(false)
    setKnown(route.known)
    setGoogle(route.google)
    if (route.step === 'create' || (!route.known && intent === 'register')) toCreate()
    else if (route.step === 'nopassword') { f.setTab('signin'); setStep('nopassword') }
    else toPassword()
  }

  const root = `text-center ${className}`
  const input = 'sl-input !rounded-full !bg-white !px-5 !py-[13px] text-left'
  const primary = 'sl-btn-primary w-full !py-[13px] disabled:opacity-50'
  const googleBtn = 'flex w-full items-center justify-center gap-2 rounded-full border border-line-strong bg-white px-4 py-[12px] text-[14px] font-semibold transition hover:border-body-3 hover:bg-surface-chip'
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
          {verify ? (zh ? '。点开它完成注册，会自动登录并接着往下走。' : '. Open it to finish — it signs you in and carries on from there.') : (zh ? '。点开它设置新密码。' : '. Open it to set a new password.')}
        </p>
        <button type="button" onClick={() => { f.back(); if (verify) toPassword() }} className={`mt-4 text-[13px] ${link}`}>{zh ? '← 返回' : '← Back'}</button>
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
          <form onSubmit={(e) => void continueWithEmail(e)} noValidate aria-busy={checking || undefined} className="space-y-3">
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
              readOnly={checking}
              className={input}
            />
            {emailErr && <div role="alert" className="text-[13px] text-danger">{zh ? '请输入有效的邮箱' : 'Enter a valid email'}</div>}
            {/* always solid, like Muse's — an empty or malformed address is caught on submit */}
            <button type="submit" disabled={checking} className={primary}>{checking ? (zh ? '请稍候…' : 'One moment…') : (zh ? '继续' : 'Continue')}</button>
          </form>
          <div className="my-4 flex items-center gap-3 text-[12px] text-body-3">
            <div className="h-px flex-1 bg-line-divider" />
            {zh ? '或' : 'or'}
            <div className="h-px flex-1 bg-line-divider" />
          </div>
          <button type="button" onClick={() => void f.signInWithGoogle()} className={googleBtn}>
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
            {!known && <button type="button" onClick={toCreate} className={link}>{zh ? '第一次来？创建账户' : 'New here? Create an account'}</button>}
            {google && <button type="button" onClick={() => void f.signInWithGoogle()} className={link}>{zh ? '改用 Google 登录' : 'Use Google instead'}</button>}
          </div>
        </form>
      )}

      {step === 'create' && (
        <form onSubmit={(e) => void f.signUpWithPassword(e)} className="space-y-3">
          {who}
          <div className={label}>
            {known
              ? (zh ? '这个邮箱还没有注册 · 免费创建账户' : 'No account for this email yet · create one, free')
              : (zh ? '创建账户 · 免费' : 'Create your account · free')}
          </div>
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
            {known
              ? (zh ? '我们会发一封验证邮件，点开它完成注册。' : 'We email you a verification link to finish.')
              : (zh ? '我们会发一封验证邮件 · ' : 'We email you a verification link · ')}
            {!known && <button type="button" onClick={toPassword} className={link}>{zh ? '已有账户？输入密码登录' : 'Have an account? Sign in'}</button>}
          </p>
          <p className="text-[11.5px] leading-relaxed text-body-3">
            {zh ? '创建即表示你同意 ' : 'By creating an account you agree to our '}
            <Link href="/terms" className="underline">{zh ? '服务条款' : 'Terms'}</Link>
            {zh ? ' 和 ' : ' and '}
            <Link href="/privacy" className="underline">{zh ? '隐私政策' : 'Privacy Policy'}</Link>
          </p>
        </form>
      )}

      {step === 'nopassword' && (
        <div className="space-y-3">
          {who}
          <p className="text-[13.5px] leading-relaxed text-body-2">
            {google
              ? (zh ? '这个邮箱是用 Google 注册的，用 Google 继续就行。' : 'This email signs in with Google.')
              : (zh ? '这个账户还没有设置密码。我们发一封邮件，点开就能设一个。' : 'This account has no password yet. We will email you a link to set one.')}
          </p>
          {google ? (
            <button ref={actRef} type="button" onClick={() => void f.signInWithGoogle()} className={googleBtn}>
              <GoogleIcon />
              {zh ? '使用 Google 继续' : 'Continue with Google'}
            </button>
          ) : (
            <button ref={actRef} type="button" disabled={f.loading} onClick={() => void f.forgotPassword()} className={primary}>
              {f.loading ? (zh ? '发送中…' : 'Sending…') : (zh ? '发送设置密码的邮件' : 'Email me a link to set a password')}
            </button>
          )}
          {errBox}
          {google && (
            <button type="button" onClick={() => void f.forgotPassword()} className={`text-[13px] ${link}`}>
              {zh ? '想用密码登录？发一封设置密码的邮件' : 'Prefer a password? Email me a link to set one'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
