'use client'

import { useRouter } from 'next/navigation'
// Tap the assistant's avatar → what it has been doing (2026-09-22, Muse
// benchmark item C: "you can't trust what you can't see"). One row per
// conversation (with the decisions taken inside it folded in) plus the
// actions that happened outside any conversation — the same log the web
// panel shows, under the user's own RLS. Two exits — the full audit page and
// the memory card on the progress page; a conversation row reopens it.
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useT } from '@/lib/i18n'
import { useAuth } from '@/lib/useAuth'
import { supabase } from '@/lib/supabase'
import { invalidateAiName, setAIName } from '@/lib/aiName'
import { AssistantAvatar, setStoredAvatar } from '@/lib/agent/avatars'
import { saveAssistantAvatar, saveAssistantName } from '@/lib/agent/assistantProfile'
import AvatarPicker from '@/components/agent/AvatarPicker'
import { AvatarIcon, PencilIcon } from '@/components/agent/panelIcons'
import { auditActionLabel } from '@/lib/agent/ideas'
import { fmtRowTime, itemIcon, itemNote, useActivityLog, type ActivityItem } from '@/lib/agent/useActivityLog'
import type { AgentRole } from '@/lib/agent/types'

export function ActivitySheet({ role, agentName, live, memoryCount, currentThreadId, onOpenThread, onClose, avatar = null, avatarFallback = 'role', onAvatarChange }: {
  role: AgentRole
  agentName: string
  live: boolean
  memoryCount: number
  currentThreadId?: string | null
  onOpenThread?: (id: string) => void | Promise<void>
  onClose: () => void
  /** The assistant's face and how to change it (2026-09-27): below lg the web
   *  panel's pencil is not on screen, so this sheet carries 换头像 / 改名. */
  avatar?: string | null
  avatarFallback?: 'role' | 'brand'
  onAvatarChange?: (key: string | null) => void
}) {
  const { lang } = useT()
  const zh = lang === 'zh'
  const items = useActivityLog(live, 20)
  const router = useRouter()
  const auth = useAuth()
  // Editing only for a signed-in account whose page owns the avatar state; preview mode just looks.
  const canEdit = live && !!onAvatarChange
  const [menu, setMenu] = useState(false)
  const [picking, setPicking] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(agentName)
  const [nameDraft, setNameDraft] = useState(agentName)
  useEffect(() => { setName(agentName); setNameDraft(agentName) }, [agentName])
  const menuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!menu) return
    const onDown = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [menu])
  // Same persistence as the web panel: assistant_profiles.avatar (cross-device) + localStorage (first paint).
  async function chooseAvatar(key: string | null) {
    setPicking(false)
    onAvatarChange?.(key)
    setStoredAvatar(key ?? 'default')
    if (live && auth.user) await saveAssistantAvatar(supabase, auth.user.id, key)
  }
  async function saveName() {
    const next = nameDraft.trim().slice(0, 20)
    setRenaming(false)
    if (!next || next === name) return
    setName(next)
    setAIName(next, live && auth.user ? auth.user.id : null)
    invalidateAiName()
    if (live && auth.user) await saveAssistantName(supabase, auth.user.id, next)
  }

  const open = (it: ActivityItem) => {
    if (!it.threadId || !onOpenThread) return
    onClose()
    // A conversation held under another hat continues on that hat's page (one assistant, separate hats — 2026-09-25).
    if (it.kind === 'thread' && it.role && it.role !== role) { router.push(`/${it.role}/agent?thread=${it.threadId}`); return }
    void onOpenThread(it.threadId)
  }
  const HAT: Record<string, { zh: string; en: string }> = { tenant: { zh: '租客', en: 'tenant' }, landlord: { zh: '房东', en: 'landlord' }, agent: { zh: '经纪', en: 'agent' } }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/35 sm:items-center sm:p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label={zh ? `${agentName} 的活动日志` : `${agentName}'s activity log`}>
      <div className="max-h-[80dvh] w-full max-w-[460px] overflow-y-auto rounded-t-2xl bg-white px-5 pb-[calc(16px+env(safe-area-inset-bottom))] pt-3 sm:rounded-2xl sm:pb-5" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-line-strong sm:hidden" />
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative h-12 w-12 flex-none">
              <button type="button" onClick={() => canEdit && setPicking((v) => !v)} disabled={!canEdit} aria-label={canEdit ? (zh ? '换头像' : 'Change avatar') : undefined} className={`block h-full w-full rounded-full ${canEdit ? 'shadow-[0_4px_14px_rgba(27,27,60,.16)]' : 'cursor-default'}`}>
                <AssistantAvatar avatar={avatar} role={role} className="h-full w-full" fallback={avatarFallback} />
              </button>
              {canEdit && (
                <div ref={menuRef} className="absolute -bottom-1 -right-1">
                  <button type="button" onClick={() => setMenu((v) => !v)} aria-label={zh ? '编辑助手' : 'Edit assistant'} title={zh ? '换头像 / 改名' : 'Change avatar / edit name'} aria-haspopup="menu" aria-expanded={menu} data-testid="sheet-pencil" className="flex h-6 w-6 items-center justify-center rounded-full border border-line-divider bg-white text-body shadow-sm">
                    <PencilIcon />
                  </button>
                  {menu && (
                    <div role="menu" className="absolute left-0 top-full z-50 mt-1.5 w-[172px] overflow-hidden rounded-xl border border-line bg-white py-1 text-left shadow-xl">
                      <button type="button" role="menuitem" onClick={() => { setMenu(false); setRenaming(false); setPicking(true) }} className="flex w-full items-center gap-2.5 px-3 py-2 text-[13.5px] font-semibold text-ink transition hover:bg-surface"><AvatarIcon /> {zh ? '换头像' : 'Change avatar'}</button>
                      <button type="button" role="menuitem" onClick={() => { setMenu(false); setPicking(false); setRenaming(true) }} className="flex w-full items-center gap-2.5 px-3 py-2 text-[13.5px] font-semibold text-ink transition hover:bg-surface"><PencilIcon /> {zh ? '改名' : 'Edit name'}</button>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="min-w-0">
              {renaming ? (
                <form onSubmit={(e) => { e.preventDefault(); void saveName() }} className="flex items-center gap-1.5">
                  <input autoFocus value={nameDraft} maxLength={20} onChange={(e) => setNameDraft(e.target.value)} onBlur={() => void saveName()} aria-label={zh ? '助手名字' : 'Assistant name'} className="sl-input w-[150px] min-w-0 !py-1 text-[16px] font-medium" />
                  <button type="submit" className="rounded-lg px-2.5 py-1.5 text-[12px] font-bold text-white" style={{ background: '#1B1B3C' }}>{zh ? '好' : 'OK'}</button>
                </form>
              ) : (
                <div className="truncate text-[17px] font-medium leading-tight tracking-tight text-ink">{name}</div>
              )}
              <div className="mt-0.5 text-[12px] text-body-3">{canEdit ? (zh ? '活动日志 · 点铅笔可换头像、改名' : 'Activity · the pencil changes the avatar or the name') : (zh ? '活动日志 · 每段对话都在这里留痕' : 'Activity · every conversation leaves a trace here')}</div>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label={zh ? '关闭' : 'Close'} className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-[18px] text-body-3 hover:bg-surface-chip">×</button>
        </div>
        {picking && <AvatarPicker role={role} avatar={avatar} live={live} zh={zh} onPick={(k) => void chooseAvatar(k)} className="mt-3" />}

        <div className="mt-3 divide-y divide-line-divider border-t border-line-divider">
          {items === null && <div className="py-4 text-[13px] text-body-3">{zh ? '读取中…' : 'Loading…'}</div>}
          {items && items.length === 0 && (
            <div className="py-4 text-[13px] text-body-3">
              {live ? (zh ? '还没有对话记录。' : 'No conversations yet.') : (zh ? '预览模式没有日志。登录后这里会列出你和助手的对话。' : 'Preview mode has no log. Sign in and your conversations are listed here.')}
            </div>
          )}
          {items?.map((it) => {
            const clickable = live && !!it.threadId && !!onOpenThread
            const current = !!it.threadId && it.threadId === currentThreadId
            const label = it.kind === 'thread' ? (it.title ?? (zh ? '新对话' : 'New conversation')) : auditActionLabel(it.action, lang, it.metadata || undefined)
            const note = itemNote(it, lang)
            const inner = (
              <>
                <span className="mt-px flex h-7 w-7 flex-none items-center justify-center rounded-full bg-surface-chip text-[12px]">{itemIcon(it)}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="min-w-0 flex-1 truncate text-[13px] leading-snug text-body">{label}</span>
                    {current && <span className="flex-none rounded-full bg-surface-chip px-1.5 py-[1px] text-[10px] font-bold text-body-3">{zh ? '当前' : 'now'}</span>}
                    {it.kind === 'thread' && it.role !== role && HAT[it.role] && <span className="flex-none rounded-full bg-surface-chip px-1.5 py-[1px] text-[10px] font-bold text-body-3">{zh ? HAT[it.role].zh : HAT[it.role].en}</span>}
                  </span>
                  {note && <span className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-body-3">{note}</span>}
                  <span className="mt-0.5 block font-mono text-[10.5px] text-body-3">{fmtRowTime(it.at, lang)}{it.kind === 'action' && it.actor_type === 'user' ? (zh ? ' · 你' : ' · you') : ''}</span>
                </span>
              </>
            )
            return clickable ? (
              <button key={it.id} type="button" onClick={() => open(it)} className="flex w-full items-start gap-3 py-2.5 text-left active:bg-surface-chip">{inner}</button>
            ) : (
              <div key={it.id} className="flex items-start gap-3 py-2.5">{inner}</div>
            )
          })}
        </div>

        <div className="mt-4 flex items-center justify-between text-[13px] font-semibold text-brand">
          <Link href={`/${role}/audit`} onClick={onClose}>{zh ? '完整审计 ›' : 'Full audit ›'}</Link>
          <Link href={`/${role}/progress#memory`} onClick={onClose}>{zh ? `它记住了什么（${memoryCount}）›` : `What it remembers (${memoryCount}) ›`}</Link>
        </div>
      </div>
    </div>
  )
}
