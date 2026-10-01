// Edit an unsent lease draft (sweep 2026-10-01): the drafting form handles it
// in edit mode, so the two never drift apart. A sent or signed lease is frozen
// (guard_lease_document_fields) and the form says so instead of saving.
import { redirect } from 'next/navigation'

export const runtime = 'edge'

export default async function EditLeaseDraft({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/landlord/leases/new?edit=${encodeURIComponent(id)}`)
}
