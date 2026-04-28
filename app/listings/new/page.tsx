'use client'

// -----------------------------------------------------------------------------
// /listings/new — Nova-driven listing composer
// -----------------------------------------------------------------------------
// Three input methods (paste text / paste URL / upload PDF) → Nova agent
// orchestrates import_listing → check_ohrc_compliance → save_listing.
// Streaming SSE chat in the right pane, structured listing preview on the
// left as Nova fills in fields.
// -----------------------------------------------------------------------------

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { tokens } from '@/lib/agent/theme'
import AppHeader from '@/components/AppHeader'

interface ChatLine {
  id: string
  role: 'user' | 'assistant'
  text: string
  toolCalls?: Array<{ name: string; status?: string }>
  blocks?: any[]
}

interface ListingDraft {
  title_en?: string
  title_zh?: string
  description_en?: string
  description_zh?: string
  address?: string
  city?: string
  province?: string
  postal_code?: string
  monthly_rent?: number
  bedrooms?: number
  bathrooms?: number
  parking?: string
  utilities_included?: string[]
  pet_policy?: string
  available_date?: string
  selling_points_zh?: string[]
  selling_points_en?: string[]
}

export default function NewListingPage() {
  const [mode, setMode] = useState<'text' | 'url' | 'pdf'>('text')
  const [text, setText] = useState('')
  const [url, setUrl] = useState('')
  const [pdfPath, setPdfPath] = useState<string | null>(null)
  const [chat, setChat] = useState<ChatLine[]>([])
  const [streaming, setStreaming] = useState(false)
  const [draft, setDraft] = useState<ListingDraft | null>(null)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [authToken, setAuthToken] = useState<string | null>(null)
  const [lang, setLang] = useState<'zh' | 'en'>('zh')
  const [chatInput, setChatInput] = useState('')
  // Once Nova fires save_listing successfully we capture the row id here so
  // the user can flip draft → active straight from the draft preview pane.
  const [savedListingId, setSavedListingId] = useState<string | null>(null)
  const [listingStatus, setListingStatus] = useState<'draft' | 'active'>('draft')
  const [publishing, setPublishing] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const chatScrollRef = useRef<HTMLDivElement | null>(null)

  // NOTE: We use the shared `supabase` singleton from lib/supabase.ts (flowType:
  // 'implicit', localStorage-backed) rather than spinning up a new browser
  // client here. The previous version used createBrowserClient from
  // @supabase/ssr which defaults to PKCE/cookie storage — that doesn't share
  // session state with the rest of the app, so the page always thought the
  // user was logged out even when they weren't.
  useEffect(() => {
    // Initial session read — populates authToken on mount.
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthToken(session?.access_token ?? null)
    })
    // Stay in sync with subsequent auth state changes (token refresh,
    // sign-out from another tab, etc).
    const sub = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthToken(session?.access_token ?? null)
    })
    return () => {
      sub.data.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => () => abortRef.current?.abort(), [])

  // Auto-scroll the Nova log to the bottom as new messages stream in.
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight
    }
  }, [chat])

  // Send the composer's text as a follow-up question to Nova. Used by the
  // Claude-style input at the bottom of the right panel so the user can keep
  // refining the listing after the initial import (e.g. "make the title more
  // upscale", "translate the description to plain English", "add a pet
  // policy: cats only").
  //
  // Don't clear the input until the request actually starts. If runNova
  // throws (network error, auth gone, etc.) we restore the input so the user
  // doesn't lose what they typed.
  async function sendChatMessage() {
    const msg = chatInput.trim()
    if (!msg || streaming) return
    const previousInput = chatInput
    setChatInput('')
    try {
      await runNova(msg)
    } catch (e) {
      setChatInput(previousInput)
      throw e
    }
  }

  async function uploadPdf(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    // Re-fetch the session live (don't rely on local authToken state — it may
    // not have hydrated yet on this page mount).
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      alert(lang === 'zh' ? '请先登录' : 'Please sign in')
      return
    }
    const stamp = Date.now()
    const safeName = f.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `listings/${user.id}/${stamp}_${safeName}`
    const { error } = await supabase.storage
      .from('tenant-files')
      .upload(path, f, { contentType: f.type })
    if (error) {
      alert(error.message)
      return
    }
    setPdfPath(path)
  }

  async function startWithSource() {
    // Be defensive: authToken from state may not have hydrated yet, so try a
    // live getSession() before falling back to the alert. The user is almost
    // certainly logged in if they reached this page (the avatar in AppHeader
    // requires a session) — no point bouncing them with "请先登录".
    let token = authToken
    if (!token) {
      const { data: { session } } = await supabase.auth.getSession()
      token = session?.access_token ?? null
      if (token) setAuthToken(token)
    }
    if (!token) {
      alert(lang === 'zh' ? '请先登录' : 'Please sign in')
      return
    }
    let userMessage = ''
    if (mode === 'text') {
      if (!text.trim()) return alert(lang === 'zh' ? '请粘贴房源描述' : 'Paste listing description first')
      userMessage =
        (lang === 'zh' ? '请帮我把这段房源整理成 Stayloop 双语 listing：\n' : 'Please convert this into a Stayloop bilingual listing:\n') +
        text
    } else if (mode === 'url') {
      if (!url.trim()) return alert(lang === 'zh' ? '请粘贴 URL' : 'Paste a URL first')
      userMessage =
        (lang === 'zh' ? '请从这个链接抓取房源并整理成 Stayloop 双语 listing：' : 'Fetch this listing URL and convert to Stayloop bilingual format: ') +
        url
    } else {
      if (!pdfPath) return alert(lang === 'zh' ? '请上传 PDF' : 'Upload a PDF first')
      userMessage =
        (lang === 'zh' ? '请从 MLS PDF 抽取房源信息并整理：' : 'Extract listing data from this MLS PDF: ') +
        `[file at ${pdfPath}]`
    }
    await runNova(userMessage)
  }

  async function runNova(message: string) {
    if (!authToken) return
    setStreaming(true)
    const userMsgId = `u_${Date.now()}`
    const assistantMsgId = `a_${Date.now()}`
    setChat((prev) => [
      ...prev,
      { id: userMsgId, role: 'user', text: message },
      { id: assistantMsgId, role: 'assistant', text: '', toolCalls: [], blocks: [] },
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
          agent_kind: 'nova',
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
    if (event.type === 'tool_use') {
      setChat((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? { ...m, toolCalls: [...(m.toolCalls || []), { name: event.tool_name }] }
            : m,
        ),
      )
      return
    }
    if (event.type === 'tool_result') {
      setChat((prev) =>
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
      // Update the live draft preview when import_listing returns
      if (event.tool_name === 'import_listing' && event.output?.listing) {
        setDraft(event.output.listing)
      }
      // Capture the row id once Nova auto-saves so the user can publish from
      // the draft preview without leaving this page.
      if (
        event.tool_name === 'save_listing' &&
        event.status === 'success' &&
        event.output?.listing_id
      ) {
        setSavedListingId(event.output.listing_id)
        setListingStatus('draft')
      }
      return
    }
  }

  // Flip the saved draft to active. Uses the user's own Supabase session so
  // landlord RLS policies gate the write to their own listings.id.
  async function publishListing() {
    if (!savedListingId || publishing) return
    setPublishing(true)
    try {
      const { error } = await supabase
        .from('listings')
        .update({ status: 'active', is_active: true })
        .eq('id', savedListingId)
      if (error) {
        alert(
          (lang === 'zh' ? '发布失败：' : 'Publish failed: ') + error.message,
        )
        return
      }
      setListingStatus('active')
    } finally {
      setPublishing(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: tokens.surfaceMuted, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <AppHeader
        back="/dashboard"
        title="New listing · Nova"
        titleZh="新建房源 · Nova"
      />

      <main
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          padding: '24px 16px',
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
          gap: 24,
        }}
      >
        {/* Left: source input + draft preview */}
        <section>
          <div
            style={{
              background: tokens.surface,
              border: `1px solid ${tokens.border}`,
              borderRadius: 14,
              padding: 18,
              marginBottom: 18,
            }}
          >
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: tokens.textPrimary }}>
              {lang === 'zh' ? '从哪里导入？' : 'Import from'}
            </h3>
            <div style={{ marginTop: 12, display: 'flex', gap: 6 }}>
              {(['text', 'url', 'pdf'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  style={{
                    flex: 1,
                    padding: '8px 10px',
                    fontSize: 12,
                    fontWeight: 600,
                    background: mode === m ? tokens.accent : tokens.surface,
                    color: mode === m ? '#fff' : tokens.textSecondary,
                    border: `1px solid ${mode === m ? tokens.accent : tokens.border}`,
                    borderRadius: 8,
                    cursor: 'pointer',
                  }}
                >
                  {m === 'text' ? (lang === 'zh' ? '粘贴文字' : 'Paste text')
                    : m === 'url' ? (lang === 'zh' ? '粘贴链接' : 'Paste URL')
                    : (lang === 'zh' ? '上传 MLS PDF' : 'Upload MLS PDF')}
                </button>
              ))}
            </div>
            <div style={{ marginTop: 12 }}>
              {mode === 'text' && (
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={
                    lang === 'zh'
                      ? '粘贴你手头的房源描述（来自 Kijiji / 51.ca / 蝌蚪 / 自己写的也行）'
                      : 'Paste your listing copy (from Kijiji / 51.ca / handwritten — anything goes)'
                  }
                  rows={10}
                  // Explicit color + bg so the global :root color (light text from
                  // the dark theme) doesn't bleed through and make typed text
                  // invisible against the white field. WebkitTextFillColor pins
                  // iOS Safari which sometimes overrides via autofill style.
                  style={{
                    width: '100%',
                    padding: 12,
                    border: `1px solid ${tokens.border}`,
                    borderRadius: 8,
                    fontSize: 13,
                    fontFamily: 'inherit',
                    resize: 'vertical',
                    boxSizing: 'border-box',
                    background: '#FFFFFF',
                    color: '#0B1736',
                    WebkitTextFillColor: '#0B1736',
                    caretColor: '#0B1736',
                  }}
                />
              )}
              {mode === 'url' && (
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://www.realtor.ca/real-estate/..."
                  style={{
                    width: '100%',
                    padding: 12,
                    border: `1px solid ${tokens.border}`,
                    borderRadius: 8,
                    fontSize: 13,
                    boxSizing: 'border-box',
                    background: '#FFFFFF',
                    color: '#0B1736',
                    WebkitTextFillColor: '#0B1736',
                    caretColor: '#0B1736',
                  }}
                />
              )}
              {mode === 'pdf' && (
                <div>
                  <input type="file" accept="application/pdf" onChange={uploadPdf} style={{ fontSize: 12 }} />
                  {pdfPath && (
                    <div style={{ marginTop: 8, fontSize: 11, color: tokens.success }}>
                      📄 {pdfPath.split('/').pop()} {lang === 'zh' ? '已上传' : 'uploaded'}
                    </div>
                  )}
                </div>
              )}
              <button
                onClick={startWithSource}
                disabled={streaming}
                style={{
                  marginTop: 12,
                  width: '100%',
                  padding: '10px 18px',
                  background: streaming ? tokens.accentLight : tokens.accent,
                  color: streaming ? tokens.accentDark : '#fff',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: streaming ? 'wait' : 'pointer',
                }}
              >
                {streaming ? (lang === 'zh' ? 'Nova 正在处理…' : 'Nova working…') : (lang === 'zh' ? '让 Nova 整理' : 'Let Nova handle it')}
              </button>
            </div>
          </div>

          <DraftPreview
            draft={draft}
            lang={lang}
            savedListingId={savedListingId}
            listingStatus={listingStatus}
            publishing={publishing}
            onPublish={publishListing}
          />
        </section>

        {/* Right: chat panel */}
        <section
          style={{
            background: tokens.surface,
            border: `1px solid ${tokens.border}`,
            borderRadius: 14,
            padding: 18,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 540,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: tokens.textTertiary,
              letterSpacing: 0.4,
              textTransform: 'uppercase',
              marginBottom: 10,
            }}
          >
            Nova ✦ {lang === 'zh' ? '工作进度' : 'Working log'}
          </div>
          <div ref={chatScrollRef} style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, paddingRight: 4, minHeight: 320, maxHeight: 'calc(100vh - 360px)' }}>
            {chat.length === 0 && (
              <div style={{ color: tokens.textTertiary, fontSize: 12, lineHeight: 1.55 }}>
                {lang === 'zh'
                  ? '左侧选择输入方式，Nova 会逐步整理 → 合规检查 → 存草稿。下方输入框可以继续追问 Nova。'
                  : 'Pick a source on the left. Nova will import → check OHRC compliance → save as draft. Use the box below to keep chatting with Nova.'}
              </div>
            )}
            {chat.map((m) => (
              <div
                key={m.id}
                style={{
                  alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '95%',
                  background: m.role === 'user' ? tokens.accent : tokens.surfaceMuted,
                  color: m.role === 'user' ? '#fff' : tokens.textPrimary,
                  padding: '8px 12px',
                  borderRadius: 10,
                  fontSize: 13,
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {m.text}
                {m.toolCalls && m.toolCalls.length > 0 && (
                  <div style={{ marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {m.toolCalls.map((tc, i) => (
                      <span
                        key={i}
                        style={{
                          fontSize: 10,
                          fontFamily: 'JetBrains Mono, monospace',
                          padding: '2px 6px',
                          borderRadius: 3,
                          background: m.role === 'user' ? 'rgba(255,255,255,0.15)' : tokens.surface,
                          color: m.role === 'user'
                            ? '#fff'
                            : tc.status === 'success' ? tokens.success
                            : tc.status === 'error' ? tokens.danger
                            : tokens.textTertiary,
                          border: m.role === 'user' ? 'none' : `1px solid ${tokens.borderSubtle}`,
                        }}
                      >
                        {tc.status === 'success' ? '✓' : tc.status === 'error' ? '✗' : '⏳'} {tc.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* ─── Composer ─────────────────────────────────────────────────
              Claude-style chat input. Sticky to the bottom of the Nova
              panel so the user can keep refining the listing after import
              ("make the title more upscale", "add cats-only pet policy"...
              ) without going back to the left source pane. */}
          <div
            style={{
              marginTop: 12,
              border: `1px solid ${tokens.border}`,
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
                // Enter sends, Shift+Enter inserts a newline.
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void sendChatMessage()
                }
              }}
              placeholder={
                lang === 'zh'
                  ? '继续追问 Nova … (Enter 发送 · Shift+Enter 换行)'
                  : 'Keep chatting with Nova… (Enter to send · Shift+Enter for newline)'
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
                title={lang === 'zh' ? '停止' : 'Stop'}
                style={{
                  width: 36, height: 36, borderRadius: 10,
                  border: `1px solid ${tokens.border}`,
                  background: '#FFFFFF',
                  color: tokens.textSecondary,
                  fontSize: 14, lineHeight: 1, cursor: 'pointer',
                  display: 'grid', placeItems: 'center',
                  flexShrink: 0,
                }}
              >
                ■
              </button>
            ) : (
              <button
                onClick={() => void sendChatMessage()}
                disabled={!chatInput.trim()}
                title={lang === 'zh' ? '发送' : 'Send'}
                style={{
                  width: 36, height: 36, borderRadius: 10,
                  border: 'none',
                  background: chatInput.trim()
                    ? 'linear-gradient(135deg, #6EE7B7 0%, #34D399 100%)'
                    : tokens.surfaceMuted,
                  color: chatInput.trim() ? '#FFFFFF' : tokens.textTertiary,
                  fontSize: 16, lineHeight: 1,
                  cursor: chatInput.trim() ? 'pointer' : 'not-allowed',
                  display: 'grid', placeItems: 'center',
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
    </div>
  )
}

// ─── Live draft preview ─────────────────────────────────────────────────

function DraftPreview({
  draft,
  lang,
  savedListingId,
  listingStatus,
  publishing,
  onPublish,
}: {
  draft: ListingDraft | null
  lang: 'zh' | 'en'
  savedListingId: string | null
  listingStatus: 'draft' | 'active'
  publishing: boolean
  onPublish: () => void
}) {
  if (!draft) {
    return (
      <div
        style={{
          background: tokens.surface,
          border: `1px dashed ${tokens.borderStrong}`,
          borderRadius: 14,
          padding: 24,
          fontSize: 12,
          color: tokens.textTertiary,
          textAlign: 'center',
        }}
      >
        {lang === 'zh' ? 'Nova 整理后会在这里实时显示草稿' : 'Nova will preview the draft here as it works'}
      </div>
    )
  }
  const title = lang === 'zh' ? draft.title_zh || draft.title_en : draft.title_en || draft.title_zh
  const desc = lang === 'zh' ? draft.description_zh || draft.description_en : draft.description_en || draft.description_zh
  const sellingPoints = lang === 'zh' ? draft.selling_points_zh || [] : draft.selling_points_en || []
  return (
    <div
      style={{
        background: tokens.surface,
        border: `1px solid ${tokens.border}`,
        borderRadius: 14,
        padding: 18,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: tokens.accentDark, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 8 }}>
        {lang === 'zh' ? '草稿预览' : 'Draft Preview'}
      </div>
      <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 700, color: tokens.textPrimary, lineHeight: 1.3 }}>
        {title || (lang === 'zh' ? '（标题待生成）' : '(title pending)')}
      </h2>
      <div style={{ fontSize: 12, color: tokens.textTertiary, marginBottom: 14 }}>
        {[draft.address, draft.city, draft.province, draft.postal_code].filter(Boolean).join(', ')}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 14 }}>
        {draft.monthly_rent && <Stat label={lang === 'zh' ? '月租' : 'Rent'} value={`$${draft.monthly_rent}`} />}
        {draft.bedrooms !== undefined && draft.bedrooms !== null && (
          <Stat label={lang === 'zh' ? '卧室' : 'Bedrooms'} value={String(draft.bedrooms)} />
        )}
        {draft.bathrooms !== undefined && draft.bathrooms !== null && (
          <Stat label={lang === 'zh' ? '浴室' : 'Bathrooms'} value={String(draft.bathrooms)} />
        )}
        {draft.parking && <Stat label={lang === 'zh' ? '车位' : 'Parking'} value={draft.parking} />}
        {draft.pet_policy && <Stat label={lang === 'zh' ? '宠物' : 'Pets'} value={draft.pet_policy} />}
        {draft.available_date && <Stat label={lang === 'zh' ? '入住日期' : 'Available'} value={draft.available_date} />}
      </div>

      {(draft.utilities_included || []).length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: tokens.textTertiary, marginBottom: 4 }}>
            {lang === 'zh' ? '包含的水电费' : 'Utilities included'}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(draft.utilities_included || []).map((u, i) => (
              <span
                key={i}
                style={{
                  fontSize: 11,
                  padding: '3px 8px',
                  background: tokens.accentMuted,
                  color: tokens.accentDark,
                  borderRadius: 12,
                }}
              >
                {u}
              </span>
            ))}
          </div>
        </div>
      )}

      {desc && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: tokens.textTertiary, marginBottom: 4 }}>
            {lang === 'zh' ? '描述' : 'Description'}
          </div>
          <p style={{ margin: 0, fontSize: 13, color: tokens.textPrimary, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{desc}</p>
        </div>
      )}

      {sellingPoints.length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: tokens.textTertiary, marginBottom: 4 }}>
            {lang === 'zh' ? '卖点' : 'Selling Points'}
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: tokens.textPrimary, lineHeight: 1.55 }}>
            {sellingPoints.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      {/* ─── Publish action ─────────────────────────────────────────────
          Once Nova has saved the draft (savedListingId set), the user can
          flip status: 'draft' → 'active' to make it live. Same soft-mint
          gradient as the rest of the app's primary CTAs. */}
      {savedListingId && (
        <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${tokens.borderSubtle}` }}>
          {listingStatus === 'active' ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                padding: '12px 16px',
                background: 'rgba(4, 120, 87, 0.10)',
                border: '1px solid rgba(4, 120, 87, 0.30)',
                borderRadius: 10,
                fontSize: 13,
                color: '#047857',
                fontWeight: 600,
              }}
            >
              <span>
                ✓ {lang === 'zh' ? '已上线' : 'Published & live'}
              </span>
              <a
                href="/dashboard/portfolio"
                style={{
                  fontSize: 12,
                  color: '#047857',
                  textDecoration: 'underline',
                  fontWeight: 500,
                }}
              >
                {lang === 'zh' ? '查看全部 →' : 'View all →'}
              </a>
            </div>
          ) : (
            <button
              onClick={onPublish}
              disabled={publishing}
              style={{
                width: '100%',
                padding: '12px 18px',
                fontSize: 14,
                fontWeight: 650,
                borderRadius: 10,
                border: 'none',
                color: '#FFFFFF',
                background: publishing
                  ? '#C5BDAA'
                  : 'linear-gradient(135deg, #6EE7B7 0%, #34D399 100%)',
                boxShadow: publishing
                  ? 'none'
                  : '0 8px 22px -10px rgba(52, 211, 153, 0.45), 0 1px 0 rgba(255, 255, 255, 0.30) inset',
                cursor: publishing ? 'wait' : 'pointer',
                transition: 'background .15s, box-shadow .15s',
              }}
            >
              {publishing
                ? (lang === 'zh' ? '正在发布…' : 'Publishing…')
                : (lang === 'zh' ? '✦ 发布上线' : '✦ Publish listing')}
            </button>
          )}
          <div style={{ fontSize: 11, color: tokens.textTertiary, marginTop: 8, lineHeight: 1.5 }}>
            {lang === 'zh'
              ? '草稿已自动保存。点击发布后，租客可以在筛选页搜到这套房源。'
              : 'Draft auto-saved. Once published, tenants can discover this listing in search.'}
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: 10,
        background: tokens.surfaceMuted,
        borderRadius: 8,
      }}
    >
      <div style={{ fontSize: 10, color: tokens.textTertiary, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: tokens.textPrimary }}>{value}</div>
    </div>
  )
}
