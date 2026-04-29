'use client'
import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useT, LanguageToggle } from '@/lib/i18n'
import { useIsMobile } from '@/lib/useMediaQuery'
import { v3 } from '@/lib/brand'

type Role = 'landlord' | 'tenant' | 'agent' | null

function RegisterInner() {
  const { t } = useT()
  const searchParams = useSearchParams()
  const nextParam = searchParams.get('next') || '/screen'
  const safeNext = nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/screen'

  const isMobile = useIsMobile()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [selectedRole, setSelectedRole] = useState<Role>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [successMessage, setSuccessMessage] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedRole) { setError(t('register.roleRequired')); return }
    if (password.length < 6) { setError(t('register.passwordTooShort')); return }

    setIsSubmitting(true)
    setError(null)

    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext)}`
    const { data, error: authError } = await supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: redirectTo, data: { role: selectedRole } },
    })

    setIsSubmitting(false)
    if (authError) { setError(authError.message); return }

    // If a session is returned, email confirmation is disabled — redirect immediately
    if (data?.session) {
      window.location.href = safeNext
      return
    }
    // Otherwise show "check your email" message
    setSuccessMessage(true)
  }

  async function handleGoogle() {
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext)}`
    await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } })
  }

  const roleOptions = [
    { id: 'landlord' as const, label: t('register.roleLandlord'), icon: '🏠' },
    { id: 'tenant' as const, label: t('register.roleTenant'), icon: '🔑' },
    { id: 'agent' as const, label: t('register.roleAgent'), icon: '🏢' },
  ]

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '12px 14px', borderRadius: 10,
    border: `1px solid ${v3.border}`, background: v3.surfaceCard,
    color: '#0B1736', WebkitTextFillColor: '#0B1736', caretColor: '#0B1736', fontSize: 14, transition: 'border-color .15s, box-shadow .15s', outline: 'none',
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: v3.surface, fontFamily: 'Inter, -apple-system, system-ui, sans-serif' }}>

      {/* ── Nav ── */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: `rgba(242, 238, 229, 0.82)`,
        backdropFilter: 'saturate(1.6) blur(14px)',
        WebkitBackdropFilter: 'saturate(1.6) blur(14px)',
        borderBottom: `1px solid ${v3.divider}`,
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: isMobile ? '10px 14px' : '14px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href="/" style={{ textDecoration: 'none', fontSize: 20, fontWeight: 800, color: v3.textPrimary, letterSpacing: '-0.02em' }}>
            Stayloop
          </Link>
          <LanguageToggle />
        </div>
      </nav>

      {/* ── Main ── */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isMobile ? '24px 16px' : '48px 24px' }}>
        <div style={{ width: '100%', maxWidth: 440 }}>
          <div style={{
            background: v3.surfaceCard, borderRadius: isMobile ? 16 : 20,
            border: `1px solid ${v3.border}`, padding: isMobile ? '24px 20px' : '36px 32px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 12px 32px -8px rgba(0,0,0,0.06)',
          }}>
            {/* Badge */}
            <div style={{
              display: 'inline-block', padding: '4px 10px', borderRadius: 6,
              background: v3.brandSoft, color: v3.brand,
              fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
              textTransform: 'uppercase' as const, fontFamily: 'JetBrains Mono, monospace', marginBottom: 16,
            }}>
              {t('register.badge')}
            </div>

            <h1 style={{ fontSize: isMobile ? 22 : 26, fontWeight: 800, color: v3.textPrimary, letterSpacing: '-0.03em', marginBottom: 6 }}>
              {t('register.title')}
            </h1>
            <p style={{ fontSize: 14, color: v3.textMuted, marginBottom: 28, lineHeight: 1.6 }}>
              {t('register.sub')}
            </p>

            {successMessage ? (
              <div style={{ borderRadius: 14, border: '1px solid rgba(22,163,74,0.25)', background: v3.successSoft, padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: 'rgba(22,163,74,0.12)', border: '1px solid rgba(22,163,74,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: v3.success, fontSize: 16, flexShrink: 0,
                  }}>✓</div>
                  <div>
                    <div style={{ fontWeight: 700, color: v3.success, marginBottom: 4 }}>{t('register.success')}</div>
                    <div style={{ fontSize: 13, color: v3.textSecondary, lineHeight: 1.6 }}>
                      {t('register.sentDetail', { email })}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Email */}
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: v3.textSecondary, textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 6 }}>
                    {t('register.emailLabel')}
                  </label>
                  <input required type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com" style={inputStyle}
                    onFocus={e => { e.currentTarget.style.borderColor = v3.brand; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(4,120,87,0.15)' }}
                    onBlur={e => { e.currentTarget.style.borderColor = v3.border; e.currentTarget.style.boxShadow = 'none' }}
                  />
                </div>

                {/* Password */}
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: v3.textSecondary, textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 6 }}>
                    {t('register.passwordLabel')}
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input required type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                      placeholder="••••••" style={{ ...inputStyle, paddingRight: 42 }}
                      onFocus={e => { e.currentTarget.style.borderColor = v3.brand; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(4,120,87,0.15)' }}
                      onBlur={e => { e.currentTarget.style.borderColor = v3.border; e.currentTarget.style.boxShadow = 'none' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      style={{
                        position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                        color: v3.textFaint, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'color .15s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.color = v3.textSecondary)}
                      onMouseLeave={e => (e.currentTarget.style.color = v3.textFaint)}
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
                  <p style={{ fontSize: 12, color: v3.textFaint, marginTop: 6 }}>
                    {t('register.passwordHint')}
                  </p>
                </div>

                {/* Role Selector */}
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: v3.textSecondary, textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 12 }}>
                    {t('register.roleLabel')}
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr 1fr' : 'repeat(3, 1fr)', gap: isMobile ? 8 : 10 }}>
                    {roleOptions.map(role => (
                      <button
                        key={role.id} type="button"
                        onClick={() => setSelectedRole(role.id)}
                        style={{
                          flex: 1, borderRadius: 12, cursor: 'pointer',
                          border: selectedRole === role.id
                            ? `2px solid ${v3.brand}`
                            : `1px solid ${v3.border}`,
                          background: selectedRole === role.id ? v3.brandSoft : v3.surfaceCard,
                          padding: selectedRole === role.id ? '15px' : '16px',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                          transition: 'all 0.2s ease',
                          color: selectedRole === role.id ? v3.brandStrong : v3.textPrimary,
                        }}
                      >
                        <div style={{ fontSize: 22 }}>{role.icon}</div>
                        <div style={{ fontSize: 12, fontWeight: 650, textAlign: 'center' }}>{role.label}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Error */}
                {error && (
                  <div style={{ borderRadius: 10, border: '1px solid rgba(220,38,38,0.2)', background: v3.dangerSoft, color: v3.danger, fontSize: 13, padding: '10px 14px' }}>
                    {error}
                  </div>
                )}

                {/* Submit */}
                <button type="submit" disabled={isSubmitting} style={{
                  width: '100%', padding: '13px 20px', borderRadius: 10,
                  background: `linear-gradient(135deg, #6EE7B7 0%, #34D399 100%)`,
                  color: '#FFFFFF', fontSize: 14.5, fontWeight: 650, border: 'none', cursor: 'pointer',
                  boxShadow: '0 8px 22px -10px rgba(52, 211, 153, 0.45), 0 1px 0 rgba(255, 255, 255, 0.30) inset',
                  transition: 'transform .15s, box-shadow .2s',
                  opacity: isSubmitting ? 0.6 : 1,
                }}>
                  {isSubmitting ? t('register.submitting') : t('register.submit') + ' →'}
                </button>
              </form>
            )}

            {!successMessage && (
              <>
                {/* Divider */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0 16px' }}>
                  <div style={{ flex: 1, height: 1, background: v3.border }} />
                  <span style={{ fontSize: 12, color: v3.textFaint, fontWeight: 500 }}>{t('register.or')}</span>
                  <div style={{ flex: 1, height: 1, background: v3.border }} />
                </div>

                {/* Google */}
                <button type="button" onClick={handleGoogle} style={{
                  width: '100%', padding: '12px 16px',
                  border: `1px solid ${v3.border}`, borderRadius: 10,
                  background: v3.surfaceCard, color: v3.textPrimary,
                  fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                  transition: 'border-color .2s, box-shadow .2s',
                }}>
                  <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                  {t('register.googleBtn')}
                </button>

                {/* Sign in link */}
                <p style={{ marginTop: 20, textAlign: 'center', fontSize: 13, color: v3.textSecondary }}>
                  {t('register.hasAccount')}{' '}
                  <Link href="/login" style={{ color: v3.brand, textDecoration: 'none', fontWeight: 600 }}>
                    {t('register.signIn')}
                  </Link>
                </p>
              </>
            )}

            <p style={{
              marginTop: 24, fontSize: 10.5, color: v3.textFaint, textAlign: 'center',
              fontFamily: 'JetBrains Mono, monospace',
            }}>
              {t('register.footer')}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: v3.surface }} />}>
      <RegisterInner />
    </Suspense>
  )
}
