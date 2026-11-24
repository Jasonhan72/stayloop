'use client'

// The browser's side of 「让 AI 助理填表」 (lib/onboard/assist.ts has the rules): get the files small
// enough to send, call the route, and carry the answer from the entrance page to the form.
import { supabase } from '@/lib/supabase'
import { downscalePhoto } from '@/lib/agent/avatarImage'
import { ASSIST_MAX_FILES, ASSIST_MAX_IMAGE_BYTES, EMPTY_SUGGESTION, sanitizeSuggestion, type JoinKind, type OnboardSuggestion } from './assist'

export type AssistLink = { url: string; ok: boolean; reason?: string }
export type AssistResult = { suggestion: OnboardSuggestion; found: number; links: AssistLink[]; images: number }
export type AssistError = 'sign_in_required' | 'rate_limited' | 'nothing_to_read' | 'link_unreadable' | 'image_type' | 'image_too_large' | 'model_failed' | 'failed'

/** Long edge of a photo sent to the model: small print on a licence stays legible, a phone photo drops from megabytes to a few hundred KB. */
const SIDE = 1800
/** Pages of one PDF that are read: a certificate is one page, a licence bundle rarely more than three. */
const PDF_PAGES = 3

/**
 * What the person picked, as images the route accepts: photos are downscaled to JPEG, a PDF is
 * rendered to its first pages (the route takes no PDFs, so nothing goes through a text-recognition
 * service on the way). `skipped` names the files that could not be read on this device.
 */
export async function prepareFiles(files: File[]): Promise<{ blobs: Blob[]; skipped: string[] }> {
  const blobs: Blob[] = []
  const skipped: string[] = []
  for (const f of files) {
    if (blobs.length >= ASSIST_MAX_FILES) { skipped.push(f.name); continue }
    try {
      if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
        const { shrinkPdfToImages } = await import('@/lib/screening/pdfShrink')
        const r = await shrinkPdfToImages(f)
        if (typeof r === 'string') { skipped.push(f.name); continue }
        for (const page of r.pages.slice(0, PDF_PAGES)) {
          if (blobs.length >= ASSIST_MAX_FILES) break
          blobs.push(await downscalePhoto(page, SIDE, 0.85))
        }
      } else {
        const b = await downscalePhoto(f, SIDE, 0.85)
        if (b.size > ASSIST_MAX_IMAGE_BYTES) { skipped.push(f.name); continue }
        blobs.push(b)
      }
    } catch {
      skipped.push(f.name)
    }
  }
  return { blobs, skipped }
}

export async function requestAssist(o: { text: string; blobs: Blob[]; hint: JoinKind | null; zh: boolean }): Promise<{ ok: true; result: AssistResult } | { ok: false; error: AssistError; links?: AssistLink[] }> {
  const token = (await supabase.auth.getSession()).data.session?.access_token
  if (!token) return { ok: false, error: 'sign_in_required' }
  const fd = new FormData()
  fd.append('text', o.text)
  fd.append('lang', o.zh ? 'zh' : 'en')
  if (o.hint) fd.append('hint', o.hint)
  o.blobs.forEach((b, i) => fd.append('files', b, `material-${i + 1}.jpg`))
  let r: Response
  try { r = await fetch('/api/onboard/assist', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd }) } catch { return { ok: false, error: 'failed' } }
  const j = (await r.json().catch(() => ({}))) as { suggestion?: unknown; found?: number; links?: AssistLink[]; images?: number; error?: string }
  if (!r.ok) {
    const known: AssistError[] = ['sign_in_required', 'rate_limited', 'nothing_to_read', 'link_unreadable', 'image_type', 'image_too_large', 'model_failed']
    return { ok: false, error: known.includes(j.error as AssistError) ? (j.error as AssistError) : 'failed', links: j.links }
  }
  return { ok: true, result: { suggestion: sanitizeSuggestion(j.suggestion), found: Number(j.found) || 0, links: Array.isArray(j.links) ? j.links : [], images: Number(j.images) || 0 } }
}

// ── from the entrance page to the form: one tab, one account, half an hour ────
const DRAFT_KEY = 'stayloop_onboard_draft'
const TEXT_KEY = 'stayloop_onboard_text'
export const DRAFT_TTL_MS = 30 * 60 * 1000
export type OnboardDraft = { suggestion: OnboardSuggestion; links: AssistLink[] }

export function saveDraft(uid: string, d: OnboardDraft, now = Date.now()): void {
  try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ v: 1, at: now, uid, suggestion: d.suggestion, links: d.links })) } catch { /* private mode: the form simply opens empty */ }
}
/** The draft left for this account, once: it is removed as it is read, and an old or foreign one is dropped. */
export function takeDraft(uid: string, now = Date.now()): OnboardDraft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    sessionStorage.removeItem(DRAFT_KEY)
    const j = JSON.parse(raw) as { v?: number; at?: number; uid?: string; suggestion?: unknown; links?: unknown }
    if (j.v !== 1 || j.uid !== uid || typeof j.at !== 'number' || now - j.at > DRAFT_TTL_MS || now < j.at) return null
    const links = (Array.isArray(j.links) ? j.links : []).filter((l): l is AssistLink => !!l && typeof l === 'object' && typeof (l as AssistLink).url === 'string').slice(0, 4)
    return { suggestion: sanitizeSuggestion(j.suggestion ?? EMPTY_SUGGESTION), links }
  } catch {
    return null
  }
}

/** What was typed on the entrance page survives a trip through sign-in. */
export function rememberText(text: string): void {
  try { if (text.trim()) sessionStorage.setItem(TEXT_KEY, text.slice(0, 4000)); else sessionStorage.removeItem(TEXT_KEY) } catch { /* nothing to keep */ }
}
export function recallText(): string {
  try { return sessionStorage.getItem(TEXT_KEY) ?? '' } catch { return '' }
}
