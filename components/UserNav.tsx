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
} as const

export interface UserNavProps {
  user: UserSession | null
  signOut: () => Promise<void>
  loading?: boolean
  showNewScreening?: boolean
  onNewScreening?: () => void
}

export default function UserNav({ user, signOut }: UserNavProps) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const getInitials = (): string => {
    if (!user) return '?'
    if (user.fullName?.trim()) {
      const p = user.fullName.trim().split(' ')
      return (p[0]?.[0] + (p[1]?.[0] || '')).toUpperCase()
    }
    return (user.email || '?').charAt(0).toUpperCase()
  }

  return (
    <nav style={{
      position: 'sticky', top: 0, zIndex: 50,
      background: 'rgba(247,248,251,0.82)',
      backdropFilter: 'saturate(1.6) blur(14px)',
      WebkitBackdropFilter: 'saturate(1.6) blur(14px)',
      borderBottom: `1px solid ${mk.border}`,
    }}>
      <div style={{
        maxWidth: 1200, margin: '0 auto',
        padding: '10px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        {/* Logo */}
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10,
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

        {/* Right side */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <LanguageToggle />

          {!user ? (
            /* Not logged in — single login button */
            <Link href="/login" style={{
              fontSize: 13, fontWeight: 600, color: '#fff',
              textDecoration: 'none', padding: '8px 18px', borderRadius: 8,
              background: `linear-gradient(135deg, ${mk.brand}, ${mk.brandStrong})`,
              boxShadow: '0 4px 12px -2px rgba(13,148,136,0.35)',
            }}>
              {t('nav.signin') || 'Sign in'}
            </Link>
          ) : (
            /* Logged in — avatar only */
            <div style={{ position: 'relative' }} ref={ref}>
              <button
                onClick={() => setOpen(!open)}
                style={{
                  width: 38, height: 38, borderRadius: '50%',
                  background: `linear-gradient(135deg, ${mk.brand}, ${mk.brandStrong})`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontWeight: 700, fontSize: 14,
                  cursor: 'pointer', border: 'none',
                  boxShadow: open
                    ? `0 0 0 3px rgba(13,148,136,0.25), 0 4px 12px -2px rgba(13,148,136,0.35)`
                    : '0 4px 12px -2px rgba(13,148,136,0.35)',
                  transition: 'box-shadow .15s',
                }}
                title={user.email}
              >
                {getInitials()}
              </button>

              {/* Dropdown */}
              <div style={{
                position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                background: mk.surface,
                border: `1px solid ${mk.border}`,
                borderRadius: 14, minWidth: 220,
                boxShadow: '0 16px 40px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.04)',
                opacity: open ? 1 : 0,
                pointerEvents: open ? 'auto' : 'none',
                transform: open ? 'translateY(0)' : 'translateY(-4px)',
                transition: 'opacity .15s, transform .15s',
                zIndex: 100,
                overflow: 'hidden',
              }}>
                {/* User header */}
                <div style={{
                  padding: '16px 18px 14px',
                  borderBottom: `1px solid ${mk.border}`,
                }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: mk.text, marginBottom: 2 }}>
                    {user.fullName || user.email.split('@')[0]}
                  </div>
                  <div style={{ fontSize: 12, color: mk.textFaint }}>{user.email}</div>
                </div>

                {/* Menu items */}
                <div style={{ padding: '6px 0' }}>
                  {[
                    { href: '/dashboard', label: t('nav.dashboard') || 'Dashboard', icon: '🏠' },
                    { href: '/screen', label: t('nav.screenings') || 'Screenings', icon: '📋' },
                    { href: '/profile', label: t('nav.profile') || 'My Profile', icon: '👤' },
                  ].map(item => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '11px 18px', fontSize: 14, color: mk.text,
                        textDecoration: 'none', transition: 'background .1s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#F1F5F9')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <span style={{ fontSize: 16, width: 22, textAlign: 'center' }}>{item.icon}</span>
                      {item.label}
                    </Link>
                  ))}
                </div>

                {/* Divider + Sign out */}
                <div style={{ borderTop: `1px solid ${mk.border}`, padding: '6px 0' }}>
                  <button
                    onClick={async () => { setOpen(false); await signOut() }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      width: '100%', padding: '11px 18px',
                      fontSize: 14, color: mk.red,
                      background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                      transition: 'background .1s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = mk.redSoft)}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span style={{ fontSize: 16, width: 22, textAlign: 'center' }}>↩</span>
                    {t('nav.signOut') || 'Sign out'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </nav>
  )
}
