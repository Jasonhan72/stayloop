// Move-in / move-out condition photos (2026-10-27 · report review batch 2 §3/§11;
// design/ai-rebuild-report-review-2026-10-25.md). Pure helpers shared by the
// hub component and the evidence pack.
//
// A photo is hashed (SHA-256) on the member's own device before upload, stored
// in the tenancy's private bucket under the household folder (the bucket
// policies key on it), and recorded in condition_photos with the server's
// time. Rows are append-only: nobody — not even the uploader — can edit or
// delete one, so the move-out comparison and the evidence pack read the same
// record. No damage grading: Ontario has no damage deposit, a charge is a
// claim, and the comparison is for people to look at side by side.
import { moveInItemsFor, type MoveInItem } from './moveIn'

export type ConditionPhase = 'move_in' | 'move_out'
export const CONDITION_PHASES: { key: ConditionPhase; label: { zh: string; en: string } }[] = [
  { key: 'move_in', label: { zh: '入住', en: 'Move-in' } },
  { key: 'move_out', label: { zh: '退租', en: 'Move-out' } },
]
export const MAX_CONDITION_PHOTOS_PER_ITEM = 6
/** Per photo after browser-side downsizing (the bucket allows 25 MB). */
export const MAX_CONDITION_PHOTO_BYTES = 8 * 1024 * 1024
export const CONDITION_PHOTO_MAX_SIDE = 1600

export type ConditionPhotoRow = {
  id: string
  household_id: string
  phase: ConditionPhase
  item_key: string
  path: string
  sha256: string
  bytes: number
  content_type: string | null
  note: string | null
  taken_by: string
  created_at: string
}

/** The checklist's photo items for a province — the rooms the comparison is organised by. */
export function photoItemsFor(province: string | null | undefined): MoveInItem[] {
  return moveInItemsFor(province).filter((i) => i.group === 'photos')
}

/**
 * Storage path for one condition photo. The first folder segment MUST be the
 * household id (tenancy_files_member_read / write key on foldername(name)[1]).
 */
export function conditionPhotoPath(householdId: string, phase: ConditionPhase, itemKey: string, id: string, ext = 'jpg'): string {
  const safeKey = itemKey.replace(/[^a-z0-9_]/gi, '').slice(0, 60) || 'item'
  const safeExt = ext.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'jpg'
  return `${householdId}/condition/${phase}/${safeKey}/${id}.${safeExt}`
}

export async function sha256HexOf(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer()
  const d = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export type ItemPair = { item: MoveInItem; move_in: ConditionPhotoRow[]; move_out: ConditionPhotoRow[] }

/** Rows grouped by checklist item, each phase in upload order — the side-by-side view. */
export function pairByItem(rows: ConditionPhotoRow[], items: MoveInItem[]): ItemPair[] {
  const sorted = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at))
  return items.map((item) => ({
    item,
    move_in: sorted.filter((r) => r.item_key === item.key && r.phase === 'move_in'),
    move_out: sorted.filter((r) => r.item_key === item.key && r.phase === 'move_out'),
  }))
}

/** Whether another photo may be added for this item + phase. */
export function roomFor(rows: ConditionPhotoRow[], phase: ConditionPhase, itemKey: string): number {
  return Math.max(0, MAX_CONDITION_PHOTOS_PER_ITEM - rows.filter((r) => r.phase === phase && r.item_key === itemKey).length)
}
