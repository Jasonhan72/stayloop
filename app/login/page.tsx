'use client'
import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useT, LanguageToggle } from '@/lib/i18n'

function LoginInner() {
  const { t } = useT()
  const router = useRouter()
  const searchParams = useSearchParams()
  const nextParam = searchParams.get('next') || '/screen'
  // Only allow same-origin relative paths to avoid open-redirect
  const safeNext = nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/screen'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [resettingPassword, setResettingPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (authError) {
      setSubmitting(false)
      setError(authError.message)
      return
    }

    // Session is now set on the supabase client, redirect to safeNext
    router.replace(safeNext)
  }

  async function handleForgotPassword(e: React.MouseEvent) {
    e.preventDefault()
    if (!email) {
      setError(t('login.enterEmail'))
      return
    }

    setResettingPassword(true)
    setError(null)

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    })

    setResettingPassword(false)
    if (resetError) {
      setError(resetError.message)
      return
    }
    setResetSent(true)
  }

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
            <div className="chip chip-accent mono mb-4">{t('login.badge')}</div>
            <h1 className="h-section mb-2">{t('login.title')}</h1>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 28, lineHeight: 1.6 }}>
              {t('login.sub')}
            </p>

            {resetSent ? (
              <div style={{ borderRadius: 14, border: '1px solid rgba(16, 185, 129, 0.35)', background: 'rgba(16, 185, 129, 0.08)', padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(16, 185, 129, 0.16)', border: '1px solid rgba(16, 185, 129, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#34D399', fontSize: 16, flexShrink: 0 }}>✓</div>
                  <div>
                    <div style={{ fontWeight: 700, color: '#6EE7B7', marginBottom: 4 }}>{t('login.resetSent')}</div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                      {t('login.resetDetail', { email })}
                    </div>
                    <button
                      onClick={() => setResetSent(false)}
                      style={{ marginTop: 12, fontSize: 13, color: '#34D399', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                      {t('login.backToLogin')}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <label className="label">{t('login.emailLabel')}</label>
                    <input
                      required
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="input"
                    />
                  </div>

                  <div>
                    <label className="label">{t('login.passwordLabel')}</label>
                    <input
                      required
                      type="password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="input"
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      disabled={resettingPassword}
                      style={{ fontSize: 13, color: 'var(--text-secondary)', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    >
                      {resettingPassword ? t('login.sending') : t('login.forgotPassword')}
                    </button>
                  </div>

                  {error && (
                    <div style={{ borderRadius: 10, border: '1px solid rgba(244, 63, 94, 0.35)', background: 'rgba(244, 63, 94, 0.08)', color: '#FDA4AF', fontSize: 13, padding: '10px 14px' }}>
                      {error}
                    </div>
                  )}

                  <button type="submit" disabled={submitting} className="btn btn-primary" style={{ width: '100%' }}>
                    {submitting ? t('login.submitting') : t('login.submit')}
                  </button>
                </form>

                <div style={{ display: 'flex', alignItems: 'center', gap: 16, margin: '24px 0 16px 0' }}>
                  <div style={{ flex: 1, height: 1, background: 'var(--border-color)' }} />
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('login.or')}</span>
                  <div style={{ flex: 1, height: 1, background: 'var(--border-color)' }} />
                </div>

                <div style={{ position: 'relative' }}>
                  <button
                    type="button"
                    disabled
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: '1px solid var(--border-color)',
                      borderRadius: 10,
                      background: 'var(--bg-secondary)',
                      color: 'var(--text-secondary)',
                      fontSize: 14,
                      fontWeight: 500,
                      cursor: 'not-allowed',
                      opacity: 0.6,
                    }}
                    title={t('login.googleSoon')}
                  >
                    {t('login.googleBtn')}
                  </button>
                  <div
                    style={{
                      position: 'absolute',
                      bottom: '100%',
                      left: '50%',
                      transform: 'translateX(-50%) translateY(-8px)',
                      background: 'var(--bg-primary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 6,
                      padding: '6px 10px',
                      fontSize: 11,
                      color: 'var(--text-secondary)',
                      whiteSpace: 'nowrap',
                      pointerEvents: 'none',
                      opacity: 0,
                      transition: 'opacity 0.2s',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '1' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '0' }}
                  >
                    {t('login.googleSoon')}
                  </div>
                </div>

                <p style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', marginTop: 16 }}>
                  {t('login.noAccount')}{' '}
                  <Link href="/register" style={{ color: 'var(--text-primary)', textDecoration: 'underline' }}>
                    {t('login.signUp')}
                  </Link>
                </p>
              </>
            )}

            <p className="mono" style={{ marginTop: 24, fontSize: 10.5, color: 'var(--text-faint)', textAlign: 'center' }}>
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
    <Suspense fallback={<div className="min-h-screen" />}>
      <LoginInner />
    </Suspense>
  )
}
