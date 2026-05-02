'use client'
// -----------------------------------------------------------------------------
// V4 PageShell — Sidebar + AppBar + scrollable content
// -----------------------------------------------------------------------------
// Replaces the older AppHeader-only chrome on every authenticated page.
//
// Spec: .v4-source/primitives.jsx PageShell()
//
//   <div display:flex height:100% overflow:hidden>
//     <Sidebar/>
//     <main flex:1 display:flex flexDirection:column overflow:hidden>
//       <AppBar/>
//       <div flex:1 overflow:auto padding:32>
//         {children}
//       </div>
//     </main>
//   </div>
//
// Usage:
//   import PageShell from '@/components/v4/PageShell'
//   <PageShell><YourPageContent/></PageShell>
//
// Optional props:
//   - role: override the role used for sidebar nav highlighting + appbar badge.
//   - path: override the breadcrumb shown in the AppBar.
//   - noPadding: opt out of the default 32px content padding (for /chat etc).
// -----------------------------------------------------------------------------

import type { ReactNode } from 'react'
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
  // PageShell is for authenticated screens by default — kick to /login if
  // missing. Pass allowAnonymous to opt into a "public preview" mode.
  const { user, loading, signOut } = useUser({
    redirectIfMissing: !allowAnonymous,
    allowAnonymous,
  })

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        background: v3.surface,
      }}
    >
      <Sidebar user={user} role={role} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <AppBar user={user} loading={loading} signOut={signOut} role={role} path={path} />
        <main
          style={{
            flex: 1,
            padding: noPadding ? 0 : 32,
            minWidth: 0,
          }}
        >
          {children}
        </main>
      </div>
    </div>
  )
}
