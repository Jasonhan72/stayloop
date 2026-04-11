'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useT } from '@/lib/i18n'
import { useRouter } from 'next/navigation'

/* ── Palette ── */
const mk = {
  bg:          '#F7F8FB',
  surface:     '#FFFFFF',
  border:      '#E4E8F0',
  borderStrong:'#CBD5E1',
  text:        '#0B1736',
  textSec:     '#475569',
  textMuted:   '#64748B',
  textFaint:   '#94A3B8',
  brand:       '#0D9488',
  brandStrong: '#0F766E',
  brandSoft:   '#CCFBF1',
  navy:        '#0B1736',
  red:         '#E11D48',
  redSoft:     '#FFF1F2',
  greenSoft:   '#ECFDF5',
  green:       '#059669',
} as const

type AuthTab = 'login' | 'register'
type Role = 'landlord' | 'tenant' | 'agent'

export interface AuthModalProps {
  open: boolean
  onClose: () => void
  defaultTab?: AuthTab
  /** Where to redirect after successful auth */
  next?: string
}

export default function AuthModal({ open, onClose, defaultTab = 'login', next = '/screen' }: AuthModalProps) {
  const { t } = useT()
  const router = useRouter()
  const [tab, setTab] = useState<AuthTab>(defaultTab)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [selectedRole, setSelectedRole] = useState<Role | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resetSent, setResetSent] = useState(false)
  const [resettingPw, setResettingPw] = useState(false)
  const [registerSuccess, setRegisterSuccess] = useState(false)

  // Reset state when modal opens/tab changes
  useEffect(() => { setTab(defaultTab) }, [defaultTab])
  useEffect(() => {
    if (open) {
      setError(null)
      setResetSent(false)
      setRegisterSuccess(false)
    }
  }, [open])

  // Esc key to close
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/screen'

  /* ── Handlers ── */
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError) { setSubmitting(false); setError(authError.message); return }
    setSubmitting(false)
    onClose()
    router.replace(safeNext)
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedRole) { setError(t('register.roleRequired')); return }
    if (password.length < 6) { setError(t('register.passwordTooShort')); return }
    setSubmitting(true)
    setError(null)

    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext)}`
    const { data, error: authError } = await supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: redirectTo, data: { role: selectedRole } },
    })
    setSubmitting(false)
    if (authError) { setError(authError.message); return }
    if (data?.session) { onClose(); window.location.href = safeNext; return }
    setRegisterSuccess(true)
  }

  async function handleGoogle() {
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext)}`
    await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } })
  }

  async function handleForgotPassword(e: React.MouseEvent) {
    e.preventDefault()
    if (!email) { setError(t('login.enterEmail')); return }
    setResettingPw(true)
    setError(null)
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    })
    setResettingPw(false)
    if (resetError) { setError(resetError.message); return }
    setResetSent(true)
  }

  function switchTab(newTab: AuthTab) {
    setTab(newTab)
    setError(null)
    setResetSent(false)
    setRegisterSuccess(false)
  }

  /* ── Styles ── */
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '12px 14px', borderRadius: 10,
    border: `1px solid ${mk.border}`, background: mk.surface,
    color: mk.text, fontSize: 14, transition: 'border-color .15s, box-shadow .15s',
    outline: 'none', boxSizing: 'border-box',
  }
  const focusIn = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = mk.brand
    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(13,148,136,0.1)'
  }
  const focusOut = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = mk.border
    e.currentTarget.style.boxShadow = 'none'
  }
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 12, fontWeight: 600, color: mk.textSec,
    textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6,
  }

  const roleOptions = [
    { id: 'landlord' as const, label: t('register.roleLandlord'), icon: '🏠' },
    { id: 'tenant' as const, label: t('register.roleTenant'), icon: '🔑' },
    { id: 'agent' as const, label: t('register.roleAgent'), icon: '🏢' },
  ]

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 9998,
          background: 'rgba(0,0,0,0.45)',
          backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
          animation: 'authFadeIn .2s ease',
        }}
      />

      {/* Modal */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16, pointerEvents: 'none',
      }}>
        <div
          onClick={e => e.stopPropagation()}
          style={{
            pointerEvents: 'auto',
            width: '100%', maxWidth: 440,
            maxHeight: 'calc(100vh - 32px)',
            overflowY: 'auto',
            background: mk.surface,
            borderRadius: 20,
            boxShadow: '0 24px 80px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.04)',
            animation: 'authSlideUp .25s ease',
            position: 'relative',
          }}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            style={{
              position: 'absolute', top: 14, right: 14, zIndex: 10,
              width: 32, height: 32, borderRadius: '50%',
              background: 'transparent', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: mk.textMuted, transition: 'background .15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#F1F5F9')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            aria-label="Close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>

          {/* Header with tabs */}
          <div style={{ borderBottom: `1px solid ${mk.border}`, padding: '20px 28px 0' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: mk.brand, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'JetBrains Mono, monospace', marginBottom: 14 }}>
              Stayloop
            </div>
            <div style={{ display: 'flex', gap: 0 }}>
              {(['login', 'register'] as const).map(t2 => (
                <button
                  key={t2}
                  onClick={() => switchTab(t2)}
                  style={{
                    flex: 1, padding: '12px 0', fontSize: 14, fontWeight: 600,
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: tab === t2 ? mk.text : mk.textFaint,
                    borderBottom: tab === t2 ? `2px solid ${mk.text}` : '2px solid transparent',
                    transition: 'color .15s, border-color .15s',
                  }}
                >
                  {t2 === 'login' ? t('am.tabLogin') : t('am.tabRegister')}
                </button>
              ))}
            </div>
          </div>

          {/* Body */}
          <div style={{ padding: '24px 28px 28px' }}>

            {/* ── Google button (always on top, Airbnb style) ── */}
            <button type="button" onClick={handleGoogle} style={{
              width: '100%', padding: '12px 16px',
              border: `1px solid ${mk.borderStrong}`, borderRadius: 10,
              background: mk.surface, color: mk.navy,
              fontSize: 14, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              transition: 'border-color .2s, box-shadow .2s',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = mk.textMuted; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = mk.borderStrong; e.currentTarget.style.boxShadow = 'none' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
              {t('login.googleBtn')}
            </button>

            {/* Divider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
              <div style={{ flex: 1, height: 1, background: mk.border }} />
              <span style={{ fontSize: 12, color: mk.textFaint, fontWeight: 500 }}>{t('login.or')}</span>
              <div style={{ flex: 1, height: 1, background: mk.border }} />
            </div>

            {/* ── LOGIN TAB ── */}
            {tab === 'login' && !resetSent && (
              <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={labelStyle}>{t('login.emailLabel')}</label>
                  <input required type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com" style={inputStyle} onFocus={focusIn} onBlur={focusOut} />
                </div>
                <div>
                  <label style={labelStyle}>{t('login.passwordLabel')}</label>
                  <div style={{ position: 'relative' }}>
                    <input required type={showPassword ? 'text' : 'password'} value={password}
                      onChange={e => setPassword(e.target.value)} placeholder="••••••••"
                      style={{ ...inputStyle, paddingRight: 42 }} onFocus={focusIn} onBlur={focusOut} />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: mk.textFaint, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      tabIndex={-1} aria-label={showPassword ? 'Hide' : 'Show'}>
                      {showPassword ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      )}
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button type="button" onClick={handleForgotPassword} disabled={resettingPw}
                    style={{ fontSize: 13, color: mk.brand, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 500 }}>
                    {resettingPw ? t('login.sending') : t('login.forgotPassword')}
                  </button>
                </div>

                {error && (
                  <div style={{ borderRadius: 10, border: '1px solid rgba(225,29,72,0.2)', background: mk.redSoft, color: mk.red, fontSize: 13, padding: '10px 14px' }}>
                    {error}
                  </div>
                )}

                <button type="submit" disabled={submitting} style={{
                  width: '100%', padding: '13px 20px', borderRadius: 10,
                  background: `linear-gradient(135deg, ${mk.brand}, ${mk.brandStrong})`,
                  color: '#fff', fontSize: 14.5, fontWeight: 650, border: 'none', cursor: 'pointer',
                  boxShadow: '0 8px 22px -10px rgba(13,148,136,0.6), inset 0 1px 0 rgba(255,255,255,0.15)',
                  transition: 'transform .15s, box-shadow .2s',
                  opacity: submitting ? 0.6 : 1,
                }}>
                  {submitting ? t('login.submitting') : t('login.submit')}
                </button>

                <p style={{ fontSize: 13, color: mk.textSec, textAlign: 'center', marginTop: 4 }}>
                  {t('login.noAccount')}{' '}
                  <button type="button" onClick={() => switchTab('register')}
                    style={{ color: mk.brand, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }}>
                    {t('login.signUp')}
                  </button>
                </p>
              </form>
            )}

            {/* Reset sent */}
            {tab === 'login' && resetSent && (
              <div style={{ borderRadius: 14, border: '1px solid rgba(5,150,105,0.25)', background: mk.greenSoft, padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(5,150,105,0.12)', border: '1px solid rgba(5,150,105,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: mk.green, fontSize: 16, flexShrink: 0 }}>✓</div>
                  <div>
                    <div style={{ fontWeight: 700, color: mk.green, marginBottom: 4 }}>{t('login.resetSent')}</div>
                    <div style={{ fontSize: 13, color: mk.textSec, lineHeight: 1.6 }}>{t('login.resetDetail', { email })}</div>
                    <button onClick={() => setResetSent(false)}
                      style={{ marginTop: 12, fontSize: 13, color: mk.brand, textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}>
                      {t('login.backToLogin')}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── REGISTER TAB ── */}
            {tab === 'register' && !registerSuccess && (
              <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={labelStyle}>{t('register.emailLabel')}</label>
                  <input required type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com" style={inputStyle} onFocus={focusIn} onBlur={focusOut} />
                </div>
                <div>
                  <label style={labelStyle}>{t('register.passwordLabel')}</label>
                  <div style={{ position: 'relative' }}>
                    <input required type={showPassword ? 'text' : 'password'} value={password}
                      onChange={e => setPassword(e.target.value)} placeholder="••••••"
                      style={{ ...inputStyle, paddingRight: 42 }} onFocus={focusIn} onBlur={focusOut} />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: mk.textFaint, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      tabIndex={-1}>
                      {showPassword ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      )}
                    </button>
                  </div>
                  <p style={{ fontSize: 12, color: mk.textFaint, marginTop: 6 }}>{t('register.passwordHint')}</p>
                </div>

                {/* Role selector */}
                <div>
                  <label style={labelStyle}>{t('register.roleLabel')}</label>
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

                {error && (
                  <div style={{ borderRadius: 10, border: '1px solid rgba(225,29,72,0.2)', background: mk.redSoft, color: mk.red, fontSize: 13, padding: '10px 14px' }}>
                    {error}
                  </div>
                )}

                <button type="submit" disabled={submitting} style={{
                  width: '100%', padding: '13px 20px', borderRadius: 10,
                  background: `linear-gradient(135deg, ${mk.brand}, ${mk.brandStrong})`,
                  color: '#fff', fontSize: 14.5, fontWeight: 650, border: 'none', cursor: 'pointer',
                  boxShadow: '0 8px 22px -10px rgba(13,148,136,0.6), inset 0 1px 0 rgba(255,255,255,0.15)',
                  transition: 'transform .15s, box-shadow .2s',
                  opacity: submitting ? 0.6 : 1,
                }}>
                  {submitting ? t('register.submitting') : t('register.submit') + ' →'}
                </button>

                <p style={{ fontSize: 13, color: mk.textSec, textAlign: 'center', marginTop: 4 }}>
                  {t('register.hasAccount')}{' '}
                  <button type="button" onClick={() => switchTab('login')}
                    style={{ color: mk.brand, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }}>
                    {t('register.signIn')}
                  </button>
                </p>
              </form>
            )}

            {/* Register success */}
            {tab === 'register' && registerSuccess && (
              <div style={{ borderRadius: 14, border: '1px solid rgba(5,150,105,0.25)', background: mk.greenSoft, padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(5,150,105,0.12)', border: '1px solid rgba(5,150,105,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: mk.green, fontSize: 16, flexShrink: 0 }}>✓</div>
                  <div>
                    <div style={{ fontWeight: 700, color: mk.green, marginBottom: 4 }}>{t('register.success')}</div>
                    <div style={{ fontSize: 13, color: mk.textSec, lineHeight: 1.6 }}>{t('register.sentDetail', { email })}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Footer */}
            <p style={{ marginTop: 20, fontSize: 10.5, color: mk.textFaint, textAlign: 'center', fontFamily: 'JetBrains Mono, monospace' }}>
              {t('login.footer')}
            </p>
          </div>
        </div>
      </div>

      {/* Keyframes */}
      <style>{`
        @keyframes authFadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes authSlideUp { from { opacity: 0; transform: translateY(16px) scale(0.97) } to { opacity: 1; transform: translateY(0) scale(1) } }
      `}</style>
    </>
  )
}
