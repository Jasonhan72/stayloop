// The turn receipt (第一批 of design/assistant-messaging-benchmark-2026-10-24.md, ①②③):
// what the assistant READ and DID in one turn, as short bilingual lines, rendered under
// the reply as a small card, and folded into the conversation list's outcome line. Built
// server-side from what the turn actually loaded / ran — never from the model's prose.
import type { MemoryItem } from './types'

export type ReceiptItem = { kind: string; zh: string; en: string }
export type TurnReceipt = { read: ReceiptItem[]; did: ReceiptItem[] }

export const RECEIPT_MAX_LINES = 8

/** A stored value as a person would read it: strings as is, lists joined, objects by their
 *  summary-like field or a few primitive fields — never raw JSON in the chat. */
export function humanValue(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (Array.isArray(v)) return v.filter((x) => x != null && typeof x !== 'object').map(String).slice(0, 4).join('、')
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    for (const k of ['summary', 'policy', 'text', 'note', 'description', 'value', 'name']) {
      if (typeof o[k] === 'string' && o[k]) return (o[k] as string).trim()
    }
    const parts: string[] = []
    for (const [k, x] of Object.entries(o)) {
      if (x == null || typeof x === 'object') continue
      parts.push(`${k.replace(/_/g, ' ')} ${String(x)}`)
      if (parts.length >= 3) break
    }
    return parts.join('，')
  }
  return ''
}

/** One "记住了：…" line per memory the turn stored, from the rows as written. */
export function memoryNoteLines(writes: MemoryItem[] | null | undefined, zh: boolean): string[] {
  const out: string[] = []
  for (const w of writes ?? []) {
    const label = (w.label || w.key || '').toString().trim()
    const val = humanValue(w.value)
    const text = [label, val].filter(Boolean).join(zh ? '：' : ': ').replace(/\s+/g, ' ').slice(0, 80)
    if (text) out.push(zh ? `记住了：${text}` : `Remembered: ${text}`)
    if (out.length >= 4) break
  }
  return out
}

/** The conversation list's outcome line: what the turn did (first), else what it read. */
export function receiptSummary(receipt: TurnReceipt | null | undefined, memoryNotes: string[] | null | undefined, zh: boolean): string | null {
  const did = (receipt?.did ?? []).map((i) => (zh ? i.zh : i.en))
  const parts = did.length ? did : (receipt?.read ?? []).map((i) => (zh ? i.zh : i.en))
  if (memoryNotes?.length) parts.push(zh ? `记住 ${memoryNotes.length} 条` : `${memoryNotes.length} remembered`)
  if (!parts.length) return null
  return parts.join(' · ').slice(0, 240)
}

export function receiptIsEmpty(receipt: TurnReceipt | null | undefined): boolean {
  return !receipt || (receipt.read.length === 0 && receipt.did.length === 0)
}
