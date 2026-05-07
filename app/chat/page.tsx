'use client'

// -----------------------------------------------------------------------------
// /chat — AI-Native landlord screening (Logic agent driver), V3 styled
// -----------------------------------------------------------------------------

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { tokens } from '@/lib/agent/theme'
import { size } from '@/lib/brand'
import { ScreeningCard } from './components/ScreeningCard'
import { ActionProposal } from './components/ActionProposal'
import PageShell from '@/components/v4/PageShell'

interface AssistantBlock {
  kind: string
  [k: string]: any
}
interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  text?: string
  blocks?: AssistantBlock[]
  toolCalls?: Array<{ name: string; status?: string }>
}
interface AttachedFile {
  path: string
  name: string
  mime: string
  size: number
}

const STARTERS = [
  { zh: '帮我筛查一位新租客 (上传文件)', en: 'Screen a new applicant (upload files)' },
  { zh: '解释一份雇佣信的真伪信号', en: 'Explain employment letter authenticity signals' },
  { zh: '我对一位申请人的工资单存疑，能帮我看看吗', en: 'Help me check a suspicious paystub' },
]

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [streaming, setStreaming] = useState(false)
  const [attached, setAttached] = useState<AttachedFile[]>([])
  const [lang, setLang] = useState<'zh' | 'en'>('zh')
  const [authToken, setAuthToken] = useState<string | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  // Use the shared singleton from lib/supabase.ts (flowType: 'implicit',
  // localStorage-backed) so this page sees the same session as everywhere
  // else in the app. The previous version created its own client via
  // createBrowserClient from @supabase/ssr, which defaults to PKCE/cookie
  // storage and doesn't share session state with the rest of the app — so
  // logged-in users would see "请先登录" alerts despite being signed in.
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthToken(session?.access_token ?? null)
      setAuthReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setAuthToken(session?.access_token ?? null)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      alert(lang === 'zh' ? '请先登录' : 'Please sign in first')
      return
    }
    const stamp = Date.now()
    const uploaded: AttachedFile[] = []
    for (let i = 0; i < files.length; i++) {
      const f = files[i]
      const safeName = f.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `chat/${user.id}/${stamp}_${i}_${safeName}`
      const { error } = await supabase.storage
        .from('tenant-files')
        .upload(path, f, { contentType: f.type })
      if (error) {
        console.warn('upload failed:', error.message)
        continue
      }
      uploaded.push({ path, name: f.name, mime: f.type, size: f.size })
    }
    setAttached((prev) => [...prev, ...uploaded])
    e.target.value = ''
  }

  async function send(prefilled?: string) {
    const userText = (prefilled ?? input).trim()
    if (!userText && attached.length === 0) return
    if (streaming) return
    if (!authToken) {
      setMessages((prev) => [
        ...prev,
        { id: `e_${Date.now()}`, role: 'system', text: lang === 'zh' ? '请先登录' : 'Please sign in' },
      ])
      return
    }
    const finalText = userText || (lang === 'zh' ? '(请帮我分析附件)' : '(Please analyze the attached files)')
    const userMsgId = `u_${Date.now()}`
    setMessages((prev) => [...prev, { id: userMsgId, role: 'user', text: finalText }])
    setInput('')

    const assistantMsgId = `a_${Date.now()}`
    setMessages((prev) => [
      ...prev,
      { id: assistantMsgId, role: 'assistant', text: '', blocks: [], toolCalls: [] },
    ])
    setStreaming(true)

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
          agent_kind: 'logic',
          message: finalText,
          attachments: attached.length > 0 ? attached : undefined,
        }),
        signal: abortRef.current.signal,
      })
      setAttached([])

      if (!res.ok) {
        const errText = await res.text().catch(() => 'request_failed')
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMsgId ? { ...m, text: `❌ ${errText.slice(0, 300)}` } : m)),
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
          const payload = line.slice(6)
          try {
            handleEvent(assistantMsgId, JSON.parse(payload))
          } catch {
            // skip malformed
          }
        }
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        setMessages((prev) =>
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
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId ? { ...m, text: (m.text || '') + (event.text || '') } : m,
        ),
      )
      return
    }
    if (event.type === 'tool_use') {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? { ...m, toolCalls: [...(m.toolCalls || []), { name: event.tool_name }] }
            : m,
        ),
      )
      return
    }
    if (event.type === 'tool_result') {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== assistantMsgId) return m
          const calls = [...(m.toolCalls || [])]
          for (let i = calls.length - 1; i >= 0; i--) {
            if (calls[i].name === event.tool_name && !calls[i].status) {
              calls[i] = { ...calls[i], status: event.status }
              break
            }
          }
          return { ...m, toolCalls: calls }
        }),
      )
      return
    }
    if (event.type === 'block') {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId ? { ...m, blocks: [...(m.blocks || []), event.block] } : m,
        ),
      )
      return
    }
    if (event.type === 'error') {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? { ...m, text: (m.text || '') + `\n\n❌ ${event.message}` }
            : m,
        ),
      )
    }
  }

  return (
    <PageShell noPadding>
      {/* Chat is a self-contained scrolling region: the outer column is
          locked to viewport height (minus AppBar) so the document body never
          scrolls. Only the messages <main> scrolls internally. This keeps
          the Sidebar (sticky inside PageShell) in view at all times and
          lets the Composer sit naturally at the bottom of the column without
          needing position:fixed (which previously spanned the full viewport
          and covered the sidebar). */}
      <div
        style={{
          height: 'calc(100vh - 56px)',  // 56px = AppBar
          display: 'flex',
          flexDirection: 'column',
          background: tokens.surfaceMuted,
          fontFamily: "'Inter', system-ui, sans-serif",
          minHeight: 0,
        }}
      >
        <Header lang={lang} setLang={setLang} streaming={streaming} />

        <main
          ref={scrollRef}
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            padding: '20px 16px 24px',
          }}
        >
          <div style={{ maxWidth: size.content.narrow, margin: '0 auto' }}>
            {messages.length === 0 && authReady && (
              <EmptyState lang={lang} authed={!!authToken} onPick={(text) => send(text)} />
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {messages.map((m) => (
                <MessageBubble key={m.id} msg={m} lang={lang} authToken={authToken} />
              ))}
            </div>

            {streaming && (
              <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
                <AssistantAvatar />
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '8px 12px', background: tokens.surface, border: `1px solid ${tokens.border}`, borderRadius: 14, boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)' }}>
                  <TypingDot delay={0} />
                  <TypingDot delay={0.18} />
                  <TypingDot delay={0.36} />
                  <span style={{ fontSize: 11, color: tokens.textTertiary, marginLeft: 6, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.04em' }}>
                    {lang === 'zh' ? 'Stayloop AI 正在思考' : 'Stayloop AI is thinking'}
                  </span>
                </div>
                <style>{`
                  @keyframes typing-dot {
                    0%, 60%, 100% { transform: translateY(0); opacity: 0.35; }
                    30% { transform: translateY(-3px); opacity: 1; }
                  }
                `}</style>
              </div>
            )}
          </div>
        </main>

        <Composer
          input={input}
          setInput={setInput}
          attached={attached}
          setAttached={setAttached}
          onFileChange={handleFileChange}
          onSend={() => send()}
          streaming={streaming}
          lang={lang}
        />
      </div>
    </PageShell>
  )
}

// ─── Header ──────────────────────────────────────────────────────────────
// Identifies the AI by name + status. Right side keeps a 'Classic mode'
// escape hatch into the older /screen page for landlords who prefer the
// form-based flow.

function Header({ lang, streaming }: { lang: 'zh' | 'en'; setLang: (l: 'zh' | 'en') => void; streaming?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 18px',
        background: tokens.surface,
        borderBottom: `1px solid ${tokens.border}`,
        flexShrink: 0,
      }}
    >
      <AssistantAvatar size={32} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: tokens.textPrimary, letterSpacing: '-0.01em' }}>
          Stayloop AI
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, fontSize: 11, color: tokens.textTertiary, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.04em' }}>
          <span
            aria-hidden
            style={{
              width: 6,
              height: 6,
              borderRadius: 999,
              background: streaming ? tokens.warning : tokens.success,
              boxShadow: streaming ? `0 0 0 0 ${tokens.warningSoft}` : 'none',
              animation: streaming ? 'header-pulse 1.4s infinite' : 'none',
            }}
          />
          {streaming
            ? (lang === 'zh' ? '思考中…' : 'thinking…')
            : (lang === 'zh' ? '在线 · 租客筛查助手' : 'online · tenant screening assistant')}
        </div>
      </div>
      <a
        href="/screen"
        style={{
          fontSize: 12,
          padding: '7px 12px',
          background: tokens.surfaceMuted,
          border: `1px solid ${tokens.border}`,
          borderRadius: 8,
          color: tokens.textSecondary,
          textDecoration: 'none',
          whiteSpace: 'nowrap',
          fontWeight: 500,
        }}
      >
        {lang === 'zh' ? '经典模式' : 'Classic mode'}
      </a>
      <style>{`
        @keyframes header-pulse {
          0% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.5); }
          70% { box-shadow: 0 0 0 6px rgba(245, 158, 11, 0); }
          100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0); }
        }
      `}</style>
    </div>
  )
}

// ─── Reusable bits ──────────────────────────────────────────────────────

/** Small AI icon used in the header, message bubbles, and streaming indicator. */
function AssistantAvatar({ size = 28 }: { size?: number }) {
  return (
    <div
      aria-hidden
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: 8,
        background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 50%, #A855F7 100%)',
        color: '#fff',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'JetBrains Mono, monospace',
        fontWeight: 700,
        fontSize: Math.round(size * 0.5),
        boxShadow: '0 2px 6px -2px rgba(124, 58, 237, 0.45)',
      }}
    >
      ✦
    </div>
  )
}

/** A single bouncing dot for the typing indicator. */
function TypingDot({ delay }: { delay: number }) {
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-block',
        width: 6,
        height: 6,
        borderRadius: 999,
        background: tokens.brand, // violet AI accent
        animation: `typing-dot 1.4s ${delay}s infinite ease-in-out`,
      }}
    />
  )
}

// ─── Empty state ────────────────────────────────────────────────────────

function EmptyState({ lang, authed, onPick }: { lang: 'zh' | 'en'; authed: boolean; onPick: (s: string) => void }) {
  return (
    <div style={{ marginTop: 56, display: 'flex', flexDirection: 'column', gap: 22 }}>
      {/* Greeting card — looks like the first AI message */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <AssistantAvatar size={32} />
        <div
          style={{
            flex: 1,
            background: tokens.surface,
            border: `1px solid ${tokens.border}`,
            borderRadius: 14,
            padding: '14px 16px',
            boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 600, color: tokens.textPrimary, marginBottom: 4 }}>
            {lang === 'zh' ? '你好，我是 Stayloop AI。' : 'Hi — I’m Stayloop AI.'}
          </div>
          <div style={{ fontSize: 13.5, color: tokens.textSecondary, lineHeight: 1.6 }}>
            {lang === 'zh'
              ? '上传申请人材料，告诉我你想关注什么。我会跑文档取证、查公开法庭记录、交叉核对雇主，再用可解释的语言给出风险信号和建议下一步。'
              : 'Drop in the applicant’s documents and tell me what you want to focus on. I’ll run document forensics, check public court records, cross-check employers, and explain the risk signals in plain language.'}
          </div>
        </div>
      </div>

      {/* Starter prompts (only for authed users) */}
      {!authed ? (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
          <a
            href="/dashboard"
            style={{
              padding: '10px 18px',
              background: tokens.accent,
              color: '#fff',
              borderRadius: 10,
              textDecoration: 'none',
              fontSize: 13,
              fontWeight: 600,
              boxShadow: '0 8px 22px -10px rgba(52, 211, 153, 0.45)',
            }}
          >
            {lang === 'zh' ? '前往登录' : 'Sign in to start'}
          </a>
        </div>
      ) : (
        <div>
          <div
            style={{
              fontSize: 11,
              fontFamily: 'JetBrains Mono, monospace',
              letterSpacing: '0.10em',
              textTransform: 'uppercase',
              color: tokens.textTertiary,
              fontWeight: 700,
              marginBottom: 10,
              paddingLeft: 4,
            }}
          >
            {lang === 'zh' ? '试试这些起手式' : 'Try one of these'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
            {STARTERS.map((s, i) => (
              <button
                key={i}
                onClick={() => onPick(lang === 'zh' ? s.zh : s.en)}
                style={{
                  padding: '12px 14px',
                  background: tokens.surface,
                  border: `1px solid ${tokens.border}`,
                  borderRadius: 12,
                  fontSize: 13,
                  color: tokens.textPrimary,
                  cursor: 'pointer',
                  textAlign: 'left',
                  lineHeight: 1.45,
                  transition: 'all 0.15s',
                  fontFamily: 'inherit',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = tokens.brand
                  e.currentTarget.style.background = tokens.brandLight
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = tokens.border
                  e.currentTarget.style.background = tokens.surface
                }}
              >
                <span style={{ display: 'inline-block', color: tokens.brand, marginRight: 6, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }}>›</span>
                {lang === 'zh' ? s.zh : s.en}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Message bubble + block dispatcher ──────────────────────────────────

function MessageBubble({
  msg,
  lang,
  authToken,
}: {
  msg: ChatMessage
  lang: 'zh' | 'en'
  authToken: string | null
}) {
  const isUser = msg.role === 'user'
  const isSystem = msg.role === 'system'

  // User messages anchor right; assistant + system anchor left and lead with
  // an AI avatar so the column scans like a conversation rather than a blob.
  return (
    <div
      style={{
        display: 'flex',
        gap: 10,
        flexDirection: isUser ? 'row-reverse' : 'row',
        alignItems: 'flex-start',
      }}
    >
      {/* Avatar slot — AI for assistant/system, blank spacer for user */}
      {isUser ? (
        <div style={{ width: 28, flexShrink: 0 }} aria-hidden />
      ) : (
        <AssistantAvatar size={28} />
      )}

      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: isUser ? 'flex-end' : 'flex-start',
          gap: 6,
        }}
      >
        {(msg.text || (msg.toolCalls && msg.toolCalls.length > 0)) && (
          <div
            style={{
              maxWidth: '92%',
              background: isUser
                ? `linear-gradient(135deg, ${tokens.accent} 0%, ${tokens.accentDark} 100%)` // emerald — user identity
                : isSystem
                  ? tokens.warningLight
                  : tokens.surface,
              color: isUser ? '#fff' : tokens.textPrimary,
              padding: msg.text ? '10px 14px' : '8px 12px',
              borderRadius: isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
              border: isUser || isSystem ? 'none' : `1px solid ${tokens.border}`,
              boxShadow: isUser ? '0 4px 14px -8px rgba(4, 120, 87, 0.40)' : '0 1px 2px rgba(15, 23, 42, 0.04)',
            }}
          >
            {msg.text && (
              <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.55 }}>{msg.text}</div>
            )}

            {msg.toolCalls && msg.toolCalls.length > 0 && (
              <div style={{ marginTop: msg.text ? 8 : 0, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {msg.toolCalls.map((tc, i) => (
                  <ToolBadge key={i} name={tc.name} status={tc.status} dark={isUser} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Blocks render outside the bubble so they can be wider / styled differently */}
        {msg.blocks?.map((block, i) => (
          <div key={i} style={{ width: '100%', maxWidth: 640 }}>
            <BlockRenderer block={block} lang={lang} authToken={authToken} />
          </div>
        ))}
      </div>
    </div>
  )
}

function ToolBadge({ name, status, dark }: { name: string; status?: string; dark?: boolean }) {
  const icon = status === 'success' ? '✓' : status === 'error' ? '✗' : status === 'timeout' ? '⏱' : '⏳'
  const color =
    status === 'success' ? tokens.success
    : status === 'error' || status === 'timeout' ? tokens.danger
    : tokens.textTertiary
  return (
    <span
      style={{
        fontSize: 10,
        fontFamily: 'JetBrains Mono, monospace',
        padding: '2px 6px',
        borderRadius: 4,
        background: dark ? 'rgba(255,255,255,0.15)' : tokens.surfaceMuted,
        color: dark ? '#fff' : color,
        border: dark ? 'none' : `1px solid ${tokens.borderSubtle}`,
      }}
    >
      <span style={{ color: dark ? '#fff' : color, marginRight: 4 }}>{icon}</span>
      {name}
    </span>
  )
}

function BlockRenderer({
  block,
  lang,
  authToken,
}: {
  block: AssistantBlock
  lang: 'zh' | 'en'
  authToken: string | null
}) {
  switch (block.kind) {
    case 'text':
      return (
        <div
          style={{
            padding: '10px 14px',
            background: tokens.surface,
            border: `1px solid ${tokens.border}`,
            borderRadius: 12,
            fontSize: 13,
            color: tokens.textPrimary,
            whiteSpace: 'pre-wrap',
            lineHeight: 1.55,
          }}
        >
          {block.markdown}
        </div>
      )
    case 'screening_card':
      return (
        <ScreeningCard
          screening_id={block.screening_id}
          overall={block.overall}
          tier={block.tier}
          flags={block.flags || []}
          cited_tool_executions={block.cited_tool_executions}
          applicant_name={block.applicant_name}
          monthly_income={block.monthly_income}
          monthly_rent={block.monthly_rent}
          lang={lang}
        />
      )
    case 'document_viewer':
      return (
        <div
          style={{
            padding: 12,
            background: tokens.surfaceMuted,
            border: `1px solid ${tokens.borderSubtle}`,
            borderRadius: 10,
            fontSize: 12,
            color: tokens.textSecondary,
          }}
        >
          📄 <strong>{block.file_name}</strong>
          {block.annotations?.length > 0 && (
            <ul style={{ margin: '6px 0 0 18px', padding: 0, fontSize: 12 }}>
              {block.annotations.map((a: any, i: number) => (
                <li key={i}>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', color: tokens.textTertiary }}>
                    p.{a.page}
                  </span>{' '}
                  — {a.note}
                </li>
              ))}
            </ul>
          )}
        </div>
      )
    case 'action_proposal':
      return authToken ? (
        <ActionProposal
          pending_action_id={block.pending_action_id}
          action_kind={block.action_kind}
          preview={block.preview}
          label_zh={block.label_zh}
          label_en={block.label_en}
          lang={lang}
          authToken={authToken}
        />
      ) : null
    case 'files_upload':
      return (
        <div
          style={{
            padding: 12,
            border: `1px dashed ${tokens.borderStrong}`,
            borderRadius: 10,
            fontSize: 12,
            color: tokens.textSecondary,
            background: tokens.surface,
          }}
        >
          📥 {block.hint_zh || block.hint_en || (lang === 'zh' ? '需要更多文件' : 'More files needed')}
        </div>
      )
    case 'followup_suggestions':
      return (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(block.suggestions || []).map((s: any, i: number) => (
            <span
              key={i}
              style={{
                padding: '4px 10px',
                fontSize: 11,
                background: tokens.surfaceMuted,
                border: `1px solid ${tokens.borderSubtle}`,
                borderRadius: 14,
                color: tokens.textSecondary,
              }}
            >
              {lang === 'zh' ? s.label_zh || s.label_en : s.label_en || s.label_zh}
            </span>
          ))}
        </div>
      )
    default:
      return (
        <div style={{ fontSize: 10, color: tokens.textTertiary, fontFamily: 'JetBrains Mono, monospace', padding: 4 }}>
          [unknown block: {block.kind}]
        </div>
      )
  }
}

// ─── Composer ────────────────────────────────────────────────────────────

function Composer({
  input,
  setInput,
  attached,
  setAttached,
  onFileChange,
  onSend,
  streaming,
  lang,
}: {
  input: string
  setInput: (s: string) => void
  attached: AttachedFile[]
  setAttached: (a: AttachedFile[]) => void
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onSend: () => void
  streaming: boolean
  lang: 'zh' | 'en'
}) {
  return (
    // Flow naturally at the bottom of the chat column (NOT position:fixed).
    // The parent column has height: calc(100vh - 56px) and flex-direction:
    // column, so this Composer pins to the bottom of the chat region while
    // the messages <main> above absorbs all remaining height as a scroller.
    // This keeps the Composer out of the Sidebar's column entirely.
    <div
      style={{
        flexShrink: 0,
        background: tokens.surface,
        borderTop: `1px solid ${tokens.border}`,
        padding: '12px 16px',
        boxShadow: '0 -4px 20px rgba(15, 23, 42, 0.04)',
      }}
    >
      <div style={{ maxWidth: size.content.narrow, margin: '0 auto' }}>
        {attached.length > 0 && (
          <div style={{ marginBottom: 10, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            {attached.map((f, i) => (
              <span
                key={i}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 12,
                  padding: '4px 10px',
                  background: tokens.brandLight,  // violet — file is "AI input"
                  border: `1px solid ${tokens.brand}33`,
                  borderRadius: 14,
                  color: tokens.brand,
                  fontWeight: 500,
                  maxWidth: 220,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={f.name}
              >
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path d="M10 2v3a1 1 0 0 0 1 1h3M5 14h6a2 2 0 0 0 2-2V6l-4-4H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</span>
              </span>
            ))}
            <button
              onClick={() => setAttached([])}
              style={{
                fontSize: 11,
                padding: '2px 8px',
                background: 'none',
                border: 'none',
                color: tokens.textTertiary,
                cursor: 'pointer',
                fontFamily: 'JetBrains Mono, monospace',
                letterSpacing: '0.04em',
              }}
            >
              {lang === 'zh' ? '清除' : 'CLEAR'}
            </button>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <label
            htmlFor="chat-file-input"
            style={{
              display: 'grid',
              placeItems: 'center',
              width: 38,
              height: 38,
              borderRadius: 10,
              background: tokens.surfaceMuted,
              border: `1px solid ${tokens.border}`,
              cursor: 'pointer',
              fontSize: 16,
            }}
            title={lang === 'zh' ? '上传文件' : 'Attach files'}
          >
            📎
          </label>
          <input
            id="chat-file-input"
            type="file"
            multiple
            accept="application/pdf,image/*"
            onChange={onFileChange}
            style={{ display: 'none' }}
          />
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                onSend()
              }
            }}
            rows={1}
            placeholder={
              lang === 'zh'
                ? '说点什么……例如 "帮我筛查 Bo Han"'
                : 'Say something… e.g. "Screen Bo Han for me"'
            }
            style={{
              flex: 1,
              padding: '10px 14px',
              border: `1px solid ${tokens.border}`,
              borderRadius: 10,
              fontSize: 14,
              fontFamily: 'inherit',
              resize: 'none',
              outline: 'none',
              background: tokens.surface,
              minHeight: 38,
              maxHeight: 160,
            }}
          />
          <button
            onClick={onSend}
            disabled={streaming || !input.trim()}
            aria-label={lang === 'zh' ? '发送' : 'Send'}
            style={{
              display: 'grid',
              placeItems: 'center',
              width: 38,
              height: 38,
              background: (streaming || !input.trim()) ? tokens.surfaceMuted : `linear-gradient(135deg, ${tokens.accent} 0%, ${tokens.accentDark} 100%)`,
              color: (streaming || !input.trim()) ? tokens.textTertiary : '#fff',
              border: 'none',
              borderRadius: 10,
              cursor: (streaming || !input.trim()) ? 'default' : 'pointer',
              transition: 'background 0.15s, color 0.15s',
              boxShadow: (streaming || !input.trim()) ? 'none' : '0 4px 12px -6px rgba(4, 120, 87, 0.5)',
            }}
          >
            {/* Up-arrow send icon — same convention used by ChatGPT / Claude */}
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path
                d="M8 13V3M8 3L3.5 7.5M8 3l4.5 4.5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
        <div
          style={{
            marginTop: 8,
            fontSize: 10.5,
            color: tokens.textTertiary,
            textAlign: 'center',
            fontFamily: 'JetBrains Mono, monospace',
            letterSpacing: '0.04em',
          }}
        >
          Stayloop AI · {lang === 'zh' ? '决策仍由您批准' : 'You stay in control of decisions'} · {lang === 'zh' ? 'Enter 发送，Shift+Enter 换行' : 'Enter to send, Shift+Enter for newline'}
        </div>
      </div>
    </div>
  )
}
