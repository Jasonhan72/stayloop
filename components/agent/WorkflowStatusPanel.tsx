'use client'

import type { AgentRole, WorkflowState } from '@/lib/agent/types'
import { WORKFLOW_STAGES, stageIndex } from '@/lib/agent/orchestrator'

export default function WorkflowStatusPanel({
  role,
  workflow,
}: {
  role: AgentRole
  workflow: WorkflowState
}) {
  const stages = WORKFLOW_STAGES[role]
  const curIdx = stageIndex(role, workflow.current_stage)

  return (
    <div className="sl-card p-6">
      <div className="mb-4 font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
        当前进度
      </div>
      {stages.map((s, i) => {
        const done = i < curIdx || workflow.completed_steps.includes(s.key)
        const now = i === curIdx
        const state: 'done' | 'now' | 'next' = done ? 'done' : now ? 'now' : 'next'
        return <Row key={s.key} state={state} label={s.label} />
      })}
    </div>
  )
}

function Row({ state, label }: { state: 'done' | 'now' | 'next'; label: string }) {
  return (
    <div className="grid grid-cols-[24px_1fr_auto] items-center gap-3 border-t border-dashed border-line-divider py-3 first:border-0 first:pt-0">
      <span
        className={
          'flex h-[22px] w-[22px] items-center justify-center rounded-full text-[12px] font-bold ' +
          (state === 'done'
            ? 'bg-brand/15 text-success'
            : state === 'now'
              ? 'bg-brand text-white shadow-[0_0_0_4px_rgba(4,120,87,0.15)]'
              : 'bg-line-divider text-body-4')
        }
      >
        {state === 'done' ? '✓' : state === 'now' ? '·' : ''}
      </span>
      <div className={'text-[14px] font-semibold ' + (state === 'now' ? 'text-brand' : 'text-body')}>
        {label}
      </div>
      <span className="font-mono text-[11px] text-body-3">
        {state === 'done' ? 'DONE' : state === 'now' ? 'NOW' : 'NEXT'}
      </span>
    </div>
  )
}
