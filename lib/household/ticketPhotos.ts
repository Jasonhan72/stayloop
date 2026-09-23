// Pure helpers for the tenant's "new maintenance request" modal
// (2026-09-23, user report "点击照片不能上传"): which files are accepted,
// where they live in the private tenancy-files bucket, and how the modal's
// four category tiles map onto the ticket categories the triage layer knows.

export const MAX_TICKET_PHOTOS = 5
/** Per-photo ceiling after browser-side downsizing (bucket allows 25 MB). */
export const MAX_TICKET_PHOTO_BYTES = 8 * 1024 * 1024

export type TicketCategory = 'plumbing' | 'electrical' | 'heating_cooling' | 'appliance' | 'pest' | 'structural' | 'locks_safety' | 'other'

/** Modal tile id → maintenance_tickets.category (lib/agent/maintenanceTriage). */
export const MODAL_CATEGORY_TO_TICKET: Record<string, TicketCategory> = {
  plumbing: 'plumbing',
  electrical: 'electrical',
  hvac: 'heating_cooling',
  lock: 'locks_safety',
}

export function ticketCategoryFor(tileId: string | null | undefined): TicketCategory {
  return (tileId && MODAL_CATEGORY_TO_TICKET[tileId]) || 'other'
}

/**
 * Storage path for one ticket photo. The first folder segment MUST be the
 * household id: the bucket policies (tenancy_files_member_read/write) key
 * on `foldername(name)[1]`, so anything else is rejected at insert.
 */
export function ticketPhotoPath(householdId: string, ticketId: string, index: number, originalName: string): string {
  const ext = (originalName.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'jpg'
  return `${householdId}/tickets/${ticketId}/${index + 1}.${ext}`
}

export type PhotoRejectReason = 'not_image' | 'too_many' | 'too_big'

/**
 * Filter a picker selection against what is already chosen. Images only
 * (HEIC arrives with an empty type on iOS, so the name is checked too),
 * never more than MAX_TICKET_PHOTOS in total.
 */
export function acceptTicketPhotos(files: { name: string; type: string; size: number }[], alreadyChosen: number): { accepted: number[]; rejected: { name: string; reason: PhotoRejectReason }[] } {
  const accepted: number[] = []
  const rejected: { name: string; reason: PhotoRejectReason }[] = []
  let room = Math.max(0, MAX_TICKET_PHOTOS - alreadyChosen)
  files.forEach((f, i) => {
    const isImg = f.type.startsWith('image/') || /\.(heic|heif|jpe?g|png|webp|gif)$/i.test(f.name)
    if (!isImg) { rejected.push({ name: f.name, reason: 'not_image' }); return }
    if (room <= 0) { rejected.push({ name: f.name, reason: 'too_many' }); return }
    accepted.push(i); room -= 1
  })
  return { accepted, rejected }
}

/** Ticket title = first line of the description (≤ 60 chars), else the tile label. */
export function ticketTitleFrom(description: string, fallback: string): string {
  const line = description.split(/\r?\n/).map((s) => s.trim()).find(Boolean) || ''
  if (!line) return fallback
  return line.length > 60 ? line.slice(0, 57).trimEnd() + '…' : line
}
