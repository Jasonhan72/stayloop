'use client'

// /agent/audit — the agent's own audit trail (the assistant panel and the
// phone activity sheet link to /${role}/audit for every role; agents had no
// page here and the link 404'd — walk-through 2026-09-25).
import AuditLog from '@/components/AuditLog'

export default function AgentAuditPage() {
  return <AuditLog role="agent" />
}
