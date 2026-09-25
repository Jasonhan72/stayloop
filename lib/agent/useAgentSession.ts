'use client'

// Client hook that drives an agent workspace. Loads the RLS-scoped session
// through the browser Supabase client when a user is present; otherwise (or
// if the data fetch stalls / the migration isn't applied) falls back to a
// local demo session so the page ALWAYS renders. Guaranteed to leave the
// loading state within a few seconds — it can never hang on a skeleton.
import { notifyPendingChanged } from '@/lib/agent/pendingCount'
import { useCallback, useEffect, useRef, useState } from 'react'
import { LISTINGS_PAGE } from '@/lib/agent/listingPaging'
import { getSupabaseBrowser } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { useT, type Lang } from '@/lib/i18n'
import type { AgentRole, AgentSessionResponse, AgentStatus, ChatAttachment, ChatMessage } from './types'
import { loadAgentSession } from './session-loader'
import { decidePendingAction } from './approval-engine'
import { runAgentTurn, WORKFLOW_STAGES } from './orchestrator'
import { demoSession } from './demo'
import { getAIName, setAIName, getStoredAIName, getDefaultName, dropForeignAIName } from '@/lib/aiName'
import { appendToThread, createThread, latestThread, loadThread, readPointer, saveThread, writePointer } from './threads'
import { notifyActivityChanged } from './useActivityLog'
import { saveAssistantName } from './assistantProfile'
import { reconcileDraft } from './draftReconcile'

const CHAT_KEY_PREFIX = 'stayloop-agent-chat-'

// Chat history keys are scoped per user (and 'anon' for demo sessions) —
// an unscoped `role`-only key leaks one user's transcript into the next
// login on a shared device, and replays anonymous demo chats inside live
// sessions.
function chatKey(role: AgentRole, scope: string): string {
  return `${CHAT_KEY_PREFIX}${role}-${scope}`
}

function saveMessages(role: AgentRole, scope: string, messages: ChatMessage[]): void {
  try {
    const stripped = messages.map(m => ({
      ...m,
      attachments: m.attachments?.map(a => ({ ...a, dataUrl: '' })),
    }))
    localStorage.setItem(chatKey(role, scope), JSON.stringify(stripped))
    // One-time cleanup of the legacy unscoped key so old transcripts stop
    // leaking across accounts.
    localStorage.removeItem(CHAT_KEY_PREFIX + role)
  } catch {}
}

// Histories saved before 2026-09-18 can carry duplicate ids (the seq
// restarted at `saved.length`); re-key repeats so React keys stay unique.
function rekeyMessages(parsed: ChatMessage[]): ChatMessage[] {
  const seen = new Set<string>()
  let max = 0
  for (const m of parsed) max = Math.max(max, parseInt(String(m.id).replace(/^m/, ''), 10) || 0)
  return parsed.map((m) => {
    const id = String(m.id)
    if (!seen.has(id)) {
      seen.add(id)
      return m
    }
    const fresh = `m${++max}`
    seen.add(fresh)
    return { ...m, id: fresh }
  })
}

function restoreMessages(role: AgentRole, scope: string): ChatMessage[] | null {
  try {
    const raw = localStorage.getItem(chatKey(role, scope))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length > 0) return rekeyMessages(parsed as ChatMessage[])
  } catch {}
  return null
}

// Sync of the assistant's name between this device (localStorage) and the
// account's profile (assistant_profiles.name): the saved name wins across
// devices; a name that only exists on this device (chosen before the profile
// table existed, or while offline) is saved once.
async function reconcileAgentName(
  client: ReturnType<typeof getSupabaseBrowser>,
  sess: AgentSessionResponse,
  _role: AgentRole
): Promise<void> {
  const uid = sess.agent.user_id
  const dbName = sess.agent.agent_name && sess.agent.agent_name !== getDefaultName() ? sess.agent.agent_name : null
  // A cache another account left on this browser is neither shown nor pushed (prod 2026-09-25).
  dropForeignAIName(uid)
  const local = getStoredAIName(uid)
  try {
    if (dbName) {
      setAIName(dbName, uid)
    } else if (local && local !== getDefaultName()) {
      // Named before signing in (onboarding) → the account adopts it.
      await saveAssistantName(client, uid, local)
      setAIName(local, uid)
    }
  } catch (e) {
    console.warn('[agent] name reconcile failed', (e as Error).message)
  }
}

function greeting(role: AgentRole, name: string, lang: Lang): string {
  if (lang === 'en') {
    if (role === 'tenant')
      return `Hi, I'm ${name}. Tell me what kind of home you're after — area, budget, layout, hard requirements. Just say it, and I'll remember it all for you.`
    if (role === 'landlord')
      return `Hi, I'm ${name}. Leave applications, due diligence, compliance and renewals to me — you only nod at the 1–2 moments that matter.`
    return `Hi, I'm ${name}. Showings, prep packs, on-site feedback, settlement — I take the busywork so you can focus on people and judgment.`
  }
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
  decide: (actionId: string, decision: 'approved' | 'rejected', option?: 'A' | 'B', note?: string) => Promise<void>
  /** Approved actions execute after a short delay; until then they can be undone (lifecycle plan §2.5). */
  scheduled: Record<string, { title: string; executeAt: number }>
  undo: (actionId: string) => Promise<void>
  sendMessage: (message: string, attachments?: ChatAttachment[]) => Promise<void>
  /** The chat reveals a further page of listing cards: exclude those addresses from later searches too. */
  markListingsShown: (addresses: string[]) => void
  /** Conversation threads (2026-09-25): live sessions keep one thread per conversation in agent_threads. */
  threadId: string | null
  threadLoading: boolean
  newThread: () => void
  openThread: (id: string) => Promise<void>
}

const RENDER_DEADLINE_MS = 10000
// Approve → execute delay during which the approval can be undone (Muse/EliseAI plans, 2026-09-22).
const UNDO_MS = 60_000

export function useAgentSession(role: AgentRole): UseAgentSession {
  const { loading: authLoading, user } = useAuth()
  const { lang } = useT()
  // Read through a ref inside stable callbacks so a language switch doesn't
  // recreate them (and re-trigger the load effects).
  const langRef = useRef<Lang>(lang)
  langRef.current = lang
  const [loading, setLoading] = useState(true)
  const [live, setLive] = useState(false)
  const [data, setData] = useState<AgentSessionResponse | null>(null)
  const [status, setStatus] = useState<AgentStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [scheduled, setScheduled] = useState<Record<string, { title: string; executeAt: number }>>({})
  const undoCtrls = useRef<Map<string, AbortController>>(new Map())
  const messagesRef = useRef<ChatMessage[]>([])
  messagesRef.current = messages
  const settled = useRef(false)
  const msgSeq = useRef(0)
  const nextId = () => `m${++msgSeq.current}`
  // Addresses already shown this session — excluded so "再找几个 / 换一批" returns new ones.
  const shownListings = useRef<Set<string>>(new Set())
  // URL images accumulated across turns so a draft in a follow-up turn gets them.
  const urlImagesRef = useRef<string[]>([])
  // Storage scope for chat history: the authed user's id, or 'anon' for demo.
  const chatScopeRef = useRef('anon')
  // Conversation threads (agent_threads, 2026-09-25): a live session keeps its
  // history per thread in the DB (the localStorage key stays for demo/anon).
  const [threadId, setThreadId] = useState<string | null>(null)
  const threadIdRef = useRef<string | null>(null)
  const [threadLoading, setThreadLoading] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const creating = useRef<Promise<string | null> | null>(null)
  const resolveGen = useRef(0)
  const agentNameRef = useRef('')
  // The exact array a thread was loaded as: the persist effect must not treat
  // loading as a change (review 2026-09-25 — opening any assistant page
  // rewrote the row and bumped last_message_at to "now").
  const lastAppliedRef = useRef<ChatMessage[] | null>(null)
  // The in-flight resolve / open: sendMessage waits for it so a message typed
  // during "读取对话…" never creates an orphan row or lands in the wrong thread.
  const resolvingRef = useRef<Promise<void> | null>(null)

  // Put a thread on screen: its messages (re-keyed, listing exclusions
  // rebuilt) or the greeting for an empty one. `id` null = a new, unsaved thread.
  const applyThread = useCallback((id: string | null, msgs: ChatMessage[] | null, scope: string) => {
    threadIdRef.current = id
    setThreadId(id)
    writePointer(role, scope, id)
    shownListings.current.clear()
    let next: ChatMessage[]
    if (msgs && msgs.length > 0) {
      next = rekeyMessages(msgs)
      msgSeq.current = Math.max(next.length, ...next.map((m) => parseInt(String(m.id).replace(/^m/, ''), 10) || 0))
      for (const m of next) for (const l of (m.listings ?? []).slice(0, m.listingsPage ?? LISTINGS_PAGE)) shownListings.current.add(l.address.toLowerCase())
    } else {
      msgSeq.current = 0
      next = [{ id: nextId(), role: 'agent', text: greeting(role, agentNameRef.current || getDefaultName(), langRef.current) }]
    }
    lastAppliedRef.current = next
    setMessages(next)
    setThreadLoading(false)
  }, [role])

  // Which thread a live session opens: ?thread=<id> / ?new=1 from the URL,
  // else the browser's pointer, else the latest thread, else the pre-thread
  // localStorage history migrated once into a first thread, else a greeting.
  const resolveThread = useCallback(async (uid: string, scope: string) => {
    const gen = ++resolveGen.current
    setThreadLoading(true)
    const client = getSupabaseBrowser()
    let wantNew = false
    let wantId: string | null = null
    try {
      const params = new URLSearchParams(window.location.search)
      wantNew = params.get('new') === '1'
      wantId = params.get('thread')
      if (wantNew || wantId) {
        params.delete('new'); params.delete('thread')
        window.history.replaceState(null, '', window.location.pathname + (params.toString() ? `?${params}` : '') + window.location.hash)
      }
    } catch { /* no window */ }
    let id: string | null = null
    let msgs: ChatMessage[] | null = null
    if (!wantNew) {
      const pointer = wantId || readPointer(role, scope)
      if (pointer) { const t = await loadThread(client, pointer); if (t) { id = t.id; msgs = t.messages } }
      if (!id) { const t = await latestThread(client, role); if (t) { id = t.id; msgs = t.messages } }
      if (!id) {
        const legacy = restoreMessages(role, scope)
        if (legacy && legacy.length > 1) { const created = await createThread(client, uid, role, legacy); if (created) { id = created; msgs = legacy } }
      }
    }
    if (gen !== resolveGen.current) return
    applyThread(id, msgs, scope)
  }, [role, applyThread])

  const settle = useCallback(
    (d: AgentSessionResponse, isLive: boolean) => {
      // Allow live data to override a demo settle, but never downgrade live → demo.
      if (settled.current && !isLive) return
      // The thread-rebuild decision is keyed on the STORAGE SCOPE, not on a
      // captured `live` flag. The old guard (`settled.current && !live`) read
      // `live` from the closure, so a SECOND live settle (loader retry,
      // visibility refresh) judged "not demo-with-input" and restored the
      // last-persisted history over an in-flight turn — eating the newest
      // bubbles in real time. And when a late live settle upgraded the scope
      // (anon → user) mid-conversation, the messages the user could SEE were
      // persisted under the anon key only, so a reload restored the user
      // scope without the latest round.
      const settledBefore = settled.current
      const nextScope = isLive && user?.id ? user.id.slice(0, 8) : 'anon'
      const scopeChanged = chatScopeRef.current !== nextScope
      settled.current = true
      chatScopeRef.current = nextScope
      // A name cached on this device (onboarding writes it before the profile
      // row lands) shows immediately; the loader already put the account's
      // saved name on d.agent, so nothing overrides that with the generic label.
      const chosen = getStoredAIName(isLive && user?.id ? user.id : null)
      if (chosen && chosen !== getDefaultName()) d = { ...d, agent: { ...d.agent, agent_name: chosen } }
      agentNameRef.current = d.agent.agent_name
      const hadTyped = messagesRef.current.length > 1
      // All state updates batched by React 18+ automatic batching
      setData(d)
      setStatus(d.status)
      setLive(isLive)
      setLoading(false)
      setMessages((cur) => {
        // Same scope, already settled → the thread is already the truth.
        // Never rebuild it from storage.
        if (settledBefore && !scopeChanged) return cur
        // Scope upgrade mid-conversation (user typed during the demo phase):
        // keep exactly what they see (a live scope saves it into a new thread
        // on the next change; anon re-homes it to its key).
        if (cur.length > 1) {
          if (nextScope === 'anon') saveMessages(role, nextScope, cur)
          return cur
        }
        // Live: the thread is resolved from the DB below — render nothing
        // until it lands (no greeting flash before the history).
        if (nextScope !== 'anon') return cur
        // Demo/anon: restore this scope's localStorage history, or greet.
        const saved = restoreMessages(role, nextScope)
        if (saved && saved.length > 0) {
          msgSeq.current = Math.max(saved.length, ...saved.map((m) => parseInt(String(m.id).replace(/^m/, ''), 10) || 0))
          for (const m of saved) for (const l of (m.listings ?? []).slice(0, m.listingsPage ?? LISTINGS_PAGE)) shownListings.current.add(l.address.toLowerCase())
          return saved
        }
        return [{ id: nextId(), role: 'agent', text: greeting(role, d.agent.agent_name, langRef.current) }]
      })
      if (isLive && user?.id && (!settledBefore || scopeChanged) && !hadTyped) {
        const p = resolveThread(user.id, nextScope)
        resolvingRef.current = p
        void p.finally(() => { if (resolvingRef.current === p) resolvingRef.current = null })
      }
    },
    [role, user, resolveThread]
  )

  // Create the thread row the first time a live conversation has something
  // to keep (never an empty row per "+"), once even when two writers race.
  const ensureThread = useCallback(async (msgs: ChatMessage[]): Promise<string | null> => {
    if (threadIdRef.current) return threadIdRef.current
    const uid = user?.id
    if (!uid || chatScopeRef.current === 'anon') return null
    if (!creating.current) {
      // "+" or opening another conversation while the row is being created:
      // the new id belongs to the conversation the user just left (review 2026-09-25).
      const gen = resolveGen.current
      creating.current = createThread(getSupabaseBrowser(), uid, role, msgs).then((id) => {
        creating.current = null
        if (!id || gen !== resolveGen.current) return null
        threadIdRef.current = id; setThreadId(id); writePointer(role, chatScopeRef.current, id)
        return id
      })
    }
    return creating.current
  }, [role, user])
  const persistThread = useCallback(async () => {
    if (chatScopeRef.current === 'anon') return
    const msgs = messagesRef.current
    if (msgs.length <= 1 || msgs === lastAppliedRef.current) return
    const id = await ensureThread(msgs)
    if (id) await saveThread(getSupabaseBrowser(), id, messagesRef.current)
    // The activity panel re-read right after the turn, before this debounced
    // save — its note still showed the greeting (2026-09-25). Tell it again.
    if (id) notifyActivityChanged()
  }, [ensureThread])
  const persistRef = useRef(persistThread)
  persistRef.current = persistThread
  const flushThread = useCallback(() => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null }
    if (chatScopeRef.current !== 'anon' && threadIdRef.current && messagesRef.current.length > 1 && messagesRef.current !== lastAppliedRef.current) void saveThread(getSupabaseBrowser(), threadIdRef.current, messagesRef.current)
  }, [])
  const newThread = useCallback(() => {
    flushThread()
    // Whatever is still resolving or being created belongs to the conversation being left.
    resolveGen.current++
    creating.current = null
    const scope = chatScopeRef.current
    if (scope === 'anon') { try { localStorage.removeItem(chatKey(role, 'anon')) } catch { /* private mode */ } }
    urlImagesRef.current = []
    setStatus('idle')
    applyThread(null, null, scope)
  }, [flushThread, applyThread, role])
  const openThread = useCallback(async (id: string) => {
    if (chatScopeRef.current === 'anon' || id === threadIdRef.current) return
    flushThread()
    setThreadLoading(true)
    const gen = ++resolveGen.current
    creating.current = null
    const p = (async () => {
      const t = await loadThread(getSupabaseBrowser(), id)
      if (gen !== resolveGen.current) return
      if (!t) { setThreadLoading(false); return }
      urlImagesRef.current = []
      setStatus('idle')
      applyThread(t.id, t.messages, chatScopeRef.current)
    })()
    resolvingRef.current = p
    void p.finally(() => { if (resolvingRef.current === p) resolvingRef.current = null })
    await p
  }, [flushThread, applyThread])
  // The rail's "+" (WorkspaceShell) starts a new conversation on this page.
  useEffect(() => {
    const h = () => newThread()
    window.addEventListener('sl-new-thread', h)
    return () => window.removeEventListener('sl-new-thread', h)
  }, [newThread])
  // Flush a pending save when leaving the page.
  useEffect(() => () => { if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; void persistRef.current() } }, [])

  // Persist the conversation on every change: demo/anon → localStorage;
  // live → the thread row (debounced).
  useEffect(() => {
    if (messages.length <= 1) return
    if (messages === lastAppliedRef.current) return // loaded, not changed
    if (chatScopeRef.current === 'anon') { saveMessages(role, 'anon', messages); return }
    if (threadLoading) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => { saveTimer.current = null; void persistRef.current() }, 800)
  }, [messages, role, threadLoading])

  // Demo mode only: when the language toggles, re-derive the demo fixtures so
  // the preview cards/memories follow the switch. Live sessions hold real user
  // data — never regenerated. Keep the (possibly user-named) agent identity.
  useEffect(() => {
    if (!settled.current || live) return
    setData((prev) => {
      if (!prev) return prev
      const fresh = demoSession(role, lang)
      return { ...fresh, agent: prev.agent }
    })
  }, [lang, live, role])

  // Safety net: render within RENDER_DEADLINE_MS no matter what (auth slow,
  // network hung, RPC stalled). Demo content mirrors the design, so the
  // worst case still looks right.
  useEffect(() => {
    const t = setTimeout(() => settle(demoSession(role, langRef.current), false), RENDER_DEADLINE_MS)
    return () => clearTimeout(t)
  }, [role, settle])

  // Live load once auth has settled.
  useEffect(() => {
    if (settled.current) return
    if (authLoading) return
    let cancelled = false
    ;(async () => {
      if (!user) {
        settle(demoSession(role, langRef.current), false)
        return
      }
      try {
        const client = getSupabaseBrowser()
        // Load the live session with ONE retry — a single slow/cold RPC must
        // not strand a logged-in user in demo mode for the whole session
        // (that made every message return the canned acknowledgement).
        let session
        try {
          session = await loadAgentSession(client, role, { seedDemo: false })
        } catch (e1) {
          console.warn('[agent] live load attempt 1 failed, retrying —', (e1 as Error).message)
          await new Promise((r) => setTimeout(r, 1500))
          session = await loadAgentSession(client, role, { seedDemo: false })
        }
        await reconcileAgentName(client, session, role)
        if (cancelled) return
        settle(session, true)

        // Proactive sweep AFTER the workspace is live — never on the load
        // critical path. Fire-and-forget; merge any created proposals in.
        if (role === 'landlord') {
          void (async () => {
            try {
              const { data: sess } = await client.auth.getSession()
              const token = sess?.session?.access_token
              if (!token) return
              const res = await fetch('/api/agent/proactive', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
              })
              if (!res.ok) return
              const j = (await res.json()) as { created?: number; actions?: AgentSessionResponse['pendingActions'] }
              if (cancelled || !j.created || j.created === 0) return
              const created = Array.isArray(j.actions) ? j.actions : []
              if (created.length) {
                setData((prev) => prev ? { ...prev, pendingActions: [...created, ...prev.pendingActions] } : prev)
                setStatus('approval')
              }
              setMessages((msgs) => [...msgs, {
                id: nextId(),
                role: 'agent',
                text: langRef.current === 'zh'
                  ? `我在你离开的时候检查了你的租约：有 ${j.created} 份租约进入了续约窗口。我已经算好方案（不涨 / 按涨租生效年度的省指导上限），放在右侧待你批准 —— 批准后我会把续约函真实发送给租客。`
                  : `While you were away I checked your leases: ${j.created} lease(s) entered the renewal window. I've worked out the options (no increase / the provincial guideline for the year the increase takes effect) — they're on the right awaiting your approval. Once you approve, I'll actually send the renewal letter to your tenant.`,
              }])
            } catch { /* sweep is best-effort */ }
          })()
        }
      } catch (e) {
        console.warn('[agent] live load failed twice, using demo —', (e as Error).message)
        if (!cancelled) settle(demoSession(role, langRef.current), false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [authLoading, user, role, settle])

  const decide = useCallback(
    async (actionId: string, decision: 'approved' | 'rejected', option?: 'A' | 'B', note?: string) => {
      // Optimistic removal, but keep what we removed so a failed RPC can
      // ROLL BACK — otherwise the card vanishes, the user believes the
      // action happened, and the still-pending row resurfaces on reload.
      let removed: AgentSessionResponse['pendingActions'][number] | undefined
      let prevStatus: AgentStatus | null = null
      let remainingPending = 0
      // The "✅ 已执行" line 60 s later belongs to the conversation the card was decided in.
      const startedIn = threadIdRef.current
      setData((prev) => {
        if (!prev) return prev
        removed = prev.pendingActions.find((a) => a.id === actionId)
        const pendingActions = prev.pendingActions.filter((a) => a.id !== actionId)
        remainingPending = pendingActions.length
        return { ...prev, pendingActions }
      })
      // Only clear the approval state when NO cards remain — otherwise a second
      // pending action would look 'handled' while still awaiting the user.
      setStatus((s) => { prevStatus = s; return remainingPending > 0 ? s : (s === 'approval' ? 'result' : s) })
      if (!live) return
      try {
        await decidePendingAction(getSupabaseBrowser(), actionId, decision, note)
        notifyPendingChanged()
      } catch (e) {
        setError((e as Error).message)
        // Roll back: restore the card and the prior status so the UI never
        // claims a decision that didn't persist.
        setData((prev) =>
          prev && removed ? { ...prev, pendingActions: [removed, ...prev.pendingActions] } : prev
        )
        if (prevStatus) setStatus(prevStatus)
        return
      }
      // Approved → EXECUTE after an undo window. The decision only changed a
      // status row; this is where the action actually happens (server-side,
      // idempotent, audited). Sends cannot be recalled, so the recall lives
      // here: 60 seconds in which the landlord can take the approval back.
      if (decision === 'approved') {
        const executeAt = Date.now() + UNDO_MS
        const ctrl = new AbortController()
        undoCtrls.current.set(actionId, ctrl)
        setScheduled((prev) => ({ ...prev, [actionId]: { title: removed?.title ?? '', executeAt } }))
        const cancelled = await new Promise<boolean>((resolve) => {
          const t = setTimeout(() => resolve(false), UNDO_MS)
          ctrl.signal.addEventListener('abort', () => { clearTimeout(t); resolve(true) })
        })
        undoCtrls.current.delete(actionId)
        setScheduled((prev) => { const n = { ...prev }; delete n[actionId]; return n })
        if (cancelled) return
        try {
          const { data: sess } = await getSupabaseBrowser().auth.getSession()
          const token = sess?.session?.access_token
          if (!token) return
          const res = await fetch('/api/agent/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ action_id: actionId, option }),
          })
          const j = (await res.json()) as {
            executed?: boolean
            already?: boolean
            reason?: string
            result?: { sent_to?: string; rent?: number } | null
          }
          const sentTo = j.result?.sent_to
          const rentAmt = j.result?.rent
          const zh = langRef.current === 'zh'
          if (j.executed && sentTo) {
            // Name the artifact by type — "续约函" only for renewals; the newer
            // executors (rent_reminder / send_message) send other emails.
            const artifact = zh
              ? (removed?.action_type === 'send_renewal_letter'
                  ? '续约函'
                  : removed?.action_type === 'rent_reminder'
                    ? '租金提醒'
                    : removed?.action_type === 'maintenance_request'
                      ? '报修工单'
                      : '邮件')
              : (removed?.action_type === 'send_renewal_letter'
                  ? 'renewal letter'
                  : removed?.action_type === 'rent_reminder'
                    ? 'rent reminder'
                    : removed?.action_type === 'maintenance_request'
                      ? 'maintenance request'
                      : 'email')
            const doneMsg: ChatMessage = {
              id: nextId(),
              role: 'agent',
              text: zh
                ? `✅ 已执行：「${removed?.title ?? '你批准的操作'}」— ${artifact}已真实发送至 ${sentTo}${rentAmt ? `（月租 $${rentAmt.toLocaleString()}）` : ''}。执行记录已写入审计日志。`
                : `✅ Done: "${removed?.title ?? 'the action you approved'}" — the ${artifact} was actually sent to ${sentTo}${rentAmt ? ` (monthly rent $${rentAmt.toLocaleString()})` : ''}. The execution was written to the audit log.`,
            }
            if (startedIn && threadIdRef.current !== startedIn) void appendToThread(getSupabaseBrowser(), startedIn, [doneMsg])
            else setMessages((msgs) => [...msgs, doneMsg])
            // The execution wrote an audit row — the activity panel should show it now, not on the next reload.
            notifyActivityChanged()
          } else if (j.executed) {
            // already executed earlier — nothing new to report
          } else if (j.reason === 'no_executor_for_type') {
            // Approval-only action type — the approval itself was the effect.
          } else if (j.reason === 'no_landlord_on_file' || j.reason === 'no_household_on_file') {
            // Tenant-side send / repair with nobody to send to: no confirmed
            // tenancy on this account (user report 2026-09-23).
            setMessages((msgs) => [...msgs, {
              id: nextId(),
              role: 'agent',
              text: zh
                ? '⚠️ 批准已记录，但我不知道该发给哪位房东：你的账号上还没有已确认的在管租约或已签租约。先在「租约」里接受房东的邀请或导入已签租约（/leases/import），之后这类事就能真实送达。'
                : "⚠️ Your approval was recorded, but there is no landlord on file: this account has no confirmed managed tenancy or signed lease yet. Accept your landlord's invitation or import a signed lease (/leases/import) first, and requests like this will really go through.",
            }])
          } else {
            setMessages((msgs) => [...msgs, {
              id: nextId(),
              role: 'agent',
              text: zh
                ? `⚠️ 批准已记录，但执行未完成（${j.reason || '发送失败'}）。这不会重复发送 —— 你可以稍后在待办里重试，或让我检查租客邮箱是否有误。`
                : `⚠️ Your approval was recorded, but execution didn't complete (${j.reason || 'send failed'}). Nothing will be double-sent — retry from your pending items later, or ask me to check whether the tenant's email address is wrong.`,
            }])
          }
        } catch {
          setMessages((msgs) => [...msgs, {
            id: nextId(),
            role: 'agent',
            text: langRef.current === 'zh'
              ? '⚠️ 批准已记录，但执行请求没有送达服务器。刷新后可重试，不会重复发送。'
              : "⚠️ Your approval was recorded, but the execution request never reached the server. Refresh and retry — nothing will be double-sent.",
          }])
        }
      }
    },
    [live]
  )

  const sendMessage = useCallback(
    async (message: string, attachments?: ChatAttachment[]) => {
      if ((!message.trim() && !attachments?.length) || !data) return
      // A live session may still be deciding which thread is open (deep links
      // send on the same tick the page settles): wait, or the message is
      // shown, then wiped by the loaded history, and its reply lands in an
      // orphan row (review 2026-09-25, reproduced in a hook harness).
      if (resolvingRef.current) await resolvingRef.current
      // Capture the prior thread as context so follow-ups ("再找几个 / 换一批")
      // keep the earlier criteria.
      const history = messagesRef.current.slice(-6).map((m) => ({ role: m.role, text: m.text }))
      // Show the user's message (with any attachments) in the thread immediately.
      const userMsg: ChatMessage = { id: nextId(), role: 'user', text: message.trim(), attachments }
      setMessages((m) => [...m, userMsg])
      setStatus('understanding')

      // Default result is only ever shown on the signed-in-but-disconnected
      // path — honest, not the old canned "我记下了…" that made a dead session
      // look alive. Anonymous visitors get REAL reasoning below (server-side
      // anonymous preview mode), so their result is always overwritten.
      const uiLang = langRef.current
      const zhUi = uiLang === 'zh'
      let result = zhUi
        ? {
            title: '会话未连接',
            body: '⚠️ 当前会话没有连接到实时服务（预览模式），这条消息我没有真正处理。请刷新页面重连后再发一次 —— 如果反复出现，告诉我你的网络环境，我们来排查。',
          }
        : {
            title: 'Session not connected',
            body: "⚠️ This session isn't connected to the live service (preview mode), so this message wasn't actually processed. Refresh the page to reconnect and send it again — if it keeps happening, tell me about your network setup and we'll debug it.",
          }
      let memoryWrites: AgentSessionResponse['memories'] = []
      let proposedAction: AgentSessionResponse['pendingActions'][number] | null = null
      let nextStage: string | null = null
      // The thread the question was asked in — the reply goes there even if the user has since opened another one.
      let sentThread: string | null = null
      let listings: ChatMessage['listings']
      let listingsSource: ChatMessage['listingsSource']
      let listingsNotice: ChatMessage['listingsNotice']
      let listingsPage: ChatMessage['listingsPage']
      let market: ChatMessage['market']
      let followups: ChatMessage['followups']
      let draftListing: ChatMessage['draftListing']

      setStatus('working')
      // Real reasoning for authenticated live sessions AND anonymous visitors
      // (server-side anonymous preview: strict per-IP limit, zero persistence).
      // Only a signed-in user whose live load failed gets the disconnect note.
      if (live && user) {
        try {
          const stageLabel = WORKFLOW_STAGES[role].find((s) => s.key === data.workflow.current_stage)?.label[uiLang]
          // The thread row exists before the turn is audited, so the activity
          // log can point back at this conversation.
          const tid = await ensureThread([...messagesRef.current.filter((m) => m.id !== userMsg.id), userMsg])
          sentThread = tid
          const turn = await runAgentTurn({
            lang: uiLang,
            client: getSupabaseBrowser(),
            userId: user.id,
            threadId: tid,
            role,
            agentName: data.agent.agent_name,
            message,
            memories: data.memories,
            workflow: data.workflow,
            stageLabel,
            attachments,
            exclude: Array.from(shownListings.current),
            history,
            live: true,
          })
          result = turn.result
          memoryWrites = turn.memoryWrites
          proposedAction = turn.proposedAction
          nextStage = turn.nextStage
          // The turn's audit row is written by now — let the activity panel re-read.
          notifyActivityChanged()
          listings = turn.listings
          listingsSource = turn.listingsSource
          listingsNotice = turn.listingsNotice
          listingsPage = turn.listingsPage
          market = turn.market
          followups = turn.followups
          draftListing = turn.draftListing
          // Accumulate URL images across turns for cross-turn draft attachment.
          if (turn.urlImages?.length) urlImagesRef.current = turn.urlImages
          // If draft has no images, attach accumulated images from prior URL turns.
          if (draftListing && (!draftListing.images || !draftListing.images.length) && urlImagesRef.current.length) {
            draftListing = { ...draftListing, images: urlImagesRef.current }
          }
          // A re-draft of the same property keeps the facts extracted earlier
          // unless this message changed them (fact drift, 2026-09-25).
          if (draftListing) {
            const prevDraft = [...messagesRef.current].reverse().find((m) => m.role === 'agent' && m.draftListing)?.draftListing
            draftListing = reconcileDraft(prevDraft, draftListing, message)
          }
          // Remember what we showed so the next search returns fresh results.
          // Only the page the user can see counts as shown; the held-back page is
          // added when 「换一批」 reveals it (markListingsShown).
          turn.listings?.slice(0, turn.listingsPage ?? LISTINGS_PAGE).forEach((l) => shownListings.current.add(l.address.toLowerCase()))
        } catch (e) {
          console.warn('[agent] turn failed —', (e as Error).message)
          // HONEST failure message — the old canned "我记下了…" made a failed
          // turn look like a successful one (user believed the agent absorbed
          // the request when nothing was processed).
          const msg = (e as Error).message || ''
          result = /429|rate.?limit/i.test(msg)
            ? (zhUi
                ? {
                    title: '本小时额度用完了',
                    body: '⚠️ 你这一小时的对话额度已经用完了。额度按小时窗口恢复，大约 10 分钟后再来试就好 —— 这条消息不用急着重发。',
                  }
                : {
                    title: 'Hourly quota used up',
                    body: "⚠️ You've used up this hour's conversation quota. It refills on an hourly window — try again in about 10 minutes. No rush to resend this message.",
                  })
            : /llm truncated/i.test(msg)
              ? (zhUi
                  ? {
                      title: '回复被截断了',
                      body: '⚠️ 这条回复过长被截断了，我没能把答案完整生成出来。请把问题拆小一点、分成几条来问，我一条条答。',
                    }
                  : {
                      title: 'Reply was cut off',
                      body: "⚠️ That reply ran too long and got truncated — I couldn't finish generating the answer. Break the question into smaller pieces and ask them one at a time; I'll answer each.",
                    })
              : (zhUi
                  ? {
                      title: '这条没处理成',
                      body: /timeout|504|network|failed to fetch|llm http 5|llm unavailable/i.test(msg)
                        ? '⚠️ 服务端处理这条消息时超时或暂时繁忙，内容我没有真正读到 —— 请把这条消息重新发一次，通常第二次就会成功（页面已被缓存）。'
                        : `⚠️ 这条消息我没有处理成功（${msg.slice(0, 120)}）。请重发一次；若持续失败，把内容以文字形式直接发给我。`,
                    }
                  : {
                      title: "That message didn't go through",
                      body: /timeout|504|network|failed to fetch|llm http 5|llm unavailable/i.test(msg)
                        ? '⚠️ The server timed out or was briefly busy handling this message — I never actually read it. Please send it again; the second try usually succeeds (the page is cached).'
                        : `⚠️ I couldn't process this message (${msg.slice(0, 120)}). Please resend it; if it keeps failing, paste the content to me as plain text.`,
                    })
        }
      } else if (!user) {
        // Anonymous visitor — real reasoning through the route's anonymous
        // preview mode. No Authorization header, no persistence: memories and
        // pending actions stay untouched (the server strips them anyway).
        // Demo-session memories/workflow are staged FICTION (Sarah Wang, fake
        // budgets) — never feed them to real reasoning; start from a blank
        // intake context instead.
        try {
          const turn = await runAgentTurn({
            lang: uiLang,
            role,
            agentName: data.agent.agent_name,
            message,
            memories: [],
            workflow: {
              workflow_type: data.workflow.workflow_type,
              workflow_id: null,
              current_stage: 'intake',
              completed_steps: [],
              status: 'active',
            },
            attachments,
            exclude: Array.from(shownListings.current),
            history,
            live: false,
            anonymous: true,
          })
          result = turn.result
          listings = turn.listings
          listingsSource = turn.listingsSource
          listingsNotice = turn.listingsNotice
          listingsPage = turn.listingsPage
          market = turn.market
          followups = turn.followups
          draftListing = turn.draftListing
          if (turn.urlImages?.length) urlImagesRef.current = turn.urlImages
          // Only the page the user can see counts as shown; the held-back page is
          // added when 「换一批」 reveals it (markListingsShown).
          turn.listings?.slice(0, turn.listingsPage ?? LISTINGS_PAGE).forEach((l) => shownListings.current.add(l.address.toLowerCase()))
        } catch (e) {
          console.warn('[agent] anonymous turn failed —', (e as Error).message)
          const msg = (e as Error).message || ''
          result = /429/.test(msg)
            ? (zhUi
                ? {
                    title: '体验额度用完了',
                    body: '⚠️ 匿名体验每小时限 8 条消息，这个小时的额度用完了。登录后继续 —— 不受此额度限制，而且我能真正记住你的偏好、替你跟进申请。点右上角「登录」即可，1 分钟搞定。',
                  }
                : {
                    title: 'Preview quota used up',
                    body: '⚠️ The anonymous preview allows 8 messages per hour, and this hour\'s quota is used up. Sign in to continue — no such limit applies, and I can truly remember your preferences and follow up on applications for you. Click "Sign in" at the top right; it takes a minute.',
                  })
            : /llm truncated/i.test(msg)
              ? (zhUi
                  ? {
                      title: '回复被截断了',
                      body: '⚠️ 这条回复过长被截断了，我没能把答案完整生成出来。请把问题拆小一点、分成几条来问，我一条条答。',
                    }
                  : {
                      title: 'Reply was cut off',
                      body: "⚠️ That reply ran too long and got truncated — I couldn't finish generating the answer. Break the question into smaller pieces and ask them one at a time; I'll answer each.",
                    })
              : (zhUi
                  ? {
                      title: '这条没处理成',
                      body: /timeout|504|network|failed to fetch|llm http 5|llm unavailable/i.test(msg)
                        ? '⚠️ 服务端处理这条消息时超时或暂时繁忙，内容我没有真正读到 —— 请把这条消息重新发一次，通常第二次就会成功。'
                        : `⚠️ 这条消息我没有处理成功（${msg.slice(0, 120)}）。请重发一次；若持续失败，把内容换个说法再发给我。`,
                    }
                  : {
                      title: "That message didn't go through",
                      body: /timeout|504|network|failed to fetch|llm http 5|llm unavailable/i.test(msg)
                        ? '⚠️ The server timed out or was briefly busy handling this message — I never actually read it. Please send it again; the second try usually succeeds.'
                        : `⚠️ I couldn't process this message (${msg.slice(0, 120)}). Please resend it, or try phrasing it differently.`,
                    })
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
      // Append the agent's reply (with any listing/draft cards) to the thread it
      // was asked in. If the user opened another conversation meanwhile, the
      // reply is written to that row instead of the one on screen (review 2026-09-25).
      const reply: ChatMessage = { id: nextId(), role: 'agent', text: result.body, listings, listingsSource, listingsNotice, listingsPage, market, followups, draftListing }
      if (sentThread && threadIdRef.current !== sentThread) {
        void appendToThread(getSupabaseBrowser(), sentThread, [reply]).then(() => notifyActivityChanged())
        return
      }
      setMessages((m) => [...m, reply])
    },
    [live, user, role, data]
  )

  const markListingsShown = useCallback((addresses: string[]) => {
    for (const a of addresses) shownListings.current.add(a.toLowerCase())
  }, [])

  // Undo within the window: cancel the timer, put the row back to pending
  // (own row under RLS), restore the card, audit the reversal.
  const undo = useCallback(async (actionId: string) => {
    const ctrl = undoCtrls.current.get(actionId)
    if (!ctrl) return
    ctrl.abort()
    if (!live) return
    try {
      const sb = getSupabaseBrowser()
      const { data: row } = await sb.from('agent_pending_actions').update({ status: 'pending' }).eq('id', actionId).eq('status', 'approved').is('executed_at', null).select('*').maybeSingle()
      if (row) {
        setData((prev) => (prev ? { ...prev, pendingActions: [row as AgentSessionResponse['pendingActions'][number], ...prev.pendingActions.filter((a) => a.id !== actionId)] } : prev))
        setStatus('approval')
        await sb.from('agent_audit_events').insert({ actor_id: user?.id ?? null, actor_type: 'user', action: 'approval_undone', target_type: 'agent_pending_action', target_id: actionId, metadata: { thread_id: ((row as { metadata?: Record<string, unknown> | null }).metadata?.thread_id as string | undefined) ?? null } })
      }
      // After the audit row exists, so the badges and the activity log re-read the final state.
      notifyPendingChanged()
    } catch (e) {
      setError((e as Error).message)
    }
  }, [live, user])

  return { loading, live, data, status, error, messages, decide, sendMessage, markListingsShown, scheduled, undo, threadId, threadLoading, newThread, openThread }
}
