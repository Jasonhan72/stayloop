'use client'

// The lifecycle rail's data hook. Since 节点 1 (2026-09-26) it is a thin
// view over lib/facts/useFacts — the one RPC every workspace surface reads —
// plus the pure derivation in ./stages. The per-table fallback loaders that
// lived here were a second data path with their own filters (tenant_id vs
// tenant_email …) and are gone: if the facts RPC fails the rail shows nothing
// rather than a different truth.
import { useMemo } from 'react'
import { useFacts } from '@/lib/facts/useFacts'
import { factsToLifecycle } from '@/lib/facts/toLifecycle'
import type { AgentRole } from '@/lib/agent/types'
import type { Lifecycle } from './stages'

export function useLifecycle(role: AgentRole): { lifecycle: Lifecycle | null; loading: boolean; reload: () => void } {
  const { facts, loading, reload } = useFacts(role)
  const lifecycle = useMemo(() => (facts ? factsToLifecycle(role, facts) : null), [facts, role])
  return { lifecycle, loading, reload }
}
