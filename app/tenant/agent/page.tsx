'use client'

// /tenant/agent — Luna's workspace. The page itself is the shared
// components/agent/AgentWorkspacePage (one component for the three hats).
import AgentWorkspacePage from '@/components/agent/AgentWorkspacePage'

export default function TenantAgentPage() {
  return <AgentWorkspacePage role="tenant" />
}
