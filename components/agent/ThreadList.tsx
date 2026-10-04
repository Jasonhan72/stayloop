'use client'

// The list of your conversations with the AI Agent (2026-10-04, user: "新的
// thread 需要有一个地方可以查看，也可以点击进去，可以参考你自己的界面设计").
// Modelled on claude.ai's sidebar: 新对话 at the top, a search box, the
// conversations grouped by when they last moved, the open one highlighted, and
// a ⋯ menu to rename or delete. One component, two frames: an inline column
// beside the chat on wide screens, a drawer over it elsewhere (AgentWorkspacePage).
// Conversations held under another hat are listed too and reopen on that
// hat's page (its tools and data), as the activity panel already does.
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useT } from '@/lib/i18n'
import { listThreads, renameThread, deleteThread, type ThreadListRow } from '@/lib/agent/threads'
import { ACTIVITY_CHANGED_EVENT, notifyActivityChanged } from '@/lib/agent/useActivityLog'
import { filterThreads, groupThreads, threadLabel } from '@/lib/agent/threadList'
import type { AgentRole } from '@/lib/agent/types'

const ROLE_TAG: Record<string, { zh: string; en: string }> = {
  tenant: { zh: '租客', en: 'Tenant' },
  landlord: { zh: '房东', en: 'Landlord' },
  agent: { zh: '经纪', en: 'Agent' },
}

export default function ThreadList({ role, live, currentThreadId, onOpenThread, onNewThread, onClose, variant }: {
  role: AgentRole
  live: boolean
  currentThreadId: string | null
  onOpenThread: (id: string) => void | Promise<void>
  onNewThread: () => void
  /** Hide the list (the column's « button, the drawer's ×). */
  onClose: () => void
  variant: 'column' | 'drawer'
}) {
  const { lang } = useT()
  const zh = lang === 'zh'
  const router = useRouter()
  const [rows, setRows] = useState<ThreadListRow[] | null>(null)
  const [q, setQ] = useState('')
  const [menu, setMenu] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  // Re-read after a turn saves a conversation, and when another one opens.
  useEffect(() => {
    const h = () => setTick((t) => t + 1)
    window.addEventListener(ACTIVITY_CHANGED_EVENT, h)
    return () => window.removeEventListener(ACTIVITY_CHANGED_EVENT, h)
  }, [])
  useEffect(() => {
    if (!live) { setRows([]); return }
    let cancelled = false
    listThreads(supabase, 100).then((r) => { if (!cancelled) setRows(r) }).catch(() => { if (!cancelled) setRows([]) })
    return () => { cancelled = true }
  }, [live, tick, currentThreadId])

  // ⋯ menu: outside click / Esc closes it.
  const menuRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!menu) return
    const onDown = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(null) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [menu])

  function open(t: ThreadListRow) {
    setMenu(null)
    if (t.role && t.role !== role && ROLE_TAG[t.role]) { router.push(`/${t.role}/agent?thread=${t.id}`); return }
    if (t.id !== currentThreadId) void onOpenThread(t.id)
    if (variant === 'drawer') onClose()
  }

  async function saveRename() {
    if (!renaming) return
    const { id, value } = renaming
    setRenaming(null)
    const ok = await renameThread(supabase, id, value)
    if (!ok) { setError(zh ? '没能改名，请再试一次。' : 'Could not rename — please try again.'); return }
    setError(null)
    setRows((prev) => prev?.map((r) => (r.id === id ? { ...r, title: value.trim() || r.title } : r)) ?? prev)
    notifyActivityChanged()
  }

  async function remove(id: string) {
    setConfirmDelete(null)
    setMenu(null)
    const ok = await deleteThread(supabase, id)
    if (!ok) { setError(zh ? '没能删除，请再试一次。' : 'Could not delete — please try again.'); return }
    setError(null)
    setRows((prev) => prev?.filter((r) => r.id !== id) ?? prev)
    if (id === currentThreadId) onNewThread()
    notifyActivityChanged()
  }

  const shown = filterThreads(rows ?? [], q)
  const groups = groupThreads(shown, lang)

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="thread-list">
      <div className="flex flex-none items-center justify-between gap-2 px-3 pb-2 pt-3">
        <h2 className="text-[14px] font-semibold text-ink">{zh ? '对话' : 'Conversations'}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={zh ? '收起对话列表' : 'Hide conversations'}
          title={zh ? '收起' : 'Hide'}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-body-3 transition hover:bg-white hover:text-ink"
        >
          {variant === 'drawer' ? '×' : <SidebarIcon />}
        </button>
      </div>
      <div className="flex-none space-y-2 px-3 pb-2">
        <button
          type="button"
          onClick={() => { onNewThread(); if (variant === 'drawer') onClose() }}
          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-[13.5px] font-semibold text-white transition hover:opacity-90"
          style={{ background: '#1B1B3C' }}
          data-testid="thread-list-new"
        >
          <span className="text-[16px] leading-none">+</span> {zh ? '新对话' : 'New conversation'}
        </button>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={zh ? '搜索对话' : 'Search conversations'}
          aria-label={zh ? '搜索对话' : 'Search conversations'}
          className="w-full rounded-lg border border-line-divider bg-white px-3 py-1.5 text-[13px] outline-none focus:border-brand"
        />
      </div>
      {error && <div className="mx-3 mb-2 rounded-lg bg-[#FEF2F2] px-3 py-2 text-[12px] text-[#B91C1C]">{error}</div>}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {rows === null ? (
          <div className="px-2 py-4 text-[12.5px] text-body-3">{zh ? '读取中…' : 'Loading…'}</div>
        ) : groups.length === 0 ? (
          <div className="px-2 py-4 text-[12.5px] leading-relaxed text-body-3">
            {q ? (zh ? '没有找到匹配的对话。' : 'No conversations match.') : (zh ? '还没有对话。说一句话，这里就会出现第一段对话。' : 'No conversations yet. Say something and your first one appears here.')}
          </div>
        ) : (
          groups.map((g) => (
            <div key={g.key} className="mb-2">
              <div className="px-2 pb-1 pt-2 text-[11.5px] font-semibold text-body-3">{g.label}</div>
              <ul className="space-y-0.5">
                {g.rows.map((t) => {
                  const current = t.id === currentThreadId
                  const otherHat = t.role !== role && ROLE_TAG[t.role]
                  if (renaming?.id === t.id) {
                    return (
                      <li key={t.id} className="px-1">
                        <input
                          autoFocus
                          value={renaming.value}
                          maxLength={80}
                          onChange={(e) => setRenaming({ id: t.id, value: e.target.value })}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void saveRename() } if (e.key === 'Escape') setRenaming(null) }}
                          onBlur={() => void saveRename()}
                          aria-label={zh ? '对话名称' : 'Conversation name'}
                          className="w-full rounded-lg border border-brand bg-white px-2.5 py-1.5 text-[13px] outline-none"
                        />
                      </li>
                    )
                  }
                  return (
                    <li key={t.id} className="group relative">
                      <button
                        type="button"
                        onClick={() => open(t)}
                        aria-current={current ? 'true' : undefined}
                        data-testid="thread-row"
                        className={`flex w-full items-center gap-2 rounded-lg py-2 pl-2.5 pr-9 text-left text-[13px] transition ${current ? 'bg-white font-semibold text-ink shadow-sm' : 'text-body-2 hover:bg-white/70'}`}
                      >
                        <span className="min-w-0 flex-1 truncate">{threadLabel(t, lang)}</span>
                        {otherHat && <span className="flex-none rounded px-1.5 py-0.5 text-[10.5px] font-medium text-body-3" style={{ background: '#E3F2FC' }}>{zh ? otherHat.zh : otherHat.en}</span>}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setConfirmDelete(null); setMenu(menu === t.id ? null : t.id) }}
                        aria-label={zh ? '更多操作' : 'More actions'}
                        aria-haspopup="menu"
                        aria-expanded={menu === t.id}
                        className={`absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-body-3 transition hover:bg-surface-chip hover:text-ink focus:opacity-100 ${current || menu === t.id ? 'opacity-100' : 'opacity-100 md:opacity-0 md:group-hover:opacity-100'}`}
                      >
                        ⋯
                      </button>
                      {menu === t.id && (
                        <div ref={menuRef} role="menu" className="absolute right-1 top-full z-30 mt-1 w-40 overflow-hidden rounded-xl border border-line-divider bg-white py-1 text-[13px] shadow-lg">
                          {confirmDelete === t.id ? (
                            <div className="px-3 py-2">
                              <div className="text-[12.5px] text-body-2">{zh ? '删除这段对话？删除后无法恢复。' : 'Delete this conversation? This can’t be undone.'}</div>
                              <div className="mt-2 flex gap-2">
                                <button type="button" role="menuitem" onClick={() => void remove(t.id)} className="rounded-md px-2.5 py-1 text-[12.5px] font-semibold text-white" style={{ background: '#DC2626' }}>{zh ? '删除' : 'Delete'}</button>
                                <button type="button" onClick={() => setConfirmDelete(null)} className="rounded-md border border-line-divider px-2.5 py-1 text-[12.5px]">{zh ? '取消' : 'Cancel'}</button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <button type="button" role="menuitem" onClick={() => { setMenu(null); setRenaming({ id: t.id, value: t.title ?? '' }) }} className="block w-full px-3 py-2 text-left hover:bg-surface-chip">{zh ? '重命名' : 'Rename'}</button>
                              <button type="button" role="menuitem" onClick={() => setConfirmDelete(t.id)} className="block w-full px-3 py-2 text-left text-[#DC2626] hover:bg-surface-chip">{zh ? '删除' : 'Delete'}</button>
                            </>
                          )}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export function SidebarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="M9 4v16" />
    </svg>
  )
}
