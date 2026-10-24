// Keep a ref at the latest value of something, for callbacks and listeners registered once (map
// 'idle', timers, Supabase channels) that must not go stale. The write happens in a layout effect,
// not during render (react-hooks 7 `refs`, React Compiler, 2026-10-23): the ref is current before
// any passive effect of the same commit runs.
//
//   const langRef = useRef(lang); useSyncRef(langRef, lang)
//
// Two statements rather than one hook returning the ref: exhaustive-deps knows a `useRef()` result
// is stable, but would demand a custom hook's return value in every dependency array.
import { useLayoutEffect, useRef, type MutableRefObject } from 'react'

export function useSyncRef<T>(ref: MutableRefObject<T>, value: T): void {
  useLayoutEffect(() => { ref.current = value })
}

/** One-liner form for places where no deps array reads the ref. */
export function useLatest<T>(value: T): MutableRefObject<T> {
  const ref = useRef(value)
  useSyncRef(ref, value)
  return ref
}
