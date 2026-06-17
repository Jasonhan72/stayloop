'use client'

// Client hook that drives an agent workspace. Loads the RLS-scoped session
// through the browser Supabase client when a user is present; otherwise (or
// if the data fetch stalls / the migration isn't applied) falls back to a
// local demo session so the page ALWAYS renders. Guaranteed to leave the
// loading state within a few seconds — it can never hang on a skeleton.
import { useCallback, useEffect, useRef, useState } from 'react'
import { getSupabaseBrowser } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import type { AgentRole, AgentSessionResponse, AgentStatus, ChatAttachment, ChatMessage } from './types'
import { loadAgentSession } from './session-loader'
import { decidePendingAction } from './approval-engine'
import { runAgentTurn, WORKFLOW_STAGES } from './orchestrator'
import { demoSession } from './demo'
import { getAIName, setAIName, getStoredAIName } from '@/lib/aiName'

const DEFAULT_AI_NAME = 'Luna'

// Two-way sync of the tenant agent's name between this device (localStorage)
// and the durable store (agent_configs.agent_name), so a name chosen on one
// device shows up on every device after login.
async function reconcileTenantName(
  client: ReturnType<typeof getSupabaseBrowser>,
  sess: AgentSessionResponse
): Promise<void> {
  const cfgId = sess.agent.id
  const dbName = sess.agent.agent_name
  const local = getStoredAIName() // raw — null if never chosen on this device
  try {
    if (local && local !== dbName) {
      // User picked a name on this device → make it durable server-side.
      await client.from('agent_configs').update({ agent_name: local }).eq('id', cfgId)
    } else if (!local && dbName && dbName !== DEFAULT_AI_NAME) {
      // Name was set on another device → cache it locally so the override shows it.
      setAIName(dbName)
    }
  } catch (e) {
    console.warn('[agent] name reconcile failed', (e as Error).message)
  }
}

function greeting(role: AgentRole, name: string): string {
  if (role === 'tenant')
    return `你好,我是 ${name}。告诉我你想找什么样的家 —— 区域、预算、户型、硬条件,直接说就好,我都帮你记住。`
  if (role === 'landlord')
    return `你好,我是 ${name}。把申请、尽调、合规、续约交给我;关键的 1–2 个时刻,你点头就好。`
  return `你好,我是 ${name}。带看、准备包、现场反馈、结算 —— 行政杂活我来,你专心做人和判断。`
}

export type UseAgentSession = {
  loading: boolean
  live: boolean // true when backed by Supabase, false in demo fallback
  data: AgentSessionResponse | null
  status: AgentStatus
  error: string | null
  messages: ChatMessage[]
  decide: (actionId: string, decision: 'approved' | 'rejected', note?: string) => Promise<void>
  sendMessage: (message: string, attachments?: ChatAttachment[]) => Promise<void>
}

const RENDER_DEADLINE_MS = 5000

export function useAgentSession(role: AgentRole): UseAgentSession {
  const { loading: authLoading, user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [live, setLive] = useState(false)
  const [data, setData] = useState<AgentSessionResponse | null>(null)
  const [status, setStatus] = useState<AgentStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const settled = useRef(false)
  const msgSeq = useRef(0)
  const nextId = () => `m${++msgSeq.current}`
  // Addresses already shown this session — excluded so "再找几个 / 换一批" returns new ones.
  const shownListings = useRef<Set<string>>(new Set())

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
      // Open the conversation with a greeting from the (named) agent.
      setMessages([{ id: nextId(), role: 'agent', text: greeting(role, d.agent.agent_name) }])
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
        const client = getSupabaseBrowser()
        const session = await loadAgentSession(client, role, { seedDemo: true })
        // Make the tenant's chosen name durable + pick up a name set elsewhere.
        if (role === 'tenant') await reconcileTenantName(client, session)
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
    async (message: string, attachments?: ChatAttachment[]) => {
      if ((!message.trim() && !attachments?.length) || !data) return
      // Show the user's message (with any attachments) in the thread immediately.
      setMessages((m) => [...m, { id: nextId(), role: 'user', text: message.trim(), attachments }])
      setStatus('understanding')

      // Default acknowledgement (used if reasoning is unavailable).
      let result = {
        title: '收到了',
        body: `我记下了:"${message.trim()}"。需要对外分享或提交的动作,都会先作为待批准卡片让你确认。`,
      }
      let memoryWrites: AgentSessionResponse['memories'] = []
      let proposedAction: AgentSessionResponse['pendingActions'][number] | null = null
      let nextStage: string | null = null
      let listings: ChatMessage['listings']
      let listingsSource: ChatMessage['listingsSource']

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
            attachments,
            exclude: Array.from(shownListings.current),
            live: true,
          })
          result = turn.result
          memoryWrites = turn.memoryWrites
          proposedAction = turn.proposedAction
          nextStage = turn.nextStage
          listings = turn.listings
          listingsSource = turn.listingsSource
          // Remember what we showed so the next search returns fresh results.
          turn.listings?.forEach((l) => shownListings.current.add(l.address.toLowerCase()))
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
      // Append the agent's reply (with any listing cards) to the thread.
      setMessages((m) => [
        ...m,
        { id: nextId(), role: 'agent', text: result.body, listings, listingsSource },
      ])
    },
    [live, user, role, data]
  )

  return { loading, live, data, status, error, messages, decide, sendMessage }
}
