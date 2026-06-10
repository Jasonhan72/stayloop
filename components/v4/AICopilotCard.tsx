'use client'
// -----------------------------------------------------------------------------
// AICopilotCard — small panel at the bottom of the V4 Sidebar
// -----------------------------------------------------------------------------
// Per primitives.jsx PageShell spec: a 1-line headline + 1 metric + "Open →"
// link. Counts pending_actions in status='pending' for the current user's
// conversations and links to /chat where the user can review them.
// -----------------------------------------------------------------------------

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { v3 } from '@/lib/brand'
import { useT } from '@/lib/i18n'
import { supabase } from '@/lib/supabase'
import type { UserSession } from '@/lib/useUser'

interface Props {
  user: UserSession | null
}

export default function AICopilotCard({ user }: Props) {
  const { lang } = useT()
  const isZh = lang === 'zh'
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    ;(async () => {
      try {
        // pending_actions are scoped to a conversation; conversations are
        // scoped to a user. Two-step join (Supabase doesn't expose a JOIN
        // through the JS client cleanly).
        const { data: convos } = await supabase
          .from('conversations')
          .select('id')
          .eq('user_id', user.authId)

        const ids = (convos as Array<{ id: string }> | null)?.map(c => c.id) || []
        if (ids.length === 0) {
          if (!cancelled) setCount(0)
          return
        }

        const { count: pendingCount } = await supabase
          .from('pending_actions')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending')
          .in('conversation_id', ids)

        if (!cancelled) setCount(pendingCount ?? 0)
      } catch {
        if (!cancelled) setCount(0)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user?.authId])

  const n = count ?? 0
  const subtitle = (() => {
    if (count === null) return isZh ? '加载中…' : 'Loading…'
    if (n === 0) return isZh ? '暂无待办建议' : 'No pending suggestions'
    return isZh ? `${n} 条最佳行动待审核` : `${n} next-best-action${n === 1 ? '' : 's'} waiting`
  })()

  return (
    <div
      style={{
        background: '#F8F5EC',
        border: `1px solid ${v3.border}`,
        borderRadius: 14,
        padding: 12,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, color: v3.textPrimary, display: 'flex', alignItems: 'center', gap: 7 }}>
        <span
          aria-hidden
          style={{
            width: 18,
            height: 18,
            borderRadius: 5,
            background: v3.trust,
            color: '#fff',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'JetBrains Mono, monospace',
            fontWeight: 700,
            fontSize: 10,
            flexShrink: 0,
          }}
        >
          ✦
        </span>
        Stayloop AI
      </div>
      <div style={{ fontSize: 11, color: v3.textSecondary, marginTop: 4, lineHeight: 1.5 }}>
        {subtitle}
      </div>
      <Link
        href="/chat"
        style={{
          display: 'inline-block',
          marginTop: 6,
          color: v3.brand,
          fontSize: 12,
          fontWeight: 600,
          textDecoration: 'none',
        }}
      >
        {isZh ? '打开 →' : 'Open →'}
      </Link>
    </div>
  )
}
