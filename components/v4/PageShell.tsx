'use client'
// -----------------------------------------------------------------------------
// V4 PageShell — Sidebar + AppBar + scrollable content
// -----------------------------------------------------------------------------
// Desktop: 220px sticky sidebar + 56px sticky app bar + scrollable main.
// Mobile (≤ 860px):
//   - Sidebar collapses into a slide-out drawer pinned to the left edge.
//   - AppBar gains a hamburger button on its left that toggles the drawer.
//   - A semi-transparent backdrop appears behind the open drawer; tapping
//     it closes the drawer.
//   - Content padding shrinks (32 → 18) so cards have breathing room on
//     narrow screens without feeling cramped.
//
// Spec: .v4-source/primitives.jsx PageShell() (desktop) +
//       .v4-source/preview (3).html @media query (mobile rules).
// -----------------------------------------------------------------------------

import { useState, useEffect, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { v3 } from '@/lib/brand'
import { useUser, type UserRole } from '@/lib/useUser'
import Sidebar from './Sidebar'
import AppBar from './AppBar'

interface Props {
  children: ReactNode
  role?: UserRole
  path?: string
  noPadding?: boolean
  /** When true, do not redirect signed-out visitors to /login. Use for pages
   *  that have a meaningful unauthenticated experience (e.g. /passport,
   *  /score, /onboard previews). Defaults to false. */
  allowAnonymous?: boolean
}

export default function PageShell({ children, role, path, noPadding, allowAnonymous }: Props) {
  const { user, loading, signOut } = useUser({
    redirectIfMissing: !allowAnonymous,
    allowAnonymous,
  })

  const [drawerOpen, setDrawerOpen] = useState(false)
  const pathname = usePathname()

  // Close the drawer whenever the user navigates to a new page. Without this
  // the drawer would stay open across page transitions on mobile and obscure
  // the page they just landed on.
  useEffect(() => {
    setDrawerOpen(false)
  }, [pathname])

  // Lock body scroll while the drawer is open so the page underneath doesn't
  // scroll behind the overlay. Restore on close.
  useEffect(() => {
    if (typeof document === 'undefined') return
    if (drawerOpen) {
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = prev
      }
    }
  }, [drawerOpen])

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        background: v3.surface,
      }}
    >
      {/* Desktop sidebar — hidden on mobile via the global stylesheet rule. */}
      <div className="ps-sidebar-desktop">
        <Sidebar user={user} role={role} />
      </div>

      {/* Mobile drawer — fixed-positioned, slides in from the left. Hidden on
          desktop via the same media query. */}
      <div
        className="ps-sidebar-mobile"
        aria-hidden={!drawerOpen}
        style={{
          position: 'fixed',
          inset: '0 auto 0 0',
          zIndex: 60,
          transform: drawerOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.22s cubic-bezier(.2,.8,.2,1)',
          boxShadow: drawerOpen ? '0 24px 80px rgba(32,24,12,0.18)' : 'none',
          willChange: 'transform',
        }}
      >
        <Sidebar user={user} role={role} />
      </div>

      {/* Backdrop — only shown on mobile when drawer is open. */}
      {drawerOpen && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setDrawerOpen(false)}
          className="ps-backdrop"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 55,
            background: 'rgba(15,23,42,0.32)',
            backdropFilter: 'blur(2px)',
            border: 0,
            cursor: 'pointer',
            padding: 0,
          }}
        />
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <AppBar
          user={user}
          loading={loading}
          signOut={signOut}
          role={role}
          path={path}
          onOpenMenu={() => setDrawerOpen(true)}
        />
        <main
          className="ps-main"
          style={{
            flex: 1,
            padding: noPadding ? 0 : 32,
            minWidth: 0,
          }}
        >
          {children}
        </main>
      </div>

      <style jsx global>{`
        /* Desktop default: show the in-flow sidebar, hide the mobile drawer. */
        .ps-sidebar-desktop { display: block; }
        .ps-sidebar-mobile { display: none; }

        @media (max-width: 860px) {
          /* Mobile: hide the in-flow sidebar entirely, switch to the drawer. */
          .ps-sidebar-desktop { display: none !important; }
          .ps-sidebar-mobile { display: block !important; }

          /* Tighter content padding on narrow viewports. */
          .ps-main {
            padding: ${noPadding ? '0' : '18px'} !important;
          }
        }
      `}</style>
    </div>
  )
}
