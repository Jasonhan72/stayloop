'use client'
// -----------------------------------------------------------------------------
// /tenant/agent — V5 prototype
// -----------------------------------------------------------------------------
// Personal command center for Luna, the tenant's V5 agent. Wraps the
// TenantAgentWorkspace component inside the existing V4 PageShell so the
// page sits naturally inside the rest of the authenticated app — same
// AppBar, same Sidebar, same brand tokens.
//
// Today: fetches mock session data from /api/agent/session.
// Tomorrow: same component, but the API will assemble live session data
//           from Supabase (agent_sessions + user_memories + task_memories +
//           pending_actions). The component contract doesn't change.
// -----------------------------------------------------------------------------

import { useEffect, useState } from 'react'
import PageShell from '@/components/v4/PageShell'
import TenantAgentWorkspace from '@/components/v5/tenant-agent/TenantAgentWorkspace'
import { useT } from '@/lib/i18n'
import { v3 } from '@/lib/brand'
import type { TenantAgentSession } from '@/lib/v5/agent-types'

export default function TenantAgentPage() {
  const { lang } = useT()
  const [session, setSession] = useState<TenantAgentSession | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/agent/session', { method: 'GET' })
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`)
        }
        const data = (await res.json()) as TenantAgentSession
        if (!cancelled) setSession(data)
      } catch (e) {
        if (!cancelled) setError((e as Error).message || 'Failed to load')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <PageShell role="tenant" path="/tenant/agent">
      {error ? (
        <div
          style={{
            maxWidth: 720,
            margin: '40px auto',
            padding: '20px 22px',
            background: v3.surfaceCard,
            border: `1px solid ${v3.border}`,
            borderRadius: 12,
            color: v3.textSecondary,
            fontSize: 13.5,
          }}
        >
          {lang === 'zh'
            ? `加载失败：${error}`
            : `Failed to load Luna's session: ${error}`}
        </div>
      ) : session ? (
        <TenantAgentWorkspace session={session} lang={lang === 'zh' ? 'zh' : 'en'} />
      ) : (
        <LoadingShimmer />
      )}
    </PageShell>
  )
}

function LoadingShimmer() {
  // Lightweight skeleton — keeps layout stable while the API resolves.
  // Mirrors the four primary blocks (header, workflow, pending, memory + recs).
  const block: React.CSSProperties = {
    background: v3.surfaceCard,
    border: `1px solid ${v3.border}`,
    borderRadius: 16,
    padding: '20px 22px',
    minHeight: 96,
  }
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 22,
        maxWidth: 1080,
        margin: '0 auto',
        padding: '4px 4px 32px',
      }}
    >
      <div style={{ ...block, minHeight: 112 }} />
      <div style={{ ...block, minHeight: 220 }} />
      <div style={{ ...block, minHeight: 260 }} />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 22,
        }}
      >
        <div style={{ ...block, minHeight: 220 }} />
        <div style={{ ...block, minHeight: 220 }} />
      </div>
    </div>
  )
}
