// One file reader for everything that attaches to a chat turn: the composer's
// 「+」 and the guided-intake card's photo / lease step (2026-09-27). Same
// limits everywhere — three files, 4 MB each — so a file accepted in one place
// is accepted in the other.
import type { ChatAttachment } from './types'

export const ATTACH_MAX_FILES = 3
export const ATTACH_MAX_BYTES = 4 * 1024 * 1024 // 4 MB
export const ATTACH_ACCEPT = 'image/*,.pdf'

/** Reads every accepted file to completion, then returns them together —
 *  reading in parallel and committing per callback raced and dropped files. */
export async function readFilesAsAttachments(files: FileList | File[] | null | undefined): Promise<ChatAttachment[]> {
  if (!files) return []
  const accepted = Array.from(files).filter((f) => f.size <= ATTACH_MAX_BYTES)
  return Promise.all(
    accepted.map(
      (f) =>
        new Promise<ChatAttachment>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve({ name: f.name, mediaType: f.type || 'application/octet-stream', dataUrl: String(reader.result), isImage: f.type.startsWith('image/') })
          reader.onerror = () => reject(reader.error)
          reader.readAsDataURL(f)
        })
    )
  ).catch(() => [] as ChatAttachment[])
}
