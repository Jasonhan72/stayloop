// -----------------------------------------------------------------------------
// POST /api/agent/approvals — V5 prototype
// -----------------------------------------------------------------------------
// Records the user's approve/reject decision on a single PendingAction.
//
// Today: validates the request shape and returns a mock success response.
// Tomorrow: write to approval_events + audit_events, transition the
//           pending action from 'pending' to 'approved' / 'rejected', and
//           (only when approved) hand the action off to the workflow
//           orchestrator for actual execution. RLS will scope writes to
//           the action's owning user.
//
// Important: even in the live implementation, this endpoint NEVER executes
// a sensitive side-effect (sending an application, signing a doc, sharing
// a passport) directly. Approval simply unlocks the orchestrator to run
// that side-effect on a separate code path that has its own audit trail.
// -----------------------------------------------------------------------------

import { NextResponse, type NextRequest } from 'next/server'
import type {
  ApprovalDecisionRequest,
  ApprovalDecisionResponse,
  ApprovalDecisionError,
} from '@/lib/v5/agent-types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  let body: ApprovalDecisionRequest
  try {
    body = (await req.json()) as ApprovalDecisionRequest
  } catch {
    return errorResponse('Expected JSON body', 400)
  }

  if (typeof body?.action_id !== 'string' || body.action_id.length < 4) {
    return errorResponse('Missing or invalid action_id', 400)
  }
  if (body?.decision !== 'approve' && body?.decision !== 'reject') {
    return errorResponse('decision must be "approve" or "reject"', 400)
  }

  // Mock success. The live implementation will:
  //   1. Authenticate the caller (Supabase auth.uid()).
  //   2. Verify the action belongs to the caller (via RLS).
  //   3. Verify the action is currently in 'pending' state.
  //   4. Insert into approval_events with the decision + optional note.
  //   5. Update pending_actions.status to approved / rejected.
  //   6. Insert an audit_events row with actor_id + timestamp.
  //   7. (approve only) Notify the orchestrator that this action may run.
  const ok: ApprovalDecisionResponse = {
    ok: true,
    action_id: body.action_id,
    status: body.decision === 'approve' ? 'approved' : 'rejected',
    recorded_at: new Date().toISOString(),
  }
  return NextResponse.json(ok, {
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  })
}

function errorResponse(message: string, status: number) {
  const payload: ApprovalDecisionError = { ok: false, error: message }
  return NextResponse.json(payload, { status })
}
