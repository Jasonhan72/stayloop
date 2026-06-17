'use client'

// Claude-style conversation panel for a Personal Agent workspace: a scrolling
// message thread (user ↔ agent bubbles) with the input pinned at the bottom.
import { useEffect, useRef } from 'react'
import AgentInputBar from './AgentInputBar'
import ListingChatCard from './ListingChatCard'
import type { AgentRole, AgentStatus, ChatAttachment, ChatMessage } from '@/lib/agent/types'

const ACCENT: Record<AgentRole, string> = {
  tenant: '#7C3AED',
  landlord: '#047857',
  agent: '#2563EB',
}
const ORB: Record<AgentRole, string> = {
  tenant: 'linear-gradient(135deg,#C4B5FD,#7C3AED)',
  landlord: 'linear-gradient(135deg,#6EE7B7,#047857)',
  agent: 'linear-gradient(135deg,#93C5FD,#2563EB)',
}

export default function AgentChat({
  role,
  agentName,
  status,
  messages,
  onSend,
}: {
  role: AgentRole
  agentName: string
  status: AgentStatus
  messages: ChatMessage[]
  onSend: (message: string, attachments?: ChatAttachment[]) => void | Promise<void>
}) {
  const accent = ACCENT[role]
  const endRef = useRef<HTMLDivElement>(null)
  const thinking = status === 'understanding' || status === 'working'

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length, thinking])

  return (
    <div className="flex h-[70vh] flex-col overflow-hidden rounded-2xl border border-line-divider bg-white shadow-sm lg:h-full">
      {/* header */}
      <div className="flex items-center gap-3 border-b border-line-divider px-5 py-3.5">
        <span className="h-9 w-9 flex-none rounded-full" style={{ background: ORB[role] }} />
        <div>
          <div className="text-[15px] font-bold tracking-tight">{agentName}</div>
          <div className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-eyebrow text-body-3">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: '#34D399' }} /> 在线 · 读取你的记忆
          </div>
        </div>
      </div>

      {/* thread */}
      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
        {messages.map((m) => (
          <div key={m.id} className={'flex ' + (m.role === 'user' ? 'justify-end' : 'justify-start')}>
            {m.role === 'agent' && (
              <span className="mr-2 mt-0.5 h-7 w-7 flex-none rounded-full" style={{ background: ORB[role] }} />
            )}
            <div
              className={
                'flex min-w-0 flex-col gap-2 ' +
                (m.role === 'user' ? 'max-w-[82%] items-end' : m.listings?.length ? 'max-w-full flex-1' : 'max-w-[92%]')
              }
            >
              <div
                className={
                  'whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed ' +
                  (m.role === 'user' ? 'rounded-tr-sm text-white' : 'rounded-tl-sm bg-surface-chip text-body')
                }
                style={m.role === 'user' ? { background: accent } : undefined}
              >
                {m.text}
              </div>
              {m.role === 'user' && m.attachments && m.attachments.length > 0 && (
                <div className="flex flex-wrap justify-end gap-2">
                  {m.attachments.map((a, i) =>
                    a.isImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={i} src={a.dataUrl} alt={a.name} className="h-24 w-24 rounded-lg border border-line-divider object-cover" />
                    ) : (
                      <span key={i} className="flex items-center gap-1.5 rounded-lg border border-line-divider bg-surface-chip px-2.5 py-1.5 text-[12px] text-body-2">
                        📄 {a.name}
                      </span>
                    )
                  )}
                </div>
              )}
              {m.role === 'agent' && m.listings && m.listings.length > 0 && (
                <div className="w-full">
                  {m.listingsSource && (
                    <div className="mb-1.5 font-mono text-[10.5px] uppercase tracking-eyebrow text-body-3">
                      {m.listingsSource === 'stayloop'
                        ? `STAYLOOP 房源 · ${m.listings.length} 套`
                        : `外部 · REALTOR.CA · ${m.listings.length} 套 · 未经 Stayloop 验证`}
                    </div>
                  )}
                  <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
                    {m.listings.map((l) => (
                      <div key={l.id} className="w-[280px] flex-none snap-start">
                        <ListingChatCard l={l} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
        {thinking && (
          <div className="flex justify-start">
            <span className="mr-2 mt-0.5 h-7 w-7 flex-none rounded-full" style={{ background: ORB[role] }} />
            <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm bg-surface-chip px-4 py-3.5">
              <Dot delay="0s" />
              <Dot delay="0.15s" />
              <Dot delay="0.3s" />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* input */}
      <div className="border-t border-line-divider p-3">
        <AgentInputBar agentName={agentName} onSend={onSend} disabled={thinking} />
      </div>
    </div>
  )
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 animate-bounce rounded-full"
      style={{ background: '#A1A1AA', animationDelay: delay }}
    />
  )
}
