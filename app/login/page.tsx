'use client'
import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useT, LanguageToggle } from '@/lib/i18n'

/* ── Marketing-matching palette (mirrors .marketing CSS vars) ── */
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

function LoginInner() {
  const { t } = useT()
  const router = useRouter()
  const searchParams = useSearchParams()
  const nextParam = searchParams.get('next') || '/screen'
  const safeNext = nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/screen'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [resettingPassword, setResettingPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError) {
      setSubmitting(false)
      setError(authError.message)
      return
    }
    router.replace(safeNext)
  }

  async function handleForgotPassword(e: React.MouseEvent) {
    e.preventDefault()
    if (!email) { setError(t('login.enterEmail')); return }
    setResettingPassword(true)
    setError(null)
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    })
    setResettingPassword(false)
    if (resetError) { setError(resetError.message); return }
    setResetSent(true)
  }

  async function handleGoogle() {
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext)}`
    await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } })
  }

  /* ── shared inline-style objects ── */
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 14px',
    borderRadius: 10,
    border: `1px solid ${mk.border}`,
    background: mk.surface,
    color: mk.text,
    fontSize: 14,
    transition: 'border-color .15s, box-shadow .15s',
    outline: 'none',
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: mk.bg, fontFamily: 'Inter, -apple-system, system-ui, sans-serif' }}>

      {/* ── Nav ── */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(247,248,251,0.82)',
        backdropFilter: 'saturate(1.6) blur(14px)',
        WebkitBackdropFilter: 'saturate(1.6) blur(14px)',
        borderBottom: `1px solid ${mk.border}`,
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '14px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: `linear-gradient(135deg, ${mk.brand}, ${mk.brandStrong})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 700, fontSize: 15,
              boxShadow: '0 4px 12px -2px rgba(13,148,136,0.35)',
            }}>S</div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: mk.navy, letterSpacing: '-0.01em' }}>Stayloop</div>
              <div style={{ fontSize: 10, color: mk.textFaint, fontFamily: 'JetBrains Mono, monospace', marginTop: -1 }}>Ontario · beta</div>
            </div>
          </Link>
          <LanguageToggle />
        </div>
      </nav>

      {/* ── Main ── */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 24px' }}>
        <div style={{ width: '100%', maxWidth: 420 }}>

          {/* Card */}
          <div style={{
            background: mk.surface,
            borderRadius: 20,
            border: `1px solid ${mk.border}`,
            padding: '36px 32px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 12px 32px -8px rgba(0,0,0,0.06)',
          }}>
            {/* Badge */}
            <div style={{
              display: 'inline-block',
              padding: '4px 10px',
              borderRadius: 6,
              background: mk.brandSoft,
              color: mk.brand,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase' as const,
              fontFamily: 'JetBrains Mono, monospace',
              marginBottom: 16,
            }}>
              {t('login.badge')}
            </div>

            <h1 style={{ fontSize: 26, fontWeight: 800, color: mk.navy, letterSpacing: '-0.03em', marginBottom: 6 }}>
              {t('login.title')}
            </h1>
            <p style={{ fontSize: 14, color: mk.textMuted, marginBottom: 28, lineHeight: 1.6 }}>
              {t('login.sub')}
            </p>

            {resetSent ? (
              <div style={{ borderRadius: 14, border: `1px solid rgba(5,150,105,0.25)`, background: mk.greenSoft, padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: 'rgba(5,150,105,0.12)', border: '1px solid rgba(5,150,105,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: mk.green, fontSize: 16, flexShrink: 0,
                  }}>✓</div>
                  <div>
                    <div style={{ fontWeight: 700, color: mk.green, marginBottom: 4 }}>{t('login.resetSent')}</div>
                    <div style={{ fontSize: 13, color: mk.textSec, lineHeight: 1.6 }}>
                      {t('login.resetDetail', { email })}
                    </div>
                    <button
                      onClick={() => setResetSent(false)}
                      style={{ marginTop: 12, fontSize: 13, color: mk.brand, textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                      {t('login.backToLogin')}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Email */}
                  <div>
                    <label style={{
                      display: 'block', fontSize: 12, fontWeight: 600, color: mk.textSec,
                      textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 6,
                    }}>{t('login.emailLabel')}</label>
                    <input
                      required type="email" value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      style={inputStyle}
                      onFocus={e => { e.currentTarget.style.borderColor = mk.brand; e.currentTarget.style.boxShadow = `0 0 0 3px rgba(13,148,136,0.1)` }}
                      onBlur={e => { e.currentTarget.style.borderColor = mk.border; e.currentTarget.style.boxShadow = 'none' }}
                    />
                  </div>

                  {/* Password */}
                  <div>
                    <label style={{
                      display: 'block', fontSize: 12, fontWeight: 600, color: mk.textSec,
                      textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 6,
                    }}>{t('login.passwordLabel')}</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        required type={showPassword ? 'text' : 'password'} value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="••••••••"
                        style={{ ...inputStyle, paddingRight: 42 }}
                        onFocus={e => { e.currentTarget.style.borderColor = mk.brand; e.currentTarget.style.boxShadow = `0 0 0 3px rgba(13,148,136,0.1)` }}
                        onBlur={e => { e.currentTarget.style.borderColor = mk.border; e.currentTarget.style.boxShadow = 'none' }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        style={{
                          position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                          background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                          color: mk.textFaint, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'color .15s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.color = mk.textSec)}
                        onMouseLeave={e => (e.currentTarget.style.color = mk.textFaint)}
                        tabIndex={-1}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? (
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                            <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/>
                            <line x1="1" y1="1" x2="23" y2="23"/>
                          </svg>
                        ) : (
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                            <circle cx="12" cy="12" r="3"/>
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Forgot password */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      type="button" onClick={handleForgotPassword} disabled={resettingPassword}
                      style={{ fontSize: 13, color: mk.brand, textDecoration: 'none', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 500 }}
                    >
                      {resettingPassword ? t('login.sending') : t('login.forgotPassword')}
                    </button>
                  </div>

                  {/* Error */}
                  {error && (
                    <div style={{
                      borderRadius: 10, border: `1px solid rgba(225,29,72,0.2)`,
                      background: mk.redSoft, color: mk.red, fontSize: 13, padding: '10px 14px',
                    }}>
                      {error}
                    </div>
                  )}

                  {/* Submit */}
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
                </form>

                {/* Divider */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, margin: '24px 0 16px' }}>
                  <div style={{ flex: 1, height: 1, background: mk.border }} />
                  <span style={{ fontSize: 12, color: mk.textFaint, fontWeight: 500 }}>{t('login.or')}</span>
                  <div style={{ flex: 1, height: 1, background: mk.border }} />
                </div>

                {/* Google */}
                <button type="button" onClick={handleGoogle} style={{
                  width: '100%', padding: '12px 16px',
                  border: `1px solid ${mk.border}`, borderRadius: 10,
                  background: mk.surface, color: mk.navy,
                  fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                  transition: 'border-color .2s, box-shadow .2s',
                }}>
                  <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                  {t('login.googleBtn')}
                </button>

                {/* Register link */}
                <p style={{ fontSize: 13, color: mk.textSec, textAlign: 'center', marginTop: 20 }}>
                  {t('login.noAccount')}{' '}
                  <Link href="/register" style={{ color: mk.brand, textDecoration: 'none', fontWeight: 600 }}>
                    {t('login.signUp')}
                  </Link>
                </p>
              </>
            )}

            <p style={{
              marginTop: 24, fontSize: 10.5, color: mk.textFaint, textAlign: 'center',
              fontFamily: 'JetBrains Mono, monospace',
            }}>
              {t('login.footer')}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#F7F8FB' }} />}>
      <LoginInner />
    </Suspense>
  )
}
