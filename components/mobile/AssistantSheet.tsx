'use client'

// The AI Agent panel below lg (2026-10-04): tapping the avatar or the status line in the chat
// head opens the SAME panel as the desktop column — 待办 · 记忆 · 设置, the pencil for
// 换头像 / 改名 — as a bottom sheet (a centred dialog from sm). It replaces the old activity
// sheet; conversations are in the AI chats drawer.
import { useRef } from 'react'
import { useT } from '@/lib/i18n'
import { useModalA11y } from '@/lib/ui/useModalA11y'
import AssistantPanel, { type PanelTab } from '@/components/agent/AssistantPanel'
import type { AgentRole, MemoryItem, PendingAction } from '@/lib/agent/types'

export default function AssistantSheet(props: {
  role: AgentRole
  agentName: string
  pendingActions: PendingAction[]
  memories: MemoryItem[]
  live: boolean
  avatar: string | null
  onAvatarChange: (key: string | null) => void
  currentThreadId: string | null
  onOpenThread: (id: string) => void | Promise<void>
  onScrollToCard?: (id: string) => void
  initialTab?: PanelTab
  onTabRequestUsed?: () => void
  onClose: () => void
}) {
  const { lang } = useT()
  const zh = lang === 'zh'
  const box = useRef<HTMLDivElement>(null)
  useModalA11y(true, props.onClose, box)
  return (
    <div className="fixed inset-0 z-[60] lg:hidden" data-testid="assistant-sheet">
      <button type="button" aria-label={zh ? '关闭' : 'Close'} tabIndex={-1} className="absolute inset-0 bg-black/35" onClick={props.onClose} />
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-label={zh ? `AI 助理 · ${props.agentName}` : `AI Agent · ${props.agentName}`}
        className="absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col overflow-hidden rounded-t-2xl bg-white pt-2 shadow-2xl sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[460px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:pt-3"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div aria-hidden className="mx-auto mb-2 h-1 w-9 flex-none rounded-full bg-line-strong sm:hidden" />
        <div className="flex min-h-0 flex-1 flex-col">
          <AssistantPanel {...props} variant="sheet" visible />
        </div>
      </div>
    </div>
  )
}
