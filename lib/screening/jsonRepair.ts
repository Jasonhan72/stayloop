// -----------------------------------------------------------------------------
// Lenient JSON repair for model output (2026-08-22).
//
// Root cause this exists for: the scoring model wrote a literal ASCII double
// quote inside a string value — `由个人作者"Johnson Osei."用Excel制作` (the
// author name copied from forensics metadata) — and the whole 12k-char report
// became unparseable ("Expected ',' or '}' after property value"), failing
// roughly every other screening of that case. The text was otherwise complete.
//
// repairUnescapedQuotes() walks the text and decides, for every `"` met while
// inside a string, whether it really closes the string: it does only if the
// next non-space character is structural (`,` `}` `]` `:`) AND — for `,` —
// what follows the comma looks like the start of the next JSON token (a key /
// string, object, array, number, literal, or the end). Any other quote is an
// inner quote and gets escaped. Raw newlines inside strings are normalised to
// spaces on the way. Pure; exported for tests.
// -----------------------------------------------------------------------------

function nextNonWs(t: string, i: number): number {
  while (i < t.length && (t[i] === ' ' || t[i] === '\n' || t[i] === '\r' || t[i] === '\t')) i++
  return i
}

function looksLikeTokenStart(ch: string | undefined): boolean {
  if (ch === undefined) return true
  return ch === '"' || ch === '{' || ch === '[' || ch === '-' || (ch >= '0' && ch <= '9') || ch === 't' || ch === 'f' || ch === 'n'
}

export function repairUnescapedQuotes(input: string): string {
  let out = ''
  let inStr = false
  let esc = false
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    if (!inStr) {
      if (ch === '"') inStr = true
      out += ch
      continue
    }
    if (esc) { esc = false; out += ch; continue }
    if (ch === '\\') { esc = true; out += ch; continue }
    if (ch === '\n' || ch === '\r') { out += ' '; continue }
    if (ch !== '"') { out += ch; continue }
    // A quote inside a string: closing or inner?
    const j = nextNonWs(input, i + 1)
    const n = input[j]
    let closes = false
    if (n === undefined) closes = true
    else if (n === '}' || n === ']' || n === ':') closes = true
    else if (n === ',') closes = looksLikeTokenStart(input[nextNonWs(input, j + 1)])
    if (closes) { inStr = false; out += ch }
    else out += '\\"'
  }
  return out
}

/**
 * Parse model JSON leniently: strict first, then with unescaped-quote repair,
 * then repair + trailing-comma cleanup. Returns null when nothing parses.
 */
export function parseModelJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
  try { return JSON.parse(t) } catch { /* fall through */ }
  const repaired = repairUnescapedQuotes(t)
  try { return JSON.parse(repaired) } catch { /* fall through */ }
  try { return JSON.parse(repaired.replace(/,(\s*[}\]])/g, '$1')) } catch { /* fall through */ }
  return null
}
