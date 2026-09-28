'use client'

// The sign-in form's state and handlers, shared by the /login page and the
// homepage's login card (V0.7, 2026-09-27) so the two never drift: Google
// OAuth, a one-time email link (which also registers a new account), and
// email + password, plus resend-confirmation and forgot-password. Rendering
// is the caller's; this hook owns nothing visual.
import { useState, type FormEvent } from 'react'
import { getSupabaseBrowser } from '@/lib/supabase'
import { useT } from '@/lib/i18n'

export type LoginTab = 'password' | 'magic-link'

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

export function useLoginForm(initialTab: LoginTab = 'password') {
  const { lang } = useT()
  const zh = lang === 'zh'
  const [tab, setTabState] = useState<LoginTab>(initialTab)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [needsConfirm, setNeedsConfirm] = useState(false)

  const setTab = (t: LoginTab) => { setTabState(t); setErr(null) }
  const message = (e: unknown, fallback: string) => (e as { message?: string })?.message || fallback

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

  const sendMagicLink = async (e?: FormEvent) => {
    e?.preventDefault()
    setLoading(true)
    setErr(null)
    try {
      const supabase = getSupabaseBrowser()
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: typeof window !== 'undefined' ? callbackUrl() : undefined },
      })
      if (error) throw error
      setSent(true)
    } catch (e: unknown) {
      setErr(message(e, zh ? '发送失败' : 'Failed to send'))
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
      setSent(true)
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
      setSent(true)
    } catch (e: unknown) {
      setErr(message(e, zh ? '发送失败' : 'Failed to send'))
    } finally {
      setLoading(false)
    }
  }

  const back = () => setSent(false)

  return { zh, tab, setTab, email, setEmail, password, setPassword, sent, back, loading, err, needsConfirm, signInWithPassword, sendMagicLink, signInWithGoogle, resendConfirm, forgotPassword }
}
