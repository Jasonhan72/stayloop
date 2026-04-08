'use client'
import { useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useT, LanguageToggle } from '@/lib/i18n'

export default function LoginPage() {
  const { t } = useT()
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSending(true)
    setError(null)

    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })

    setSending(false)
    if (authError) { setError(authError.message); return }
    setSent(true)
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

            {sent ? (
              <div style={{ borderRadius: 14, border: '1px solid rgba(16, 185, 129, 0.35)', background: 'rgba(16, 185, 129, 0.08)', padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(16, 185, 129, 0.16)', border: '1px solid rgba(16, 185, 129, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#34D399', fontSize: 16, flexShrink: 0 }}>✓</div>
                  <div>
                    <div style={{ fontWeight: 700, color: '#6EE7B7', marginBottom: 4 }}>{t('login.checkInbox')}</div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                      {t('login.sentDetail', { email })}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
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

                {error && (
                  <div style={{ borderRadius: 10, border: '1px solid rgba(244, 63, 94, 0.35)', background: 'rgba(244, 63, 94, 0.08)', color: '#FDA4AF', fontSize: 13, padding: '10px 14px' }}>
                    {error}
                  </div>
                )}

                <button type="submit" disabled={sending} className="btn btn-primary" style={{ width: '100%' }}>
                  {sending ? t('login.sending') : t('login.send') + ' →'}
                </button>
              </form>
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
