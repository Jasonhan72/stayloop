// Internal paths the assistant is told to mention (e.g. /screening/app) render as links in the
// chat; everything else stays plain text. Longer paths come before their prefixes
// (/providers/professional before /providers). Add a path here when a prompt starts naming it.
export const PATH_RE = /(\/screening\/app|\/screening|\/verify\/[A-Za-z0-9-]+|\/leases\/import|\/landlord\/applicants|\/agent\/clients|\/agent\/verify|\/landlord\/leases|\/landlord\/todo|\/landlord\/maintenance|\/landlord\/providers|\/messages|\/tenant\/lease|\/tenant\/passport|\/providers\/professional|\/providers|\/agents|\/onboard|\/stayloop-api\/docs|\/stayloop-api|\/landlord\/finance|\/tenant\/payments|\/tenant\/maintenance|\/contact|\/platform)(?![\w/-])/g

/** Text → strings and { href } pieces. A match glued to a longer path or a URL (「/admin/providers」,
 *  「stayloop.ai/agents」) is not a path the assistant named, so it stays text. No regex lookbehind:
 *  older iOS Safari fails to parse the whole script on one. */
export function splitPaths(text: string): Array<string | { href: string }> {
  const out: Array<string | { href: string }> = []
  let last = 0
  for (const m of text.matchAll(PATH_RE)) {
    const i = m.index ?? 0
    if (i > 0 && /[\w/.-]/.test(text[i - 1])) continue
    if (i > last) out.push(text.slice(last, i))
    out.push({ href: m[0] })
    last = i + m[0].length
  }
  if (!out.length) return [text]
  if (last < text.length) out.push(text.slice(last))
  return out
}
