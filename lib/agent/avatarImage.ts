// Browser-side prep for the avatar maker (2026-09-28): a phone photo is 3–12 MB
// and the image model only needs the face, so the picture is downscaled to
// ≤ 1024px on its long side and re-encoded as JPEG before it leaves the
// device. Nothing is kept: the blob goes to /api/assistant/avatar once.
export const AVATAR_PHOTO_MAX_SIDE = 1024
export const AVATAR_PHOTO_MAX_BYTES = 12 * 1024 * 1024

export async function downscalePhoto(file: File | Blob, maxSide = AVATAR_PHOTO_MAX_SIDE, quality = 0.86): Promise<Blob> {
  if (file.size > AVATAR_PHOTO_MAX_BYTES) throw new Error('photo_too_large')
  const bitmap = await createImageBitmap(file).catch(() => null)
  if (!bitmap) throw new Error('photo_unreadable')
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('photo_unreadable')
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close?.()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
  if (!blob) throw new Error('photo_unreadable')
  return blob
}

/** The styles the maker offers; the server owns the wording that goes to the model. */
export const AVATAR_STYLES = ['plush', 'pixar', 'clay', 'memoji'] as const
export type AvatarStyle = (typeof AVATAR_STYLES)[number]
export const AVATAR_STYLE_LABEL: Record<AvatarStyle, { zh: string; en: string }> = {
  plush: { zh: '毛绒玩具', en: 'Plush toy' },
  pixar: { zh: '3D 卡通', en: '3D cartoon' },
  clay: { zh: '黏土', en: 'Clay' },
  memoji: { zh: 'Memoji 风', en: 'Memoji-style' },
}
export const AVATAR_PROMPT_MAX = 300
