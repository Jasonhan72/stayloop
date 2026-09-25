'use client'

import { useRouter } from 'next/navigation'
// Tap the assistant's avatar → what it has been doing (2026-09-22, Muse
// benchmark item C: "you can't trust what you can't see"). One row per
// conversation (with the decisions taken inside it folded in) plus the
// actions that happened outside any conversation — the same log the web
// panel shows, under the user's own RLS. Two exits — the full audit page and
// the memory card on the progress page; a conversation row reopens it.
import Link from 'next/link'
import { useT } from '@/lib/i18n'
import { auditActionLabel } from '@/lib/agent/ideas'
import { fmtRowTime, itemIcon, itemNote, useActivityLog, type ActivityItem } from '@/lib/agent/useActivityLog'
import type { AgentRole } from '@/lib/agent/types'

export function ActivitySheet({ role, agentName, live, memoryCount, currentThreadId, onOpenThread, onClose }: {
  role: AgentRole
  agentName: string
  live: boolean
  memoryCount: number
  currentThreadId?: string | null
  onOpenThread?: (id: string) => void | Promise<void>
  onClose: () => void
}) {
  const { lang } = useT()
  const zh = lang === 'zh'
  const items = useActivityLog(live, 20)
  const router = useRouter()

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
          <div>
            <div className="text-[15px] font-bold">{zh ? `${agentName} 的活动日志` : `${agentName}'s activity`}</div>
            <div className="text-[12px] text-body-3">{zh ? '每段对话、它替你做的每件事都在这里留痕' : 'Every conversation and everything it did for you leaves a trace here'}</div>
          </div>
          <button type="button" onClick={onClose} aria-label={zh ? '关闭' : 'Close'} className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-[18px] text-body-3 hover:bg-surface-chip">×</button>
        </div>

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
