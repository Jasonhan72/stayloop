'use client'

// In-page preview for an applicant's documents (three-role test report
// 2026-09-24, SL-L-01). The old button awaited the signed URL and then called
// window.open — by then the click's user activation was gone, the browser
// blocked the popup silently, and the landlord saw nothing. Now: the modal
// opens on the click, shows loading / error states, renders images and PDFs
// inline, and offers a real <a target=_blank> (a user click, never blocked).
// /api/file-url checks the landlord can read the application and logs the view.
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type State = { phase: 'loading' } | { phase: 'ready'; url: string; kind: 'pdf' | 'image' | 'heic' | 'other' } | { phase: 'error'; code: number | 'network' }

export default function FilePreviewModal({ path, name, zh, onClose }: { path: string; name: string; zh: boolean; onClose: () => void }) {
  const [st, setSt] = useState<State>({ phase: 'loading' })
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let cancelled = false
    setSt({ phase: 'loading' })
    ;(async () => {
      try {
        const { data } = await supabase.auth.getSession()
        const token = data.session?.access_token
        if (!token) { if (!cancelled) setSt({ phase: 'error', code: 401 }); return }
        const res = await fetch('/api/file-url', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ path }) })
        const j = (await res.json().catch(() => ({}))) as { url?: string; kind?: 'pdf' | 'image' | 'heic' | 'other' }
        if (cancelled) return
        if (!res.ok || !j.url) { setSt({ phase: 'error', code: res.status }); return }
        setSt({ phase: 'ready', url: j.url, kind: j.kind ?? 'other' })
      } catch {
        if (!cancelled) setSt({ phase: 'error', code: 'network' })
      }
    })()
    return () => { cancelled = true }
  }, [path, nonce])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const errText = (code: number | 'network') =>
    code === 401 ? (zh ? '登录已过期，请重新登录后再看。' : 'Your session expired — sign in again.')
      : code === 403 ? (zh ? '你没有查看这份申请材料的权限（只有该房源的房东可以看）。' : 'You do not have access to this application’s documents (only the listing’s landlord does).')
        : code === 400 ? (zh ? '文件路径无效，这份材料可能已损坏。' : 'Invalid file path — this document may be damaged.')
          : code === 'network' ? (zh ? '网络错误，请重试。' : 'Network error — try again.')
            : (zh ? '文件暂时打不开（可能已被删除或链接生成失败），请重试。' : 'The file could not be opened (it may have been removed, or signing failed). Try again.')

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-0 backdrop-blur-sm sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={name} onClick={onClose}>
      <div data-testid="file-preview" className="flex h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:h-[85vh] sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-none items-center gap-3 border-b border-line-divider px-4 py-3">
          <span className="min-w-0 flex-1 truncate text-[14px] font-bold">{name}</span>
          {st.phase === 'ready' && (
            <a href={st.url} target="_blank" rel="noopener noreferrer" className="flex-none rounded-lg border border-line-divider px-3 py-1.5 text-[12.5px] font-semibold">{zh ? '新标签打开 ↗' : 'Open in new tab ↗'}</a>
          )}
          <button onClick={onClose} aria-label={zh ? '关闭' : 'Close'} className="flex h-9 w-9 flex-none items-center justify-center rounded-lg text-[20px] text-body-2 hover:bg-surface-chip">×</button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-surface-chip">
          {st.phase === 'loading' && <div className="flex h-full items-center justify-center font-mono text-[13px] text-body-3">{zh ? '正在生成安全链接…' : 'Creating a secure link…'}</div>}
          {st.phase === 'error' && (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="max-w-md text-[13.5px] leading-relaxed text-body">{errText(st.code)}</p>
              <button onClick={() => setNonce((n) => n + 1)} className="sl-btn-secondary !py-2 !text-[13px]">{zh ? '重试' : 'Retry'}</button>
            </div>
          )}
          {st.phase === 'ready' && st.kind === 'image' && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={st.url} alt={name} className="mx-auto block h-auto max-w-full" onError={() => setSt({ phase: 'error', code: 500 })} />
          )}
          {st.phase === 'ready' && st.kind === 'pdf' && <iframe src={st.url} title={name} className="h-full w-full border-0 bg-white" />}
          {st.phase === 'ready' && (st.kind === 'heic' || st.kind === 'other') && (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="max-w-md text-[13.5px] leading-relaxed text-body">{st.kind === 'heic' ? (zh ? 'HEIC 照片多数浏览器不能直接显示，请用「新标签打开」下载后查看。' : 'Most browsers cannot show HEIC photos inline — use “Open in new tab” to download it.') : (zh ? '这种文件格式不能在页面里预览，请用「新标签打开」。' : 'This file type cannot be previewed here — use “Open in new tab”.')}</p>
              <a href={st.url} target="_blank" rel="noopener noreferrer" className="sl-btn-primary !py-2 !text-[13px]">{zh ? '新标签打开 ↗' : 'Open in new tab ↗'}</a>
            </div>
          )}
        </div>
        <div className="flex-none border-t border-line-divider px-4 py-2 text-[11px] text-body-3">{zh ? '链接 10 分钟内有效 · 这次查看已记入审计日志' : 'Link valid for 10 minutes · this view is recorded in the audit log'}</div>
      </div>
    </div>
  )
}
