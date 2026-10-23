// Agent profile photo keys (2026-10-23) — a plain module (no 'use client') so the route
// handler and the client both get real values. Key `<uid>/<id>.webp|jpg` →
// https://<supabase>/storage/v1/object/public/agent-photos/<key>. Only our bucket, ever.
const KEY_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/([a-z0-9]{8,40})\.(webp|jpg)$/
export const AGENT_PHOTO_BUCKET = 'agent-photos'
/** What the browser sends after its own square crop (512px); the bucket caps at 1 MB. */
export const AGENT_PHOTO_SIDE = 512
export const AGENT_PHOTO_MAX_BYTES = 1024 * 1024

export function isAgentPhotoKey(key: unknown): key is string {
  return typeof key === 'string' && KEY_RE.test(key)
}

export function agentPhotoUrl(key: string | null | undefined): string | null {
  if (!isAgentPhotoKey(key)) return null
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')
  return `${base}/storage/v1/object/public/${AGENT_PHOTO_BUCKET}/${key}`
}

/** WebP ("RIFF….WEBP") or JPEG (FF D8 FF) by magic bytes — the declared type is not trusted. */
export function sniffPhoto(bytes: Uint8Array): 'webp' | 'jpg' | null {
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'webp'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg'
  return null
}
