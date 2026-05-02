'use client'
export const runtime = 'edge'

// -----------------------------------------------------------------------------
// /disputes/[id] — Mediator-driven dispute resolution detail page
// -----------------------------------------------------------------------------
// Two-pane layout: left = dispute info + 14-day RTA clock, right = Mediator chat.
// Pre-populates chat with system message. Streams from /api/agent/chat with
// agent_kind='mediator'. Uses the same composer pattern as /listings/new.
// V3 section 17 — dispute resolution.
// -----------------------------------------------------------------------------

import { useEffect, useRef, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { v3, size } from '@/lib/brand'
import { useT } from '@/lib/i18n'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/lib/useUser'
import PageShell from '@/components/v4/PageShell'
import SecHead from '@/components/v4/SecHead'

interface ChatLine {
  id: string
  role: 'user' | 'assistant'
  text: string
  toolCalls?: Array<{ name: string; status?: string }>
}

interface Dispute {
  id: string
  case_number: string
  title: string
  category: string
  status: 'open' | 'mediating' | 'settled' | 'escalated'
  amount_disputed: number | null
  opened_at: string
  deadline_at: string | null
  tenant_claim: string
  landlord_response?: string
  tenant_user_id?: string
}

export default function DisputeDetailPage() {
  const { lang } = useT()
  const isZh = lang === 'zh'
  const router = useRouter()
  const params = useParams()
  const disputeId = params?.id as string

  const { user, loading: authLoading } = useUser({ redirectIfMissing: true })
  const [dispute, setDispute] = useState<Dispute | null>(null)
  const [loading, setLoading] = useState(true)
  const [chat, setChat] = useState<ChatLine[]>([])
  const [streaming, setStreaming] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [authToken, setAuthToken] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const chatScrollRef = useRef<HTMLDivElement | null>(null)

  // Load auth session
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthToken(session?.access_token ?? null)
    })
    const sub = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthToken(session?.access_token ?? null)
    })
    return () => {
      sub.data.subscription.unsubscribe()
    }
  }, [])

  // Load dispute by ID
  useEffect(() => {
    if (!user || !disputeId) return
    void loadDispute()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.authId, disputeId])

  async function loadDispute() {
    if (!disputeId) return
    setLoading(true)
    const { data } = await supabase
      .from('disputes')
      .select('*')
      .eq('id', disputeId)
      .single()
    if (data) {
      setDispute(data as Dispute)
      // Pre-populate chat with system message from Mediator
      const sysMsg: ChatLine = {
        id: `sys_${Date.now()}`,
        role: 'assistant',
        text: isZh
          ? 'Hi — I\'m Stayloop\'s neutral mediator. I\'ve reviewed the dispute. Let me ask both parties some clarifying questions to find common ground.'
          : 'Hi — I\'m Stayloop\'s neutral mediator. I\'ve reviewed the dispute. Let me ask both parties some clarifying questions to find common ground.',
      }
      setChat([sysMsg])
    }
    setLoading(false)
  }

  // Auto-scroll to bottom
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight
    }
  }, [chat])

  // Cleanup abort controller
  useEffect(() => () => abortRef.current?.abort(), [])

  // Send chat message
  async function sendChatMessage() {
    const msg = chatInput.trim()
    if (!msg || streaming) return
    const previousInput = chatInput
    setChatInput('')
    try {
      await runMediator(msg)
    } catch (e) {
      setChatInput(previousInput)
      throw e
    }
  }

  async function runMediator(message: string) {
    if (!authToken || !dispute) return
    setStreaming(true)
    const userMsgId = `u_${Date.now()}`
    const assistantMsgId = `a_${Date.now()}`
    setChat((prev) => [
      ...prev,
      { id: userMsgId, role: 'user', text: message },
      { id: assistantMsgId, role: 'assistant', text: '' },
    ])

    abortRef.current = new AbortController()
    try {
      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          conversation_id: conversationId,
          agent_kind: 'mediator',
          message,
        }),
        signal: abortRef.current.signal,
      })
      if (!res.ok) {
        const errText = await res.text().catch(() => 'request_failed')
        setChat((prev) =>
          prev.map((m) => (m.id === assistantMsgId ? { ...m, text: `❌ ${errText.slice(0, 200)}` } : m)),
        )
        return
      }
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6))
            handleEvent(assistantMsgId, event)
          } catch {}
        }
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        setChat((prev) =>
          prev.map((m) => (m.id === assistantMsgId ? { ...m, text: `❌ ${e?.message || 'error'}` } : m)),
        )
      }
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }

  function handleEvent(assistantMsgId: string, event: any) {
    if (event.type === 'conversation') {
      setConversationId(event.conversation_id)
      return
    }
    if (event.type === 'text_delta') {
      setChat((prev) =>
        prev.map((m) => (m.id === assistantMsgId ? { ...m, text: (m.text || '') + (event.text || '') } : m)),
      )
      return
    }
  }

  // Calculate days remaining
  const daysLeft = dispute?.deadline_at
    ? Math.max(0, Math.ceil((new Date(dispute.deadline_at).getTime() - Date.now()) / 86400000))
    : null

  const daysTotal = 14

  // Circular progress percentage
  const progressPercent = daysLeft != null && daysTotal > 0 ? (daysLeft / daysTotal) * 100 : 100

  if (authLoading || loading) {
    return (
      <PageShell role="tenant">
        <div style={{ color: v3.textMuted, fontSize: 14, display: 'grid', placeItems: 'center', minHeight: 400 }}>
          {isZh ? '加载…' : 'Loading…'}
        </div>
      </PageShell>
    )
  }

  if (!dispute) {
    return (
      <PageShell role="tenant">
        <div style={{ textAlign: 'center', padding: '40px 20px' }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: v3.textPrimary, margin: '0 0 8px' }}>
            {isZh ? '纠纷未找到' : 'Dispute not found'}
          </h1>
          <button
            onClick={() => router.push('/disputes')}
            style={{ marginTop: 16, padding: '10px 18px', background: v3.brand, color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            {isZh ? '返回纠纷列表' : 'Back to disputes'}
          </button>
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell role="tenant">
      <div style={{ maxWidth: size.content.wide, margin: '0 auto', paddingLeft: 16, paddingRight: 16 }}>
        <SecHead
          eyebrow={isZh ? '用户工作区' : 'Tenant Workspace'}
          title={isZh ? '纠纷调解' : 'Dispute Mediation'}
        />
      </div>

      <main
        style={{
          maxWidth: size.content.wide,
          margin: '0 auto',
          padding: '24px 16px',
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 0.4fr) minmax(0, 0.6fr)',
          gap: 24,
        }}
        className="dispute-detail-grid"
      >
        {/* Left pane: dispute info + RTA clock */}
        <section>
          {/* Header card */}
          <div style={{ background: v3.surfaceCard, border: `1px solid ${v3.border}`, borderRadius: 14, padding: 18, marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12, gap: 8 }}>
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', color: v3.textPrimary }}>
                {dispute.title}
              </h1>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '4px 10px',
                  borderRadius: 999,
                  background: dispute.status === 'settled' ? v3.successSoft : v3.warningSoft,
                  color: dispute.status === 'settled' ? v3.success : v3.warning,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                }}
              >
                {isZh
                  ? dispute.status === 'open' ? '待调解'
                  : dispute.status === 'mediating' ? '调解中'
                  : dispute.status === 'settled' ? '已解决'
                  : '已升级'
                  : dispute.status === 'open' ? 'Open'
                  : dispute.status === 'mediating' ? 'Mediating'
                  : dispute.status === 'settled' ? 'Settled'
                  : 'Escalated'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 16, fontSize: 12, color: v3.textMuted, flexWrap: 'wrap' }}>
              <span>{isZh ? '类别：' : 'Category: '}{dispute.category.replace('_', ' ')}</span>
              {dispute.amount_disputed && (
                <span>{isZh ? '争议金额：' : 'Amount: '}${dispute.amount_disputed.toLocaleString()}</span>
              )}
            </div>
            {dispute.opened_at && (
              <div style={{ fontSize: 11, color: v3.textMuted, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${v3.divider}` }}>
                {isZh ? '开启于 ' : 'Opened '}
                {new Date(dispute.opened_at).toLocaleDateString(isZh ? 'zh-CN' : 'en-CA')}
              </div>
            )}
          </div>

          {/* Tenant claim */}
          <div style={{ background: v3.surfaceCard, border: `1px solid ${v3.border}`, borderRadius: 14, padding: 18, marginBottom: 18 }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: v3.textPrimary, letterSpacing: '0.02em' }}>
              {isZh ? '租客主张' : 'Tenant Claim'}
            </h3>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: v3.textPrimary, whiteSpace: 'pre-wrap' }}>
              {dispute.tenant_claim || (isZh ? '（待补充）' : '(pending)')}
            </p>
          </div>

          {/* Landlord response placeholder */}
          <div style={{ background: v3.surfaceCard, border: `1px dashed ${v3.borderStrong}`, borderRadius: 14, padding: 18, marginBottom: 18 }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: v3.textSecondary, letterSpacing: '0.02em' }}>
              {isZh ? '房东回应' : 'Landlord Response'}
            </h3>
            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: v3.textMuted }}>
              {isZh ? '等待房东补充回应…' : 'Awaiting landlord response…'}
            </p>
          </div>

          {/* RTA Clock */}
          <div style={{ background: v3.surfaceCard, border: `1px solid ${v3.border}`, borderRadius: 14, padding: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: v3.textMuted, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 16 }}>
              {isZh ? '14 天调解期' : '14-day RTA window'}
            </div>
            {/* Circular progress */}
            <svg width="140" height="140" viewBox="0 0 140 140" style={{ margin: '0 auto', display: 'block' }}>
              {/* Background circle */}
              <circle cx="70" cy="70" r="63" fill="none" stroke={v3.divider} strokeWidth="6" />
              {/* Progress circle */}
              <circle
                cx="70"
                cy="70"
                r="63"
                fill="none"
                stroke={v3.trust}
                strokeWidth="6"
                strokeDasharray={`${(progressPercent / 100) * 2 * Math.PI * 63} ${2 * Math.PI * 63}`}
                strokeLinecap="round"
                style={{ transform: 'rotate(-90deg)', transformOrigin: '70px 70px', transition: 'stroke-dasharray 0.5s ease' }}
              />
              {/* Text in center */}
              <text x="70" y="65" textAnchor="middle" fontSize="32" fontWeight="800" fill={v3.trust} fontFamily="var(--font-mono)">
                {daysLeft}
              </text>
              <text x="70" y="85" textAnchor="middle" fontSize="12" fill={v3.textMuted} fontFamily="inherit">
                {isZh ? '天' : 'days'}
              </text>
            </svg>
            <div style={{ marginTop: 14, fontSize: 12, color: v3.textSecondary }}>
              {isZh ? `还剩 ${daysLeft} 天` : `${daysLeft} days remaining`}
            </div>
          </div>

          {/* Settlement buttons (UI only) */}
          <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              disabled={streaming}
              style={{
                width: '100%',
                padding: '12px 18px',
                background: 'linear-gradient(135deg, #6EE7B7 0%, #34D399 100%)',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 600,
                cursor: streaming ? 'wait' : 'pointer',
                boxShadow: '0 8px 22px -10px rgba(52, 211, 153, 0.45)',
                transition: 'opacity 0.15s',
                opacity: streaming ? 0.7 : 1,
              }}
            >
              {isZh ? '✓ 接受调解方案' : '✓ Accept offer'}
            </button>
            <button
              style={{
                width: '100%',
                padding: '12px 18px',
                background: v3.surfaceCard,
                color: v3.textPrimary,
                border: `1px solid ${v3.borderStrong}`,
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {isZh ? '⚖ 升级到 LTB' : '⚖ Escalate to LTB'}
            </button>
          </div>
        </section>

        {/* Right pane: Mediator chat */}
        <section
          style={{
            background: v3.surfaceCard,
            border: `1px solid ${v3.border}`,
            borderRadius: 14,
            padding: 18,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 600,
          }}
        >
          {/* Header */}
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: v3.trust,
              letterSpacing: 0.4,
              textTransform: 'uppercase',
              marginBottom: 14,
              paddingBottom: 12,
              borderBottom: `1px solid ${v3.divider}`,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 28,
                height: 28,
                background: v3.trust,
                color: '#fff',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              ⚖
            </span>
            Mediator {isZh ? '· 中立 RTA 培训 AI' : '· Neutral RTA-trained AI'}
          </div>

          {/* Chat messages */}
          <div ref={chatScrollRef} style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, paddingRight: 4, minHeight: 320, maxHeight: 'calc(100vh - 420px)' }}>
            {chat.map((m) => (
              <div
                key={m.id}
                style={{
                  alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '95%',
                  background: m.role === 'user' ? 'linear-gradient(135deg, #6EE7B7 0%, #34D399 100%)' : v3.surfaceMuted,
                  color: m.role === 'user' ? '#fff' : v3.textPrimary,
                  padding: '10px 14px',
                  borderRadius: 12,
                  fontSize: 13,
                  lineHeight: 1.55,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {m.text}
              </div>
            ))}
          </div>

          {/* Composer */}
          <div
            style={{
              marginTop: 12,
              border: `1px solid ${v3.border}`,
              borderRadius: 12,
              background: '#FFFFFF',
              padding: '10px 12px',
              display: 'flex',
              alignItems: 'flex-end',
              gap: 10,
              boxShadow: '0 1px 0 rgba(0,0,0,0.02)',
            }}
          >
            <textarea
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void sendChatMessage()
                }
              }}
              placeholder={
                isZh
                  ? '向 Mediator 发言… (Enter 发送 · Shift+Enter 换行)'
                  : 'Speak to Mediator… (Enter to send · Shift+Enter for newline)'
              }
              rows={1}
              style={{
                flex: 1,
                resize: 'none',
                border: 'none',
                outline: 'none',
                background: 'transparent',
                fontSize: 13.5,
                lineHeight: 1.5,
                fontFamily: 'inherit',
                color: '#0B1736',
                WebkitTextFillColor: '#0B1736',
                caretColor: '#0B1736',
                maxHeight: 160,
                minHeight: 22,
                padding: '4px 0',
              }}
            />
            {streaming ? (
              <button
                onClick={() => abortRef.current?.abort()}
                title={isZh ? '停止' : 'Stop'}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  border: `1px solid ${v3.border}`,
                  background: '#FFFFFF',
                  color: v3.textSecondary,
                  fontSize: 14,
                  lineHeight: 1,
                  cursor: 'pointer',
                  display: 'grid',
                  placeItems: 'center',
                  flexShrink: 0,
                }}
              >
                ■
              </button>
            ) : (
              <button
                onClick={() => void sendChatMessage()}
                disabled={!chatInput.trim()}
                title={isZh ? '发送' : 'Send'}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  border: 'none',
                  background: chatInput.trim()
                    ? 'linear-gradient(135deg, #6EE7B7 0%, #34D399 100%)'
                    : v3.surfaceMuted,
                  color: chatInput.trim() ? '#FFFFFF' : v3.textMuted,
                  fontSize: 16,
                  lineHeight: 1,
                  cursor: chatInput.trim() ? 'pointer' : 'not-allowed',
                  display: 'grid',
                  placeItems: 'center',
                  flexShrink: 0,
                  boxShadow: chatInput.trim()
                    ? '0 4px 12px -4px rgba(52, 211, 153, 0.45)'
                    : 'none',
                  transition: 'background .15s, box-shadow .15s',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </button>
            )}
          </div>
        </section>
      </main>

      <style jsx>{`
        @media (max-width: 1023px) {
          :global(.dispute-detail-grid) {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </PageShell>
  )
}
