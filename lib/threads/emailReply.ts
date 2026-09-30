// Email replies into a thread (消息系统 A 期, 2026-09-29) · pure helpers.
//
// Every email we send about a thread carries Reply-To: t-<token>@reply.stayloop.ai,
// one token per (thread, recipient address) in thread_reply_tokens. A reply is
// recorded only when the token exists, is not revoked, and the From address is
// the address the token was issued to. The quoted history is stripped before
// the reply becomes a message; the raw MIME and its SHA-256 are kept apart.

export const REPLY_DOMAIN = 'reply.stayloop.ai'
/** The line above which a reply is read. Also recognised in any language the mail client quotes it in. */
export const REPLY_MARKER = '—— 请在此线以上回复 · Reply above this line ——'

export function replyAddress(token: string): string {
  return `t-${token}@${REPLY_DOMAIN}`
}

/** A 32-char lowercase token (base36 of 20 random bytes, trimmed). */
export function newReplyToken(): string {
  const b = new Uint8Array(20)
  crypto.getRandomValues(b)
  let s = ''
  for (const x of b) s += x.toString(36).padStart(2, '0')
  return s.slice(0, 32)
}

/** The token from any recipient address (To / Delivered-To / envelope), or null. */
export function tokenFromAddress(addr: string | null | undefined): string | null {
  if (!addr) return null
  const m = new RegExp(`(?:^|[<\\s,"'])t-([a-z0-9]{20,40})@${REPLY_DOMAIN.replace(/\./g, '\\.')}(?=$|[>\\s,;"'])`, 'i').exec(addr.trim())
  return m ? m[1].toLowerCase() : null
}

/** Bare lowercase address from "Name <a@b.c>" or "a@b.c". */
export function bareAddress(v: string | null | undefined): string | null {
  if (!v) return null
  const m = /<([^>]+)>/.exec(v)
  const a = (m ? m[1] : v).trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a) ? a : null
}

const QUOTE_HEADERS: RegExp[] = [
  /^-{2,}\s*Original Message\s*-{2,}/i,
  /^-{2,}\s*原始邮件\s*-{2,}/,
  /^_{5,}/, // Outlook separator
  /^On .{4,200}wrote:\s*$/i,
  /^Le .{4,200}a écrit\s*:\s*$/i,
  /^在.{2,200}写道[:：]\s*$/,
  /^.{0,80}于.{2,120}写道[:：]\s*$/,
  /^From:\s.+/i,
  /^发件人[:：]/,
  /^Sent from my /i,
  /^发自我的/,
]

/**
 * The new text of a reply: everything above our marker, above the first
 * quote header, and without trailing ">" quoted lines. Also joins "On … \n wrote:"
 * that Gmail sometimes wraps across two lines.
 */
export function stripQuotedReply(text: string): string {
  const src = text.replace(/\r\n?/g, '\n')
  const markerAt = src.indexOf('请在此线以上回复')
  const markerEn = src.search(/Reply above this line/i)
  let cut = src.length
  for (const i of [markerAt, markerEn]) if (i >= 0) cut = Math.min(cut, src.lastIndexOf('\n', i) + 1)
  const lines = src.slice(0, cut).split('\n')
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const joined = i + 1 < lines.length ? `${line} ${lines[i + 1]}` : line
    if (QUOTE_HEADERS.some((re) => re.test(line.trim())) || /^On .{4,200}wrote:\s*$/i.test(joined.trim())) break
    out.push(line)
  }
  while (out.length && (out[out.length - 1].trim() === '' || out[out.length - 1].trim().startsWith('>'))) out.pop()
  return out.filter((l) => !l.trim().startsWith('>')).join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** Strip HTML to text for mail clients that send no text part. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h\d|blockquote)>/gi, '\n')
    .replace(/<blockquote[\s\S]*$/i, '') // everything quoted after the first blockquote
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
}
