'use client'
// /echo — Tenant Echo concierge (V3 section 01)
// Production: streams real Echo agent responses via /api/agent/chat?agent_kind=echo.
import { useEffect, useRef, useState } from 'react'
import { v3 } from '@/lib/brand'
import { useT } from '@/lib/i18n'
import { Phone } from '@/components/v3/Frame'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/lib/useUser'
import PageShell from '@/components/v4/PageShell'

interface ChatLine {
  id: string
  role: 'user' | 'assistant'
  text: string
}

export default function EchoPage() {
  const { lang } = useT()
  const isZh = lang === 'zh'
  const { user } = useUser({ redirectIfMissing: true })
  const [messages, setMessages] = useState<ChatLine[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [convId, setConvId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  async function send() {
    if (!input.trim() || busy) return
    const text = input.trim()
    setInput('')
    setBusy(true)

    const userMsg: ChatLine = { id: crypto.randomUUID(), role: 'user', text }
    setMessages((m) => [...m, userMsg])

    const placeholderId = crypto.randomUUID()
    setMessages((m) => [...m, { id: placeholderId, role: 'assistant', text: '' }])

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token || ''}`,
        },
        body: JSON.stringify({
          conversation_id: convId,
          agent_kind: 'echo',
          message: text,
        }),
      })

      if (!res.body) throw new Error('No stream')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      let acc = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const events = buf.split('\n\n')
        buf = events.pop() || ''
        for (const e of events) {
          if (!e.startsWith('data: ')) continue
          try {
            const ev = JSON.parse(e.slice(6))
            if (ev.type === 'conversation') {
              setConvId(ev.conversation_id)
            } else if (ev.type === 'text') {
              acc += ev.delta || ''
              setMessages((m) => m.map((x) => (x.id === placeholderId ? { ...x, text: acc } : x)))
            } else if (ev.type === 'message_end') {
              if (ev.text) {
                acc = ev.text
                setMessages((m) => m.map((x) => (x.id === placeholderId ? { ...x, text: acc } : x)))
              }
            } else if (ev.type === 'error') {
              acc = `[error] ${ev.message}`
              setMessages((m) => m.map((x) => (x.id === placeholderId ? { ...x, text: acc } : x)))
            }
          } catch {}
        }
      }
    } catch (err: any) {
      setMessages((m) =>
        m.map((x) => (x.id === placeholderId ? { ...x, text: `[error] ${err?.message || err}` } : x)),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <PageShell noPadding>
      <Phone>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ padding: '8px 16px 12px', borderBottom: `1px solid ${v3.divider}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 10, background: `linear-gradient(135deg, ${v3.brand}, ${v3.brandStrong})`, display: 'grid', placeItems: 'center' }}>
                <span style={{ fontSize: 16, color: '#fff' }}>✦</span>
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em' }}>Echo</div>
                <div style={{ fontSize: 10.5, color: v3.brand, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 5, height: 5, borderRadius: 999, background: v3.brand }} />
                  Online · 中英双语
                </div>
              </div>
            </div>
            <div style={{ width: 28, height: 28, borderRadius: 999, background: v3.brand, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700 }}>
              {user?.email?.[0]?.toUpperCase() || '·'}
            </div>
          </div>

          <div ref={scrollRef} style={{ flex: 1, padding: '14px 14px 8px', display: 'flex', flexDirection: 'column', gap: 12, overflow: 'auto' }}>
            {messages.length === 0 && (
              <>
                <div style={{ textAlign: 'center', fontSize: 10, color: v3.textFaint, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  {isZh ? '今天 · 在线' : 'Today · Online'}
                </div>
                <div style={{ alignSelf: 'flex-start', maxWidth: '92%' }}>
                  <div style={{ background: v3.surfaceMuted, border: `1px solid ${v3.border}`, borderRadius: '16px 16px 16px 4px', padding: '11px 13px', fontSize: 13, lineHeight: 1.5, color: v3.textPrimary }}>
                    {isZh
                      ? '你好！我是 Echo。问我找房、解释租约、或者查房东背景。中英文都行。'
                      : 'Hi! I\u2019m Echo. Ask me to find listings, explain a lease clause, or check a landlord\u2019s background. EN + 中文 both work.'}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignSelf: 'flex-start', width: '100%' }}>
                  {[
                    isZh ? '帮我看看 King West 1B1B 预算 $2400' : 'Find me a 1B1B in King West, budget $2400',
                    isZh ? '租约第 4.1 条是什么意思？' : 'What does clause 4.1 mean?',
                    isZh ? '查一下 ABC Realty Inc. 是不是真的公司' : 'Is ABC Realty Inc. a real company?',
                  ].map((q) => (
                    <button
                      key={q}
                      onClick={() => setInput(q)}
                      style={{ textAlign: 'left', background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 10, padding: '10px 12px', fontSize: 12, color: v3.textPrimary, cursor: 'pointer' }}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </>
            )}

            {messages.map((m) => (
              <div key={m.id} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
                <div
                  style={{
                    background: m.role === 'user' ? v3.textPrimary : v3.surfaceMuted,
                    color: m.role === 'user' ? v3.surface : v3.textPrimary,
                    border: m.role === 'user' ? 'none' : `1px solid ${v3.border}`,
                    padding: '9px 13px',
                    borderRadius: m.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                    fontSize: 13,
                    lineHeight: 1.5,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {m.text || (m.role === 'assistant' && busy ? <span style={{ color: v3.textMuted }}>…</span> : '')}
                </div>
              </div>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              void send()
            }}
            style={{ padding: '8px 14px 14px', borderTop: `1px solid ${v3.divider}`, display: 'flex', gap: 8, alignItems: 'center' }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isZh ? '用任何语言问我…' : 'Ask in any language…'}
              disabled={busy}
              style={{ flex: 1, background: v3.surfaceMuted, border: `1px solid ${v3.border}`, borderRadius: 999, padding: '9px 14px', fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              style={{ width: 36, height: 36, borderRadius: 999, background: busy || !input.trim() ? v3.divider : v3.brand, border: 'none', display: 'grid', placeItems: 'center', color: '#fff', fontSize: 16, cursor: busy || !input.trim() ? 'default' : 'pointer' }}
            >
              →
            </button>
          </form>
        </div>
      </Phone>
    </PageShell>
  )
}
