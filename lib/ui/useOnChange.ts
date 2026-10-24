// "Adjust state when a prop / derived value changes" without an effect (React docs: storing
// information from previous renders). The callback runs during the render in which `key`
// differs from the previous render's — synchronously, so the component never paints the
// stale state first (an effect would). Only set the component's OWN state in `onChange`;
// a parent's setter belongs in an effect. (react-hooks 7 `set-state-in-effect`, 2026-10-23.)
import { useState } from 'react'

export function useOnChange<K>(key: K, onChange: () => void): void {
  const [prev, setPrev] = useState(key)
  if (!Object.is(prev, key)) {
    setPrev(key)
    onChange()
  }
}
