import type { ReactNode } from 'react'

// Listing "AI note" copy is stored as a tiny HTML subset (only <b>…</b>) and
// used to be injected with dangerouslySetInnerHTML. The column is writable by
// the listing's landlord under RLS, so raw injection was an XSS door on the
// public listings page. This renders the same look with React text nodes —
// everything except <b> pairs is shown literally.
export function renderNote(text: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /<b>([\s\S]*?)<\/b>/gi
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    out.push(<b key={i++}>{m[1]}</b>)
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}
