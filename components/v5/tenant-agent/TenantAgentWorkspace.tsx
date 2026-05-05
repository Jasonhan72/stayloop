'use client'
// -----------------------------------------------------------------------------
// V5 — Tenant Agent Workspace ("Luna")
// -----------------------------------------------------------------------------
// Renders the personal command center for the tenant agent. Composed of
// seven blocks mandated by the V5 spec:
//
//   1. AgentStatusHeader      — agent identity + live status
//   2. WorkflowState          — orchestrated rental stages (completed / current / upcoming)
//   3. PendingActions         — approval-gated actions, visually distinct
//   4. PrivateMemorySummary   — what Luna remembers about the tenant; clearly marked private
//   5. RecommendationDeck     — non-blocking nudges
//   6. AgentInputBar          — bottom-anchored input where the user talks to Luna
//   7. AuditTrustNote         — assurance that approval decisions are logged
//
// Visual language reuses the existing V4 brand tokens (lib/brand v3) so the
// page sits naturally inside PageShell. We do NOT introduce a new design system.
//
// All approve / reject interactions are LOCAL to this component — they POST
// to /api/agent/approvals (which currently returns mock success) and update
// component state. No real action ever fires from this prototype.
// -----------------------------------------------------------------------------

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { v3 } from '@/lib/brand'
import type {
  TenantAgentSession,
  PendingAction,
  PendingActionStatus,
  WorkflowStage,
  PrivateMemoryItem,
  AgentRecommendation,
  AgentStatus,
  ActionSensitivity,
} from '@/lib/v5/agent-types'

interface Props {
  session: TenantAgentSession
  /** UI language. Defaults to 'en' to match the rest of V4. */
  lang?: 'en' | 'zh'
}

export default function TenantAgentWorkspace({ session, lang = 'en' }: Props) {
  const isZh = lang === 'zh'

  // Approval flow lives entirely in component state for the prototype.
  // The initial map is keyed by action_id so we can update one without
  // touching the others.
  const [actionStates, setActionStates] = useState<Record<string, PendingActionStatus>>(
    () =>
      Object.fromEntries(
        session.pending_actions.map(a => [a.id, a.status]),
      ),
  )
  const [pendingDecision, setPendingDecision] = useState<string | null>(null)

  // Local input bar state — submitting only appends a transient "Working…"
  // notice. Wiring to the real agent runtime is out of scope for this PR.
  const [draft, setDraft] = useState('')
  const [thinking, setThinking] = useState<string | null>(null)

  const overallStatus: AgentStatus = useMemo(() => {
    const hasPending = Object.values(actionStates).some(s => s === 'pending')
    if (hasPending) return 'waiting_approval'
    return session.status === 'waiting_approval' ? 'active' : session.status
  }, [actionStates, session.status])

  async function handleDecision(action: PendingAction, decision: 'approve' | 'reject') {
    if (pendingDecision) return
    setPendingDecision(action.id)
    // Optimistic update — flip immediately so the UI feels responsive.
    setActionStates(prev => ({
      ...prev,
      [action.id]: decision === 'approve' ? 'approved' : 'rejected',
    }))
    try {
      await fetch('/api/agent/approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action_id: action.id, decision }),
      })
    } catch {
      // The prototype's API never errors, but if a future deploy does we
      // surface nothing to the user — the local state already reflects the
      // intent. A real impl will reconcile here.
    } finally {
      setPendingDecision(null)
    }
  }

  function handleAsk() {
    const text = draft.trim()
    if (!text) return
    setDraft('')
    setThinking(text)
    // Mock-only acknowledgement that fades after a short window.
    window.setTimeout(() => setThinking(null), 1800)
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 22,
        maxWidth: 1080,
        margin: '0 auto',
        padding: '4px 4px 32px',
      }}
    >
      <AgentStatusHeader
        session={session}
        overallStatus={overallStatus}
        isZh={isZh}
      />
      <WorkflowStateBlock stages={session.workflow_stages} isZh={isZh} />
      <PendingActionsBlock
        actions={session.pending_actions}
        states={actionStates}
        decisionPending={pendingDecision}
        onDecision={handleDecision}
        isZh={isZh}
      />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 22,
        }}
      >
        <PrivateMemoryBlock items={session.private_memory} isZh={isZh} />
        <RecommendationDeck items={session.recommendations} isZh={isZh} />
      </div>
      <AgentInputBar
        agentName={session.agent_name}
        draft={draft}
        setDraft={setDraft}
        onSubmit={handleAsk}
        thinking={thinking}
        isZh={isZh}
      />
      <AuditTrustNote message={isZh ? session.audit_note.message_zh : session.audit_note.message_en} />
    </div>
  )
}

// ─── 1. Agent status header ────────────────────────────────────────────────
function AgentStatusHeader({
  session,
  overallStatus,
  isZh,
}: {
  session: TenantAgentSession
  overallStatus: AgentStatus
  isZh: boolean
}) {
  const pillTone = STATUS_PILL[overallStatus]
  return (
    <header
      style={{
        background: v3.surfaceCard,
        border: `1px solid ${v3.border}`,
        borderRadius: 16,
        padding: '20px 22px',
        boxShadow: '0 1px 3px rgba(31,25,11,0.04), 0 12px 32px -8px rgba(31,25,11,0.06)',
        display: 'flex',
        gap: 18,
        alignItems: 'center',
        flexWrap: 'wrap',
      }}
    >
      <div
        aria-hidden
        style={{
          width: 48,
          height: 48,
          borderRadius: 14,
          background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 50%, #A855F7 100%)',
          color: '#fff',
          fontFamily: 'JetBrains Mono, monospace',
          fontWeight: 700,
          fontSize: 22,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          boxShadow: '0 6px 18px rgba(76, 29, 149, 0.22)',
        }}
      >
        ✦
      </div>
      <div style={{ flex: 1, minWidth: 240 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: v3.textPrimary,
              margin: 0,
              letterSpacing: '-0.01em',
            }}
          >
            {session.agent_name}
          </h1>
          <span
            style={{
              fontSize: 11,
              fontFamily: 'JetBrains Mono, monospace',
              letterSpacing: '0.10em',
              textTransform: 'uppercase',
              color: v3.textMuted,
              fontWeight: 700,
            }}
          >
            {isZh ? session.agent_role_label_zh : session.agent_role_label_en}
          </span>
          <span
            role="status"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 10px',
              borderRadius: 999,
              background: pillTone.bg,
              color: pillTone.fg,
              border: `1px solid ${pillTone.border}`,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.02em',
            }}
          >
            <span
              aria-hidden
              style={{
                width: 6,
                height: 6,
                borderRadius: 999,
                background: pillTone.fg,
              }}
            />
            {STATUS_LABEL[overallStatus][isZh ? 'zh' : 'en']}
          </span>
        </div>
        <p
          style={{
            margin: '6px 0 0',
            fontSize: 13.5,
            color: v3.textSecondary,
            lineHeight: 1.5,
            maxWidth: 720,
          }}
        >
          {isZh ? session.status_message_zh : session.status_message_en}
        </p>
      </div>
    </header>
  )
}

const STATUS_PILL: Record<AgentStatus, { bg: string; fg: string; border: string }> = {
  active: { bg: '#DCFCE7', fg: '#15803D', border: 'rgba(21, 128, 61, 0.22)' },
  understanding: { bg: '#E0F2FE', fg: '#0369A1', border: 'rgba(3, 105, 161, 0.22)' },
  working: { bg: '#FEF3C7', fg: '#92400E', border: 'rgba(146, 64, 14, 0.22)' },
  waiting_approval: { bg: '#F3E8FF', fg: '#6B21A8', border: 'rgba(107, 33, 168, 0.22)' },
  blocked: { bg: '#FEE2E2', fg: '#B91C1C', border: 'rgba(185, 28, 28, 0.22)' },
}

const STATUS_LABEL: Record<AgentStatus, { en: string; zh: string }> = {
  active: { en: 'Active', zh: '在线' },
  understanding: { en: 'Understanding', zh: '理解中' },
  working: { en: 'Working', zh: '工作中' },
  waiting_approval: { en: 'Waiting for approval', zh: '等待你确认' },
  blocked: { en: 'Blocked', zh: '已暂停' },
}

// ─── 2. Workflow state ─────────────────────────────────────────────────────
function WorkflowStateBlock({ stages, isZh }: { stages: WorkflowStage[]; isZh: boolean }) {
  return (
    <section style={cardStyle}>
      <SectionTitle
        eyebrow={isZh ? '工作流' : 'Workflow'}
        title={isZh ? '租房流程当前阶段' : 'Where you are in the rental process'}
        hint={isZh
          ? 'Stayloop 系统按阶段推进，Luna 在每个阶段为你出力。'
          : 'Stayloop orchestrates each stage. Luna helps you ship the work inside it.'}
      />
      <ol
        style={{
          listStyle: 'none',
          padding: 0,
          margin: '14px 0 0',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 12,
        }}
      >
        {stages.map((s, idx) => {
          const tone = STAGE_TONE[s.status]
          return (
            <li
              key={s.id}
              style={{
                background: tone.bg,
                border: `1px solid ${tone.border}`,
                borderRadius: 12,
                padding: '12px 14px',
                position: 'relative',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  aria-hidden
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 999,
                    background: tone.dot,
                    color: '#fff',
                    fontFamily: 'JetBrains Mono, monospace',
                    fontWeight: 700,
                    fontSize: 11,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {s.status === 'completed' ? '✓' : idx + 1}
                </span>
                <span
                  style={{
                    fontSize: 10.5,
                    fontFamily: 'JetBrains Mono, monospace',
                    letterSpacing: '0.10em',
                    textTransform: 'uppercase',
                    color: tone.label,
                    fontWeight: 700,
                  }}
                >
                  {STAGE_STATUS_LABEL[s.status][isZh ? 'zh' : 'en']}
                </span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: v3.textPrimary, marginTop: 6 }}>
                {isZh ? s.label_zh : s.label_en}
              </div>
              <div style={{ fontSize: 12.5, color: v3.textSecondary, marginTop: 4, lineHeight: 1.45 }}>
                {isZh ? s.description_zh : s.description_en}
              </div>
              {(s.hint_en || s.hint_zh) && (
                <div
                  style={{
                    fontSize: 11,
                    color: v3.textMuted,
                    marginTop: 8,
                    fontFamily: 'JetBrains Mono, monospace',
                  }}
                >
                  {isZh ? s.hint_zh : s.hint_en}
                </div>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}

const STAGE_TONE: Record<
  WorkflowStage['status'],
  { bg: string; border: string; dot: string; label: string }
> = {
  completed: { bg: '#F0FDF4', border: 'rgba(21, 128, 61, 0.18)', dot: '#15803D', label: '#15803D' },
  current: { bg: '#F5F3FF', border: 'rgba(124, 58, 237, 0.30)', dot: '#7C3AED', label: '#6B21A8' },
  upcoming: { bg: v3.surfaceCard, border: v3.border, dot: '#94A3B8', label: v3.textMuted },
}

const STAGE_STATUS_LABEL: Record<WorkflowStage['status'], { en: string; zh: string }> = {
  completed: { en: 'Completed', zh: '已完成' },
  current: { en: 'In progress', zh: '进行中' },
  upcoming: { en: 'Upcoming', zh: '即将开始' },
}

// ─── 3. Pending actions (approval-gated) ───────────────────────────────────
function PendingActionsBlock({
  actions,
  states,
  decisionPending,
  onDecision,
  isZh,
}: {
  actions: PendingAction[]
  states: Record<string, PendingActionStatus>
  decisionPending: string | null
  onDecision: (action: PendingAction, decision: 'approve' | 'reject') => void
  isZh: boolean
}) {
  const pendingCount = actions.filter(a => states[a.id] === 'pending').length
  return (
    <section
      style={{
        ...cardStyle,
        // Approval-gated actions get a stronger visual treatment so they
        // never get lost amongst recommendations.
        borderLeft: `4px solid ${v3.brand}`,
      }}
    >
      <SectionTitle
        eyebrow={isZh ? '需要你确认' : 'Needs your approval'}
        title={isZh ? `等待批准的操作 (${pendingCount})` : `Pending approvals (${pendingCount})`}
        hint={isZh
          ? '这些是 Luna 准备好但需要你点头才能执行的操作。每一项都会留底。'
          : 'Luna prepared these. Each one needs your explicit go-ahead before anything is sent or shared.'}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
        {actions.map(a => (
          <PendingActionCard
            key={a.id}
            action={a}
            status={states[a.id]}
            disabled={decisionPending !== null}
            decisionInFlight={decisionPending === a.id}
            onDecision={onDecision}
            isZh={isZh}
          />
        ))}
        {pendingCount === 0 && (
          <div
            style={{
              fontSize: 12.5,
              color: v3.textMuted,
              padding: '10px 12px',
              fontStyle: 'italic',
            }}
          >
            {isZh ? '当前没有待批准的操作。' : 'No actions waiting for your approval right now.'}
          </div>
        )}
      </div>
    </section>
  )
}

function PendingActionCard({
  action,
  status,
  disabled,
  decisionInFlight,
  onDecision,
  isZh,
}: {
  action: PendingAction
  status: PendingActionStatus
  disabled: boolean
  decisionInFlight: boolean
  onDecision: (action: PendingAction, decision: 'approve' | 'reject') => void
  isZh: boolean
}) {
  const sens = SENSITIVITY_TONE[action.sensitivity]
  const isPending = status === 'pending'
  const isApproved = status === 'approved'
  const isRejected = status === 'rejected'
  return (
    <article
      style={{
        background: v3.surfaceCard,
        border: `1px solid ${isPending ? sens.border : v3.border}`,
        borderRadius: 12,
        padding: '14px 16px',
        opacity: isPending ? 1 : 0.78,
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <span
          style={{
            fontSize: 10.5,
            fontFamily: 'JetBrains Mono, monospace',
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
            color: sens.fg,
            background: sens.bg,
            border: `1px solid ${sens.border}`,
            padding: '2px 8px',
            borderRadius: 999,
            fontWeight: 700,
          }}
        >
          {SENSITIVITY_LABEL[action.sensitivity][isZh ? 'zh' : 'en']}
        </span>
        {!isPending && (
          <span
            style={{
              fontSize: 10.5,
              fontFamily: 'JetBrains Mono, monospace',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: isApproved ? '#15803D' : '#B91C1C',
              fontWeight: 700,
            }}
          >
            {isApproved
              ? (isZh ? '已批准' : 'Approved')
              : isRejected
                ? (isZh ? '已驳回' : 'Rejected')
                : status}
          </span>
        )}
      </div>
      <h3 style={{ fontSize: 15, fontWeight: 700, color: v3.textPrimary, margin: '8px 0 4px' }}>
        {isZh ? action.title_zh : action.title_en}
      </h3>
      <p style={{ fontSize: 13, color: v3.textSecondary, margin: 0, lineHeight: 1.55 }}>
        {isZh ? action.description_zh : action.description_en}
      </p>
      <div
        style={{
          marginTop: 10,
          padding: '10px 12px',
          background: '#FAF7EE',
          border: `1px dashed ${v3.borderStrong}`,
          borderRadius: 8,
          fontSize: 12.5,
          color: v3.textSecondary,
          lineHeight: 1.5,
        }}
      >
        <span
          style={{
            display: 'block',
            fontSize: 10.5,
            fontFamily: 'JetBrains Mono, monospace',
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
            color: v3.textMuted,
            fontWeight: 700,
            marginBottom: 4,
          }}
        >
          {isZh ? '为什么需要你确认' : 'Why approval is required'}
        </span>
        {isZh ? action.reason_zh : action.reason_en}
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => onDecision(action, 'approve')}
          disabled={!isPending || disabled}
          style={{
            padding: '8px 16px',
            background: isPending ? v3.brand : v3.surfaceMuted,
            color: isPending ? '#fff' : v3.textMuted,
            border: `1px solid ${isPending ? v3.brand : v3.border}`,
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            cursor: isPending && !disabled ? 'pointer' : 'default',
            opacity: decisionInFlight ? 0.7 : 1,
          }}
        >
          {isApproved
            ? (isZh ? '✓ 已批准' : '✓ Approved')
            : isZh ? '批准' : 'Approve'}
        </button>
        <button
          type="button"
          onClick={() => onDecision(action, 'reject')}
          disabled={!isPending || disabled}
          style={{
            padding: '8px 16px',
            background: v3.surfaceCard,
            color: isPending ? v3.textPrimary : v3.textMuted,
            border: `1px solid ${v3.borderStrong}`,
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            cursor: isPending && !disabled ? 'pointer' : 'default',
          }}
        >
          {isRejected
            ? (isZh ? '已驳回' : 'Rejected')
            : isZh ? '驳回' : 'Reject'}
        </button>
      </div>
    </article>
  )
}

const SENSITIVITY_TONE: Record<
  ActionSensitivity,
  { fg: string; bg: string; border: string }
> = {
  low: { fg: '#0369A1', bg: '#E0F2FE', border: 'rgba(3, 105, 161, 0.30)' },
  medium: { fg: '#92400E', bg: '#FEF3C7', border: 'rgba(146, 64, 14, 0.30)' },
  high: { fg: '#B91C1C', bg: '#FEE2E2', border: 'rgba(185, 28, 28, 0.32)' },
}

const SENSITIVITY_LABEL: Record<ActionSensitivity, { en: string; zh: string }> = {
  low: { en: 'Routine', zh: '常规' },
  medium: { en: 'Send on your behalf', zh: '代你发送' },
  high: { en: 'Sensitive', zh: '敏感操作' },
}

// ─── 4. Private memory summary ─────────────────────────────────────────────
function PrivateMemoryBlock({ items, isZh }: { items: PrivateMemoryItem[]; isZh: boolean }) {
  return (
    <section style={cardStyle}>
      <SectionTitle
        eyebrow={isZh ? '私人记忆' : 'Private memory'}
        title={isZh ? 'Luna 用来个性化的内容' : 'What Luna remembers about you'}
        hint={isZh
          ? '这些是私人记忆，仅在你批准后才会用于对外操作。'
          : 'Private to you. Nothing here leaves Stayloop without your explicit approval.'}
      />
      <div
        style={{
          marginTop: 14,
          background: '#F8F5EC',
          border: `1px dashed ${v3.borderStrong}`,
          borderRadius: 10,
          padding: '4px 0',
        }}
      >
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {items.map((m, i) => (
            <li
              key={m.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '120px 1fr auto',
                gap: 12,
                padding: '10px 14px',
                borderTop: i === 0 ? 'none' : `1px solid ${v3.divider}`,
                alignItems: 'baseline',
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontFamily: 'JetBrains Mono, monospace',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: v3.textMuted,
                  fontWeight: 700,
                }}
              >
                {isZh ? m.label_zh : m.label_en}
              </span>
              <span style={{ fontSize: 13, color: v3.textPrimary, lineHeight: 1.5 }}>
                {Array.isArray(m.value) ? m.value.join(' · ') : m.value}
              </span>
              <span
                title={m.user_confirmed
                  ? (isZh ? '由你确认' : 'Confirmed by you')
                  : (isZh ? '由 Luna 推断' : 'Inferred by Luna')}
                style={{
                  fontSize: 10,
                  fontFamily: 'JetBrains Mono, monospace',
                  color: m.user_confirmed ? '#15803D' : v3.textMuted,
                  letterSpacing: '0.05em',
                }}
              >
                {m.user_confirmed ? '● ' + (isZh ? '已确认' : 'confirmed') : '○ ' + (isZh ? '推断' : 'inferred')}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

// ─── 5. Recommendation deck ────────────────────────────────────────────────
function RecommendationDeck({ items, isZh }: { items: AgentRecommendation[]; isZh: boolean }) {
  return (
    <section style={cardStyle}>
      <SectionTitle
        eyebrow={isZh ? '建议' : 'Suggestions'}
        title={isZh ? 'Luna 的建议（非强制）' : 'Luna recommends (optional)'}
        hint={isZh
          ? '这些是非强制的建议，跟需要批准的操作分开。'
          : 'Take them or leave them. These are nudges, not approvals.'}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
        {items.map(r => (
          <article
            key={r.id}
            style={{
              border: `1px solid ${v3.border}`,
              borderRadius: 10,
              padding: '12px 14px',
              background: v3.surfaceCard,
            }}
          >
            <div
              style={{
                fontSize: 10.5,
                fontFamily: 'JetBrains Mono, monospace',
                letterSpacing: '0.10em',
                textTransform: 'uppercase',
                color: v3.textMuted,
                fontWeight: 700,
                marginBottom: 4,
              }}
            >
              {RECOMMENDATION_LABEL[r.kind][isZh ? 'zh' : 'en']}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: v3.textPrimary }}>
              {isZh ? r.title_zh : r.title_en}
            </div>
            <p style={{ fontSize: 12.5, color: v3.textSecondary, margin: '4px 0 0', lineHeight: 1.5 }}>
              {isZh ? r.rationale_zh : r.rationale_en}
            </p>
            {r.cta_href && (
              <Link
                href={r.cta_href}
                style={{
                  display: 'inline-block',
                  marginTop: 8,
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: v3.brand,
                  textDecoration: 'none',
                }}
              >
                {(isZh ? r.cta_label_zh : r.cta_label_en) || (isZh ? '查看 →' : 'Open →')}
              </Link>
            )}
          </article>
        ))}
      </div>
    </section>
  )
}

const RECOMMENDATION_LABEL: Record<AgentRecommendation['kind'], { en: string; zh: string }> = {
  improvement: { en: 'Strengthen application', zh: '加强申请' },
  comparison: { en: 'Compare options', zh: '横向对比' },
  reminder: { en: 'Reminder', zh: '提醒' },
}

// ─── 6. Agent input bar ────────────────────────────────────────────────────
function AgentInputBar({
  agentName,
  draft,
  setDraft,
  onSubmit,
  thinking,
  isZh,
}: {
  agentName: string
  draft: string
  setDraft: (v: string) => void
  onSubmit: () => void
  thinking: string | null
  isZh: boolean
}) {
  return (
    <section
      style={{
        background: v3.surfaceCard,
        border: `1px solid ${v3.border}`,
        borderRadius: 14,
        padding: '14px 16px',
        boxShadow: '0 8px 24px -16px rgba(15, 23, 42, 0.18)',
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          fontFamily: 'JetBrains Mono, monospace',
          letterSpacing: '0.10em',
          textTransform: 'uppercase',
          color: v3.textMuted,
          fontWeight: 700,
          marginBottom: 6,
        }}
      >
        {isZh ? `跟 ${agentName} 对话` : `Talk to ${agentName}`}
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onSubmit()
          }}
          rows={2}
          placeholder={
            isZh
              ? '让 Luna 找房源、准备申请、解读租约条款……'
              : 'Ask Luna to find listings, prepare your application, or explain a lease term...'
          }
          style={{
            flex: 1,
            resize: 'vertical',
            minHeight: 44,
            border: `1px solid ${v3.border}`,
            borderRadius: 10,
            padding: '10px 12px',
            fontSize: 13.5,
            fontFamily: 'inherit',
            color: v3.textPrimary,
            background: '#FFFFFF',
            outline: 'none',
          }}
        />
        <button
          type="button"
          onClick={onSubmit}
          disabled={!draft.trim()}
          style={{
            padding: '10px 18px',
            background: draft.trim() ? v3.brand : v3.surfaceMuted,
            color: draft.trim() ? '#fff' : v3.textMuted,
            border: `1px solid ${draft.trim() ? v3.brand : v3.border}`,
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            cursor: draft.trim() ? 'pointer' : 'default',
            whiteSpace: 'nowrap',
          }}
        >
          {isZh ? '发送' : 'Send'}
        </button>
      </div>
      {thinking && (
        <div
          aria-live="polite"
          style={{
            marginTop: 10,
            fontSize: 12,
            color: v3.textMuted,
            fontFamily: 'JetBrains Mono, monospace',
          }}
        >
          {isZh
            ? `${agentName} 正在思考你的请求…（"${truncate(thinking, 64)}"）`
            : `${agentName} is thinking about your request… ("${truncate(thinking, 64)}")`}
        </div>
      )}
    </section>
  )
}

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}

// ─── 7. Audit / trust note ─────────────────────────────────────────────────
function AuditTrustNote({ message }: { message: string }) {
  return (
    <footer
      style={{
        fontSize: 12,
        color: v3.textMuted,
        textAlign: 'center',
        lineHeight: 1.55,
        padding: '0 16px',
        maxWidth: 760,
        margin: '0 auto',
      }}
    >
      <span
        aria-hidden
        style={{
          display: 'inline-block',
          marginRight: 6,
          fontFamily: 'JetBrains Mono, monospace',
          color: v3.brand,
        }}
      >
        ◆
      </span>
      {message}
    </footer>
  )
}

// ─── Shared bits ───────────────────────────────────────────────────────────
const cardStyle: React.CSSProperties = {
  background: v3.surfaceCard,
  border: `1px solid ${v3.border}`,
  borderRadius: 16,
  padding: '20px 22px',
  boxShadow: '0 1px 3px rgba(31,25,11,0.04), 0 12px 32px -8px rgba(31,25,11,0.06)',
}

function SectionTitle({
  eyebrow,
  title,
  hint,
}: {
  eyebrow: string
  title: string
  hint?: string
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 10.5,
          fontFamily: 'JetBrains Mono, monospace',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: v3.brand,
          fontWeight: 700,
        }}
      >
        {eyebrow}
      </div>
      <h2 style={{ fontSize: 17, fontWeight: 700, color: v3.textPrimary, margin: '4px 0 0' }}>
        {title}
      </h2>
      {hint && (
        <p style={{ fontSize: 12.5, color: v3.textMuted, margin: '4px 0 0', lineHeight: 1.5 }}>
          {hint}
        </p>
      )}
    </div>
  )
}
