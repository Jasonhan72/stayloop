'use client'

// Client hook that drives an agent workspace. Loads the RLS-scoped session
// through the browser Supabase client when a user is present; otherwise (or
// if the agent-core migration isn't applied yet) falls back to a local demo
// session so the page always renders. Approve/reject are optimistic and
// persist through the decide_pending_action RPC in live mode.
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

export function useAgentSession(role: AgentRole): UseAgentSession {
  const { loading: authLoading, user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [live, setLive] = useState(false)
  const [data, setData] = useState<AgentSessionResponse | null>(null)
  const [status, setStatus] = useState<AgentStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const bootstrapped = useRef(false)

  useEffect(() => {
    if (authLoading) return
    if (bootstrapped.current) return
    bootstrapped.current = true

    let cancelled = false
    ;(async () => {
      // No user → demo preview.
      if (!user) {
        const demo = demoSession(role)
        if (!cancelled) {
          setData(demo); setStatus(demo.status); setLive(false); setLoading(false)
        }
        return
      }
      try {
        const client = getSupabaseBrowser()
        const session = await loadAgentSession(client, role, { seedDemo: true })
        if (!cancelled) {
          setData(session); setStatus(session.status); setLive(true); setLoading(false)
        }
      } catch (e) {
        // Migration not applied / transient → degrade to demo, don't crash.
        console.warn('[agent] live load failed, using demo', (e as Error).message)
        const demo = demoSession(role)
        if (!cancelled) {
          setData(demo); setStatus(demo.status); setLive(false); setLoading(false)
        }
      }
    })()

    return () => { cancelled = true }
  }, [authLoading, user, role])

  const decide = useCallback(
    async (actionId: string, decision: 'approved' | 'rejected', note?: string) => {
      // Optimistic: drop the action from the pending list immediately.
      setData((prev) => {
        if (!prev) return prev
        const pendingActions = prev.pendingActions.filter((a) => a.id !== actionId)
        return { ...prev, pendingActions }
      })
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
      await new Promise((r) => setTimeout(r, 350))
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
      await new Promise((r) => setTimeout(r, 250))
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
