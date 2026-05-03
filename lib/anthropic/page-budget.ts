// -----------------------------------------------------------------------------
// PDF page budget for Anthropic API
//
// Anthropic enforces a hard limit of 100 PDF pages per single message. When
// landlords upload e.g. a 65-page pay-stub history + a 30-page PR card scan,
// the request fails with:
//
//   "messages.0.content.X: A maximum of 100 PDF pages may be provided."
//
// This module pre-counts pages, allocates a budget per file based on the
// document kind (we know which fields matter where), and truncates over-long
// PDFs to keep total under 95 pages with safety headroom. Truncated files
// are sent as base64 so we control exactly what Sonnet sees.
//
// All forensics (run on the original full files) still happens in
// lib/forensics/ — page-budget only affects what gets attached to the
// scoring prompt.
// -----------------------------------------------------------------------------

import { PDFDocument } from 'pdf-lib'

/** Anthropic's hard limit. Stay below to leave room for safety. */
const TOTAL_BUDGET = 95

/**
 * Per-document-kind hint for how many pages actually carry signal. We
 * deliberately under-budget kinds where the first page is sufficient.
 */
const KIND_BUDGET: Record<string, number> = {
  id: 4,
  drivers_license: 4,
  passport: 4,
  health_card: 2,
  application: 8,
  application_form: 8,
  employment_letter: 5,
  pay_stub: 4,           // current period summary + maybe YTD
  paystub: 4,
  payslip: 4,
  noa: 6,
  t4: 3,
  lease_application: 10,
  bank_statement: 8,     // most recent 2-3 months
  credit_report: 12,
  reference_letter: 5,
  other: 10,
}

const DEFAULT_KIND_BUDGET = 6

/**
 * A file's `kind` field may be a comma-joined list when the classifier saw
 * multiple document kinds inside one bundled PDF (e.g. an applicant's
 * "Supporting Documents.pdf" containing employment letter + pay stubs +
 * Equifax credit report). Split into individual lowercase kinds.
 */
function splitKinds(kind: string | undefined): string[] {
  if (!kind) return []
  return kind
    .toLowerCase()
    .split(',')
    .map(k => k.trim())
    .filter(Boolean)
}

/** Per-kind cap for a single kind, falling back to DEFAULT_KIND_BUDGET. */
function capForOne(kind: string): number {
  return KIND_BUDGET[kind] ?? DEFAULT_KIND_BUDGET
}

/**
 * Total page budget for a file given its (possibly multi-kind) classification.
 * For bundled PDFs we SUM the per-kind budgets so each embedded document gets
 * its own page allocation — a 38-page bundle of employment_letter (5) +
 * pay_stub (4) + credit_report (12) gets 21 pages, not 6.
 */
function capForKind(kind: string | undefined): number {
  const kinds = splitKinds(kind)
  if (kinds.length === 0) return DEFAULT_KIND_BUDGET
  if (kinds.length === 1) return capForOne(kinds[0])
  return kinds.reduce((sum, k) => sum + capForOne(k), 0)
}

/**
 * Per-kind minimum pages to keep when budget is tight. Single-page docs
 * (IDs, health cards) can sample 1 page; multi-page docs benefit from 2+.
 * For multi-kind bundles return the SUM of mins so each kind keeps its
 * minimum coverage.
 */
function minForKind(kind: string): number {
  const kinds = splitKinds(kind)
  if (kinds.length === 0) return 2
  return kinds.reduce((sum, k) => {
    if (k === 'id' || k === 'id_document' || k === 'health_card' || k === 'drivers_license' || k === 'passport') return sum + 1
    if (k === 'pay_stub' || k === 'paystub' || k === 'payslip' || k === 't4') return sum + 1
    return sum + 2
  }, 0)
}

export interface BudgetedFile {
  name: string
  kind: string
  mime: string
  /** Anthropic content-block source. Either a URL passthrough or base64 of a
   *  truncated copy. */
  source:
    | { type: 'url'; url: string }
    | { type: 'base64'; media_type: 'application/pdf'; data: string }
  /** True when the file was truncated to fit budget. */
  truncated: boolean
  /** Original page count (PDFs only, 0 for images). */
  original_pages: number
  /** Pages actually sent to Sonnet. */
  sent_pages: number
}

interface InputFile {
  name: string
  kind: string
  mime: string
  signed_url: string
}

function bytesToBase64(bytes: Uint8Array): string {
  // Edge runtime supports btoa via standard Web APIs; chunk to avoid stack overflow
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, i + chunk)
    binary += String.fromCharCode.apply(null, slice as unknown as number[])
  }
  return btoa(binary)
}

async function fetchBytes(url: string, timeoutMs = 10_000): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok) return null
    const buf = await res.arrayBuffer()
    return new Uint8Array(buf)
  } catch {
    return null
  }
}

async function countPages(bytes: Uint8Array): Promise<number> {
  try {
    const pdf = await PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: true })
    return pdf.getPageCount()
  } catch {
    return 0
  }
}

async function truncatePdf(bytes: Uint8Array, keepCount: number, totalCount: number): Promise<Uint8Array> {
  const src = await PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: true })
  const dst = await PDFDocument.create()

  // Strategy: take first N pages. For very long docs (>20 pages) where N>=5,
  // take the first (N-2) pages plus the LAST 2 pages so we capture cover +
  // any summary/total page at the end.
  const indices: number[] = []
  if (totalCount <= keepCount) {
    for (let i = 0; i < totalCount; i++) indices.push(i)
  } else if (keepCount >= 5 && totalCount > 20) {
    for (let i = 0; i < keepCount - 2; i++) indices.push(i)
    indices.push(totalCount - 2, totalCount - 1)
  } else {
    for (let i = 0; i < keepCount; i++) indices.push(i)
  }

  const copied = await dst.copyPages(src, indices)
  for (const p of copied) dst.addPage(p)
  return await dst.save({ useObjectStreams: false })
}

/**
 * Pre-process a list of files for an Anthropic request. Returns content-block
 * sources ready to attach. PDFs that exceed budget are truncated and returned
 * as base64.
 *
 * Order of operations:
 *   1. Fetch each PDF's bytes and count pages
 *   2. Compute initial allocation by kind hint
 *   3. If sum still > TOTAL_BUDGET, scale all allocations proportionally
 *   4. Truncate each file that exceeds its allocation
 */
export async function applyPageBudget(files: InputFile[]): Promise<{
  prepared: BudgetedFile[]
  total_original_pages: number
  total_sent_pages: number
  any_truncated: boolean
}> {
  // Step 1: Fetch + count for PDFs only. Images are 1-block each.
  type Probe = InputFile & { bytes?: Uint8Array | null; pages: number }
  const probes: Probe[] = await Promise.all(files.map(async f => {
    if (f.mime !== 'application/pdf') return { ...f, bytes: null, pages: 0 }
    const bytes = await fetchBytes(f.signed_url)
    if (!bytes) return { ...f, bytes: null, pages: 0 }
    const pages = await countPages(bytes)
    return { ...f, bytes, pages }
  }))

  const totalOriginal = probes.reduce((s, p) => s + (p.pages || 0), 0)

  // If total fits, send as URLs (cheaper, faster — Anthropic fetches).
  if (totalOriginal <= TOTAL_BUDGET) {
    return {
      prepared: probes.map(p => ({
        name: p.name,
        kind: p.kind,
        mime: p.mime,
        source: { type: 'url', url: p.signed_url },
        truncated: false,
        original_pages: p.pages,
        sent_pages: p.pages,
      })),
      total_original_pages: totalOriginal,
      total_sent_pages: totalOriginal,
      any_truncated: false,
    }
  }

  // Step 2: Compute kind-based allocation (only applied to PDFs).
  const allocations = probes.map(p => {
    if (!p.bytes || p.pages === 0) return 0
    const cap = capForKind(p.kind)
    return Math.min(p.pages, Math.max(minForKind(p.kind), cap))
  })

  // Step 3: If sum still exceeds, scale proportionally. Iterate up to 3 times
  // to converge — the floor() in scaling can leave us slightly over.
  let allocSum = allocations.reduce((s, n) => s + n, 0)
  for (let iter = 0; iter < 3 && allocSum > TOTAL_BUDGET; iter++) {
    const scale = TOTAL_BUDGET / allocSum
    for (let i = 0; i < allocations.length; i++) {
      if (allocations[i] > 0) {
        allocations[i] = Math.max(
          minForKind(probes[i].kind),
          Math.floor(allocations[i] * scale),
        )
      }
    }
    allocSum = allocations.reduce((s, n) => s + n, 0)
  }
  // Final safety: if minimums-only still exceeds budget (e.g. 50+ files of
  // 2 pages each), drop the lowest-priority files entirely.
  if (allocSum > TOTAL_BUDGET) {
    const PRIORITY: Record<string, number> = {
      employment_letter: 100, pay_stub: 95, t4: 90, noa: 90,
      lease_application: 85, application: 85, application_form: 85,
      id: 80, drivers_license: 80, passport: 80, health_card: 75,
      bank_statement: 70, credit_report: 70,
      reference_letter: 60, other: 30,
    }
    const ranked = probes
      .map((p, i) => ({ idx: i, prio: PRIORITY[p.kind?.toLowerCase()] ?? 30 }))
      .sort((a, b) => a.prio - b.prio)  // lowest priority first
    for (const r of ranked) {
      if (allocSum <= TOTAL_BUDGET) break
      if (allocations[r.idx] > 0) {
        allocSum -= allocations[r.idx]
        allocations[r.idx] = 0  // drop entirely
      }
    }
  }

  // Step 4: Build prepared list. Truncate where needed.
  const prepared: BudgetedFile[] = []
  for (let i = 0; i < probes.length; i++) {
    const p = probes[i]
    if (p.mime !== 'application/pdf') {
      // Images pass through; images aren't counted in PDF page budget.
      prepared.push({
        name: p.name,
        kind: p.kind,
        mime: p.mime,
        source: { type: 'url', url: p.signed_url },
        truncated: false,
        original_pages: 0,
        sent_pages: 0,
      })
      continue
    }
    if (!p.bytes || p.pages === 0) {
      // Couldn't read; skip rather than risk a malformed include.
      console.warn(`[page-budget] skipping ${p.name} (couldn't read pages)`)
      continue
    }
    const keep = Math.min(p.pages, allocations[i])
    if (keep >= p.pages) {
      // Full file fits its allocation; pass through as URL.
      prepared.push({
        name: p.name,
        kind: p.kind,
        mime: p.mime,
        source: { type: 'url', url: p.signed_url },
        truncated: false,
        original_pages: p.pages,
        sent_pages: p.pages,
      })
      continue
    }
    // Need to truncate.
    const truncatedBytes = await truncatePdf(p.bytes, keep, p.pages)
    prepared.push({
      name: p.name,
      kind: p.kind,
      mime: 'application/pdf',
      source: {
        type: 'base64',
        media_type: 'application/pdf',
        data: bytesToBase64(truncatedBytes),
      },
      truncated: true,
      original_pages: p.pages,
      sent_pages: keep,
    })
  }

  const totalSent = prepared.reduce((s, p) => s + p.sent_pages, 0)
  return {
    prepared,
    total_original_pages: totalOriginal,
    total_sent_pages: totalSent,
    any_truncated: prepared.some(p => p.truncated),
  }
}
