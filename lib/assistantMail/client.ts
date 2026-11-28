'use client'

// AI 助理的邮箱 · what the browser does (2026-11-27). Reads are the person's own rows under RLS,
// with explicit columns (the tables have column-level grants: `select('*')` would be refused).
// Everything that changes something, or takes a file out of the private bucket, asks a route.
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ATTACH_MAX_BYTES, ATTACH_MAX_FILES } from '@/lib/agent/attachments'
import type { ChatAttachment } from '@/lib/agent/types'
import type { MailboxState } from './server'

export type { MailboxState } from './server'

export const MAIL_CHANGED_EVENT = 'sl-assistant-mail-changed'
export function notifyMailChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(MAIL_CHANGED_EVENT))
}

export type MailRow = {
  id: string; from_addr: string; from_name: string | null; subject: string; size_bytes: number; file_count: number
  skipped_files: string[] | null; status: 'new' | 'seen' | 'handed'; received_at: string; expires_at: string
}
export type MailFile = { idx: number; name: string; media_type: string; size_bytes: number }
export const MAIL_LIST_COLUMNS = 'id, from_addr, from_name, subject, size_bytes, file_count, skipped_files, status, received_at, expires_at'
export const MAIL_FILE_COLUMNS = 'idx, name, media_type, size_bytes'

async function bearer(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession()
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` }
}

export async function fetchMailbox(): Promise<MailboxState | null> {
  try {
    const res = await fetch('/api/assistant/inbox', { headers: await bearer() })
    return res.ok ? ((await res.json()) as MailboxState) : null
  } catch { return null }
}

export type MailboxAction = 'create' | 'rotate' | 'close' | 'add_sender' | 'remove_sender'
/** The new state when it worked; the route's error word when it did not. */
export async function mailboxAction(action: MailboxAction, extra: { email?: string; id?: string } = {}): Promise<{ state: MailboxState } | { error: string }> {
  try {
    const res = await fetch('/api/assistant/inbox', { method: 'POST', headers: await bearer(), body: JSON.stringify({ action, ...extra }) })
    const j = (await res.json().catch(() => ({}))) as MailboxState & { error?: string }
    if (!res.ok) return { error: j.error || `http ${res.status}` }
    notifyMailChanged()
    return { state: j }
  } catch { return { error: 'network' } }
}

export async function listMail(limit = 50): Promise<MailRow[]> {
  const { data, error } = await supabase.from('assistant_mail').select(MAIL_LIST_COLUMNS).order('received_at', { ascending: false }).limit(limit)
  if (error) throw new Error(error.message)
  return (data ?? []) as MailRow[]
}

export async function readMail(id: string): Promise<{ body: string; files: MailFile[] } | null> {
  const [m, f] = await Promise.all([
    supabase.from('assistant_mail').select('body_text').eq('id', id).maybeSingle(),
    supabase.from('assistant_mail_files').select(MAIL_FILE_COLUMNS).eq('mail_id', id).order('idx', { ascending: true }),
  ])
  if (m.error || !m.data) return null
  return { body: (m.data as { body_text: string }).body_text ?? '', files: ((f.data ?? []) as MailFile[]) }
}

export async function mailAction(id: string, action: 'seen' | 'handed' | 'delete'): Promise<boolean> {
  try {
    const res = await fetch('/api/assistant/mail', { method: 'POST', headers: await bearer(), body: JSON.stringify({ id, action }) })
    if (res.ok) notifyMailChanged()
    return res.ok
  } catch { return false }
}

/** A ten-minute download link for one attachment. */
export async function mailFileUrl(id: string, idx: number): Promise<string | null> {
  try {
    const res = await fetch('/api/assistant/mail', { method: 'POST', headers: await bearer(), body: JSON.stringify({ id, action: 'file', idx }) })
    if (!res.ok) return null
    return ((await res.json()) as { url?: string }).url ?? null
  } catch { return null }
}

/** Which of a mail's attachments the conversation can take: PDFs and images within the composer's own limits. */
export function carriable(files: readonly MailFile[]): { take: MailFile[]; left: number } {
  const fits = files.filter((f) => f.size_bytes <= ATTACH_MAX_BYTES && (f.media_type === 'application/pdf' || f.media_type.startsWith('image/')))
  const take = fits.slice(0, ATTACH_MAX_FILES)
  return { take, left: files.length - take.length }
}

/** Download those attachments and turn them into what the composer holds (the same shape as a file the person picks). */
export async function loadAttachments(id: string, files: readonly MailFile[]): Promise<ChatAttachment[]> {
  const out: ChatAttachment[] = []
  for (const f of files) {
    const url = await mailFileUrl(id, f.idx)
    if (!url) continue
    try {
      const res = await fetch(url)
      if (!res.ok) continue
      // Bytes → base64 by hand (in chunks): the data URL carries the type we stored, whatever the download says.
      const bytes = new Uint8Array(await res.arrayBuffer())
      let bin = ''
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
      out.push({ name: f.name, mediaType: f.media_type, dataUrl: `data:${f.media_type};base64,${btoa(bin)}`, isImage: f.media_type.startsWith('image/'), isPdf: f.media_type === 'application/pdf' })
    } catch { /* one file failing does not lose the others */ }
  }
  return out
}

/** Is the mailbox open to this account (the switch in app_config, asked once a minute per account)? null while unknown.
 *  The panel needs it to know what its 收件 badge counts: new mail, or — for an account without a mailbox — the
 *  unread messages its 收件 tab still lists. */
let availability: { uid: string; at: number; p: Promise<boolean> } | null = null
export function useMailboxAvailable(uid: string | null, enabled: boolean): boolean | null {
  const [v, setV] = useState<boolean | null>(null)
  useEffect(() => {
    if (!uid || !enabled) { setV(null); return }
    let cancelled = false
    if (!availability || availability.uid !== uid || Date.now() - availability.at > 60_000) {
      availability = { uid, at: Date.now(), p: fetchMailbox().then((s) => !!s?.available, () => false) }
    }
    void availability.p.then((a) => { if (!cancelled) setV(a) })
    return () => { cancelled = true }
  }, [uid, enabled])
  return v
}

/** How many mails nobody has opened yet — the 收件 tab's badge. 0 when there is no mailbox. */
export function useNewMailCount(enabled: boolean): number {
  const [n, setN] = useState(0)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const h = () => setTick((t) => t + 1)
    window.addEventListener(MAIL_CHANGED_EVENT, h)
    window.addEventListener('focus', h)
    return () => { window.removeEventListener(MAIL_CHANGED_EVENT, h); window.removeEventListener('focus', h) }
  }, [])
  useEffect(() => {
    if (!enabled) { setN(0); return }
    let cancelled = false
    supabase.from('assistant_mail').select('id', { count: 'exact', head: true }).eq('status', 'new')
      .then(({ count }) => { if (!cancelled) setN(count ?? 0) }, () => { if (!cancelled) setN(0) })
    return () => { cancelled = true }
  }, [enabled, tick])
  return n
}
