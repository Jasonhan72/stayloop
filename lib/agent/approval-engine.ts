// Agent spine — pending actions + approve/reject.
// The non-negotiable control point: key actions never auto-execute.
// approve/reject route through the decide_pending_action RPC, which
// dual-writes approval_event + audit_event inside one transaction.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AgentRole, PendingAction } from './types'

/** What the execute route stamped on a row (releaseClaim writes `error`, newer executors `reason`). */
export type ExecutionResult = { ok?: boolean; reason?: string | null; error?: string | null; [k: string]: unknown }

/** A row as the database holds it once decided: when, and what execution made of it. */
export type DecidedAction = PendingAction & {
  decided_at?: string | null
  executed_at?: string | null
  execution_result?: ExecutionResult | null
  /** Renewal letters: the A/B the person approved (from the approval event's note). */
  approved_option?: 'A' | 'B' | null
}

// Action types the execute route can carry out (C1). A card of any other type
// would be approved and then do nothing — it is not offered as approvable.
export const EXECUTABLE_ACTION_TYPES = [
  'send_renewal_letter', 'send_message', 'maintenance_request', 'rent_reminder', 'renewal_checkpoint',
  'relist_prompt', 'dispatch_work_order', 'approve_quote', 'accept_completion', 'work_order_overdue',
  'showing_request', 'listing_inquiry', 'send_decision', 'send_lease',
] as const
export function isExecutableAction(type: string | null | undefined): boolean {
  return (EXECUTABLE_ACTION_TYPES as readonly string[]).includes(String(type ?? ''))
}

/** A card the executor found no longer valid (preview said expired): every session drops it. */
export const PENDING_EXPIRED_EVENT = 'sl-pending-expired'
export function notifyPendingExpired(id: string): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(PENDING_EXPIRED_EVENT, { detail: { id } }))
}

/** The note decide_pending_action records on the approval event for a renewal letter's choice. */
export const optionNote = (option: 'A' | 'B') => `option:${option}`

/** What a decision on a card turned into — the chat records its collapsed line from this, never
 *  from the button pressed (an approval the RPC retired is not 「已批准」). */
export type DecideOutcome =
  | 'executed' | 'already_ran' | 'stalled' | 'expired' | 'not_run'
  | 'undone' | 'rejected' | 'abandoned' | 'preview' | 'error' | 'noop'

// An approved card found unexecuted on load: decided within this window and not
// failed → its countdown resumes (what is left of the 60 s, then it runs);
// otherwise it waits on the to-do list as 「已批准，尚未执行」 with 现在执行 / 放弃.
export const RESUME_WINDOW_MS = 10 * 60_000
export function classifyApproved(r: DecidedAction, now: number, undoFailed?: Set<string>): 'resume' | 'stalled' {
  // An undo that did not go through is held, never run on a timer.
  if (undoFailed?.has(r.id) || r.execution_result?.reason === 'undo_failed') return 'stalled'
  if (r.execution_result && r.execution_result.ok === false) return 'stalled'
  const t = r.decided_at ? Date.parse(r.decided_at) : NaN
  if (!Number.isFinite(t) || now - t >= RESUME_WINDOW_MS || t > now + 60_000) return 'stalled'
  // Without the A/B the person chose, a renewal letter must not be sent on a guess.
  if (r.action_type === 'send_renewal_letter' && !r.approved_option) return 'stalled'
  return 'resume'
}
export function resumeDelayMs(r: DecidedAction, now: number, undoMs: number): number {
  const t = r.decided_at ? Date.parse(r.decided_at) : NaN
  return Number.isFinite(t) ? Math.min(undoMs, Math.max(0, t + undoMs - now)) : 0
}

// An undo that did not reach the database leaves the row approved: this browser remembers
// it so no later load resumes the countdown the person took back (review 2026-10-01).
export const UNDO_FAILED_KEY = 'sl-undo-failed'
function readUndoFailed(): Record<string, number> {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(UNDO_FAILED_KEY) : null
    const v = raw ? JSON.parse(raw) : {}
    return v && typeof v === 'object' ? (v as Record<string, number>) : {}
  } catch { return {} }
}
function writeUndoFailed(v: Record<string, number>): void {
  try { localStorage.setItem(UNDO_FAILED_KEY, JSON.stringify(v)) } catch { /* private mode */ }
}
export function markUndoFailed(id: string, now = Date.now()): void {
  writeUndoFailed({ ...readUndoFailed(), [id]: now })
}
export function clearUndoFailed(id: string): void {
  const v = readUndoFailed()
  if (!(id in v)) return
  delete v[id]
  writeUndoFailed(v)
}
/** Ids whose undo failed recently; older ones classify as stalled by age anyway. */
export function undoFailedIds(now = Date.now()): Set<string> {
  return new Set(Object.entries(readUndoFailed()).filter(([, t]) => now - Number(t) < RESUME_WINDOW_MS).map(([id]) => id))
}

function rowToAction(r: Record<string, unknown>): PendingAction {
  return {
    id: r.id as string,
    user_id: r.user_id as string,
    workflow_id: (r.workflow_id as string) ?? null,
    role: r.role as AgentRole,
    action_type: r.action_type as string,
    title: r.title as string,
    summary: (r.summary as string) ?? '',
    recipient_label: (r.recipient_label as string) ?? null,
    data_scope: (r.data_scope as string[]) ?? [],
    excluded_data: (r.excluded_data as string[]) ?? [],
    risk_level: (r.risk_level as PendingAction['risk_level']) ?? 'medium',
    status: r.status as PendingAction['status'],
    requires_approval: (r.requires_approval as boolean) ?? true,
    created_at: r.created_at as string,
    expires_at: (r.expires_at as string) ?? null,
    metadata: (r.metadata as Record<string, unknown>) ?? {},
  }
}

function rowToDecided(r: Record<string, unknown>): DecidedAction {
  const events = Array.isArray(r.approvals) ? (r.approvals as { status?: string; metadata?: { note?: unknown } | null; created_at?: string }[]) : []
  const latest = events
    .filter((e) => e.status === 'approved')
    .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))[0]
  const m = String(latest?.metadata?.note ?? '').match(/^option:(A|B)$/)
  return {
    ...rowToAction(r),
    decided_at: (r.decided_at as string) ?? null,
    executed_at: (r.executed_at as string) ?? null,
    execution_result: (r.execution_result as ExecutionResult) ?? null,
    approved_option: m ? (m[1] as 'A' | 'B') : null,
  }
}

export async function getPendingActions(
  client: SupabaseClient,
  role: AgentRole,
  status: PendingAction['status'] = 'pending'
): Promise<PendingAction[]> {
  return (await readPendingActions(client, role, status)) ?? []
}

/** null on a read error — a refresh must keep what is on screen rather than wipe every card. */
export async function readPendingActions(
  client: SupabaseClient,
  role: AgentRole,
  status: PendingAction['status'] = 'pending'
): Promise<PendingAction[] | null> {
  const { data, error } = await client
    .from('agent_pending_actions')
    .select('*')
    .eq('role', role)
    .eq('status', status)
    .order('created_at', { ascending: false })

  if (error) {
    console.warn('[approval] read failed', error.message)
    return null
  }
  // Dedupe by content — guards against duplicate rows (e.g. a past seed race)
  // rendering the same approval card twice. Rows are ordered newest-first.
  const seen = new Set<string>()
  return (data ?? []).map(rowToAction).filter((a) => {
    const key = `${a.action_type}|${a.title}|${a.recipient_label ?? ''}|${a.summary}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Approved but never executed (tab closed during the undo window, or the run failed): these
 *  must stay visible with a retry, never vanish (sweep 2026-10-01). Not deduped — each is a real decision. */
export async function getApprovedUnexecuted(client: SupabaseClient, role: AgentRole): Promise<DecidedAction[]> {
  return (await readApprovedUnexecuted(client, role)) ?? []
}

/** null on a read error (see readPendingActions). */
export async function readApprovedUnexecuted(client: SupabaseClient, role: AgentRole): Promise<DecidedAction[] | null> {
  const base = () => client.from('agent_pending_actions')
  const withEvents = await base()
    .select('*, approvals:approval_events(status, metadata, created_at)')
    .eq('role', role)
    .eq('status', 'approved')
    .is('executed_at', null)
    .order('created_at', { ascending: false })
    .limit(20)
  let rows = withEvents.data as Record<string, unknown>[] | null
  if (withEvents.error) {
    // The embed is a convenience (the renewal option); the rows themselves must still show.
    const plain = await base().select('*').eq('role', role).eq('status', 'approved').is('executed_at', null).order('created_at', { ascending: false }).limit(20)
    if (plain.error) {
      console.warn('[approval] approved-unexecuted read failed', plain.error.message)
      return null
    }
    rows = plain.data as Record<string, unknown>[] | null
  }
  return (rows ?? []).map(rowToDecided)
}

export async function decidePendingAction(
  client: SupabaseClient,
  actionId: string,
  decision: 'approved' | 'rejected',
  note?: string
): Promise<DecidedAction> {
  const { data, error } = await client.rpc('decide_pending_action', {
    p_id: actionId,
    p_decision: decision,
    p_note: note ?? null,
  })
  if (error) throw new Error(error.message)
  return rowToDecided(data as Record<string, unknown>)
}
