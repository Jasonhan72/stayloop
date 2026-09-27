'use client'

// Open a server-rendered HTML document (evidence pack, receipt) in a new tab
// (节点 6). The tab is opened on the click — before the awaited fetch — so the
// browser's popup rule is satisfied; the fetch carries the JWT the server
// needs; the result becomes a blob URL the tab navigates to.
import { supabase } from '@/lib/supabase'

export async function openHtmlFromPost(url: string, body: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const win = window.open('about:blank', '_blank')
  try {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) { win?.close(); return { ok: false, error: 'sign_in_required' } }
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) })
    if (!res.ok) { win?.close(); const j = (await res.json().catch(() => ({}))) as { error?: string }; return { ok: false, error: j.error || `HTTP ${res.status}` } }
    const html = await res.text()
    const blobUrl = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }))
    if (win) win.location.href = blobUrl; else window.location.assign(blobUrl)
    return { ok: true }
  } catch (e) {
    win?.close()
    return { ok: false, error: (e as Error).message }
  }
}
