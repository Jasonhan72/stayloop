'use client'

// /agent/agent — Brief's workspace. The page itself is the shared
// components/agent/AgentWorkspacePage (one component for the three hats).
import AgentWorkspacePage from '@/components/agent/AgentWorkspacePage'

export default function FieldAgentPage() {
  return <AgentWorkspacePage role="agent" />
}
