'use client'

// Client hook that drives an agent workspace. Loads the RLS-scoped session
// through the browser Supabase client when a user is present; otherwise (or
// if the data fetch stalls / the migration isn't applied) falls back to a
// local demo session so the page ALWAYS renders. Guaranteed to leave the
// loading state within a few seconds — it can never hang on a skeleton.
import { useCallback, useEffect, useRef, useState } from 'react'
import { getSupabaseBrowser } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import type { AgentRole, AgentSessionResponse, AgentStatus } from './types'
import { loadAgentSession } from './session-loader'
import { decidePendingAction } from './approval-engine'
import { handleMessage } from './orchestrator'
import { demoSession } from './demo'

export type UseAgentSession = {
  loading: boolean
  live: boolean // true when backed by Supabase, false in demo fallback
  data: AgentSessionResponse | null
  status: AgentStatus
  error: string | null
  decide: (actionId: string, decision: 'approved' | 'rejected', note?: string) => Promise<void>
  sendMessage: (message: string) => Promise<void>
}

const RENDER_DEADLINE_MS = 5000

export function useAgentSession(role: AgentRole): UseAgentSession {
  const { loading: authLoading, user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [live, setLive] = useState(false)
  const [data, setData] = useState<AgentSessionResponse | null>(null)
  const [status, setStatus] = useState<AgentStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const settled = useRef(false)

  const settle = useCallback(
    (d: AgentSessionResponse, isLive: boolean) => {
      // Atomic check-and-set to prevent double settle from timeout + live load race
      if (settled.current) return
      settled.current = true
      // All state updates batched by React 18+ automatic batching
      setData(d)
      setStatus(d.status)
      setLive(isLive)
      setLoading(false)
    },
    []
  )

  // Safety net: render within RENDER_DEADLINE_MS no matter what (auth slow,
  // network hung, RPC stalled). Demo content mirrors the design, so the
  // worst case still looks right.
  useEffect(() => {
    const t = setTimeout(() => settle(demoSession(role), false), RENDER_DEADLINE_MS)
    return () => clearTimeout(t)
  }, [role, settle])

  // Live load once auth has settled.
  useEffect(() => {
    if (settled.current) return
    if (authLoading) return
    let cancelled = false
    ;(async () => {
      if (!user) {
        settle(demoSession(role), false)
        return
      }
      try {
        const session = await loadAgentSession(getSupabaseBrowser(), role, { seedDemo: true })
        if (!cancelled) settle(session, true)
      } catch (e) {
        console.warn('[agent] live load failed, using demo —', (e as Error).message)
        if (!cancelled) settle(demoSession(role), false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [authLoading, user, role, settle])

  const decide = useCallback(
    async (actionId: string, decision: 'approved' | 'rejected', note?: string) => {
      setData((prev) =>
        prev ? { ...prev, pendingActions: prev.pendingActions.filter((a) => a.id !== actionId) } : prev
      )
      setStatus((s) => (s === 'approval' ? 'result' : s))
      if (!live) return
      try {
        await decidePendingAction(getSupabaseBrowser(), actionId, decision, note)
      } catch (e) {
        setError((e as Error).message)
      }
    },
    [live]
  )

  const sendMessage = useCallback(
    async (message: string) => {
      if (!message.trim()) return
      setStatus('understanding')
      await new Promise((r) => setTimeout(r, 300))
      setStatus('working')

      let result = {
        title: '收到了',
        body: `我记下了:“${message.trim()}”。需要对外分享或提交的动作,都会先作为待批准卡片让你确认。`,
      }
      if (live && user) {
        try {
          result = await handleMessage(getSupabaseBrowser(), user.id, role, message)
        } catch (e) {
          console.warn('[agent] message failed', (e as Error).message)
        }
      }
      await new Promise((r) => setTimeout(r, 200))
      setData((prev) => {
        if (!prev) return prev
        setStatus(prev.pendingActions.length ? 'approval' : 'result')
        return { ...prev, latestResult: { ...result, kind: 'summary' } }
      })
    },
    [live, user, role]
  )

  return { loading, live, data, status, error, decide, sendMessage }
}
