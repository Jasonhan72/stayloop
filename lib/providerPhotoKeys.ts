// Service-provider photo keys (2026-11-23) — a plain module (no 'use client') so the route
// handler and the client both get real values. Same shape as the agent photo
// (lib/agentPhotoKeys.ts): key `<provider id>/<id>.webp|jpg` →
// https://<supabase>/storage/v1/object/public/provider-photos/<key>. Only our bucket, ever.
// The folder is the provider's id, not the account's: a provider record can exist without an account.
const KEY_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/([a-z0-9]{8,40})\.(webp|jpg)$/
export const PROVIDER_PHOTO_BUCKET = 'provider-photos'
/** What the browser sends after its own square crop (512px); the bucket caps at 1 MB. */
export const PROVIDER_PHOTO_SIDE = 512
export const PROVIDER_PHOTO_MAX_BYTES = 1024 * 1024

export function isProviderPhotoKey(key: unknown): key is string {
  return typeof key === 'string' && KEY_RE.test(key)
}

/** The key belongs to this provider's own folder. */
export function isProviderPhotoKeyOf(key: unknown, providerId: string): key is string {
  return isProviderPhotoKey(key) && key.startsWith(`${providerId.toLowerCase()}/`)
}

export function providerPhotoUrl(key: string | null | undefined): string | null {
  if (!isProviderPhotoKey(key)) return null
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')
  return `${base}/storage/v1/object/public/${PROVIDER_PHOTO_BUCKET}/${key}`
}
