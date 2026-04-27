'use client'
/**
 * AuthModal — progressive single-flow auth (Airbnb-inspired)
 *
 * State machine:
 *   EMAIL          → user types email, clicks Continue
 *   WELCOME_BACK   → returning user (localStorage match), asks only for password
 *   SIGNIN         → unknown user entered email; ask for password
 *   SIGNUP         → user explicitly chose "Create new account"; ask password + role
 *   RESET_SENT     → password reset email sent
 *   CHECK_EMAIL    → signup confirmation email sent
 *
 * vs. previous design: no login/register tabs. We figure out the user's
 * state from what they type and remember returning users via localStorage.
 */
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useT } from '@/lib/i18n'
import { useRouter } from 'next/navigation'

/* ── Palette ── */
const mk = {
  surface:     '#FFFFFF',
  border:      '#E4E8F0',
  borderStrong:'#CBD5E1',
  text:        '#0B1736',
  textSec:     '#475569',
  textMuted:   '#64748B',
  textFaint:   '#94A3B8',
  brand:       '#10B981',
  brandStrong: '#059669',
  brandSoft:   '#ECFDF5',
  navy:        '#0B1736',
  red:         '#E11D48',
  redSoft:     '#FFF1F2',
  greenSoft:   '#ECFDF5',
  green:       '#059669',
} as const

type Step = 'email' | 'welcome_back' | 'signin' | 'signup' | 'reset_sent' | 'check_email'
type Role = 'landlord' | 'tenant' | 'agent'

export interface AuthModalProps {
  open: boolean
  onClose: () => void
  /** If 'signup', start on signup step (skips email gate). Default: auto-detect from localStorage */
  defaultTab?: 'login' | 'register'
  /** Where to redirect after successful auth */
  next?: string
}

/* ── localStorage helper for welcome-back ── */
const WB_KEY = 'stayloop:lastAuth'
const WB_TTL_MS = 60 * 24 * 60 * 60 * 1000 // 60 days

interface WelcomeBackData { email: string; displayName: string; savedAt: number }

function readWelcomeBack(): WelcomeBackData | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(WB_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as WelcomeBackData
    if (!parsed.email) return null
    if (Date.now() - (parsed.savedAt || 0) > WB_TTL_MS) return null
    return parsed
  } catch { return null }
}

function saveWelcomeBack(email: string, displayName?: string) {
  if (typeof window === 'undefined') return
  try {
    const data: WelcomeBackData = {
      email, displayName: displayName || email.split('@')[0], savedAt: Date.now(),
    }
    localStorage.setItem(WB_KEY, JSON.stringify(data))
  } catch {}
}

function clearWelcomeBack() {
  if (typeof window === 'undefined') return
  try { localStorage.removeItem(WB_KEY) } catch {}
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!domain || local.length <= 2) return email
  return `${local[0]}${'*'.repeat(Math.min(3, local.length - 2))}${local.slice(-1)}@${domain}`
}

/* ═════════════════════════════════════════════════════════════════
   COMPONENT
════════════════════════════════════════════════════════════════ */

export default function AuthModal({ open, onClose, defaultTab, next = '/screen' }: AuthModalProps) {
  const { t } = useT()
  const router = useRouter()
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/screen'

  /* State */
  const [step, setStep] = useState<Step>('email')
  const [welcomeBack, setWelcomeBack] = useState<WelcomeBackData | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [selectedRole, setSelectedRole] = useState<Role | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resettingPw, setResettingPw] = useState(false)

  const emailInputRef = useRef<HTMLInputElement>(null)
  const passwordInputRef = useRef<HTMLInputElement>(null)

  /* ── Init on open ── */
  useEffect(() => {
    if (!open) return
    setError(null)
    setSubmitting(false)
    setShowPassword(false)
    setPassword('')

    // Explicit register request → jump straight to signup
    if (defaultTab === 'register') {
      setStep('signup')
      clearWelcomeBack() // start fresh when user wants to register
      setEmail('')
      return
    }

    // Otherwise: welcome back if we have a recent user
    const wb = readWelcomeBack()
    if (wb) {
      setWelcomeBack(wb)
      setEmail(wb.email)
      setStep('welcome_back')
    } else {
      setWelcomeBack(null)
      setEmail('')
      setStep('email')
    }
  }, [open, defaultTab])

  /* ── Focus management ── */
  useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => {
      if (step === 'email') emailInputRef.current?.focus()
      if (step === 'signin' || step === 'signup' || step === 'welcome_back') {
        passwordInputRef.current?.focus()
      }
    }, 100)
    return () => clearTimeout(timer)
  }, [step, open])

  /* ── Esc to close ── */
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [open, onClose])

  /* ── Lock scroll ── */
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  /* ═════════════════════════ Handlers ═════════════════════════ */

  function isValidEmail(e: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())
  }

  function handleContinueFromEmail(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!isValidEmail(email)) { setError(t('am.emailInvalid')); return }
    // Go to signin step — if it fails, we offer "create account" path
    setStep('signin')
    setPassword('')
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password })
    setSubmitting(false)
    if (authError) { setError(authError.message); return }
    // success
    saveWelcomeBack(email, data?.user?.user_metadata?.full_name)
    onClose()
    router.replace(safeNext)
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedRole) { setError(t('register.roleRequired')); return }
    if (password.length < 6) { setError(t('register.passwordTooShort')); return }
    if (!isValidEmail(email)) { setError(t('am.emailInvalid')); return }
    setSubmitting(true)
    setError(null)

    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext)}`
    const { data, error: authError } = await supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: redirectTo, data: { role: selectedRole } },
    })
    setSubmitting(false)
    if (authError) { setError(authError.message); return }
    saveWelcomeBack(email)
    if (data?.session) { onClose(); window.location.href = safeNext; return }
    setStep('check_email')
  }

  async function handleGoogle() {
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext)}`
    await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } })
  }

  async function handleForgotPassword() {
    if (!email) { setError(t('login.enterEmail')); return }
    setResettingPw(true)
    setError(null)
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    })
    setResettingPw(false)
    if (err) { setError(err.message); return }
    setStep('reset_sent')
  }

  function switchToSignup() {
    setStep('signup')
    setError(null)
    setPassword('')
    setSelectedRole(null)
  }

  function switchToSignin() {
    setStep('signin')
    setError(null)
    setPassword('')
  }

  function forgetUser() {
    clearWelcomeBack()
    setWelcomeBack(null)
    setEmail('')
    setPassword('')
    setStep('email')
    setError(null)
  }

  function backToEmail() {
    setStep('email')
    setError(null)
    setPassword('')
  }

  /* ═════════════════════════ Shared styles ═════════════════════════ */

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '14px 14px', borderRadius: 10,
    border: `1px solid ${mk.borderStrong}`, background: mk.surface,
    color: mk.text, fontSize: 15, outline: 'none',
    transition: 'border-color .15s, box-shadow .15s',
    boxSizing: 'border-box',
  }
  const focusIn = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = mk.brand
    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(13,148,136,0.1)'
  }
  const focusOut = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = mk.borderStrong
    e.currentTarget.style.boxShadow = 'none'
  }
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 12, fontWeight: 600, color: mk.textSec,
    textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6,
  }
  const primaryBtnStyle: React.CSSProperties = {
    width: '100%', padding: '13px 20px', borderRadius: 10,
    background: `linear-gradient(135deg, ${mk.brand}, ${mk.brandStrong})`,
    color: '#fff', fontSize: 15, fontWeight: 650, border: 'none', cursor: 'pointer',
    boxShadow: '0 8px 22px -10px rgba(13,148,136,0.6), inset 0 1px 0 rgba(255,255,255,0.15)',
    transition: 'transform .15s, box-shadow .2s',
  }
  const textLinkStyle: React.CSSProperties = {
    color: mk.brand, background: 'none', border: 'none', cursor: 'pointer',
    padding: 0, fontSize: 13, fontWeight: 600, textDecoration: 'underline',
  }

  /* ═════════════════════════ Title & subtitle by step ═════════════════════════ */

  let title = t('am.title')
  let subtitle: string | null = null
  if (step === 'welcome_back' && welcomeBack) {
    title = t('am.titleWelcome')
    subtitle = t('am.greeting', { name: welcomeBack.displayName })
  } else if (step === 'signup') {
    title = t('am.titleSignup')
  } else if (step === 'signin') {
    subtitle = maskEmail(email)
  }

  const PasswordEye = () => (
    <button type="button" onClick={() => setShowPassword(!showPassword)}
      style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: mk.textFaint, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      tabIndex={-1} aria-label={showPassword ? 'Hide' : 'Show'}>
      {showPassword ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
      )}
    </button>
  )

  const roleOptions: { id: Role; label: string; icon: string }[] = [
    { id: 'landlord', label: t('register.roleLandlord'), icon: '🏠' },
    { id: 'tenant',   label: t('register.roleTenant'),   icon: '🔑' },
    { id: 'agent',    label: t('register.roleAgent'),    icon: '🏢' },
  ]

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, zIndex: 9998,
        background: 'rgba(0,0,0,0.45)',
        backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
        animation: 'authFadeIn .2s ease',
      }} />

      {/* Modal wrapper */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16, pointerEvents: 'none',
      }}>
        <div onClick={e => e.stopPropagation()} style={{
          pointerEvents: 'auto',
          width: '100%', maxWidth: 440,
          maxHeight: 'calc(100vh - 32px)',
          overflowY: 'auto',
          background: mk.surface,
          borderRadius: 16,
          boxShadow: '0 24px 80px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.04)',
          animation: 'authSlideUp .25s ease',
          position: 'relative',
        }}>

          {/* ── Header bar (Airbnb-style): back/close + title ── */}
          <div style={{
            position: 'relative',
            padding: '16px 56px',
            borderBottom: `1px solid ${mk.border}`,
            textAlign: 'center',
          }}>
            <button onClick={onClose}
              style={{
                position: 'absolute', top: 14, left: 14,
                width: 32, height: 32, borderRadius: '50%',
                background: 'transparent', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: mk.text, transition: 'background .15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#F1F5F9')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              aria-label="Close"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
            <div style={{ fontSize: 15, fontWeight: 700, color: mk.text }}>{title}</div>
          </div>

          {/* ── Body ── */}
          <div style={{ padding: '24px 28px 28px' }}>

            {/* Greeting heading (welcome back / signin) */}
            {(step === 'welcome_back' || step === 'signin') && (
              <div style={{ marginBottom: 22 }}>
                <h2 style={{ fontSize: 22, fontWeight: 700, color: mk.navy, letterSpacing: '-0.02em', margin: '0 0 4px' }}>
                  {step === 'welcome_back'
                    ? t('am.greeting', { name: welcomeBack?.displayName || '' })
                    : 'Stayloop'}
                </h2>
                {subtitle && step === 'signin' && (
                  <p style={{ fontSize: 14, color: mk.textMuted, margin: 0 }}>{subtitle}</p>
                )}
                {step === 'welcome_back' && welcomeBack && (
                  <p style={{ fontSize: 14, color: mk.textMuted, margin: 0 }}>{maskEmail(welcomeBack.email)}</p>
                )}
              </div>
            )}

            {step === 'signup' && (
              <div style={{ marginBottom: 22 }}>
                <h2 style={{ fontSize: 22, fontWeight: 700, color: mk.navy, letterSpacing: '-0.02em', margin: '0 0 4px' }}>
                  {t('am.titleSignup')}
                </h2>
                <p style={{ fontSize: 14, color: mk.textMuted, margin: 0 }}>{email}</p>
              </div>
            )}

            {step === 'email' && (
              <div style={{ marginBottom: 22 }}>
                <h2 style={{ fontSize: 22, fontWeight: 700, color: mk.navy, letterSpacing: '-0.02em', margin: '0 0 4px' }}>
                  Stayloop
                </h2>
                <p style={{ fontSize: 14, color: mk.textMuted, margin: 0 }}>{t('am.title')}</p>
              </div>
            )}

            {/* ═════════════ STEP: EMAIL ═════════════ */}
            {step === 'email' && (
              <form onSubmit={handleContinueFromEmail} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={labelStyle}>{t('am.emailLabel')}</label>
                  <input ref={emailInputRef} required type="email" value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    style={inputStyle} onFocus={focusIn} onBlur={focusOut} autoComplete="email" />
                </div>
                {error && <ErrorBox text={error} />}
                <button type="submit" style={primaryBtnStyle}>{t('am.continue')}</button>

                <Divider text={t('am.or')} />

                <button type="button" onClick={handleGoogle} style={googleBtnStyle}>
                  <GoogleIcon />
                  {t('am.continueWithGoogle')}
                </button>

                <p style={{ fontSize: 12, color: mk.textFaint, textAlign: 'center', marginTop: 4, lineHeight: 1.5 }}>
                  {t('am.byContinuing')}
                </p>
              </form>
            )}

            {/* ═════════════ STEP: WELCOME BACK ═════════════ */}
            {step === 'welcome_back' && (
              <form onSubmit={handleSignIn} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={labelStyle}>{t('am.passwordLabel')}</label>
                  <div style={{ position: 'relative' }}>
                    <input ref={passwordInputRef} required type={showPassword ? 'text' : 'password'}
                      value={password} onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••" autoComplete="current-password"
                      style={{ ...inputStyle, paddingRight: 44 }} onFocus={focusIn} onBlur={focusOut} />
                    <PasswordEye />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <button type="button" onClick={handleForgotPassword} disabled={resettingPw}
                    style={{ ...textLinkStyle, fontSize: 13 }}>
                    {resettingPw ? t('login.sending') : t('am.forgotPassword')}
                  </button>
                  <button type="button" onClick={forgetUser} style={{ ...textLinkStyle, fontSize: 13 }}>
                    {t('am.notYouAction')}
                  </button>
                </div>

                {error && <ErrorBox text={error} />}

                <button type="submit" disabled={submitting} style={{ ...primaryBtnStyle, opacity: submitting ? 0.6 : 1 }}>
                  {submitting ? t('am.signingIn') : t('am.signInBtn')}
                </button>
              </form>
            )}

            {/* ═════════════ STEP: SIGNIN ═════════════ */}
            {step === 'signin' && (
              <form onSubmit={handleSignIn} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <button type="button" onClick={backToEmail}
                  style={{ alignSelf: 'flex-start', ...textLinkStyle, fontSize: 13, marginBottom: -4, textDecoration: 'none' }}>
                  {t('am.backToEmail')}
                </button>

                <div>
                  <label style={labelStyle}>{t('am.passwordLabel')}</label>
                  <div style={{ position: 'relative' }}>
                    <input ref={passwordInputRef} required type={showPassword ? 'text' : 'password'}
                      value={password} onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••" autoComplete="current-password"
                      style={{ ...inputStyle, paddingRight: 44 }} onFocus={focusIn} onBlur={focusOut} />
                    <PasswordEye />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button type="button" onClick={handleForgotPassword} disabled={resettingPw}
                    style={{ ...textLinkStyle, fontSize: 13 }}>
                    {resettingPw ? t('login.sending') : t('am.forgotPassword')}
                  </button>
                </div>

                {error && <ErrorBox text={error} />}

                <button type="submit" disabled={submitting} style={{ ...primaryBtnStyle, opacity: submitting ? 0.6 : 1 }}>
                  {submitting ? t('am.signingIn') : t('am.signInBtn')}
                </button>

                <p style={{ fontSize: 13, color: mk.textSec, textAlign: 'center', marginTop: 4 }}>
                  {t('am.noAccount')}{' '}
                  <button type="button" onClick={switchToSignup} style={{ ...textLinkStyle, fontSize: 13 }}>
                    {t('am.createNew')}
                  </button>
                </p>
              </form>
            )}

            {/* ═════════════ STEP: SIGNUP ═════════════ */}
            {step === 'signup' && (
              <form onSubmit={handleSignUp} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Email field is visible here because signup might be triggered with blank email */}
                {!email && (
                  <div>
                    <label style={labelStyle}>{t('am.emailLabel')}</label>
                    <input required type="email" value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      style={inputStyle} onFocus={focusIn} onBlur={focusOut} autoComplete="email" />
                  </div>
                )}
                {email && (
                  <button type="button" onClick={backToEmail}
                    style={{ alignSelf: 'flex-start', ...textLinkStyle, fontSize: 13, marginBottom: -4, textDecoration: 'none' }}>
                    {t('am.backToEmail')}
                  </button>
                )}

                <div>
                  <label style={labelStyle}>{t('am.passwordLabel')}</label>
                  <div style={{ position: 'relative' }}>
                    <input ref={passwordInputRef} required type={showPassword ? 'text' : 'password'}
                      value={password} onChange={e => setPassword(e.target.value)}
                      placeholder="••••••" autoComplete="new-password"
                      style={{ ...inputStyle, paddingRight: 44 }} onFocus={focusIn} onBlur={focusOut} />
                    <PasswordEye />
                  </div>
                  <p style={{ fontSize: 12, color: mk.textFaint, marginTop: 6 }}>{t('am.passwordHint')}</p>
                </div>

                <div>
                  <label style={labelStyle}>{t('am.roleLabel')}</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                    {roleOptions.map(role => (
                      <button key={role.id} type="button" onClick={() => setSelectedRole(role.id)}
                        style={{
                          borderRadius: 12, cursor: 'pointer',
                          border: selectedRole === role.id ? `2px solid ${mk.brand}` : `1px solid ${mk.border}`,
                          background: selectedRole === role.id ? mk.brandSoft : mk.surface,
                          padding: selectedRole === role.id ? '13px 4px' : '14px 4px',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                          transition: 'all 0.2s ease',
                          color: selectedRole === role.id ? mk.brandStrong : mk.text,
                        }}>
                        <div style={{ fontSize: 20 }}>{role.icon}</div>
                        <div style={{ fontSize: 11, fontWeight: 650, textAlign: 'center' }}>{role.label}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {error && <ErrorBox text={error} />}

                <button type="submit" disabled={submitting} style={{ ...primaryBtnStyle, opacity: submitting ? 0.6 : 1 }}>
                  {submitting ? t('am.creating') : t('am.createBtn')}
                </button>

                <p style={{ fontSize: 13, color: mk.textSec, textAlign: 'center', marginTop: 4 }}>
                  {t('am.hasAccount')}{' '}
                  <button type="button" onClick={switchToSignin} style={{ ...textLinkStyle, fontSize: 13 }}>
                    {t('am.signInInstead')}
                  </button>
                </p>

                <p style={{ fontSize: 12, color: mk.textFaint, textAlign: 'center', marginTop: 4, lineHeight: 1.5 }}>
                  {t('am.byContinuing')}
                </p>
              </form>
            )}

            {/* ═════════════ STEP: RESET SENT ═════════════ */}
            {step === 'reset_sent' && (
              <SuccessPanel
                title={t('login.resetSent')}
                detail={t('login.resetDetail', { email })}
                actionLabel={t('login.backToLogin')}
                onAction={() => setStep(welcomeBack ? 'welcome_back' : 'signin')}
              />
            )}

            {/* ═════════════ STEP: CHECK EMAIL ═════════════ */}
            {step === 'check_email' && (
              <SuccessPanel
                title={t('register.success')}
                detail={t('register.sentDetail', { email })}
              />
            )}

            {/* Footer */}
            {step !== 'reset_sent' && step !== 'check_email' && (
              <p style={{ marginTop: 20, fontSize: 10.5, color: mk.textFaint, textAlign: 'center', fontFamily: 'JetBrains Mono, monospace' }}>
                {t('login.footer')}
              </p>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes authFadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes authSlideUp { from { opacity: 0; transform: translateY(16px) scale(0.97) } to { opacity: 1; transform: translateY(0) scale(1) } }
      `}</style>
    </>
  )
}

/* ═════════════════════════ Helpers ═════════════════════════ */

function ErrorBox({ text }: { text: string }) {
  return (
    <div style={{
      borderRadius: 10, border: '1px solid rgba(225,29,72,0.2)',
      background: mk.redSoft, color: mk.red, fontSize: 13, padding: '10px 14px',
    }}>{text}</div>
  )
}

function Divider({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '6px 0' }}>
      <div style={{ flex: 1, height: 1, background: mk.border }} />
      <span style={{ fontSize: 12, color: mk.textFaint, fontWeight: 500 }}>{text}</span>
      <div style={{ flex: 1, height: 1, background: mk.border }} />
    </div>
  )
}

function SuccessPanel({ title, detail, actionLabel, onAction }: {
  title: string; detail: string; actionLabel?: string; onAction?: () => void
}) {
  return (
    <div style={{ borderRadius: 14, border: '1px solid rgba(5,150,105,0.25)', background: mk.greenSoft, padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(5,150,105,0.12)', border: '1px solid rgba(5,150,105,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: mk.green, fontSize: 16, flexShrink: 0 }}>✓</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, color: mk.green, marginBottom: 4 }}>{title}</div>
          <div style={{ fontSize: 13, color: mk.textSec, lineHeight: 1.6 }}>{detail}</div>
          {actionLabel && onAction && (
            <button onClick={onAction}
              style={{ marginTop: 12, fontSize: 13, color: mk.brand, textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}>
              {actionLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

const googleBtnStyle: React.CSSProperties = {
  width: '100%', padding: '12px 16px',
  border: `1px solid ${mk.borderStrong}`, borderRadius: 10,
  background: mk.surface, color: mk.navy,
  fontSize: 14, fontWeight: 600, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
  transition: 'border-color .2s, box-shadow .2s',
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}
