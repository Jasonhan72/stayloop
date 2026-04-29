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
import AppHeader from '@/components/AppHeader'

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
    <div
      style={{
        minHeight: '100vh',
        background: tokens.surfaceMuted,
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      <Header lang={lang} setLang={setLang} />

      <main
        ref={scrollRef}
        style={{
          maxWidth: size.content.narrow,
          margin: '0 auto',
          padding: '20px 16px 200px',
          minHeight: 'calc(100vh - 60px)',
        }}
      >
        {messages.length === 0 && authReady && (
          <EmptyState lang={lang} authed={!!authToken} onPick={(text) => send(text)} />
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {messages.map((m) => (
            <MessageBubble key={m.id} msg={m} lang={lang} authToken={authToken} />
          ))}
        </div>

        {streaming && (
          <div style={{ marginTop: 12, fontSize: 11, color: tokens.textTertiary, fontFamily: 'JetBrains Mono, monospace' }}>
            <span style={{ display: 'inline-block', animation: 'pulse 1.4s ease-in-out infinite' }}>●</span> Logic 正在思考…
            <style>{`@keyframes pulse { 0%, 100% { opacity: 0.3 } 50% { opacity: 1 } }`}</style>
          </div>
        )}
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
  )
}

// ─── Header ──────────────────────────────────────────────────────────────

function Header(_: { lang: 'zh' | 'en'; setLang: (l: 'zh' | 'en') => void }) {
  return (
    <AppHeader
      title="Logic · Landlord screening"
      titleZh="Logic · 房东筛查"
      right={
        <a
          href="/screen"
          style={{
            fontSize: 11,
            padding: '6px 10px',
            background: tokens.surfaceMuted,
            border: `1px solid ${tokens.border}`,
            borderRadius: 6,
            color: tokens.textSecondary,
            textDecoration: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          Classic mode
        </a>
      }
    />
  )
}

// ─── Empty state ────────────────────────────────────────────────────────

function EmptyState({ lang, authed, onPick }: { lang: 'zh' | 'en'; authed: boolean; onPick: (s: string) => void }) {
  return (
    <div style={{ marginTop: 80, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 14,
          background: tokens.accentMuted,
          display: 'grid',
          placeItems: 'center',
          fontSize: 26,
          color: tokens.accent,
        }}
      >
        🛡
      </div>
      <div>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: tokens.textPrimary }}>
          {lang === 'zh' ? '租客信任，AI 优先' : 'Tenant trust, AI-first'}
        </h2>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: tokens.textTertiary, maxWidth: 480, lineHeight: 1.5 }}>
          {lang === 'zh'
            ? '上传申请人材料 + 一句话告诉我你的疑虑。我会跑取证、查法庭记录、核对雇主、给出可解释的决策建议。'
            : 'Upload applicant docs + tell me your concern in one sentence. I run forensics, check court records, verify employers, and recommend a decision with reasoning.'}
        </p>
      </div>

      {!authed ? (
        <a
          href="/dashboard"
          style={{
            padding: '8px 18px',
            background: tokens.accent,
            color: '#fff',
            borderRadius: 8,
            textDecoration: 'none',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {lang === 'zh' ? '前往登录' : 'Sign in'}
        </a>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 460 }}>
          {STARTERS.map((s, i) => (
            <button
              key={i}
              onClick={() => onPick(lang === 'zh' ? s.zh : s.en)}
              style={{
                padding: '10px 14px',
                background: tokens.surface,
                border: `1px solid ${tokens.border}`,
                borderRadius: 10,
                fontSize: 13,
                color: tokens.textPrimary,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = tokens.accent
                e.currentTarget.style.background = tokens.accentMuted
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = tokens.border
                e.currentTarget.style.background = tokens.surface
              }}
            >
              💬 {lang === 'zh' ? s.zh : s.en}
            </button>
          ))}
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
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start' }}>
      <div
        style={{
          maxWidth: '88%',
          background: isUser ? tokens.accent : isSystem ? tokens.warningLight : tokens.surface,
          color: isUser ? '#fff' : tokens.textPrimary,
          padding: msg.text ? '10px 14px' : 0,
          borderRadius: 14,
          border: isUser || isSystem ? 'none' : `1px solid ${tokens.border}`,
          boxShadow: isUser ? 'none' : '0 1px 2px rgba(15, 23, 42, 0.04)',
        }}
      >
        {msg.text && (
          <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.55 }}>{msg.text}</div>
        )}

        {msg.toolCalls && msg.toolCalls.length > 0 && (
          <div style={{ marginTop: msg.text ? 8 : 0, padding: msg.text ? 0 : '8px 12px', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {msg.toolCalls.map((tc, i) => (
              <ToolBadge key={i} name={tc.name} status={tc.status} dark={isUser} />
            ))}
          </div>
        )}
      </div>

      {/* Blocks render outside the bubble so they can be wider / styled differently */}
      {msg.blocks?.map((block, i) => (
        <div key={i} style={{ width: '100%', maxWidth: 640, marginTop: 6 }}>
          <BlockRenderer block={block} lang={lang} authToken={authToken} />
        </div>
      ))}
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
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        background: tokens.surface,
        borderTop: `1px solid ${tokens.border}`,
        padding: '12px 16px',
        boxShadow: '0 -4px 20px rgba(15, 23, 42, 0.04)',
      }}
    >
      <div style={{ maxWidth: size.content.narrow, margin: '0 auto' }}>
        {attached.length > 0 && (
          <div style={{ marginBottom: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {attached.map((f, i) => (
              <span
                key={i}
                style={{
                  fontSize: 11,
                  padding: '3px 8px',
                  background: tokens.accentMuted,
                  border: `1px solid ${tokens.accent}40`,
                  borderRadius: 12,
                  color: tokens.accentDark,
                }}
              >
                📎 {f.name}
              </span>
            ))}
            <button
              onClick={() => setAttached([])}
              style={{ fontSize: 11, background: 'none', border: 'none', color: tokens.textTertiary, cursor: 'pointer' }}
            >
              {lang === 'zh' ? '清除' : 'Clear'}
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
            disabled={streaming}
            style={{
              padding: '10px 20px',
              background: streaming ? tokens.accentLight : tokens.accent,
              color: streaming ? tokens.accentDark : '#fff',
              border: 'none',
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 600,
              cursor: streaming ? 'wait' : 'pointer',
              minHeight: 38,
            }}
          >
            {streaming ? '…' : lang === 'zh' ? '发送' : 'Send'}
          </button>
        </div>
        <div style={{ marginTop: 6, fontSize: 10, color: tokens.textTertiary, textAlign: 'center' }}>
          Stayloop AI · 决策仍由您批准 · {lang === 'zh' ? 'Enter 发送' : 'Enter to send'}
        </div>
      </div>
    </div>
  )
}
