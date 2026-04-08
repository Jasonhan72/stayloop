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
    <div className="min-h-screen flex flex-col text-slate-100">
      <nav className="px-6 py-4 flex items-center justify-between">
        <Link href="/" className="inline-flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 to-violet-500 flex items-center justify-center text-white font-bold shadow-lg shadow-cyan-500/30">S</div>
          <div className="text-base font-bold tracking-tight">Stayloop</div>
        </Link>
        <LanguageToggle />
      </nav>

      <div className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-md">
          <div className="glass rounded-2xl p-8 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-violet-500/5 pointer-events-none" />
            <div className="relative">
              <div className="mono text-[11px] text-cyan-400 mb-2">{t('login.badge')}</div>
              <h1 className="text-2xl font-bold tracking-tight mb-2">{t('login.title')}</h1>
              <p className="text-sm text-slate-400 mb-7">
                {t('login.sub')}
              </p>

              {sent ? (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-5">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">✓</div>
                    <div>
                      <div className="font-semibold text-emerald-300 mb-1">{t('login.checkInbox')}</div>
                      <div className="text-sm text-slate-300">
                        {t('login.sentDetail', { email })}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
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
                    <div className="rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 text-sm px-3 py-2">
                      {error}
                    </div>
                  )}

                  <button type="submit" disabled={sending} className="btn-primary w-full">
                    {sending ? t('login.sending') : t('login.send')}
                  </button>
                </form>
              )}

              <p className="mt-6 text-[11px] text-slate-500 text-center mono">
                {t('login.footer')}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
