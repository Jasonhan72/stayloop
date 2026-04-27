'use client'

// -----------------------------------------------------------------------------
// /chat — AI-Native landlord screening (Logic agent driver)
// -----------------------------------------------------------------------------
// Sprint 2 skeleton. Renders a chat panel + 5 block types (text,
// screening_card, document_viewer, action_proposal, files_upload). Streams
// SSE events from /api/agent/chat and updates UI incrementally.
//
// Production-style polish (theme, i18n, mobile, advanced upload UX) lands
// in Sprint 3+. The current page focuses on end-to-end correctness so we
// can drive a real screening through the agent loop.
// -----------------------------------------------------------------------------

import { useEffect, useRef, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'

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

const supabase = (() => {
  if (typeof window === 'undefined') return null
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
})()

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [streaming, setStreaming] = useState(false)
  const [attached, setAttached] = useState<AttachedFile[]>([])
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!supabase) return
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      alert('请先登录 / Please sign in')
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

  async function send() {
    if (!input.trim() && attached.length === 0) return
    if (streaming) return
    if (!supabase) return

    const userText = input.trim() || '(请帮我分析附件)'
    const userMsgId = `u_${Date.now()}`
    setMessages((prev) => [...prev, { id: userMsgId, role: 'user', text: userText }])
    setInput('')

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      setMessages((prev) => [...prev, { id: `e_${Date.now()}`, role: 'system', text: '请先登录 / Please sign in' }])
      return
    }

    const assistantMsgId = `a_${Date.now()}`
    setMessages((prev) => [...prev, { id: assistantMsgId, role: 'assistant', text: '', blocks: [], toolCalls: [] }])
    setStreaming(true)

    abortRef.current = new AbortController()
    try {
      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          conversation_id: conversationId,
          agent_kind: 'logic',
          message: userText,
          attachments: attached.length > 0 ? attached : undefined,
        }),
        signal: abortRef.current.signal,
      })
      setAttached([])

      if (!res.ok) {
        const errText = await res.text().catch(() => 'request_failed')
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMsgId ? { ...m, text: `❌ ${errText}` } : m)),
        )
        return
      }

      // Parse SSE stream
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
            const event = JSON.parse(payload)
            handleEvent(assistantMsgId, event)
          } catch (e) {
            console.warn('SSE parse error:', e, payload.slice(0, 200))
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
          // Mark the most recent matching tool as done
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
          m.id === assistantMsgId
            ? { ...m, blocks: [...(m.blocks || []), event.block] }
            : m,
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
      return
    }
    // 'turn_start', 'done' — informational, no UI update needed
  }

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '24px 16px', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ borderBottom: '1px solid #E4E4E7', paddingBottom: 12, marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Stayloop · Logic 助手</h1>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: '#71717A' }}>
          AI-Native screening · 上传文件或直接说"帮我筛查 …"
        </p>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minHeight: 400 }}>
        {messages.length === 0 && (
          <div style={{ padding: 24, color: '#71717A', fontSize: 13, textAlign: 'center' }}>
            开始一段对话。例如："帮我筛查这位 Bo Han 的申请"，然后拖入文件。
          </div>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} msg={m} />
        ))}
        {streaming && (
          <div style={{ fontSize: 11, color: '#9CA3AF' }}>⏳ Logic is thinking…</div>
        )}
      </div>

      <div style={{ marginTop: 20, borderTop: '1px solid #E4E4E7', paddingTop: 12 }}>
        {attached.length > 0 && (
          <div style={{ marginBottom: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {attached.map((f, i) => (
              <span
                key={i}
                style={{
                  fontSize: 11,
                  padding: '2px 8px',
                  background: '#F4F4F5',
                  borderRadius: 12,
                  color: '#52525B',
                }}
              >
                📎 {f.name}
              </span>
            ))}
            <button
              onClick={() => setAttached([])}
              style={{
                fontSize: 11,
                background: 'none',
                border: 'none',
                color: '#9CA3AF',
                cursor: 'pointer',
              }}
            >
              清除
            </button>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="file" multiple onChange={handleFileChange} style={{ fontSize: 12 }} />
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            placeholder="说点什么……"
            style={{
              flex: 1,
              padding: '8px 12px',
              border: '1px solid #D4D4D8',
              borderRadius: 8,
              fontSize: 14,
            }}
          />
          <button
            onClick={send}
            disabled={streaming}
            style={{
              padding: '8px 18px',
              background: streaming ? '#A7F3D0' : '#0D9488',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: streaming ? 'wait' : 'pointer',
            }}
          >
            {streaming ? '…' : '发送'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Message bubble + block renderers ────────────────────────────────────

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user'
  return (
    <div
      style={{
        alignSelf: isUser ? 'flex-end' : 'flex-start',
        maxWidth: '85%',
        background: isUser ? '#0D9488' : '#F9FAFB',
        color: isUser ? '#fff' : '#18181B',
        padding: '10px 14px',
        borderRadius: 12,
        border: isUser ? 'none' : '1px solid #E4E4E7',
      }}
    >
      {msg.text && (
        <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.55 }}>{msg.text}</div>
      )}
      {msg.toolCalls && msg.toolCalls.length > 0 && (
        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {msg.toolCalls.map((tc, i) => (
            <span
              key={i}
              style={{
                fontSize: 10,
                fontFamily: 'JetBrains Mono, monospace',
                padding: '2px 6px',
                background: '#FFFFFF80',
                color: isUser ? '#fff' : '#52525B',
                borderRadius: 4,
                border: '1px solid #00000010',
              }}
            >
              {tc.status === 'success' ? '✓' : tc.status === 'error' ? '✗' : '⏳'} {tc.name}
            </span>
          ))}
        </div>
      )}
      {msg.blocks?.map((block, i) => (
        <BlockRenderer key={i} block={block} />
      ))}
    </div>
  )
}

function BlockRenderer({ block }: { block: AssistantBlock }) {
  switch (block.kind) {
    case 'text':
      return <div style={{ fontSize: 14, marginTop: 6 }}>{block.markdown}</div>
    case 'screening_card':
      return (
        <div
          style={{
            marginTop: 10,
            padding: 12,
            background: '#FFFFFF',
            border: '1px solid #E4E4E7',
            borderRadius: 10,
          }}
        >
          <div style={{ fontSize: 11, color: '#71717A', fontWeight: 600, marginBottom: 4 }}>
            🛡 Screening Result
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#0D9488', marginBottom: 4 }}>
            {block.overall} <span style={{ fontSize: 13, color: '#71717A' }}>/ 100</span>
          </div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: '3px 8px',
              borderRadius: 4,
              display: 'inline-block',
              background:
                block.tier === 'approve' ? '#DCFCE7' : block.tier === 'conditional' ? '#FEF3C7' : '#FEE2E2',
              color:
                block.tier === 'approve' ? '#166534' : block.tier === 'conditional' ? '#92400E' : '#991B1B',
            }}
          >
            {block.tier}
          </div>
          {block.flags?.length > 0 && (
            <div style={{ marginTop: 10, fontSize: 12 }}>
              {block.flags.map((f: any, i: number) => (
                <div
                  key={i}
                  style={{
                    padding: '4px 0',
                    borderTop: i === 0 ? 'none' : '1px solid #F4F4F5',
                    color: f.severity === 'critical' ? '#991B1B' : '#52525B',
                  }}
                >
                  <strong>[{f.severity}] {f.code}</strong>: {f.evidence_zh || f.evidence_en}
                </div>
              ))}
            </div>
          )}
        </div>
      )
    case 'document_viewer':
      return (
        <div style={{ marginTop: 8, fontSize: 12, color: '#52525B' }}>
          📄 <strong>{block.file_name}</strong>
          {block.annotations?.length > 0 && (
            <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
              {block.annotations.map((a: any, i: number) => (
                <li key={i}>
                  Page {a.page}: {a.note}
                </li>
              ))}
            </ul>
          )}
        </div>
      )
    case 'action_proposal':
      return (
        <div
          style={{
            marginTop: 8,
            padding: 10,
            border: '1px dashed #C084FC',
            borderRadius: 8,
            background: '#FAF5FF',
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: '#6B21A8', marginBottom: 4 }}>
            ⚠ Pending Action: {block.action_kind}
          </div>
          <div style={{ fontSize: 12, color: '#52525B' }}>{block.label_zh || block.label_en}</div>
          <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
            <button
              style={{
                padding: '4px 10px',
                fontSize: 11,
                background: '#7E22CE',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              批准
            </button>
            <button
              style={{
                padding: '4px 10px',
                fontSize: 11,
                background: 'transparent',
                color: '#71717A',
                border: '1px solid #D4D4D8',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              驳回
            </button>
          </div>
        </div>
      )
    case 'files_upload':
      return (
        <div
          style={{
            marginTop: 8,
            padding: 10,
            border: '1px dashed #94A3B8',
            borderRadius: 8,
            fontSize: 12,
            color: '#52525B',
          }}
        >
          📥 {block.hint_zh || block.hint_en || '需要更多文件'}
        </div>
      )
    default:
      return (
        <div style={{ fontSize: 11, color: '#9CA3AF', fontFamily: 'monospace', marginTop: 6 }}>
          [unknown block: {block.kind}]
        </div>
      )
  }
}
