'use client'

// Browser-side rescue for oversized PDFs (>25 MB) on /screening.
//
// Why rasterize instead of extracting embedded images: the server OCR layer
// (lib/ocr/qwenOcr.ts) already pulls page images out of scan-style PDFs, but
// it only understands two encodings (DCT passthrough + 8-bit Gray/RGB Flate).
// Tested 2026-08-25 against the real failing file — ID_Leo.pdf, 32.4 MB,
// Adobe Illustrator export with a 17 MB raw bitmap — and extraction came back
// `unsupported: 1`. Rendering the page with pdf.js sidesteps the whole
// encoding zoo: whatever the PDF contains, the canvas gets the pixels.
//
// We use the pdf.js build that ships inside `unpdf` (already a dependency;
// its single-file bundle includes WorkerMessageHandler, so it runs on the
// main thread without a worker script). The import is dynamic — the ~1.6 MB
// module loads only when someone actually adds an oversized PDF.
//
// Honesty note: a rasterized upload loses the original PDF's structure, so
// forensics degrades to the image path (OCR only — no producer string, no
// object-layout analysis, no incremental-update history). That is disclosed
// to the model via the conversion note the caller writes into `notes`; the
// alternative was rejecting the file outright, which is strictly worse
// evidence. The ORIGINAL file's producer often carries signal (an ID exported
// by Adobe Illustrator is itself suspicious) — which is why this path only
// runs for files that cannot upload at all.

/** Hard page cap. A >25 MB PDF with more pages than this should be split by
 * the user instead — silently converting half a document would let a partial
 * evidence set read as complete, which is the exact failure mode this whole
 * upload layer exists to prevent. Matches OCR_MAX_PAGES server-side. */
const MAX_PAGES = 12

/** Long edge of a rendered page. Same target as prepareUpload's photo path —
 * keeps 8–10pt printed text comfortably legible for OCR. */
const MAX_EDGE = 2600

export type ShrunkPdf = {
  /** One JPEG per page, named `<base>.p<N>.jpg`. */
  pages: File[]
  pageCount: number
  originalSize: number
}

export type ShrinkFailure = 'too_many_pages' | 'render_failed'

/**
 * Render every page of a PDF to a JPEG. Returns the failure reason instead of
 * throwing — the caller folds it into the rejected-files warning.
 */
export async function shrinkPdfToImages(file: File): Promise<ShrunkPdf | ShrinkFailure> {
  if (typeof document === 'undefined') return 'render_failed'
  try {
    const pdfjs: any = await import('unpdf/pdfjs')
    // The serverless bundle carries its own worker handler; make sure a
    // browser environment doesn't go looking for an external worker script.
    try {
      if (pdfjs.GlobalWorkerOptions && !pdfjs.GlobalWorkerOptions.workerSrc) {
        pdfjs.GlobalWorkerOptions.workerSrc = ''
      }
    } catch { /* readonly in some builds — the fake-worker path still works */ }

    const data = new Uint8Array(await file.arrayBuffer())
    const doc = await pdfjs.getDocument({
      data,
      isEvalSupported: false,
      useSystemFonts: true,
    }).promise

    if (doc.numPages > MAX_PAGES) {
      await doc.destroy().catch(() => {})
      return 'too_many_pages'
    }

    const base = file.name.replace(/\.[^.]+$/, '')
    const pages: File[] = []
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n)
      const v1 = page.getViewport({ scale: 1 })
      const scale = Math.min(4, MAX_EDGE / Math.max(v1.width, v1.height))
      const viewport = page.getViewport({ scale })

      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(viewport.width))
      canvas.height = Math.max(1, Math.round(viewport.height))
      const ctx = canvas.getContext('2d')
      if (!ctx) return 'render_failed'
      // White ground — PDF pages are conceptually white; without this,
      // transparent regions render black in JPEG.
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      await page.render({ canvasContext: ctx, viewport }).promise

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.85)
      )
      if (!blob) return 'render_failed'
      pages.push(new File([blob], `${base}.p${n}.jpg`, { type: 'image/jpeg', lastModified: file.lastModified }))
      page.cleanup?.()
    }
    await doc.destroy().catch(() => {})
    if (pages.length === 0) return 'render_failed'
    return { pages, pageCount: pages.length, originalSize: file.size }
  } catch (e) {
    console.warn('[pdfShrink] render failed:', e instanceof Error ? e.message : String(e))
    return 'render_failed'
  }
}
