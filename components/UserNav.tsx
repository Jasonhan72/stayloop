'use client'
import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { UserSession } from '@/lib/useUser'
import { useT, LanguageToggle } from '@/lib/i18n'

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

export interface UserNavProps {
  user: UserSession | null
  signOut: () => Promise<void>
  loading?: boolean
  showNewScreening?: boolean
  onNewScreening?: () => void
}

export default function UserNav({ user, signOut, loading, showNewScreening, onNewScreening }: UserNavProps) {
  const { t } = useT()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Get initials from user name or email
  const getInitials = (): string => {
    if (!user) return '?'
    if (user.fullName && user.fullName.trim()) {
      const parts = user.fullName.trim().split(' ')
      return (parts[0]?.[0] + (parts[1]?.[0] || '')).toUpperCase()
    }
    const email = user.email || ''
    return email.charAt(0).toUpperCase()
  }

  const navStyle: React.CSSProperties = {
    position: 'sticky',
    top: 0,
    zIndex: 50,
    background: 'rgba(247,248,251,0.82)',
    backdropFilter: 'saturate(1.6) blur(14px)',
    WebkitBackdropFilter: 'saturate(1.6) blur(14px)',
    borderBottom: `1px solid ${mk.border}`,
  }

  const containerStyle: React.CSSProperties = {
    maxWidth: 1200,
    margin: '0 auto',
    padding: '14px 28px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  }

  const logoBoxStyle: React.CSSProperties = {
    width: 36,
    height: 36,
    borderRadius: 10,
    background: `linear-gradient(135deg, ${mk.brand}, ${mk.brandStrong})`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontWeight: 700,
    fontSize: 15,
    boxShadow: '0 4px 12px -2px rgba(13,148,136,0.35)',
  }

  const brandLinkStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    textDecoration: 'none',
  }

  const brandTextStyle: React.CSSProperties = {
    fontSize: 15,
    fontWeight: 700,
    color: mk.navy,
    letterSpacing: '-0.01em',
  }

  const brandSubStyle: React.CSSProperties = {
    fontSize: 10,
    color: mk.textFaint,
    fontFamily: 'JetBrains Mono, monospace',
    marginTop: -1,
  }

  const actionsStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  }

  const buttonStyle: React.CSSProperties = {
    fontSize: 13,
    color: mk.brand,
    textDecoration: 'none',
    background: 'none',
    border: `1px solid ${mk.border}`,
    borderRadius: 8,
    padding: '8px 14px',
    cursor: 'pointer',
    fontWeight: 600,
    transition: 'all .15s',
  }

  const avatarStyle: React.CSSProperties = {
    width: 36,
    height: 36,
    borderRadius: 10,
    background: `linear-gradient(135deg, ${mk.brand}, ${mk.brandStrong})`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontWeight: 700,
    fontSize: 13,
    cursor: 'pointer',
    transition: 'transform .15s',
    boxShadow: '0 4px 12px -2px rgba(13,148,136,0.35)',
  }

  const dropdownStyle: React.CSSProperties = {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: 8,
    background: mk.surface,
    border: `1px solid ${mk.border}`,
    borderRadius: 12,
    boxShadow: '0 12px 32px rgba(0,0,0,0.1)',
    minWidth: 180,
    opacity: dropdownOpen ? 1 : 0,
    pointerEvents: dropdownOpen ? 'auto' : 'none',
    transition: 'opacity .15s',
    zIndex: 100,
  }

  const dropdownItemBaseStyle: React.CSSProperties = {
    display: 'block',
    width: '100%',
    padding: '12px 16px',
    fontSize: 14,
    color: mk.text,
    textDecoration: 'none',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'background .1s',
  }

  const dividerStyle: React.CSSProperties = {
    height: 1,
    background: mk.border,
    margin: '6px 0',
  }

  const userInfoStyle: React.CSSProperties = {
    padding: '12px 16px',
    fontSize: 12,
    color: mk.textMuted,
    borderBottom: `1px solid ${mk.border}`,
  }

  const userNameStyle: React.CSSProperties = {
    fontWeight: 600,
    color: mk.text,
  }

  return (
    <nav style={navStyle}>
      <div style={containerStyle}>
        {/* Logo + Brand */}
        <Link href="/" style={brandLinkStyle}>
          <div style={logoBoxStyle}>S</div>
          <div>
            <div style={brandTextStyle}>Stayloop</div>
            <div style={brandSubStyle}>Ontario · beta</div>
          </div>
        </Link>

        {/* Actions */}
        <div style={actionsStyle}>
          {/* New Screening button (optional) */}
          {showNewScreening && onNewScreening && (
            <button
              onClick={onNewScreening}
              style={{
                ...buttonStyle,
                background: `linear-gradient(135deg, ${mk.brand}, ${mk.brandStrong})`,
                color: '#fff',
                border: 'none',
                boxShadow: '0 4px 12px -2px rgba(13,148,136,0.35)',
              }}
            >
              {t('nav.newScreening') || 'New screening'}
            </button>
          )}

          {/* Language Toggle */}
          <LanguageToggle />

          {/* Auth state */}
          {!user ? (
            // Anonymous or loading - show Sign in / Register
            <>
              <Link href="/login" style={buttonStyle}>
                {t('nav.signin') || 'Sign in'}
              </Link>
              <Link
                href="/register"
                style={{
                  ...buttonStyle,
                  background: `linear-gradient(135deg, ${mk.brand}, ${mk.brandStrong})`,
                  color: '#fff',
                  border: 'none',
                  boxShadow: '0 4px 12px -2px rgba(13,148,136,0.35)',
                }}
              >
                {t('nav.register') || 'Register'}
              </Link>
            </>
          ) : (
            // Authenticated - show avatar dropdown
            <div style={{ position: 'relative' }} ref={dropdownRef}>
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                onMouseEnter={() => setDropdownOpen(true)}
                style={{
                  ...avatarStyle,
                  transform: dropdownOpen ? 'scale(1.05)' : 'scale(1)',
                }}
                title={user.email}
              >
                {getInitials()}
              </button>

              {/* Dropdown Menu */}
              <div style={dropdownStyle}>
                <div style={userInfoStyle}>
                  <div style={userNameStyle}>{user.fullName || user.email.split('@')[0]}</div>
                  <div style={{ fontSize: 11, color: mk.textFaint }}>{user.email}</div>
                </div>

                <Link
                  href="/profile"
                  style={dropdownItemBaseStyle}
                  onMouseEnter={e => (e.currentTarget.style.background = mk.brandSoft)}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  {t('nav.profile') || 'My Profile'}
                </Link>

                <Link
                  href="/dashboard"
                  style={dropdownItemBaseStyle}
                  onMouseEnter={e => (e.currentTarget.style.background = mk.brandSoft)}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  {t('nav.dashboard') || 'Dashboard'}
                </Link>

                <Link
                  href="/screen"
                  style={dropdownItemBaseStyle}
                  onMouseEnter={e => (e.currentTarget.style.background = mk.brandSoft)}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  {t('nav.screenings') || 'Screenings'}
                </Link>

                <div style={dividerStyle} />

                <button
                  onClick={async () => {
                    setDropdownOpen(false)
                    await signOut()
                  }}
                  style={{
                    ...dropdownItemBaseStyle,
                    color: mk.red,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = mk.redSoft)}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  {t('nav.signOut') || 'Sign out'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </nav>
  )
}
