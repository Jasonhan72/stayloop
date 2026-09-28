'use client'

// The homepage's login card (V0.7, 2026-09-27): the hero's right column on
// desktop, under the headline on phones. Same three methods as /login through
// the shared useLoginForm hook — Google, a one-time email link (default; it
// also registers a new account), and email + password behind「密码登录」.
// After the link is sent the card turns into「查收你的邮箱」in place.
import GoogleIcon from '@/components/auth/GoogleIcon'
import { useLoginForm } from '@/lib/auth/useLoginForm'

export default function LoginCard({ className = '' }: { className?: string }) {
  const f = useLoginForm('magic-link')
  const zh = f.zh
  const shell = `rounded-[20px] border border-line-divider bg-white p-6 shadow-[0_20px_60px_rgba(27,27,60,0.08)] sm:p-7 ${className}`

  if (f.sent) {
    return (
      <div id="login" data-testid="home-login" className={`${shell} text-center`}>
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand/15 text-brand" aria-hidden>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><polyline points="3 7 12 13 21 7" /></svg>
        </span>
        <h2 className="mt-4 text-[20px] font-extrabold tracking-tight">{zh ? '查收你的邮箱' : 'Check your email'}</h2>
        <p className="mt-2 text-[13.5px] leading-relaxed text-body-2">
          {zh ? '我们刚把链接发到 ' : 'We just sent a link to '}
          <b className="text-body">{f.email}</b>
          {zh ? '。点击链接即可继续，链接 1 小时内有效。' : '. Click it to continue; it is valid for 1 hour.'}
        </p>
        <button type="button" onClick={f.back} className="mt-5 text-[13px] font-semibold text-brand hover:underline">{zh ? '← 返回' : '← Back'}</button>
      </div>
    )
  }

  return (
    <div id="login" data-testid="home-login" className={shell}>
      <h2 className="text-[20px] font-extrabold tracking-tight">{zh ? '登录 · 免费开始' : 'Sign in · start free'}</h2>
      <p className="mt-1 text-[13.5px] leading-snug text-body-2">{zh ? '一个账号，租客、房东、经纪、服务商四种身份随时切换。' : 'One account; switch between tenant, landlord, agent and provider any time.'}</p>

      <button
        type="button"
        onClick={() => void f.signInWithGoogle()}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-[10px] border border-line-strong bg-white px-4 py-[11px] text-[13.5px] font-semibold transition hover:border-body-3 hover:bg-surface-chip"
      >
        <GoogleIcon />
        {zh ? '使用 Google 登录' : 'Continue with Google'}
      </button>

      <div className="my-4 flex items-center gap-3">
        <div className="h-px flex-1 bg-line-divider" />
        <span className="text-[12px] text-body-3">{zh ? '或用邮箱' : 'or with email'}</span>
        <div className="h-px flex-1 bg-line-divider" />
      </div>

      {f.tab === 'magic-link' ? (
        <form onSubmit={(e) => void f.sendMagicLink(e)} className="space-y-3">
          <label className="block">
            <span className="sl-eyebrow">{zh ? '邮箱' : 'Email'}</span>
            <input type="email" required value={f.email} onChange={(e) => f.setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" className="sl-input mt-1" />
          </label>
          {f.err && <div className="rounded-md bg-danger/10 px-3 py-2 text-[13px] text-danger">{f.err}</div>}
          <button type="submit" disabled={f.loading || !f.email} className="sl-btn-primary w-full !py-[13px] disabled:opacity-50">
            {f.loading ? (zh ? '发送中…' : 'Sending…') : (zh ? '发送登录链接' : 'Send sign-in link')}
          </button>
          <p className="text-center text-[12px] leading-relaxed text-body-3">
            {zh ? '一次性链接，1 小时内有效 · ' : 'One-time link, valid for 1 hour · '}
            <button type="button" onClick={() => f.setTab('password')} className="font-semibold text-brand hover:underline">{zh ? '已有密码？密码登录' : 'Have a password? Sign in with it'}</button>
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
            <button type="button" onClick={() => f.setTab('magic-link')} className="font-semibold text-brand hover:underline">{zh ? '改用邮箱链接登录' : 'Use an email link instead'}</button>
          </p>
        </form>
      )}

      <div className="mt-4 border-t border-line-divider pt-3 text-center text-[12px] text-body-3">
        {zh ? '首次登录即完成注册 · 租客永远免费' : 'Your first sign-in creates the account · free for tenants, always'}
      </div>
    </div>
  )
}
