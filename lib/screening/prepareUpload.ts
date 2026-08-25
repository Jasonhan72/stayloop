'use client'

// Client-side upload preparation for /screening.
//
// Why this exists: a landlord standing in a unit photographs a paystub with
// their phone. A modern iPhone/Android photo is routinely 4–12 MB, and the
// `tenant-files` bucket used to cap at 10 MB — so the file was simply
// rejected with "over 10 MB" and the landlord had no way forward on a phone.
//
// Two separate limits are in play and they are NOT the same number:
//   * storage — the `tenant-files` bucket cap (now 25 MB, see
//     supabase/migrations/20260825_tenant_files_limits.sql)
//   * the model — screen-score and the forensics OCR pass hand images to the
//     model BY URL, and the providers cap a fetched image at ~5 MB. An 8 MB
//     photo would upload fine and then fail at scoring.
//
// So: photos get downscaled here (long edge 2600px, JPEG q0.85 — well above
// what OCR needs for printed text), PDFs are passed through untouched.
//
// PDFs are deliberately NOT re-encoded. `lib/forensics/pdf-metadata.ts` and
// `pdf-structure.ts` read the producer string, object layout and incremental
// -update history to detect tampering; rewriting the file client-side would
// destroy exactly the evidence the forensics pass exists to find. Image
// forensics, by contrast, is OCR-only (lib/forensics/index.ts — images go
// straight to `ocrImagePdf`), so re-encoding a photo costs no signal.

/** Bucket cap. Keep in sync with the `tenant-files` bucket's file_size_limit. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024

/** Above this an image is downscaled — chosen to stay under the providers' ~5 MB fetched-image cap. */
const IMAGE_TARGET_BYTES = 4 * 1024 * 1024

/** Longest edge after downscaling. 2600px keeps 8–10pt printed text legible for OCR. */
const MAX_EDGE = 2600

export type PreparedFile = {
  file: File
  /** Set when the file was re-encoded, for the "compressed from X" note. */
  originalSize?: number
}

export type PrepareResult = {
  accepted: PreparedFile[]
  /** Files that are still too large after preparation, with a reason to show. */
  rejected: { name: string; size: number; reason: 'too_big_pdf' | 'too_big_image' }[]
}

function isImage(f: File): boolean {
  if (f.type.startsWith('image/')) return true
  // iOS sometimes hands over an empty/octet-stream type for HEIC.
  return /\.(jpe?g|png|webp|heic|heif|gif|bmp|tiff?)$/i.test(f.name)
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement | null> {
  // No DOM (SSR, or a unit test) — the caller falls back to the original file
  // and the plain size check, which is the correct behaviour anyway.
  if (typeof document === 'undefined') return null
  // createImageBitmap is the fast path and handles HEIC wherever the browser
  // decodes it natively (iOS Safari does; desktop Chrome does not).
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file)
    } catch {
      /* fall through to <img> */
    }
  }
  return await new Promise<HTMLImageElement | null>((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    img.src = url
  })
}

/**
 * Downscale one image to fit MAX_EDGE and re-encode as JPEG. Returns null when
 * the browser cannot decode the format (e.g. HEIC on desktop Chrome) — the
 * caller then falls back to the original file and the normal size check.
 */
async function downscaleImage(file: File): Promise<File | null> {
  const bmp = await loadBitmap(file)
  if (!bmp) return null
  const w = 'width' in bmp ? bmp.width : 0
  const h = 'height' in bmp ? bmp.height : 0
  if (!w || !h) return null

  const scale = Math.min(1, MAX_EDGE / Math.max(w, h))
  const outW = Math.max(1, Math.round(w * scale))
  const outH = Math.max(1, Math.round(h * scale))

  const canvas = document.createElement('canvas')
  canvas.width = outW
  canvas.height = outH
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  // White backdrop: a transparent PNG flattened onto black would make dark
  // text on a transparent background unreadable after JPEG conversion.
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, outW, outH)
  ctx.drawImage(bmp as CanvasImageSource, 0, 0, outW, outH)
  if ('close' in bmp && typeof bmp.close === 'function') bmp.close()

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.85)
  )
  if (!blob) return null
  // A tiny already-optimised JPEG can come out bigger after a round trip.
  if (blob.size >= file.size && scale === 1) return null

  const base = file.name.replace(/\.[^.]+$/, '')
  return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: file.lastModified })
}

/**
 * Run every incoming file through preparation. Images over the model's fetch
 * cap are downscaled; PDFs pass through. Anything still over the bucket cap
 * comes back in `rejected` with a reason the UI can phrase usefully.
 */
export async function prepareUploads(files: File[]): Promise<PrepareResult> {
  const accepted: PrepareResult['accepted'] = []
  const rejected: PrepareResult['rejected'] = []

  for (const f of files) {
    let out: File = f
    let originalSize: number | undefined

    if (isImage(f) && f.size > IMAGE_TARGET_BYTES) {
      const smaller = await downscaleImage(f)
      if (smaller) {
        originalSize = f.size
        out = smaller
      }
    }

    if (out.size > MAX_UPLOAD_BYTES) {
      rejected.push({
        name: f.name,
        size: out.size,
        reason: isImage(f) ? 'too_big_image' : 'too_big_pdf',
      })
      continue
    }
    accepted.push(originalSize ? { file: out, originalSize } : { file: out })
  }

  return { accepted, rejected }
}
