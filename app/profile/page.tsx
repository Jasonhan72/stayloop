'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/lib/useUser'
import { useT } from '@/lib/i18n'
import UserNav from '@/components/UserNav'

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

interface ProfileData {
  id: string
  full_name: string | null
  email: string
  phone: string | null
  plan: 'free' | 'pro' | 'enterprise'
  role?: 'landlord' | 'tenant' | 'agent'
  company_name?: string | null
}

export default function ProfilePage() {
  const { user, loading: authLoading, signOut } = useUser({ redirectIfMissing: true })
  const { t } = useT()

  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState<'landlord' | 'tenant' | 'agent'>('landlord')
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
        setFullName('')
        setPhone('')
        setRole('landlord')
        setCompanyName('')
        setPlan('free')
      } else if (data) {
        const profileData = data as ProfileData
        setFullName(profileData.full_name || '')
        setPhone(profileData.phone || '')
        setRole(profileData.role || 'landlord')
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
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: mk.bg, fontFamily: 'Inter, -apple-system, system-ui, sans-serif' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, margin: '0 auto 12px', borderRadius: 10, border: `4px solid rgba(13,148,136,0.2)`, borderTopColor: mk.brand, animation: 'spin 1s linear infinite' }} />
          <div style={{ fontSize: 12, color: mk.textMuted, fontFamily: 'JetBrains Mono, monospace' }}>{t('common.authenticating')}</div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

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
    fontFamily: 'Inter, -apple-system, system-ui, sans-serif',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 12,
    fontWeight: 600,
    color: mk.textSec,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: 6,
  }

  const roleButtonStyle: React.CSSProperties = {
    padding: '12px 16px',
    borderRadius: 10,
    border: `1px solid ${mk.border}`,
    background: mk.surface,
    color: mk.text,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all .15s',
  }

  const buttonStyle: React.CSSProperties = {
    width: '100%',
    padding: '13px 20px',
    borderRadius: 10,
    background: `linear-gradient(135deg, ${mk.brand}, ${mk.brandStrong})`,
    color: '#fff',
    fontSize: 14.5,
    fontWeight: 650,
    border: 'none',
    cursor: 'pointer',
    boxShadow: '0 8px 22px -10px rgba(13,148,136,0.6), inset 0 1px 0 rgba(255,255,255,0.15)',
    transition: 'transform .15s, box-shadow .2s',
    opacity: saving || loading ? 0.6 : 1,
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: mk.bg, fontFamily: 'Inter, -apple-system, system-ui, sans-serif' }}>
      {/* Nav */}
      <UserNav user={user} signOut={signOut} />

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '32px 24px' }}>
        <div style={{ width: '100%', maxWidth: 600 }}>
          {/* Header */}
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 11, color: mk.brand, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
              {t('profile.badge') || 'Account Settings'}
            </div>
            <h1 style={{ fontSize: 32, fontWeight: 800, color: mk.navy, letterSpacing: '-0.02em', marginBottom: 0 }}>
              {t('profile.title') || 'My Profile'}
            </h1>
          </div>

          {/* Profile Form Card */}
          <form onSubmit={handleSave} style={{
            background: mk.surface,
            borderRadius: 20,
            border: `1px solid ${mk.border}`,
            padding: '36px 32px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 12px 32px -8px rgba(0,0,0,0.06)',
            marginBottom: 24,
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {/* Email (Read-only) */}
              <div>
                <label style={labelStyle}>{t('profile.emailLabel') || 'Email address'}</label>
                <input
                  type="email"
                  value={user.email}
                  disabled
                  style={{
                    ...inputStyle,
                    opacity: 0.6,
                    cursor: 'not-allowed',
                    background: '#F7F8FB',
                  }}
                />
                <div style={{ fontSize: 11, color: mk.textFaint, marginTop: 8 }}>{t('profile.emailReadOnly') || 'Read-only'}</div>
              </div>

              {/* Full Name */}
              <div>
                <label style={labelStyle}>{t('profile.fullName') || 'Full name'}</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="Your full name"
                  style={inputStyle}
                  onFocus={e => { e.currentTarget.style.borderColor = mk.brand; e.currentTarget.style.boxShadow = `0 0 0 3px rgba(13,148,136,0.1)` }}
                  onBlur={e => { e.currentTarget.style.borderColor = mk.border; e.currentTarget.style.boxShadow = 'none' }}
                />
              </div>

              {/* Phone */}
              <div>
                <label style={labelStyle}>{t('profile.phone') || 'Phone number'}</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+1 (416) 555-0123"
                  style={inputStyle}
                  onFocus={e => { e.currentTarget.style.borderColor = mk.brand; e.currentTarget.style.boxShadow = `0 0 0 3px rgba(13,148,136,0.1)` }}
                  onBlur={e => { e.currentTarget.style.borderColor = mk.border; e.currentTarget.style.boxShadow = 'none' }}
                />
              </div>

              {/* Role Selection */}
              <div>
                <label style={labelStyle}>{t('profile.role') || 'Role'}</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                  {[
                    { value: 'landlord' as const, label: t('register.roleLandlord') || 'Landlord' },
                    { value: 'tenant' as const, label: t('register.roleTenant') || 'Tenant' },
                    { value: 'agent' as const, label: t('register.roleAgent') || 'Agent' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setRole(opt.value)}
                      style={{
                        ...roleButtonStyle,
                        background: role === opt.value ? mk.brandSoft : mk.surface,
                        borderColor: role === opt.value ? mk.brand : mk.border,
                        color: role === opt.value ? mk.brand : mk.text,
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Company Name (only if role === 'agent') */}
              {role === 'agent' && (
                <div>
                  <label style={labelStyle}>{t('profile.company') || 'Company name'}</label>
                  <input
                    type="text"
                    value={companyName}
                    onChange={e => setCompanyName(e.target.value)}
                    placeholder="Your company name"
                    style={inputStyle}
                    onFocus={e => { e.currentTarget.style.borderColor = mk.brand; e.currentTarget.style.boxShadow = `0 0 0 3px rgba(13,148,136,0.1)` }}
                    onBlur={e => { e.currentTarget.style.borderColor = mk.border; e.currentTarget.style.boxShadow = 'none' }}
                  />
                </div>
              )}

              {/* Current Plan (Read-only) */}
              <div>
                <label style={labelStyle}>{t('profile.plan') || 'Current plan'}</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                    padding: '6px 12px',
                    borderRadius: 8,
                    border: `1px solid ${mk.border}`,
                    background: mk.brandSoft,
                    color: mk.brand,
                    fontFamily: 'JetBrains Mono, monospace',
                  }}>
                    {plan}
                  </span>
                  {plan === 'free' && (
                    <Link href="/dashboard?upgrade=1" style={{ fontSize: 13, color: mk.brand, textDecoration: 'underline', fontWeight: 500 }}>
                      {t('common.upgrade') || 'Upgrade'} →
                    </Link>
                  )}
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div style={{
                  borderRadius: 10,
                  border: `1px solid rgba(225,29,72,0.2)`,
                  background: mk.redSoft,
                  color: mk.red,
                  fontSize: 13,
                  padding: '12px 14px',
                }}>
                  {error}
                </div>
              )}

              {/* Success Message */}
              {saved && (
                <div style={{
                  borderRadius: 10,
                  border: `1px solid rgba(5,150,105,0.25)`,
                  background: mk.greenSoft,
                  color: mk.green,
                  fontSize: 13,
                  padding: '12px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}>
                  <span>✓</span>
                  {t('profile.saved') || 'Saved successfully'}
                </div>
              )}

              {/* Save Button */}
              <button
                type="submit"
                disabled={saving || loading}
                style={buttonStyle}
              >
                {saving ? (t('profile.saving') || 'Saving...') : (t('profile.save') || 'Save changes')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
