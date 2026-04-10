'use client'
import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useT, LanguageToggle } from '@/lib/i18n'

type Role = 'landlord' | 'tenant' | 'agent' | null

function RegisterInner() {
  const { t } = useT()
  const searchParams = useSearchParams()
  const nextParam = searchParams.get('next') || '/screen'
  // Only allow same-origin relative paths to avoid open-redirect
  const safeNext = nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/screen'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [selectedRole, setSelectedRole] = useState<Role>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [successMessage, setSuccessMessage] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!selectedRole) {
      setError(t('register.roleRequired'))
      return
    }

    if (password.length < 6) {
      setError(t('register.passwordTooShort'))
      return
    }

    setIsSubmitting(true)
    setError(null)

    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext)}`

    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectTo,
        data: { role: selectedRole }
      }
    })

    setIsSubmitting(false)
    if (authError) {
      setError(authError.message)
      return
    }

    setSuccessMessage(true)
  }

  const roleOptions = [
    {
      id: 'landlord' as const,
      label: t('register.roleLandlord'),
      icon: '🏠'
    },
    {
      id: 'tenant' as const,
      label: t('register.roleTenant'),
      icon: '🔑'
    },
    {
      id: 'agent' as const,
      label: t('register.roleAgent'),
      icon: '🏢'
    }
  ]

  return (
    <div className="min-h-screen flex flex-col">
      <nav className="nav-bar">
        <Link href="/" className="nav-brand">
          <div className="nav-logo">S</div>
          <div className="nav-title">Stayloop</div>
        </Link>
        <div className="nav-actions"><LanguageToggle /></div>
      </nav>

      <div className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-md fade-up">
          <div className="card-hero">
            <div className="chip chip-accent mono mb-4">{t('register.badge')}</div>
            <h1 className="h-section mb-2">{t('register.title')}</h1>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 28, lineHeight: 1.6 }}>
              {t('register.sub')}
            </p>

            {successMessage ? (
              <div style={{ borderRadius: 14, border: '1px solid rgba(16, 185, 129, 0.35)', background: 'rgba(16, 185, 129, 0.08)', padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(16, 185, 129, 0.16)', border: '1px solid rgba(16, 185, 129, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#34D399', fontSize: 16, flexShrink: 0 }}>✓</div>
                  <div>
                    <div style={{ fontWeight: 700, color: '#6EE7B7', marginBottom: 4 }}>{t('register.success')}</div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                      {t('register.sentDetail', { email })}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Email */}
                <div>
                  <label className="label">{t('register.emailLabel')}</label>
                  <input
                    required
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="input"
                  />
                </div>

                {/* Password */}
                <div>
                  <label className="label">{t('register.passwordLabel')}</label>
                  <input
                    required
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••"
                    className="input"
                  />
                  <p style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 6 }}>
                    {t('register.passwordHint')}
                  </p>
                </div>

                {/* Role Selector */}
                <div>
                  <label className="label" style={{ marginBottom: 12 }}>{t('register.roleLabel')}</label>
                  <div style={{ display: 'flex', flexDirection: 'row', gap: 12 }}>
                    {roleOptions.map(role => (
                      <button
                        key={role.id}
                        type="button"
                        onClick={() => setSelectedRole(role.id)}
                        style={{
                          flex: 1,
                          borderRadius: 14,
                          border: selectedRole === role.id
                            ? '1px solid rgba(6, 182, 212, 0.6)'
                            : '1px solid rgba(255, 255, 255, 0.1)',
                          background: selectedRole === role.id
                            ? 'rgba(6, 182, 212, 0.08)'
                            : 'rgba(255, 255, 255, 0.03)',
                          padding: 16,
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: 8,
                          transition: 'all 0.2s ease',
                          color: 'var(--text-primary)'
                        }}
                      >
                        <div style={{ fontSize: 24 }}>{role.icon}</div>
                        <div style={{ fontSize: 13, fontWeight: 600, textAlign: 'center' }}>
                          {role.label}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Error Message */}
                {error && (
                  <div style={{ borderRadius: 10, border: '1px solid rgba(244, 63, 94, 0.35)', background: 'rgba(244, 63, 94, 0.08)', color: '#FDA4AF', fontSize: 13, padding: '10px 14px' }}>
                    {error}
                  </div>
                )}

                {/* Submit Button */}
                <button type="submit" disabled={isSubmitting} className="btn btn-primary" style={{ width: '100%' }}>
                  {isSubmitting ? t('register.submitting') : t('register.submit') + ' →'}
                </button>
              </form>
            )}

            {!successMessage && (
              <>
                {/* Divider */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0 16px' }}>
                  <div style={{ flex: 1, height: 1, background: 'rgba(255, 255, 255, 0.1)' }} />
                  <span className="mono" style={{ fontSize: 12, color: 'var(--text-faint)' }}>
                    {t('register.or')}
                  </span>
                  <div style={{ flex: 1, height: 1, background: 'rgba(255, 255, 255, 0.1)' }} />
                </div>

                {/* Google Button (Disabled) */}
                <button
                  type="button"
                  disabled
                  title={t('register.googleSoon')}
                  style={{
                    width: '100%',
                    borderRadius: 10,
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    background: 'rgba(255, 255, 255, 0.03)',
                    padding: '12px 16px',
                    fontSize: 14,
                    fontWeight: 500,
                    color: 'var(--text-faint)',
                    cursor: 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 10,
                    transition: 'opacity 0.2s ease'
                  }}
                >
                  <span style={{ fontSize: 18 }}>🔵</span>
                  {t('register.googleBtn')}
                </button>

                {/* Sign In Link */}
                <p style={{ marginTop: 24, textAlign: 'center', fontSize: 14, color: 'var(--text-secondary)' }}>
                  {t('register.hasAccount')}{' '}
                  <Link href="/login" style={{ color: 'rgba(6, 182, 212, 0.8)', textDecoration: 'none', fontWeight: 600 }}>
                    {t('register.signIn')}
                  </Link>
                </p>
              </>
            )}

            <p className="mono" style={{ marginTop: 24, fontSize: 10.5, color: 'var(--text-faint)', textAlign: 'center' }}>
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
    <Suspense fallback={<div className="min-h-screen" />}>
      <RegisterInner />
    </Suspense>
  )
}
