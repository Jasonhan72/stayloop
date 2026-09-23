'use client'

// Lets live-row blocks (MyApplications / MyShowings) tell the workspace
// shell's demo gate whether they rendered anything, so the honest empty
// state ("还没有租房申请") is not printed under a list of real applications
// (e2e 2026-09-23).
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

type Ctx = { report: (key: string, n: number) => void; total: number }
const LiveRowsContext = createContext<Ctx | null>(null)

export function LiveRowsProvider({ children }: { children: ReactNode }) {
  const [counts, setCounts] = useState<Record<string, number>>({})
  const report = useCallback((key: string, n: number) => {
    setCounts((c) => (c[key] === n ? c : { ...c, [key]: n }))
  }, [])
  const total = useMemo(() => Object.values(counts).reduce((a, b) => a + b, 0), [counts])
  const value = useMemo(() => ({ report, total }), [report, total])
  return <LiveRowsContext.Provider value={value}>{children}</LiveRowsContext.Provider>
}

export function useLiveRowsTotal(): number {
  return useContext(LiveRowsContext)?.total ?? 0
}

/** Call from a live block whenever its row count is known. Safe outside a provider. */
export function useReportLiveRows(key: string, n: number | null | undefined) {
  const ctx = useContext(LiveRowsContext)
  const report = ctx?.report
  useEffect(() => { if (report && typeof n === 'number') report(key, n) }, [report, key, n])
}
