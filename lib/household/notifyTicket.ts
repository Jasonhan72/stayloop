import { supabase } from '@/lib/supabase'

/** Tell the other side of the tenancy about a ticket this user just filed
 *  (email + push, via /api/maintenance/notify). Best effort: the ticket is
 *  already on the shared board, so a failure here only loses the ping. */
export async function notifyTicket(ticketId: string): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) return false
    const res = await fetch('/api/maintenance/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ticket_id: ticketId }),
    })
    return res.ok
  } catch {
    return false
  }
}
