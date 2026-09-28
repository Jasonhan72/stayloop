'use client'

// The sign-in form's state and handlers, shared by /login, /register and the
// homepage's login card (V0.7, 2026-09-27) so the entrances never drift.
// Methods are the regular ones (user decision 2026-09-27: the one-time email
// link was retired long ago —「改为常规的几个登录方式」): Google OAuth, email +
// password sign-in, email + password registration (verification email),
// forgot-password (reset email) and resend-verification. Rendering is the
// caller's; this hook owns nothing visual.
import { useState, type FormEvent } from 'react'
import { getSupabaseBrowser } from '@/lib/supabase'
import { useT } from '@/lib/i18n'

export type LoginTab = 'signin' | 'register'
/** What the「查收你的邮箱」state is waiting for. */
export type SentKind = 'verify' | 'reset'

// Post-login destination: useLandlord/guards bounce logged-out users to
// /login?redirect=<path>; the auth callback honors a `next` param. Bridge
// the two so bookmarked deep links survive the sign-in round-trip.
export function callbackUrl(): string {
  if (typeof window === 'undefined') return '/auth/callback'
  // Half the app sends ?next= (screening subpages, /h/[id], lease import),
  // the other half ?redirect= — honor both, and reject /\ alongside //
  // (browsers treat backslash as slash: '/\evil.com' escapes the origin).
  const q = new URLSearchParams(window.location.search)
  const redirect = q.get('next') ?? q.get('redirect')
  const next = redirect && redirect.startsWith('/') && !redirect.startsWith('//') && !redirect.startsWith('/\\')
    ? `?next=${encodeURIComponent(redirect)}`
    : ''
  return `${window.location.origin}/auth/callback${next}`
}

export function useLoginForm(initialTab: LoginTab = 'signin') {
  const { lang } = useT()
  const zh = lang === 'zh'
  const [tab, setTabState] = useState<LoginTab>(initialTab)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [sent, setSent] = useState<SentKind | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [needsConfirm, setNeedsConfirm] = useState(false)

  const setTab = (t: LoginTab) => { setTabState(t); setErr(null); setNeedsConfirm(false) }
  const message = (e: unknown, fallback: string) => (e as { message?: string })?.message || fallback
  const alreadyRegistered = () => new Error(zh ? '该邮箱已注册，请直接登录' : 'This email is already registered — please sign in')

  const signInWithPassword = async (e?: FormEvent) => {
    e?.preventDefault()
    setLoading(true)
    setErr(null)
    setNeedsConfirm(false)
    try {
      const supabase = getSupabaseBrowser()
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        if (error.message?.includes('Invalid login credentials')) {
          throw new Error(zh ? '邮箱或密码错误' : 'Invalid email or password')
        }
        if (error.message?.includes('Email not confirmed')) {
          setNeedsConfirm(true)
          throw new Error(zh ? '邮箱尚未验证，请先点击注册邮件里的确认链接' : 'Email not verified yet — please click the link in your sign-up email first')
        }
        throw error
      }
      window.location.href = callbackUrl()
    } catch (e: unknown) {
      setErr(message(e, zh ? '登录失败' : 'Sign-in failed'))
    } finally {
      setLoading(false)
    }
  }

  /** Email + password registration. With email confirmation on, the account
   *  becomes usable once the verification link is clicked; the link lands on
   *  the auth callback (allow-listed), which sends a brand-new account through
   *  onboarding — and the homepage does the same should it land there. */
  const signUpWithPassword = async (e?: FormEvent) => {
    e?.preventDefault()
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
      const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: callbackUrl() } })
      if (error) {
        if (error.message?.includes('already registered')) throw alreadyRegistered()
        throw error
      }
      // With email confirmation ON, signUp for an already-registered address
      // returns success with an empty identities array (anti-enumeration).
      if (data.user && data.user.identities?.length === 0) throw alreadyRegistered()
      // A session comes back only when autoconfirm is on; otherwise the
      // verification link must be clicked first.
      if (data.session) {
        window.location.href = callbackUrl()
        return
      }
      setSent('verify')
    } catch (e: unknown) {
      setErr(message(e, zh ? '注册失败' : 'Registration failed'))
    } finally {
      setLoading(false)
    }
  }

  const signInWithGoogle = async () => {
    setErr(null)
    try {
      const supabase = getSupabaseBrowser()
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: typeof window !== 'undefined' ? callbackUrl() : undefined },
      })
      if (error) throw error
    } catch (e: unknown) {
      setErr(message(e, zh ? '登录失败' : 'Sign-in failed'))
    }
  }

  const resendConfirm = async () => {
    setLoading(true)
    setErr(null)
    try {
      const supabase = getSupabaseBrowser()
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: typeof window !== 'undefined' ? callbackUrl() : undefined },
      })
      if (error) throw error
      setNeedsConfirm(false)
      setSent('verify')
    } catch (e: unknown) {
      setErr(message(e, zh ? '发送失败' : 'Failed to send'))
    } finally {
      setLoading(false)
    }
  }

  const forgotPassword = async () => {
    if (!email) {
      setErr(zh ? '请先输入邮箱' : 'Please enter your email first')
      return
    }
    setLoading(true)
    setErr(null)
    try {
      const supabase = getSupabaseBrowser()
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/auth/reset-password` : undefined,
      })
      if (error) throw error
      setErr(null)
      setSent('reset')
    } catch (e: unknown) {
      setErr(message(e, zh ? '发送失败' : 'Failed to send'))
    } finally {
      setLoading(false)
    }
  }

  const back = () => setSent(null)

  return { zh, tab, setTab, email, setEmail, password, setPassword, password2, setPassword2, sent, back, loading, err, needsConfirm, signInWithPassword, signUpWithPassword, signInWithGoogle, resendConfirm, forgotPassword }
}
