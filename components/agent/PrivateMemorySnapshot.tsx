'use client'

import type { MemoryItem } from '@/lib/agent/types'
import { formatMemoryValue } from '@/lib/agent/memory'

export default function PrivateMemorySnapshot({
  agentName,
  memories,
}: {
  agentName: string
  memories: MemoryItem[]
}) {
  return (
    <div>
      <h4 className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
        {agentName} 记得 · 关于你
      </h4>
      <div className="mt-3 divide-y divide-dashed divide-line-divider">
        {memories.length === 0 && (
          <p className="py-2 text-[12.5px] text-body-3">还没有记忆 —— 告诉 {agentName} 你的偏好。</p>
        )}
        {memories.map((m) => (
          <div key={m.key} className="grid grid-cols-[52px_1fr] items-baseline gap-3 py-2">
            <span className="font-mono text-[10px] font-bold text-brand">{m.label}</span>
            <span className="text-[12.5px] leading-snug text-body">{formatMemoryValue(m)}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 font-mono text-[10px] leading-relaxed text-body-4">
        仅你可见 · RLS 锁定到你的账户 · 绝不外泄
      </p>
    </div>
  )
}
