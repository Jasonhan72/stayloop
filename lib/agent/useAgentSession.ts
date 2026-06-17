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
import { runAgentTurn, WORKFLOW_STAGES } from './orchestrator'
import { demoSession } from './demo'
import { getAIName } from '@/lib/aiName'

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
      // The tenant's agent is named by the user at onboarding (localStorage).
      // The session's agent_name defaults to ROLE_META — override it so the
      // workspace, input bar, memory aside, and LLM all use the chosen name.
      if (role === 'tenant') {
        const chosen = getAIName()
        if (chosen) d = { ...d, agent: { ...d.agent, agent_name: chosen } }
      }
      // All state updates batched by React 18+ automatic batching
      setData(d)
      setStatus(d.status)
      setLive(isLive)
      setLoading(false)
    },
    [role]
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
      if (!message.trim() || !data) return
      setStatus('understanding')

      // Default acknowledgement (used if reasoning is unavailable).
      let result = {
        title: '收到了',
        body: `我记下了:"${message.trim()}"。需要对外分享或提交的动作,都会先作为待批准卡片让你确认。`,
      }
      let memoryWrites: AgentSessionResponse['memories'] = []
      let proposedAction: AgentSessionResponse['pendingActions'][number] | null = null
      let nextStage: string | null = null

      setStatus('working')
      // Real reasoning only for authenticated live sessions — anonymous preview
      // keeps the canned acknowledgement (no LLM cost, no persistence target).
      if (live && user) {
        try {
          const stageLabel = WORKFLOW_STAGES[role].find((s) => s.key === data.workflow.current_stage)?.label
          const turn = await runAgentTurn({
            client: getSupabaseBrowser(),
            userId: user.id,
            role,
            agentName: data.agent.agent_name,
            message,
            memories: data.memories,
            workflow: data.workflow,
            stageLabel,
            live: true,
          })
          result = turn.result
          memoryWrites = turn.memoryWrites
          proposedAction = turn.proposedAction
          nextStage = turn.nextStage
        } catch (e) {
          console.warn('[agent] turn failed, using fallback —', (e as Error).message)
        }
      } else {
        await new Promise((r) => setTimeout(r, 350))
      }

      setData((prev) => {
        if (!prev) return prev
        // Merge implicit memory writes into the live snapshot (dedupe by key).
        const memMap = new Map(prev.memories.map((m) => [m.key, m]))
        for (const m of memoryWrites) memMap.set(m.key, m)
        const pendingActions = proposedAction
          ? [proposedAction, ...prev.pendingActions]
          : prev.pendingActions
        const workflow = nextStage ? { ...prev.workflow, current_stage: nextStage } : prev.workflow
        setStatus(pendingActions.length ? 'approval' : 'result')
        return {
          ...prev,
          memories: Array.from(memMap.values()),
          pendingActions,
          workflow,
          latestResult: { ...result, kind: 'summary' },
        }
      })
    },
    [live, user, role, data]
  )

  return { loading, live, data, status, error, decide, sendMessage }
}
