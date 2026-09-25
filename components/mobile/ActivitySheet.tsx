'use client'

// Tap the assistant's avatar → what it has been doing (2026-09-22, Muse
// benchmark item C: "you can't trust what you can't see"). Reads the last
// 20 agent_audit_events under the user's own RLS; two exits — the full audit
// page and the memory card on the progress page.
import Link from 'next/link'
import { useT } from '@/lib/i18n'
import { auditActionLabel } from '@/lib/agent/ideas'
import { fmtActivityTime, useActivityLog } from '@/lib/agent/useActivityLog'
import type { AgentRole } from '@/lib/agent/types'

export function ActivitySheet({ role, agentName, live, memoryCount, onClose }: { role: AgentRole; agentName: string; live: boolean; memoryCount: number; onClose: () => void }) {
  const { lang } = useT()
  const zh = lang === 'zh'
  const rows = useActivityLog(live, 20)

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/35 sm:items-center sm:p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label={zh ? `${agentName} 的活动日志` : `${agentName}'s activity log`}>
      <div className="max-h-[80dvh] w-full max-w-[460px] overflow-y-auto rounded-t-2xl bg-white px-5 pb-[calc(16px+env(safe-area-inset-bottom))] pt-3 sm:rounded-2xl sm:pb-5" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-line-strong sm:hidden" />
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[15px] font-bold">{zh ? `${agentName} 的活动日志` : `${agentName}'s activity`}</div>
            <div className="text-[12px] text-body-3">{zh ? '它替你做过的每件事都在这里留痕' : 'Everything it did for you leaves a trace here'}</div>
          </div>
          <button type="button" onClick={onClose} aria-label={zh ? '关闭' : 'Close'} className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-[18px] text-body-3 hover:bg-surface-chip">×</button>
        </div>

        <div className="mt-3 divide-y divide-line-divider border-t border-line-divider">
          {rows === null && <div className="py-4 text-[13px] text-body-3">{zh ? '读取中…' : 'Loading…'}</div>}
          {rows && rows.length === 0 && (
            <div className="py-4 text-[13px] text-body-3">
              {live ? (zh ? '还没有后台动作。' : 'No background actions yet.') : (zh ? '预览模式没有日志。登录后这里会列出助手做过的事。' : 'Preview mode has no log. Sign in and the assistant’s actions are listed here.')}
            </div>
          )}
          {rows?.map((r) => (
            <div key={r.id} className="flex gap-3 py-2.5 text-[13px]">
              <span className="w-[62px] flex-none font-mono text-[11px] text-body-3">{fmtActivityTime(r.created_at, lang)}</span>
              <span className="min-w-0 text-body-2">
                {auditActionLabel(r.action, lang, r.metadata || undefined)}
                {r.actor_type === 'user' && <span className="ml-1 text-[11px] text-body-3">{zh ? '· 你' : '· you'}</span>}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between text-[13px] font-semibold text-brand">
          <Link href={`/${role}/audit`} onClick={onClose}>{zh ? '完整审计 ›' : 'Full audit ›'}</Link>
          <Link href={`/${role}/progress#memory`} onClick={onClose}>{zh ? `它记住了什么（${memoryCount}）›` : `What it remembers (${memoryCount}) ›`}</Link>
        </div>
      </div>
    </div>
  )
}
