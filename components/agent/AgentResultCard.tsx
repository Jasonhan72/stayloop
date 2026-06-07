'use client'

import type { AgentResult } from '@/lib/agent/types'

const KIND: Record<AgentResult['kind'], { label: string; cls: string }> = {
  summary: { label: 'SUMMARY', cls: 'text-brand' },
  recommendation: { label: 'RECOMMENDATION', cls: 'text-tenant' },
  warning: { label: 'WARNING', cls: 'text-warning' },
  approval_prompt: { label: 'APPROVAL', cls: 'text-warning' },
}

export default function AgentResultCard({ result }: { result?: AgentResult }) {
  if (!result) return null
  const k = KIND[result.kind] ?? KIND.summary
  return (
    <div className="sl-card p-6">
      <div className={'font-mono text-[10px] font-bold uppercase tracking-eyebrowLg ' + k.cls}>
        {k.label}
      </div>
      <h3 className="mt-2 text-[18px] font-bold tracking-tight">{result.title}</h3>
      <p className="mt-2 text-[14px] leading-relaxed text-body-2">{result.body}</p>
    </div>
  )
}
