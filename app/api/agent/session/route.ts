// -----------------------------------------------------------------------------
// GET /api/agent/session — V5 prototype
// -----------------------------------------------------------------------------
// Returns the tenant agent session payload that drives /tenant/agent.
//
// Today: returns the static mock from lib/v5/tenant-agent-mock.
// Tomorrow: assemble the live session by reading
//   - agent_configs       (which agent + system prompt for this user)
//   - agent_sessions      (current session id, status, last_active_at)
//   - user_memories       (private memory items)
//   - task_memories       (current workflow stage, completed/upcoming flags)
//   - approval_events     (pending actions in 'pending' state)
//   and projecting them into TenantAgentSession.
//
// We keep the route on the Node.js runtime because the future implementation
// will use the Supabase service-role client + RLS-aware reads. Edge runtime
// is overkill for a low-volume personal session endpoint.
// -----------------------------------------------------------------------------

import { NextResponse } from 'next/server'
import { getTenantAgentMock } from '@/lib/v5/tenant-agent-mock'
import type { TenantAgentSession } from '@/lib/v5/agent-types'

export const runtime = 'nodejs'
// V5 sessions evolve as the user takes action; never cache.
export const dynamic = 'force-dynamic'

export async function GET() {
  const session: TenantAgentSession = getTenantAgentMock()
  return NextResponse.json(session, {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  })
}
