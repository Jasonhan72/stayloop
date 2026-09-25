'use client'

// Tap the assistant's avatar → what it has been doing (2026-09-22, Muse
// benchmark item C: "you can't trust what you can't see"). One row per
// conversation (with the decisions taken inside it folded in) plus the
// actions that happened outside any conversation — the same log the web
// panel shows, under the user's own RLS. Two exits — the full audit page and
// the memory card on the progress page; a conversation row reopens it.
import Link from 'next/link'
import { useT } from '@/lib/i18n'
import { auditActionLabel } from '@/lib/agent/ideas'
import { fmtActivityTime, itemIcon, threadFacts, useActivityLog, type ActivityItem } from '@/lib/agent/useActivityLog'
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
  const items = useActivityLog(live, role, 20)

  const open = (it: ActivityItem) => {
    if (!it.threadId || !onOpenThread) return
    onClose()
    void onOpenThread(it.threadId)
  }

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
            const inner = (
              <>
                <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-surface-chip text-[12px]">{itemIcon(it)}</span>
                <span className="min-w-0 flex-1">
                  {it.kind === 'thread' ? (
                    <>
                      <span className="block text-[13px] leading-snug text-body">{it.title ?? (zh ? '新对话' : 'New conversation')}</span>
                      {it.summary && <span className="mt-0.5 line-clamp-2 block text-[12px] leading-snug text-body-3">{it.summary}</span>}
                      <span className="mt-0.5 block font-mono text-[10.5px] text-body-3">{[...threadFacts(it, lang), fmtActivityTime(it.at, lang)].join(' · ')}{current ? (zh ? ' · 当前对话' : ' · this conversation') : ''}</span>
                    </>
                  ) : (
                    <>
                      <span className="block text-[13px] leading-snug text-body-2">
                        {auditActionLabel(it.action, lang, it.metadata || undefined)}
                        {it.actor_type === 'user' && <span className="ml-1 text-[11px] text-body-3">{zh ? '· 你' : '· you'}</span>}
                      </span>
                      <span className="mt-0.5 block font-mono text-[10.5px] text-body-3">{fmtActivityTime(it.at, lang)}</span>
                    </>
                  )}
                </span>
              </>
            )
            return clickable ? (
              <button key={it.id} type="button" onClick={() => open(it)} className="flex w-full gap-3 py-2.5 text-left active:bg-surface-chip">{inner}</button>
            ) : (
              <div key={it.id} className="flex gap-3 py-2.5">{inner}</div>
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
