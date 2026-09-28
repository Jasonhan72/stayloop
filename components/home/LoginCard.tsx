'use client'

// The homepage's login card (V0.7, 2026-09-27): the hero's right column on
// desktop, under the headline on phones. The regular methods only (user
// decision 2026-09-27 — the one-time email link is retired): Google, email +
// password sign-in, and email + password registration behind the「注册」tab,
// plus forgot-password and resend-verification — all through the shared
// useLoginForm hook that /login and /register render too. After a
// verification or reset email goes out the card turns into「查收你的邮箱」in place.
import Link from 'next/link'
import GoogleIcon from '@/components/auth/GoogleIcon'
import { useLoginForm } from '@/lib/auth/useLoginForm'

export default function LoginCard({ className = '' }: { className?: string }) {
  const f = useLoginForm('signin')
  const zh = f.zh
  const register = f.tab === 'register'
  const shell = `rounded-[20px] border border-line-divider bg-white p-6 shadow-[0_20px_60px_rgba(27,27,60,0.08)] sm:p-7 ${className}`
  const tabCls = (on: boolean) => 'flex-1 rounded-md py-2 text-[13px] font-semibold transition ' + (on ? 'bg-white text-body shadow-sm' : 'text-body-3 hover:text-body-2')

  if (f.sent) {
    const verify = f.sent === 'verify'
    return (
      <div id="login" data-testid="home-login" className={`${shell} text-center`}>
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand/15 text-brand" aria-hidden>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><polyline points="3 7 12 13 21 7" /></svg>
        </span>
        <h2 className="mt-4 text-[20px] font-extrabold tracking-tight">{verify ? (zh ? '验证你的邮箱' : 'Verify your email') : (zh ? '查收你的邮箱' : 'Check your email')}</h2>
        <p className="mt-2 text-[13.5px] leading-relaxed text-body-2">
          {verify ? (zh ? '我们刚把验证链接发到 ' : 'We just sent a verification link to ') : (zh ? '我们刚把重置密码的链接发到 ' : 'We just sent a password-reset link to ')}
          <b className="text-body">{f.email}</b>
          {verify ? (zh ? '。点击链接完成注册，然后回来登录。' : '. Click it to finish registering, then sign in.') : (zh ? '。点击链接设置新密码。' : '. Click it to set a new password.')}
        </p>
        <button type="button" onClick={f.back} className="mt-5 text-[13px] font-semibold text-brand hover:underline">{zh ? '← 返回' : '← Back'}</button>
      </div>
    )
  }

  return (
    <div id="login" data-testid="home-login" className={shell}>
      <div className="flex rounded-lg bg-surface-chip p-1" role="tablist" aria-label={zh ? '登录或注册' : 'Sign in or create an account'}>
        <button type="button" role="tab" aria-selected={!register} onClick={() => f.setTab('signin')} className={tabCls(!register)}>{zh ? '登录' : 'Sign in'}</button>
        <button type="button" role="tab" aria-selected={register} onClick={() => f.setTab('register')} className={tabCls(register)}>{zh ? '注册' : 'Create account'}</button>
      </div>
      <h2 className="mt-4 text-[20px] font-extrabold tracking-tight">{register ? (zh ? '创建账号 · 免费' : 'Create your account · free') : (zh ? '欢迎回来' : 'Welcome back')}</h2>
      <p className="mt-1 text-[13.5px] leading-snug text-body-2">{zh ? '一个账号，租客、房东、经纪、服务商四种身份随时切换。' : 'One account; switch between tenant, landlord, agent and provider any time.'}</p>

      <button
        type="button"
        onClick={() => void f.signInWithGoogle()}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-[10px] border border-line-strong bg-white px-4 py-[11px] text-[13.5px] font-semibold transition hover:border-body-3 hover:bg-surface-chip"
      >
        <GoogleIcon />
        {register ? (zh ? '使用 Google 注册' : 'Continue with Google') : (zh ? '使用 Google 登录' : 'Continue with Google')}
      </button>

      <div className="my-4 flex items-center gap-3">
        <div className="h-px flex-1 bg-line-divider" />
        <span className="text-[12px] text-body-3">{zh ? '或用邮箱' : 'or with email'}</span>
        <div className="h-px flex-1 bg-line-divider" />
      </div>

      {register ? (
        <form onSubmit={(e) => void f.signUpWithPassword(e)} className="space-y-3">
          <label className="block">
            <span className="sl-eyebrow">{zh ? '邮箱' : 'Email'}</span>
            <input type="email" required value={f.email} onChange={(e) => f.setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" className="sl-input mt-1" />
          </label>
          <label className="block">
            <span className="sl-eyebrow">{zh ? '设置密码' : 'Password'}</span>
            <input type="password" required value={f.password} onChange={(e) => f.setPassword(e.target.value)} placeholder={zh ? '至少 8 位' : 'At least 8 characters'} autoComplete="new-password" className="sl-input mt-1" />
          </label>
          <label className="block">
            <span className="sl-eyebrow">{zh ? '确认密码' : 'Confirm password'}</span>
            <input type="password" required value={f.password2} onChange={(e) => f.setPassword2(e.target.value)} placeholder={zh ? '再输入一次' : 'Enter again'} autoComplete="new-password" className="sl-input mt-1" />
          </label>
          {f.err && <div className="rounded-md bg-danger/10 px-3 py-2 text-[13px] text-danger">{f.err}</div>}
          <button type="submit" disabled={f.loading || !f.email || !f.password || !f.password2} className="sl-btn-primary w-full !py-[13px] disabled:opacity-50">
            {f.loading ? (zh ? '注册中…' : 'Creating…') : (zh ? '创建账号' : 'Create account')}
          </button>
          <p className="text-center text-[12px] leading-relaxed text-body-3">
            {zh ? '我们会发一封验证邮件，点击后完成注册 · ' : 'We email you a verification link · '}
            <button type="button" onClick={() => f.setTab('signin')} className="font-semibold text-brand hover:underline">{zh ? '已有账号？登录' : 'Have an account? Sign in'}</button>
          </p>
          <p className="text-center text-[11.5px] leading-relaxed text-body-3">
            {zh ? '注册即表示你同意 ' : 'By registering you agree to our '}
            <Link href="/terms" className="underline">{zh ? '服务条款' : 'Terms'}</Link>
            {zh ? ' 和 ' : ' and '}
            <Link href="/privacy" className="underline">{zh ? '隐私政策' : 'Privacy Policy'}</Link>
          </p>
        </form>
      ) : (
        <form onSubmit={(e) => void f.signInWithPassword(e)} className="space-y-3">
          <label className="block">
            <span className="sl-eyebrow">{zh ? '邮箱' : 'Email'}</span>
            <input type="email" required value={f.email} onChange={(e) => f.setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" className="sl-input mt-1" />
          </label>
          <label className="block">
            <div className="flex items-center justify-between">
              <span className="sl-eyebrow">{zh ? '密码' : 'Password'}</span>
              <button type="button" onClick={() => void f.forgotPassword()} className="text-[11.5px] font-semibold text-brand hover:underline">{zh ? '忘记密码？' : 'Forgot password?'}</button>
            </div>
            <input type="password" required value={f.password} onChange={(e) => f.setPassword(e.target.value)} placeholder={zh ? '输入密码' : 'Enter password'} autoComplete="current-password" className="sl-input mt-1" />
          </label>
          {f.err && (
            <div className="rounded-md bg-danger/10 px-3 py-2 text-[13px] text-danger">
              {f.err}
              {f.needsConfirm && (
                <button type="button" onClick={() => void f.resendConfirm()} className="mt-1 block font-semibold underline">{zh ? '重发验证邮件' : 'Resend verification email'}</button>
              )}
            </div>
          )}
          <button type="submit" disabled={f.loading || !f.email || !f.password} className="sl-btn-primary w-full !py-[13px] disabled:opacity-50">
            {f.loading ? (zh ? '登录中…' : 'Signing in…') : (zh ? '登录' : 'Sign in')}
          </button>
          <p className="text-center text-[12px] text-body-3">
            <button type="button" onClick={() => f.setTab('register')} className="font-semibold text-brand hover:underline">{zh ? '没有账号？免费注册 →' : 'No account? Create one free →'}</button>
          </p>
        </form>
      )}

      <div className="mt-4 border-t border-line-divider pt-3 text-center text-[12px] text-body-3">
        {zh ? '注册免费 · 不要信用卡 · 租客永远免费' : 'Free to join · no credit card · free for tenants, always'}
      </div>
    </div>
  )
}
