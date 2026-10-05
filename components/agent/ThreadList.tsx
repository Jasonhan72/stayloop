'use client'

// The list of your conversations with the AI Agent (2026-10-04, user: "新的
// thread 需要有一个地方可以查看，也可以点击进去，可以参考你自己的界面设计").
// Modelled on claude.ai's sidebar: a search box, the conversations grouped by
// when they last moved (title + time, then one line of what the AI Agent last
// said), the open one highlighted, and a ⋯ menu to rename or delete. One
// component, two frames: an inline column beside the chat on wide screens (no
// new-chat button there — the rail's ＋ sits right beside it), a drawer over the
// chat elsewhere (it covers the rail, so it carries 「＋ 新对话」).
// 2026-10-04 regroup (user: 「折叠到底部一段」): this hat's conversations first;
// the other hats' in one folded section at the bottom, without per-row tags —
// they reopen on that hat's page (its tools and data). This list is the only
// place conversations are listed; the panel's 活动 tab is gone.
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useT } from '@/lib/i18n'
import { listThreads, renameThread, deleteThread, type ThreadListRow } from '@/lib/agent/threads'
import { ACTIVITY_CHANGED_EVENT, notifyActivityChanged } from '@/lib/agent/useActivityLog'
import { filterThreads, groupThreads, HAT_SECTION, isEmptyThread, partitionByHat, threadAt, threadLabel, threadNote, type Hat } from '@/lib/agent/threadList'
import { fmtRowTime } from '@/lib/agent/activityLog'
import type { AgentRole } from '@/lib/agent/types'

const HATS = new Set(['tenant', 'landlord', 'agent'])
const OTHERS_KEY = 'sl-thread-list-others'

export default function ThreadList({ role, live, currentThreadId, onOpenThread, onNewThread, onClose, variant, focusSearch = false, onFocused }: {
  role: AgentRole
  live: boolean
  currentThreadId: string | null
  onOpenThread: (id: string) => void | Promise<void>
  onNewThread: () => void
  /** Hide the list (the column's « button, the drawer's ×). */
  onClose: () => void
  variant: 'column' | 'drawer'
  /** Move keyboard focus to the search box (the column was just opened from the pill). */
  focusSearch?: boolean
  onFocused?: () => void
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
  const searchRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!focusSearch) return
    searchRef.current?.focus()
    onFocused?.()
  }, [focusSearch, onFocused])
  const [othersOpen, setOthersOpen] = useState(false)
  useEffect(() => { try { if (localStorage.getItem(OTHERS_KEY) === 'open') setOthersOpen(true) } catch { /* private mode */ } }, [])
  const toggleOthers = () => setOthersOpen((v) => { const n = !v; try { localStorage.setItem(OTHERS_KEY, n ? 'open' : 'closed') } catch { /* private mode */ } return n })

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
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); setMenu(null) } }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [menu])

  function open(t: ThreadListRow) {
    setMenu(null)
    if (t.role && t.role !== role && HATS.has(t.role)) { router.push(`/${t.role}/agent?thread=${t.id}`); return }
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
    setRows((prev) => prev?.map((r) => (r.id === id ? { ...r, custom_title: value.replace(/\s+/g, ' ').trim().slice(0, 80) || null } : r)) ?? prev)
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

  const visibleRows = (rows ?? []).filter((t) => !isEmptyThread(t, currentThreadId))
  const shown = filterThreads(visibleRows, q)
  const { mine, others } = partitionByHat(shown, role)
  const groups = groupThreads(mine, lang)
  const othersCount = others.reduce((n, g) => n + g.rows.length, 0)
  // Searching looks through every hat, so the folded section opens while a query is typed.
  const othersShown = othersOpen || !!q.trim()

  const renderRow = (t: ThreadListRow) => {
    const current = t.id === currentThreadId
    if (renaming?.id === t.id) {
      return (
        <li key={t.id} className="px-1">
          <input
            autoFocus
            value={renaming.value}
            maxLength={80}
            onChange={(e) => setRenaming({ id: t.id, value: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void saveRename() } if (e.key === 'Escape') { e.preventDefault(); setRenaming(null) } }}
            onBlur={() => void saveRename()}
            aria-label={zh ? '对话名称' : 'Chat name'}
            className="w-full rounded-lg border border-brand bg-white px-2.5 py-1.5 text-[13px] outline-none"
          />
        </li>
      )
    }
    const note = threadNote(t)
    return (
      <li key={t.id} className="group relative">
        <button
          type="button"
          onClick={() => open(t)}
          aria-current={current ? 'true' : undefined}
          data-testid="thread-row"
          className={`block w-full rounded-lg py-1.5 pl-2.5 pr-9 text-left transition ${current ? 'bg-white shadow-sm' : 'hover:bg-white/70'}`}
        >
          <span className="flex items-baseline gap-2">
            <span className={`min-w-0 flex-1 truncate text-[13.5px] ${current ? 'font-semibold text-ink' : 'text-body'}`}>{threadLabel(t, lang)}</span>
            <span className="flex-none font-mono text-[10.5px] text-body-3">{fmtRowTime(threadAt(t), lang)}</span>
          </span>
          {note && <span className="mt-0.5 block truncate text-[12px] leading-snug text-body-3">{note}</span>}
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setConfirmDelete(null); setMenu(menu === t.id ? null : t.id) }}
          aria-label={zh ? '更多操作' : 'More actions'}
          aria-haspopup="menu"
          aria-expanded={menu === t.id}
          className={`absolute right-1 top-1.5 flex h-9 w-9 items-center justify-center rounded-md text-body-3 transition hover:bg-surface-chip hover:text-ink focus:opacity-100 md:h-7 md:w-7 ${current || menu === t.id ? 'opacity-100' : 'opacity-100 md:opacity-0 md:group-hover:opacity-100'}`}
        >
          ⋯
        </button>
        {menu === t.id && (
          <div ref={menuRef} role="menu" className="absolute right-1 top-full z-30 mt-1 w-44 overflow-hidden rounded-xl border border-line-divider bg-white py-1 text-[13px] shadow-lg">
            {confirmDelete === t.id ? (
              <div className="px-3 py-2">
                <div className="text-[12.5px] text-body-2">{zh ? '删除这段对话？删除后无法恢复。' : 'Delete this chat? This can’t be undone.'}</div>
                <div className="mt-2 flex gap-2">
                  <button type="button" role="menuitem" onClick={() => void remove(t.id)} className="rounded-md px-2.5 py-1 text-[12.5px] font-semibold text-white" style={{ background: '#DC2626' }}>{zh ? '删除' : 'Delete'}</button>
                  <button type="button" onClick={() => setConfirmDelete(null)} className="rounded-md border border-line-divider px-2.5 py-1 text-[12.5px]">{zh ? '取消' : 'Cancel'}</button>
                </div>
              </div>
            ) : (
              <>
                <button type="button" role="menuitem" onClick={() => { setMenu(null); setRenaming({ id: t.id, value: threadLabel(t, lang) }) }} className="block w-full px-3 py-2 text-left hover:bg-surface-chip">{zh ? '重命名' : 'Rename'}</button>
                <button type="button" role="menuitem" onClick={() => setConfirmDelete(t.id)} className="block w-full px-3 py-2 text-left text-[#DC2626] hover:bg-surface-chip">{zh ? '删除' : 'Delete'}</button>
              </>
            )}
          </div>
        )}
      </li>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="thread-list">
      <div className="flex flex-none items-center justify-between gap-2 px-3 pb-2 pt-3">
        <h2 className="text-[14px] font-semibold text-ink">{zh ? 'AI 对话' : 'AI chats'}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={variant === 'drawer' ? (zh ? '关闭' : 'Close') : (zh ? '收起对话列表' : 'Hide chats')}
          title={variant === 'drawer' ? (zh ? '关闭' : 'Close') : (zh ? '收起' : 'Hide')}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-[20px] text-body-3 transition hover:bg-white hover:text-ink"
        >
          {variant === 'drawer' ? '×' : <SidebarIcon />}
        </button>
      </div>
      <div className="flex-none space-y-2 px-3 pb-2">
        {/* One new-chat control at a time: the rail's ＋ beside the column; the drawer covers the rail, so it has its own. */}
        {variant === 'drawer' && (
          <button
            type="button"
            onClick={() => { onNewThread(); onClose() }}
            className="flex h-11 w-full items-center gap-2 rounded-xl px-3 text-[13.5px] font-semibold text-white transition hover:opacity-90"
            style={{ background: '#1B1B3C' }}
            data-testid="thread-list-new"
          >
            <span className="text-[16px] leading-none">+</span> {zh ? '新对话' : 'New chat'}
          </button>
        )}
        <input
          ref={searchRef}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={zh ? '搜索对话' : 'Search chats'}
          aria-label={zh ? '搜索对话' : 'Search chats'}
          className="w-full rounded-lg border border-line-divider bg-white px-3 py-1.5 text-[13px] outline-none focus:border-brand"
        />
      </div>
      {error && <div className="mx-3 mb-2 rounded-lg bg-[#FEF2F2] px-3 py-2 text-[12px] text-[#B91C1C]">{error}</div>}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {rows === null ? (
          <div className="px-2 py-4 text-[12.5px] text-body-3">{zh ? '读取中…' : 'Loading…'}</div>
        ) : groups.length === 0 && othersCount === 0 ? (
          <div className="px-2 py-4 text-[12.5px] leading-relaxed text-body-3">
            {q ? (zh ? '没有找到匹配的对话。' : 'No chats match.') : (zh ? '还没有对话。说一句话，这里就会出现第一段对话。' : 'No chats yet. Say something and your first one appears here.')}
          </div>
        ) : (
          <>
            {groups.length === 0 && (
              <div className="px-2 pb-1 pt-3 text-[12.5px] text-body-3">{q ? (zh ? '这个身份下没有匹配的对话。' : 'No matching chats in this role.') : (zh ? '这个身份下还没有对话。' : 'No chats in this role yet.')}</div>
            )}
            {groups.map((g) => (
              <div key={g.key} className="mb-2">
                <div className="px-2 pb-1 pt-2 text-[11.5px] font-semibold text-body-3">{g.label}</div>
                <ul className="space-y-0.5">{g.rows.map(renderRow)}</ul>
              </div>
            ))}
            {othersCount > 0 && (
              <div className="mt-2 border-t border-line-divider pt-2" data-testid="thread-list-others">
                <button
                  type="button"
                  onClick={toggleOthers}
                  aria-expanded={othersShown}
                  className="flex h-9 w-full items-center justify-between rounded-lg px-2 text-[12.5px] font-semibold text-body-2 transition hover:bg-white/70"
                >
                  <span>{zh ? `其他身份的对话 · ${othersCount}` : `Other roles · ${othersCount}`}</span>
                  <span aria-hidden className={`transition ${othersShown ? 'rotate-90' : ''}`}>›</span>
                </button>
                {othersShown && others.map((g) => (
                  <div key={g.hat} className="mb-2">
                    <div className="px-2 pb-0.5 pt-2 text-[11.5px] font-semibold text-body-3">{zh ? `${HAT_SECTION[g.hat as Hat].zh} · ${g.rows.length}` : `${HAT_SECTION[g.hat as Hat].en} · ${g.rows.length}`}</div>
                    <div className="px-2 pb-1 text-[11px] text-body-3">{zh ? `点开会切到${HAT_SECTION[g.hat as Hat].zh}的 AI 助理页` : `Opens on your ${g.hat} AI Agent page`}</div>
                    <ul className="space-y-0.5">{[...g.rows].sort((a, b) => threadAt(b).localeCompare(threadAt(a))).map(renderRow)}</ul>
                  </div>
                ))}
              </div>
            )}
          </>
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
