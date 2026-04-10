'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/lib/useUser'
import { useT, LanguageToggle } from '@/lib/i18n'

interface ProfileData {
  id: string
  full_name: string | null
  email: string
  phone: string | null
  plan: 'free' | 'pro' | 'enterprise'
  role?: 'user' | 'tenant' | 'agent'
  company_name?: string | null
}

export default function ProfilePage() {
  const { user, loading: authLoading, signOut } = useUser({ redirectIfMissing: true })
  const { t } = useT()

  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState<'user' | 'tenant' | 'agent'>('user')
  const [companyName, setCompanyName] = useState('')
  const [plan, setPlan] = useState<'free' | 'pro' | 'enterprise'>('free')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    const pid = user.profileId

    async function fetchProfile() {
      setLoading(true)
      setError(null)

      const { data, error: dbError } = await supabase
        .from('landlords')
        .select('id, full_name, email, phone, plan, role, company_name')
        .eq('id', pid)
        .single()

      if (dbError) {
        console.error('Failed to fetch profile:', dbError)
        // If columns don't exist, just fall back to basic data
        setFullName('')
        setPhone('')
        setRole('user')
        setCompanyName('')
        setPlan('free')
      } else if (data) {
        const profileData = data as ProfileData
        setFullName(profileData.full_name || '')
        setPhone(profileData.phone || '')
        setRole(profileData.role || 'user')
        setCompanyName(profileData.company_name || '')
        setPlan(profileData.plan || 'free')
      }

      setLoading(false)
    }

    fetchProfile()
  }, [user])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    const pid = user.profileId

    setSaving(true)
    setError(null)
    setSaved(false)

    try {
      const updateData: Record<string, unknown> = {
        full_name: fullName,
        phone: phone || null,
        role,
        company_name: companyName || null,
      }

      const { error: updateError } = await supabase
        .from('landlords')
        .update(updateData)
        .eq('id', pid)

      if (updateError) {
        setError(updateError.message)
        console.error('Update error:', updateError)
      } else {
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setSaving(false)
    }
  }

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 mx-auto mb-3 border-4 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />
          <div className="mono text-xs text-slate-500">{t('common.authenticating')}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen text-slate-100 flex flex-col">
      {/* Navigation Bar */}
      <nav className="sticky top-0 z-20 backdrop-blur-xl bg-[#060814]/60 border-b border-white/[0.06]">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 to-violet-500 flex items-center justify-center text-white font-bold shadow-lg shadow-cyan-500/30">
              S
            </div>
            <div className="text-base font-bold tracking-tight">Stayloop</div>
          </Link>
          <div className="flex items-center gap-3">
            <LanguageToggle />
            <button
              onClick={signOut}
              className="text-xs px-3 py-1.5 rounded-lg font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
            >
              {t('profile.signOut')}
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="flex-1 flex items-start justify-center px-6 py-10">
        <div className="w-full max-w-2xl">
          {/* Header */}
          <div className="mb-8">
            <div className="mono text-[11px] text-cyan-400 mb-2">{t('profile.badge')}</div>
            <h1 className="text-3xl font-bold tracking-tight">{t('profile.title')}</h1>
          </div>

          {/* Profile Form Card */}
          <form onSubmit={handleSave} className="glass rounded-2xl p-8 relative overflow-hidden mb-6">
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-violet-500/5 pointer-events-none" />

            <div className="relative space-y-6">
              {/* Email (Read-only) */}
              <div>
                <label className="label">Email address</label>
                <input
                  type="email"
                  value={user.email}
                  disabled
                  className="input opacity-60 cursor-not-allowed"
                />
                <div className="text-[11px] text-slate-500 mt-2">Read-only</div>
              </div>

              {/* Full Name */}
              <div>
                <label className="label">{t('profile.fullName')}</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="Your full name"
                  className="input"
                />
              </div>

              {/* Phone */}
              <div>
                <label className="label">{t('profile.phone')}</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+1 (416) 555-0123"
                  className="input"
                />
              </div>

              {/* Role Selection Cards */}
              <div>
                <label className="label">{t('profile.role')}</label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { value: 'user', label: t('register.roleLandlord') },
                    { value: 'tenant', label: t('register.roleTenant') },
                    { value: 'agent', label: t('register.roleAgent') },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setRole(opt.value as typeof role)}
                      className={`relative px-4 py-3 rounded-lg border transition-all ${
                        role === opt.value
                          ? 'border-cyan-500/60 bg-cyan-500/15 text-cyan-200'
                          : 'border-white/[0.06] bg-white/[0.02] text-slate-300 hover:border-white/[0.12] hover:bg-white/[0.04]'
                      }`}
                    >
                      <span className="text-sm font-medium">{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Company Name (only if role === 'agent') */}
              {role === 'agent' && (
                <div>
                  <label className="label">{t('profile.company')}</label>
                  <input
                    type="text"
                    value={companyName}
                    onChange={e => setCompanyName(e.target.value)}
                    placeholder="Your company name"
                    className="input"
                  />
                </div>
              )}

              {/* Current Plan (Read-only) */}
              <div>
                <label className="label">{t('profile.plan')}</label>
                <div className="flex items-center gap-2">
                  <span
                    className={`mono text-[12px] uppercase px-3 py-1.5 rounded-lg border font-medium ${
                      plan === 'free'
                        ? 'bg-slate-500/10 text-slate-300 border-slate-500/30'
                        : plan === 'pro'
                          ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                          : 'bg-violet-500/15 text-violet-300 border-violet-500/40'
                    }`}
                  >
                    {plan}
                  </span>
                  {plan === 'free' && (
                    <Link href="/dashboard?upgrade=1" className="text-xs text-cyan-400 hover:text-cyan-300 font-medium">
                      {t('common.upgrade')} →
                    </Link>
                  )}
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 text-sm px-3 py-2">
                  {error}
                </div>
              )}

              {/* Success Message */}
              {saved && (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-sm px-3 py-2 flex items-center gap-2">
                  <span className="text-lg">✓</span>
                  {t('profile.saved')}
                </div>
              )}

              {/* Save Button */}
              <button
                type="submit"
                disabled={saving || loading}
                className="btn-primary w-full mt-2"
              >
                {saving ? t('profile.saving') : t('profile.save')}
              </button>
            </div>
          </form>

          {/* Sign Out Button */}
          <div className="flex justify-center">
            <button
              onClick={signOut}
              className="text-sm px-4 py-2 rounded-lg font-medium text-red-300 hover:text-red-200 border border-red-500/20 hover:border-red-500/40 hover:bg-red-500/10 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
