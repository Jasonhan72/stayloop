// The assistant's one-line status ("正在：…", "等你点头：N 件", "空闲 · 当前阶段 …").
// Shared by the chat header (phones) and the assistant panel (web, Muse
// benchmark 2026-09-25) so both never disagree.
import type { AgentStatus } from './types'

export function assistantStatusLine(i: {
  status: AgentStatus
  pendingCount: number
  /** false on the homepage hero (no approvals wired) → the generic "online" line */
  hasApprovals: boolean
  stageLabel: string
  memoryCount: number
  zh: boolean
}): string {
  const { status, pendingCount, hasApprovals, stageLabel, memoryCount, zh } = i
  if (status === 'understanding') return zh ? '正在读你的消息…' : 'Reading your message…'
  if (status === 'working') return zh ? `正在：${stageLabel || '处理你的请求'}` : `Working on: ${stageLabel || 'your request'}`
  if (pendingCount) return zh ? `等你点头：${pendingCount} 件` : `Waiting on you: ${pendingCount}`
  if (!hasApprovals) return zh ? '在线 · 读取你的记忆' : 'ONLINE · READING YOUR MEMORY'
  return zh
    ? `空闲${stageLabel ? ` · 当前阶段 ${stageLabel}` : ''}${memoryCount ? ` · 记得 ${memoryCount} 条` : ''}`
    : `Idle${stageLabel ? ` · stage: ${stageLabel}` : ''}${memoryCount ? ` · ${memoryCount} memories` : ''}`
}
