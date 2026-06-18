'use client'

import { useT } from '@/lib/i18n'
import type { AgentRole, AgentStatus } from '@/lib/agent/types'

const STATUS_LABEL: Record<AgentStatus, { zh: string; en: string }> = {
  idle: { zh: 'IDLE · 待命', en: 'IDLE · STANDING BY' },
  understanding: { zh: 'UNDERSTANDING · 理解中', en: 'UNDERSTANDING' },
  working: { zh: 'WORKING · 处理中', en: 'WORKING' },
  result: { zh: 'ACTIVE · LISTENING', en: 'ACTIVE · LISTENING' },
  approval: { zh: 'APPROVAL · 等你确认', en: 'APPROVAL · AWAITING YOU' },
}

const ROLE_ORB: Record<AgentRole, { cls: string; color: string }> = {
  tenant: { cls: 'tenant', color: '#7C3AED' },
  landlord: { cls: 'landlord', color: '#047857' },
  agent: { cls: 'agent', color: '#2563EB' },
}

export default function AgentHeroStatus({
  role,
  agentName,
  status,
  title,
  nextAction,
}: {
  role: AgentRole
  agentName: string
  status: AgentStatus
  title: React.ReactNode
  nextAction: string
}) {
  const { lang } = useT()
  const orb = ROLE_ORB[role]
  const busy = status === 'understanding' || status === 'working'
  return (
    <div>
      <div className="mb-7 flex items-center gap-4">
        <span
          className={`orb ${orb.cls} ${busy ? 'pulse' : ''} h-14 w-14`}
          style={{ color: orb.color }}
        />
        <div>
          <div className="text-[28px] font-bold leading-tight tracking-tight">{agentName}</div>
          <div className="mt-1 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-eyebrow text-body-3">
            <span
              className={
                'h-1.5 w-1.5 rounded-full ' +
                (status === 'approval'
                  ? 'bg-warning'
                  : busy
                    ? 'animate-live-blink bg-tenant'
                    : 'live-dot bg-brand-bright')
              }
              style={{ background: status === 'approval' ? '#D97706' : undefined }}
            />
            {STATUS_LABEL[status][lang]}
          </div>
        </div>
      </div>

      <h1 className="text-[32px] font-bold leading-tight tracking-tight sm:text-[36px]">{title}</h1>
      <p className="mt-3 max-w-[640px] text-[15px] leading-relaxed text-body-2">{nextAction}</p>
    </div>
  )
}
