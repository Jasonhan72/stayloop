'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useT, LanguageToggle } from '@/lib/i18n'

const mk = {
  bg:          '#F7F8FB',
  surface:     '#FFFFFF',
  border:      '#E4E8F0',
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

export default function ResetPasswordPage() {
  const { t } = useT()
  const router = useRouter()

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [sessionReady, setSessionReady] = useState(false)

  // On mount, handle the recovery token from Supabase
  useEffect(() => {
    async function handleRecovery() {
      const url = new URL(window.location.href)
      const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash
      const hashParams = new URLSearchParams(hash)

      const accessToken = hashParams.get('access_token')
      const refreshToken = hashParams.get('refresh_token')
      const type = hashParams.get('type')

      if (accessToken && refreshToken && type === 'recovery') {
        const { error: setErr } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })
        if (setErr) {
          setError(setErr.message)
          return
        }
      }

      // Check if session exists (user clicked the reset link)
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        setSessionReady(true)
      } else {
        setError(t('resetPassword.invalidLink') || 'This reset link is invalid or has expired. Please request a new one.')
      }
    }
    handleRecovery()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 6) {
      setError(t('resetPassword.tooShort') || 'Password must be at least 6 characters')
      return
    }
    if (password !== confirmPassword) {
      setError(t('resetPassword.mismatch') || 'Passwords do not match')
      return
    }

    setSubmitting(true)
    setError(null)

    const { error: updateError } = await supabase.auth.updateUser({ password })
    setSubmitting(false)

    if (updateError) {
      setError(updateError.message)
      return
    }

    setSuccess(true)
    setTimeout(() => router.replace('/screen'), 2500)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '12px 14px', borderRadius: 10,
    border: `1px solid ${mk.border}`, background: mk.surface,
    color: mk.text, fontSize: 14, transition: 'border-color .15s, box-shadow .15s', outline: 'none',
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: mk.bg, fontFamily: 'Inter, -apple-system, system-ui, sans-serif' }}>
      {/* Nav */}
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

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 24px' }}>
        <div style={{ width: '100%', maxWidth: 420 }}>
          <div style={{
            background: mk.surface, borderRadius: 20,
            border: `1px solid ${mk.border}`, padding: '36px 32px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 12px 32px -8px rgba(0,0,0,0.06)',
          }}>
            <div style={{
              display: 'inline-block', padding: '4px 10px', borderRadius: 6,
              background: mk.brandSoft, color: mk.brand,
              fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
              textTransform: 'uppercase' as const, fontFamily: 'JetBrains Mono, monospace', marginBottom: 16,
            }}>
              {t('resetPassword.badge') || '// RESET PASSWORD'}
            </div>

            <h1 style={{ fontSize: 26, fontWeight: 800, color: mk.navy, letterSpacing: '-0.03em', marginBottom: 6 }}>
              {t('resetPassword.title') || 'Set new password'}
            </h1>
            <p style={{ fontSize: 14, color: mk.textMuted, marginBottom: 28, lineHeight: 1.6 }}>
              {t('resetPassword.sub') || 'Enter your new password below.'}
            </p>

            {success ? (
              <div style={{ borderRadius: 14, border: '1px solid rgba(5,150,105,0.25)', background: mk.greenSoft, padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: 'rgba(5,150,105,0.12)', border: '1px solid rgba(5,150,105,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: mk.green, fontSize: 16, flexShrink: 0,
                  }}>✓</div>
                  <div>
                    <div style={{ fontWeight: 700, color: mk.green, marginBottom: 4 }}>
                      {t('resetPassword.success') || 'Password updated'}
                    </div>
                    <div style={{ fontSize: 13, color: mk.textSec, lineHeight: 1.6 }}>
                      {t('resetPassword.successDetail') || 'Your password has been reset successfully. Redirecting...'}
                    </div>
                  </div>
                </div>
              </div>
            ) : !sessionReady && !error ? (
              <div style={{ textAlign: 'center', padding: 20 }}>
                <div style={{ width: 40, height: 40, margin: '0 auto 12px', borderRadius: 10, border: `4px solid rgba(13,148,136,0.2)`, borderTopColor: mk.brand, animation: 'spin 1s linear infinite' }} />
                <div style={{ fontSize: 12, color: mk.textMuted, fontFamily: 'JetBrains Mono, monospace' }}>
                  {t('resetPassword.verifying') || 'Verifying reset link...'}
                </div>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              </div>
            ) : (
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: mk.textSec, textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 6 }}>
                    {t('resetPassword.newPassword') || 'New password'}
                  </label>
                  <input required type="password" value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="••••••" style={inputStyle}
                    onFocus={e => { e.currentTarget.style.borderColor = mk.brand; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(13,148,136,0.1)' }}
                    onBlur={e => { e.currentTarget.style.borderColor = mk.border; e.currentTarget.style.boxShadow = 'none' }}
                  />
                  <p style={{ fontSize: 12, color: mk.textFaint, marginTop: 6 }}>
                    {t('register.passwordHint') || 'At least 6 characters'}
                  </p>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: mk.textSec, textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 6 }}>
                    {t('resetPassword.confirmPassword') || 'Confirm password'}
                  </label>
                  <input required type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="••••••" style={inputStyle}
                    onFocus={e => { e.currentTarget.style.borderColor = mk.brand; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(13,148,136,0.1)' }}
                    onBlur={e => { e.currentTarget.style.borderColor = mk.border; e.currentTarget.style.boxShadow = 'none' }}
                  />
                </div>

                {error && (
                  <div style={{ borderRadius: 10, border: '1px solid rgba(225,29,72,0.2)', background: mk.redSoft, color: mk.red, fontSize: 13, padding: '10px 14px' }}>
                    {error}
                  </div>
                )}

                <button type="submit" disabled={submitting || !sessionReady} style={{
                  width: '100%', padding: '13px 20px', borderRadius: 10,
                  background: `linear-gradient(135deg, ${mk.brand}, ${mk.brandStrong})`,
                  color: '#fff', fontSize: 14.5, fontWeight: 650, border: 'none', cursor: 'pointer',
                  boxShadow: '0 8px 22px -10px rgba(13,148,136,0.6), inset 0 1px 0 rgba(255,255,255,0.15)',
                  transition: 'transform .15s, box-shadow .2s',
                  opacity: submitting || !sessionReady ? 0.6 : 1,
                }}>
                  {submitting
                    ? (t('resetPassword.updating') || 'Updating...')
                    : (t('resetPassword.submit') || 'Update password')}
                </button>
              </form>
            )}

            {!success && (
              <p style={{ marginTop: 20, textAlign: 'center', fontSize: 13, color: mk.textSec }}>
                <Link href="/login" style={{ color: mk.brand, textDecoration: 'none', fontWeight: 600 }}>
                  {t('resetPassword.backToLogin') || 'Back to sign in'}
                </Link>
              </p>
            )}

            <p style={{
              marginTop: 24, fontSize: 10.5, color: mk.textFaint, textAlign: 'center',
              fontFamily: 'JetBrains Mono, monospace',
            }}>
              {t('login.footer') || 'Encrypted · PIPEDA compliant · Built in Ontario'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
