'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/lib/useUser'
import { useT, LanguageToggle } from '@/lib/i18n'
import UserNav from '@/components/UserNav'
import { useIsMobile } from '@/lib/useMediaQuery'

/* ── Marketing-matching palette ── */
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

type SectionKey = 'personal' | 'security' | 'notifications' | 'langplan'
type Role = 'landlord' | 'tenant' | 'agent'
type Plan = 'free' | 'pro' | 'enterprise'

interface ProfileData {
  full_name: string | null
  phone: string | null
  role: Role
  company_name: string | null
  plan: Plan
}

/* ── Section icons (inline SVG, Airbnb-style) ── */
const icons: Record<SectionKey, React.ReactNode> = {
  personal: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
  ),
  security: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
  ),
  notifications: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
  ),
  langplan: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
  ),
}

export default function AccountSettingsPage() {
  const { user, loading: authLoading, signOut } = useUser({ redirectIfMissing: true })
  const { t } = useT()
  const isMobile = useIsMobile()

  const [section, setSection] = useState<SectionKey>('personal')
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(true)

  /* Load profile */
  useEffect(() => {
    if (!user) return
    (async () => {
      setLoading(true)
      const { data } = await supabase
        .from('landlords')
        .select('full_name, phone, role, company_name, plan')
        .eq('id', user.profileId)
        .single()
      if (data) {
        setProfile({
          full_name: data.full_name || '',
          phone: data.phone || '',
          role: (data.role as Role) || 'landlord',
          company_name: data.company_name || '',
          plan: (data.plan as Plan) || 'free',
        })
      } else {
        setProfile({ full_name: '', phone: '', role: 'landlord', company_name: '', plan: 'free' })
      }
      setLoading(false)
    })()
  }, [user])

  /* Save a single field */
  async function saveField(patch: Partial<ProfileData>): Promise<string | null> {
    if (!user) return 'Not authenticated'
    const { error } = await supabase
      .from('landlords')
      .update(patch)
      .eq('id', user.profileId)
    if (error) return error.message
    setProfile(prev => (prev ? { ...prev, ...patch } : prev))
    return null
  }

  if (authLoading || !user || loading || !profile) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: mk.bg }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, margin: '0 auto 12px', borderRadius: 10, border: `4px solid rgba(13,148,136,0.2)`, borderTopColor: mk.brand, animation: 'spin 1s linear infinite' }} />
          <div style={{ fontSize: 12, color: mk.textMuted, fontFamily: 'JetBrains Mono, monospace' }}>{t('common.authenticating')}</div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  const sections: { key: SectionKey; label: string }[] = [
    { key: 'personal',      label: t('acct.section.personal') },
    { key: 'security',      label: t('acct.section.security') },
    { key: 'notifications', label: t('acct.section.notifications') },
    { key: 'langplan',      label: t('acct.section.langplan') },
  ]

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: mk.bg, fontFamily: 'Inter, -apple-system, system-ui, sans-serif' }}>
      <UserNav user={user} signOut={signOut} />

      <div style={{ flex: 1, maxWidth: 1040, width: '100%', margin: '0 auto', padding: isMobile ? '20px 16px 40px' : '40px 24px 60px' }}>
        {/* Header */}
        <div style={{ marginBottom: isMobile ? 20 : 32 }}>
          <h1 style={{ fontSize: isMobile ? 28 : 34, fontWeight: 800, color: mk.navy, letterSpacing: '-0.02em', margin: 0 }}>
            {t('acct.title')}
          </h1>
          <p style={{ fontSize: 14, color: mk.textMuted, marginTop: 6 }}>{user.email}</p>
        </div>

        {/* Mobile top-tabs */}
        {isMobile && (
          <div style={{
            display: 'flex', gap: 8, marginBottom: 20,
            overflowX: 'auto', paddingBottom: 6,
            scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch',
          }}
          className="sl-hscroll">
            {sections.map(s => (
              <button key={s.key} onClick={() => setSection(s.key)}
                style={{
                  flexShrink: 0, padding: '8px 14px', borderRadius: 999,
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  border: `1px solid ${section === s.key ? mk.text : mk.border}`,
                  background: section === s.key ? mk.text : mk.surface,
                  color: section === s.key ? '#fff' : mk.textSec,
                  transition: 'all .15s',
                  whiteSpace: 'nowrap',
                }}>
                {s.label}
              </button>
            ))}
            <style>{`.sl-hscroll::-webkit-scrollbar { display: none; }`}</style>
          </div>
        )}

        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '260px 1fr',
          gap: isMobile ? 0 : 40,
          alignItems: 'flex-start',
        }}>
          {/* Desktop sidebar */}
          {!isMobile && (
            <aside style={{ position: 'sticky', top: 90 }}>
              <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {sections.map(s => (
                  <button key={s.key} onClick={() => setSection(s.key)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '11px 14px', borderRadius: 10, cursor: 'pointer',
                      background: section === s.key ? '#EEF2F7' : 'transparent',
                      border: 'none', textAlign: 'left', width: '100%',
                      color: section === s.key ? mk.navy : mk.textSec,
                      fontSize: 14, fontWeight: section === s.key ? 650 : 500,
                      transition: 'background .15s, color .15s',
                    }}
                    onMouseEnter={e => { if (section !== s.key) e.currentTarget.style.background = '#F1F5F9' }}
                    onMouseLeave={e => { if (section !== s.key) e.currentTarget.style.background = 'transparent' }}>
                    <span style={{ color: section === s.key ? mk.brand : mk.textFaint, display: 'flex' }}>{icons[s.key]}</span>
                    {s.label}
                  </button>
                ))}
              </nav>
            </aside>
          )}

          {/* Content */}
          <div style={{ minWidth: 0 }}>
            {section === 'personal' && (
              <PersonalSection profile={profile} userEmail={user.email} saveField={saveField} isMobile={isMobile} />
            )}
            {section === 'security' && (
              <SecuritySection userEmail={user.email} signOut={signOut} isMobile={isMobile} />
            )}
            {section === 'notifications' && (
              <NotificationsSection isMobile={isMobile} />
            )}
            {section === 'langplan' && (
              <LangPlanSection plan={profile.plan} isMobile={isMobile} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   ROW — generic Airbnb-style inline-edit row
═══════════════════════════════════════════════════════════════ */

interface RowProps {
  label: string
  value: React.ReactNode
  hint?: string
  editable?: boolean
  onSave?: (newValue: string) => Promise<string | null>
  /** For custom editors (e.g. role selector). When provided, clicking Edit renders this instead of default input */
  renderEditor?: (opts: { close: () => void; setError: (e: string | null) => void }) => React.ReactNode
  inputType?: 'text' | 'tel'
  placeholder?: string
  last?: boolean
}

function Row({ label, value, hint, editable = true, onSave, renderEditor, inputType = 'text', placeholder, last }: RowProps) {
  const { t } = useT()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus()
  }, [editing])

  function startEdit() {
    setDraft(typeof value === 'string' ? value : '')
    setEditing(true)
    setError(null)
  }

  async function handleSave() {
    if (!onSave) return
    setSaving(true)
    setError(null)
    const err = await onSave(draft)
    setSaving(false)
    if (err) { setError(err); return }
    setEditing(false)
    setJustSaved(true)
    setTimeout(() => setJustSaved(false), 1800)
  }

  return (
    <div style={{
      padding: '18px 0',
      borderBottom: last ? 'none' : `1px solid ${mk.border}`,
    }}>
      {!editing ? (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: mk.text, marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 14, color: mk.textSec, wordBreak: 'break-word' }}>
              {value || <span style={{ color: mk.textFaint, fontStyle: 'italic' }}>{t('acct.notSet')}</span>}
            </div>
            {justSaved && (
              <div style={{ fontSize: 12, color: mk.green, marginTop: 6, fontWeight: 600 }}>
                ✓ {t('acct.saved')}
              </div>
            )}
          </div>
          {editable && (
            <button onClick={startEdit}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: mk.text, fontSize: 14, fontWeight: 600,
                textDecoration: 'underline', padding: '2px 4px', flexShrink: 0,
              }}>
              {t('acct.edit')}
            </button>
          )}
        </div>
      ) : (
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: mk.text, marginBottom: 10 }}>{label}</div>
          {renderEditor ? (
            renderEditor({ close: () => setEditing(false), setError })
          ) : (
            <input
              ref={inputRef}
              type={inputType}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              placeholder={placeholder}
              style={{
                width: '100%', padding: '12px 14px', borderRadius: 10,
                border: `1px solid ${mk.borderStrong}`, background: mk.surface,
                color: mk.text, fontSize: 15, outline: 'none',
                transition: 'border-color .15s, box-shadow .15s',
                boxSizing: 'border-box',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = mk.brand; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(13,148,136,0.1)' }}
              onBlur={e => { e.currentTarget.style.borderColor = mk.borderStrong; e.currentTarget.style.boxShadow = 'none' }}
            />
          )}
          {hint && <p style={{ fontSize: 12, color: mk.textMuted, marginTop: 8 }}>{hint}</p>}
          {error && (
            <div style={{ marginTop: 10, borderRadius: 8, border: '1px solid rgba(225,29,72,0.2)', background: mk.redSoft, color: mk.red, fontSize: 13, padding: '8px 12px' }}>
              {error}
            </div>
          )}
          {!renderEditor && (
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button onClick={() => setEditing(false)}
                style={{
                  padding: '10px 18px', borderRadius: 8, background: 'none',
                  border: 'none', color: mk.text, fontSize: 14, fontWeight: 600,
                  textDecoration: 'underline', cursor: 'pointer',
                }}>
                {t('acct.cancel')}
              </button>
              <button onClick={handleSave} disabled={saving}
                style={{
                  padding: '10px 18px', borderRadius: 10,
                  background: mk.text, color: '#fff',
                  border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  opacity: saving ? 0.6 : 1,
                }}>
                {saving ? t('acct.saving') : t('acct.save')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   SECTION CARD wrapper
═══════════════════════════════════════════════════════════════ */

function SectionCard({ title, subtitle, children, isMobile }: {
  title: string; subtitle?: string; children: React.ReactNode; isMobile: boolean
}) {
  return (
    <div>
      <h2 style={{ fontSize: isMobile ? 22 : 26, fontWeight: 800, color: mk.navy, letterSpacing: '-0.02em', margin: 0 }}>{title}</h2>
      {subtitle && <p style={{ fontSize: 14, color: mk.textMuted, marginTop: 6, marginBottom: 0 }}>{subtitle}</p>}
      <div style={{ marginTop: 20 }}>
        {children}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   PERSONAL INFORMATION
═══════════════════════════════════════════════════════════════ */

function PersonalSection({ profile, userEmail, saveField, isMobile }: {
  profile: ProfileData; userEmail: string; saveField: (p: Partial<ProfileData>) => Promise<string | null>; isMobile: boolean
}) {
  const { t } = useT()
  const roleLabels: Record<Role, string> = {
    landlord: t('register.roleLandlord'),
    tenant:   t('register.roleTenant'),
    agent:    t('register.roleAgent'),
  }
  const [draftRole, setDraftRole] = useState<Role>(profile.role)
  const [roleSaving, setRoleSaving] = useState(false)

  return (
    <SectionCard title={t('acct.personal.title')} isMobile={isMobile}>
      <Row
        label={t('acct.personal.legalName')}
        value={profile.full_name || ''}
        hint={t('acct.personal.legalNameHint')}
        placeholder="Jason Han"
        onSave={(v) => saveField({ full_name: v })}
      />
      <Row
        label={t('acct.personal.email')}
        value={userEmail}
        editable={false}
      />
      <Row
        label={t('acct.personal.phone')}
        value={profile.phone || ''}
        hint={t('acct.personal.phoneHint')}
        inputType="tel"
        placeholder="+1 (416) 555-0123"
        onSave={(v) => saveField({ phone: v || null })}
      />
      <Row
        label={t('acct.personal.role')}
        value={roleLabels[profile.role]}
        hint={t('acct.personal.roleHint')}
        renderEditor={({ close, setError }) => (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 4 }}>
              {(['landlord', 'tenant', 'agent'] as Role[]).map(r => (
                <button key={r} type="button" onClick={() => setDraftRole(r)}
                  style={{
                    padding: '12px 8px', borderRadius: 10, cursor: 'pointer',
                    border: draftRole === r ? `2px solid ${mk.brand}` : `1px solid ${mk.border}`,
                    background: draftRole === r ? mk.brandSoft : mk.surface,
                    color: draftRole === r ? mk.brandStrong : mk.text,
                    fontSize: 13, fontWeight: 600,
                  }}>
                  {roleLabels[r]}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button onClick={close}
                style={{ padding: '10px 18px', borderRadius: 8, background: 'none', border: 'none', color: mk.text, fontSize: 14, fontWeight: 600, textDecoration: 'underline', cursor: 'pointer' }}>
                {t('acct.cancel')}
              </button>
              <button
                onClick={async () => {
                  setRoleSaving(true)
                  const err = await saveField({ role: draftRole })
                  setRoleSaving(false)
                  if (err) { setError(err); return }
                  close()
                }}
                disabled={roleSaving}
                style={{ padding: '10px 18px', borderRadius: 10, background: mk.text, color: '#fff', border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: roleSaving ? 0.6 : 1 }}>
                {roleSaving ? t('acct.saving') : t('acct.save')}
              </button>
            </div>
          </>
        )}
      />
      {profile.role === 'agent' && (
        <Row
          label={t('acct.personal.company')}
          value={profile.company_name || ''}
          placeholder="Acme Realty Inc."
          onSave={(v) => saveField({ company_name: v || null })}
          last
        />
      )}
    </SectionCard>
  )
}

/* ═══════════════════════════════════════════════════════════════
   LOGIN & SECURITY
═══════════════════════════════════════════════════════════════ */

function SecuritySection({ userEmail, signOut, isMobile }: {
  userEmail: string; signOut: () => Promise<void>; isMobile: boolean
}) {
  const { t } = useT()
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [signingOutAll, setSigningOutAll] = useState(false)

  async function sendResetLink() {
    setSending(true)
    setError(null)
    const { error: err } = await supabase.auth.resetPasswordForEmail(userEmail, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    })
    setSending(false)
    if (err) { setError(err.message); return }
    setSent(true)
  }

  async function signOutEverywhere() {
    if (!confirm(t('acct.security.signOutConfirm'))) return
    setSigningOutAll(true)
    await supabase.auth.signOut({ scope: 'global' })
    setSigningOutAll(false)
    await signOut()
  }

  return (
    <SectionCard title={t('acct.security.title')} isMobile={isMobile}>
      {/* Password row */}
      <div style={{ padding: '18px 0', borderBottom: `1px solid ${mk.border}` }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: mk.text, marginBottom: 4 }}>{t('acct.security.password')}</div>
        <div style={{ fontSize: 13, color: mk.textMuted, lineHeight: 1.6, marginBottom: 12 }}>
          {t('acct.security.passwordDesc')}
        </div>
        {sent ? (
          <div style={{ borderRadius: 10, border: '1px solid rgba(5,150,105,0.25)', background: mk.greenSoft, color: mk.green, fontSize: 13, padding: '10px 14px', display: 'flex', gap: 8 }}>
            <span>✓</span>{t('acct.security.resetSent')}
          </div>
        ) : (
          <button onClick={sendResetLink} disabled={sending}
            style={{
              padding: '10px 18px', borderRadius: 10,
              background: mk.text, color: '#fff', border: 'none',
              fontSize: 14, fontWeight: 600, cursor: 'pointer',
              opacity: sending ? 0.6 : 1,
            }}>
            {sending ? t('acct.saving') : t('acct.security.sendReset')}
          </button>
        )}
        {error && (
          <div style={{ marginTop: 10, borderRadius: 8, border: '1px solid rgba(225,29,72,0.2)', background: mk.redSoft, color: mk.red, fontSize: 13, padding: '8px 12px' }}>
            {error}
          </div>
        )}
      </div>

      {/* Sign out of all */}
      <div style={{ padding: '18px 0' }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: mk.text, marginBottom: 4 }}>{t('acct.security.signOutAll')}</div>
        <div style={{ fontSize: 13, color: mk.textMuted, lineHeight: 1.6, marginBottom: 12 }}>
          {t('acct.security.signOutAllDesc')}
        </div>
        <button onClick={signOutEverywhere} disabled={signingOutAll}
          style={{
            padding: '10px 18px', borderRadius: 10,
            background: mk.surface, color: mk.red,
            border: `1px solid ${mk.red}`,
            fontSize: 14, fontWeight: 600, cursor: 'pointer',
            opacity: signingOutAll ? 0.6 : 1,
          }}>
          {signingOutAll ? '…' : t('acct.security.signOutAllBtn')}
        </button>
      </div>
    </SectionCard>
  )
}

/* ═══════════════════════════════════════════════════════════════
   NOTIFICATIONS (placeholder with toggles)
═══════════════════════════════════════════════════════════════ */

function NotificationsSection({ isMobile }: { isMobile: boolean }) {
  const { t } = useT()
  const [emailOn, setEmailOn] = useState(true)
  const [marketingOn, setMarketingOn] = useState(false)

  return (
    <SectionCard title={t('acct.notif.title')} subtitle={t('acct.notif.comingSoon')} isMobile={isMobile}>
      <ToggleRow
        label={t('acct.notif.email')}
        desc={t('acct.notif.emailDesc')}
        value={emailOn} onChange={setEmailOn} disabled
      />
      <ToggleRow
        label={t('acct.notif.marketing')}
        desc={t('acct.notif.marketingDesc')}
        value={marketingOn} onChange={setMarketingOn} disabled
        last
      />
    </SectionCard>
  )
}

function ToggleRow({ label, desc, value, onChange, disabled, last }: {
  label: string; desc: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean; last?: boolean
}) {
  return (
    <div style={{
      padding: '18px 0',
      borderBottom: last ? 'none' : `1px solid ${mk.border}`,
      display: 'flex', alignItems: 'center', gap: 16,
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: mk.text, marginBottom: 4 }}>{label}</div>
        <div style={{ fontSize: 13, color: mk.textMuted, lineHeight: 1.6 }}>{desc}</div>
      </div>
      <button onClick={() => !disabled && onChange(!value)} disabled={disabled}
        style={{
          width: 44, height: 26, borderRadius: 13,
          background: value ? mk.brand : mk.borderStrong,
          border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
          position: 'relative', transition: 'background .15s',
          opacity: disabled ? 0.5 : 1, flexShrink: 0,
        }}>
        <span style={{
          position: 'absolute', top: 3,
          left: value ? 21 : 3,
          width: 20, height: 20, borderRadius: '50%',
          background: '#fff', transition: 'left .15s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
        }} />
      </button>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   LANGUAGES & PLAN
═══════════════════════════════════════════════════════════════ */

function LangPlanSection({ plan, isMobile }: { plan: Plan; isMobile: boolean }) {
  const { t } = useT()
  const isPaid = plan === 'pro' || plan === 'enterprise'

  return (
    <SectionCard title={t('acct.langplan.title')} isMobile={isMobile}>
      {/* Language */}
      <div style={{ padding: '18px 0', borderBottom: `1px solid ${mk.border}`, display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: mk.text, marginBottom: 4 }}>{t('acct.langplan.language')}</div>
          <div style={{ fontSize: 13, color: mk.textMuted }}>English · 中文</div>
        </div>
        <LanguageToggle />
      </div>

      {/* Plan */}
      <div style={{ padding: '18px 0' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: mk.text, marginBottom: 4 }}>{t('acct.langplan.plan')}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span style={{
                fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                padding: '4px 10px', borderRadius: 6,
                background: isPaid ? mk.brandSoft : '#F1F5F9',
                color: isPaid ? mk.brand : mk.textSec,
                fontFamily: 'JetBrains Mono, monospace',
              }}>{plan}</span>
            </div>
            <div style={{ fontSize: 13, color: mk.textMuted, lineHeight: 1.6 }}>
              {isPaid ? t('acct.langplan.planProDesc') : t('acct.langplan.planFreeDesc')}
            </div>
          </div>
          <Link href={isPaid ? '/dashboard?billing=1' : '/dashboard?upgrade=1'}
            style={{
              padding: '10px 16px', borderRadius: 10,
              background: isPaid ? mk.surface : `linear-gradient(135deg, ${mk.brand}, ${mk.brandStrong})`,
              color: isPaid ? mk.text : '#fff',
              border: isPaid ? `1px solid ${mk.borderStrong}` : 'none',
              fontSize: 13, fontWeight: 600, textDecoration: 'none',
              flexShrink: 0, whiteSpace: 'nowrap',
            }}>
            {isPaid ? t('acct.langplan.manage') : t('acct.langplan.upgrade')}
          </Link>
        </div>
      </div>
    </SectionCard>
  )
}
