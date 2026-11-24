'use client'

// One line into the main conversation (2026-11-24, user: 「是不是在产品页，要加上 AI 对话的功能？或者用已经有的
// AI 主对话？」). The answer was the second: a person has one AI Agent — its memory, its approval cards
// and its audit trail are in one place — so a page does not get a conversation of its own. It gets
// this: a role, a sentence, and a send button that lands in that role's AI Agent page with the
// sentence sent on arrival (lib/homeDeepLink.ts assistantPromptHref — the same hand-off the
// homepage's ask box and the workspace pages use). Anonymous visitors get the preview there (not
// saved, hourly limit); signed-in visitors their own assistant.
//
// The first render is the server's (the default role); the role picked in this tab — shared with the
// homepage's box — or, signed in, the hat the person wears, arrives in an effect.
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { ASK_MAX, ASSISTANT_ROLES, assistantPromptHref, isAssistantRole, type AssistantRole } from '@/lib/homeDeepLink'
import { DEFAULT_ASK_ROLE, ROLE_KEY, ROLE_LABEL } from '@/components/home/HeroComposer'
import { HOME, homeForHats } from '@/lib/landlordHat'
import { roleStorageKey, useAuth } from '@/lib/useAuth'
import { useHats } from '@/lib/useHats'

/** Signed in: the hat the person wears, when that hat has an AI Agent page; otherwise null. */
function useWornRole(): AssistantRole | null {
  const auth = useAuth()
  const hats = useHats()
  const [worn, setWorn] = useState<AssistantRole | null>(null)
  useEffect(() => {
    const user = auth.user as ({ id: string; is_anonymous?: boolean } | null)
    if (auth.loading || !user || user.is_anonymous || hats.loading) { setWorn(null); return }
    let stored: string | null = auth.role
    try { stored = window.localStorage.getItem(roleStorageKey(user.id)) ?? auth.role } catch { /* private mode */ }
    const home = homeForHats(stored, { landlord: hats.landlord, agent: hats.agent, provider: hats.provider })
    const hat = Object.entries(HOME).find(([, h]) => h === home)?.[0]
    setWorn(isAssistantRole(hat) ? hat : null)
  }, [auth.loading, auth.user, auth.role, hats.loading, hats.landlord, hats.agent, hats.provider])
  return worn
}

export default function AskBar({ zh, className = '', testId = 'ask-bar' }: { zh: boolean; className?: string; testId?: string }) {
  const router = useRouter()
  const worn = useWornRole()
  const [role, setRole] = useState<AssistantRole>(DEFAULT_ASK_ROLE)
  const [text, setText] = useState('')
  const [going, setGoing] = useState(false)
  const [narrow, setNarrow] = useState(false)
  const picked = useRef(false)

  // Phones: the full placeholder does not fit beside the role and the button, so a short one (after mount — the first render is the server's).
  useEffect(() => {
    if (!window.matchMedia) return
    const mq = window.matchMedia('(max-width: 639px)')
    const on = () => setNarrow(mq.matches)
    on()
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [])

  // A pick made in this tab wins; otherwise a signed-in visitor asks as the hat they wear.
  useEffect(() => {
    if (picked.current) return
    try { const r = sessionStorage.getItem(ROLE_KEY); if (isAssistantRole(r)) { setRole(r); return } } catch { /* private mode */ }
    if (worn) setRole(worn)
  }, [worn])

  // Back from the AI Agent page may restore this page from the bfcache: let the button work again.
  useEffect(() => {
    const onShow = () => setGoing(false)
    window.addEventListener('pageshow', onShow)
    return () => window.removeEventListener('pageshow', onShow)
  }, [])

  const pickRole = (r: AssistantRole) => {
    picked.current = true
    setRole(r)
    try { sessionStorage.setItem(ROLE_KEY, r) } catch { /* private mode */ }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (going) return
    const typed = text.trim().slice(0, ASK_MAX)
    setGoing(true)
    // nothing typed: open that role's conversation and let the person start there
    router.push(typed ? assistantPromptHref(role, typed) : `/${role}/agent`)
  }

  const label = zh ? '想办哪件事，直接跟 AI 助理说' : 'Tell the AI Agent what you need'
  return (
    <form
      onSubmit={submit}
      aria-label={label}
      data-testid={testId}
      className={`flex h-[60px] w-full max-w-[720px] items-center gap-1.5 rounded-full border border-line-divider bg-white pl-2 pr-2 shadow-[0_14px_34px_-20px_rgba(27,27,60,0.4)] has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-[#0094C6] ${className}`}
    >
      <label className="relative flex-none">
        <span className="sr-only">{zh ? '以哪个身份问' : 'Ask as'}</span>
        <select
          value={role}
          onChange={(e) => { if (isAssistantRole(e.target.value)) pickRole(e.target.value) }}
          data-testid={`${testId}-role`}
          className="h-11 cursor-pointer appearance-none rounded-full bg-[#EEF5FA] pl-3.5 pr-7 text-[15px] font-semibold text-ink outline-none transition hover:bg-[#E3F2FC] focus-visible:ring-2 focus-visible:ring-[#0094C6]"
        >
          {ASSISTANT_ROLES.map((r) => <option key={r} value={r}>{zh ? ROLE_LABEL[r].zh : ROLE_LABEL[r].en}</option>)}
        </select>
        <svg aria-hidden width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-body-3"><path d="m6 9 6 6 6-6" /></svg>
      </label>
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={ASK_MAX}
        enterKeyHint="send"
        placeholder={narrow ? (zh ? '问 AI 助理…' : 'Ask the AI Agent…') : label}
        aria-label={label}
        data-testid={`${testId}-input`}
        className="min-w-0 flex-1 overflow-hidden text-ellipsis bg-transparent px-1.5 text-[16px] text-ink outline-none placeholder:text-body-3 sm:text-[17px]"
      />
      <button
        type="submit"
        disabled={going}
        aria-label={zh ? '发送给 AI 助理' : 'Send to the AI Agent'}
        data-testid={`${testId}-send`}
        className="flex h-11 w-11 flex-none items-center justify-center rounded-full text-white transition hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0094C6] disabled:opacity-60"
        style={{ background: '#00ACE4' }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
      </button>
    </form>
  )
}
