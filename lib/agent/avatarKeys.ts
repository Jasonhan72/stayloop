// Custom (generated) assistant avatar keys — a plain module with no 'use
// client' directive, so the edge route can import it as real values. (The
// first live run failed with "Bucket name invalid": importing the constant
// from the client-marked lib/agent/avatars.tsx inside a Route Handler gives a
// client-reference stub, not the string. 2026-09-28.)
//
// Key `custom:<uid>/<id>` → https://<supabase>/storage/v1/object/public/assistant-avatars/<uid>/<id>.webp
const CUSTOM_KEY_RE = /^custom:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/([a-z0-9]{8,40})$/
export const CUSTOM_AVATAR_BUCKET = 'assistant-avatars'

export function isCustomAvatarKey(key: string | null | undefined): key is string {
  return !!key && CUSTOM_KEY_RE.test(key)
}

/** The public URL of a made face — always under our own storage host, never anywhere else. */
export function customAvatarUrl(key: string): string | null {
  const m = CUSTOM_KEY_RE.exec(key)
  if (!m) return null
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')
  return `${base}/storage/v1/object/public/${CUSTOM_AVATAR_BUCKET}/${m[1]}/${m[2]}.webp`
}
