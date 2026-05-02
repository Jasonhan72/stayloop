// -----------------------------------------------------------------------------
// /api/agent/action — pending_actions approve/reject/modify
// -----------------------------------------------------------------------------
// AI-proposed mutations are written to pending_actions by the agent loop
// (via the action_proposal block + a row insert). The frontend renders the
// proposal with [批准] / [驳回] / [修改] buttons. Each button calls this
// endpoint to update the pending_actions row + actually trigger the side
// effect when approved.
//
// POST body: { pending_action_id, decision: 'approve'|'reject'|'modify', modified_payload? }
// -----------------------------------------------------------------------------

export const runtime = 'edge'

import { createClient } from '@supabase/supabase-js'

interface ActionRequestBody {
  pending_action_id: string
  decision: 'approve' | 'reject' | 'modify'
  modified_payload?: any
}

function makeServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

function makeRlsClient(authHeader: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } },
  )
}

export async function POST(req: Request) {
  const rawAuth = req.headers.get('authorization') || ''
  const authHeader = rawAuth.replace(/[^\x20-\x7E]/g, '').trim()
  if (!authHeader) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  const rls = makeRlsClient(authHeader)
  const { data: userData, error: userErr } = await rls.auth.getUser()
  if (userErr || !userData?.user) {
    return Response.json({ error: 'invalid_session' }, { status: 401 })
  }
  const userId = userData.user.id

  const body = (await req.json().catch(() => null)) as ActionRequestBody | null
  if (!body || !body.pending_action_id || !body.decision) {
    return Response.json({ error: 'bad_request' }, { status: 400 })
  }
  if (!['approve', 'reject', 'modify'].includes(body.decision)) {
    return Response.json({ error: `invalid_decision: ${body.decision}` }, { status: 400 })
  }

  // Load + verify ownership via RLS client
  const { data: pa, error: paErr } = await rls
    .from('pending_actions')
    .select('id, conversation_id, action_kind, payload, status')
    .eq('id', body.pending_action_id)
    .maybeSingle()
  if (paErr || !pa) {
    return Response.json({ error: 'not_found' }, { status: 404 })
  }
  if (pa.status !== 'pending') {
    return Response.json({ error: `already_${pa.status}` }, { status: 409 })
  }

  const admin = makeServiceClient()
  const finalStatus =
    body.decision === 'approve' ? 'approved'
    : body.decision === 'modify' ? 'modified'
    : 'rejected'
  const finalPayload = body.decision === 'modify' ? body.modified_payload : pa.payload

  // Persist decision
  const { error: updateErr } = await admin
    .from('pending_actions')
    .update({
      status: finalStatus,
      decided_at: new Date().toISOString(),
      decided_by: userId,
      final_payload: finalPayload,
    })
    .eq('id', body.pending_action_id)
  if (updateErr) {
    return Response.json({ error: `update_failed: ${updateErr.message}` }, { status: 500 })
  }

  // Execute the actual side effect (only for 'approve' or 'modify')
  let executionResult: any = { skipped: body.decision === 'reject' }
  if (body.decision !== 'reject') {
    executionResult = await executeApprovedAction(pa.action_kind, finalPayload, admin)
  }

  return Response.json({
    success: true,
    pending_action_id: pa.id,
    status: finalStatus,
    execution: executionResult,
  })
}

/**
 * Dispatch the approved side effect. Each action_kind has a tiny handler.
 * Failures here are non-fatal — the pending_actions row is still recorded
 * as approved/modified so the audit trail is preserved.
 *
 * Sprint 3: only stub handlers. Real implementations land alongside the
 * agents that propose them (e.g. send_email lands with Echo's draft tool).
 */
async function executeApprovedAction(actionKind: string, payload: any, admin: any) {
  switch (actionKind) {
    case 'send_email':
      // TODO: integrate Resend client
      console.log('[action] send_email stub:', JSON.stringify(payload).slice(0, 200))
      return { stubbed: true, action_kind: actionKind }
    case 'reject_applicant':
      // TODO: update applications.status, log decision_log
      console.log('[action] reject_applicant stub:', JSON.stringify(payload).slice(0, 200))
      return { stubbed: true, action_kind: actionKind }
    case 'post_listing':
      console.log('[action] post_listing stub:', JSON.stringify(payload).slice(0, 200))
      return { stubbed: true, action_kind: actionKind }
    default:
      return { stubbed: true, action_kind: actionKind, note: 'unknown_action_kind' }
  }
}
