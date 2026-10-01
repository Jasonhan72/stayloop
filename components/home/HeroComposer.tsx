'use client'

// The homepage's ask box (2026-10-01, user: 「是否这个登录的改为 America.gov 这样的对话框 + 底图，
// 样式和大小就按照这个 america 来做，对话框先就一行，输入了以后就掉到全屏的这个助手页面，继续可以对话」 →
// 「按照你的建议来修改」).
//
// America.gov, measured the same day: a rounded photo card (~688×458, radius 40) with a white one-line
// composer laid on its top edge (inset 16px, 96px tall, 21px text), the placeholder cycling through ten
// "Try '…'" examples whose photo changes with them, and prev / pause / next (56px round) under the card.
// Submitting turns the page into a full-screen chat; no account is ever asked for.
//
// Here the card uses the 3D scenes of the three-role film; each example belongs to a role, and the
// composer carries a role chip (租客 / 房东 / 经纪, default tenant — the three AI Agents do different
// things). Typed text goes to the chip's role; the chip never follows the rotating examples (it did in
// the first build, and a tenant's question typed while a landlord example was on show went to the
// landlord's AI Agent). An empty submit tries the example on show, as the example's own role — the
// placeholder says 「试试」, with the role in brackets when it differs from the chip. Either way the
// visitor lands on that role's full-screen AI Agent page with the question sent on arrival
// (`/<role>/agent?prompt=…&send=1`): anonymous visitors get the preview (not saved, hourly limit);
// signed-in visitors never see the homepage.
//
// Review 2026-10-01: rotation stops while the pointer or keyboard focus is anywhere in the box, while
// the card is off screen and while the tab is hidden; an empty submit within 1.5 s of an automatic
// change sends the example the visitor was reading; only changes the visitor makes are announced to
// screen readers; phones (where the placeholder cannot fit) get a short placeholder and the example as
// a tappable caption on the photo; only the current and next photos load.
import { useCallback, useEffect, useRef, useState, type FocusEvent, type FormEvent, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ASK_MAX, ASSISTANT_ROLES, assistantPromptHref, isAssistantRole, type AssistantRole } from '@/lib/homeDeepLink'

type Bi = { zh: string; en: string }
export type HeroExample = { role: AssistantRole; img: string; alt: Bi; ask: Bi }

// Every example is something that role's anonymous preview really answers (tests/homeAsk20261001):
// tenants and agents get the live listing + TRREB pipeline, landlords the listing-draft card, the
// screening hand-off and — when renewal is asked about — the same RTA facts as tenants; years are
// absolute because the prompt carries no date.
export const HERO_EXAMPLES: HeroExample[] = [
  { role: 'tenant', img: '/home/film/mia-subway.webp', alt: { zh: '租客 Mia 在地铁上用手机找房', en: 'Mia, a tenant, searching on her phone on the subway' }, ask: { zh: '帮我在 King West 找一套 $2,800 以内的一房', en: 'Find me a one-bedroom in King West under $2,800' } },
  { role: 'landlord', img: '/home/film/sarah-kitchen.webp', alt: { zh: '房东 Sarah 在厨房用电脑', en: 'Sarah, a landlord, at her laptop in the kitchen' }, ask: { zh: '帮我发一个房源：28 Avondale Ave 1203，1+1，$2,450，11 月 1 日起租', en: 'List my unit: 28 Avondale Ave #1203, 1+1, $2,450, available November 1' } },
  { role: 'tenant', img: '/home/film/showing.webp', alt: { zh: '经纪带租客看房', en: 'An agent showing a tenant an apartment' }, ask: { zh: '看房时要问房东哪些问题？', en: 'What should I ask the landlord at a viewing?' } },
  { role: 'agent', img: '/home/film/david-lobby.webp', alt: { zh: '经纪 David 在公寓大堂', en: 'David, an agent, in a condo lobby' }, ask: { zh: '帮我给 King West 的两房定个挂牌价', en: 'Help me price a two-bedroom listing in King West' } },
  { role: 'tenant', img: '/home/film/mia-cat.webp', alt: { zh: 'Mia 和她的猫在家', en: 'Mia at home with her cat' }, ask: { zh: '我养了一只猫，租约里的禁宠条款有效吗？', en: 'I have a cat — is a no-pets clause in my lease valid?' } },
  { role: 'landlord', img: '/home/film/sarah-report.webp', alt: { zh: 'Sarah 戴着眼镜看筛查报告', en: 'Sarah reading a screening report' }, ask: { zh: '筛查一位申请人要准备哪些材料？', en: 'What do I need to screen an applicant?' } },
  { role: 'tenant', img: '/home/film/mia-sofa.webp', alt: { zh: 'Mia 晚上在沙发上用电脑', en: 'Mia on the sofa with her laptop in the evening' }, ask: { zh: '房东说 2027 年涨租 5%，合法吗？', en: 'My landlord wants a 5% rent increase in 2027 — is that legal?' } },
  { role: 'agent', img: '/home/film/david-car.webp', alt: { zh: 'David 在车里看平板', en: 'David checking his tablet in the car' }, ask: { zh: '租房押金最多能收多少？', en: 'What is the most a landlord can take as a deposit?' } },
  { role: 'landlord', img: '/home/film/sarah-tea.webp', alt: { zh: 'Sarah 端着茶看手机', en: 'Sarah with a cup of tea, reading her phone' }, ask: { zh: '租客的租约 2027 年 1 月到期，续约最多能涨多少？', en: 'My tenant’s lease ends in January 2027 — how much can I raise the rent at renewal?' } },
  { role: 'tenant', img: '/home/film/mia-cafe.webp', alt: { zh: 'Mia 在咖啡馆看手机', en: 'Mia in a café, looking at her phone' }, ask: { zh: 'Liberty Village 两房，预算 $3,500 以内', en: 'Two bedrooms in Liberty Village, up to $3,500' } },
]

export const ROLE_LABEL: Record<AssistantRole, Bi> = {
  tenant: { zh: '租客', en: 'Tenant' },
  landlord: { zh: '房东', en: 'Landlord' },
  agent: { zh: '经纪', en: 'Agent' },
}

const ROTATE_MS = 6000
const CHANGE_GRACE_MS = 1500
const ROLE_KEY = 'sl-home-ask-role'

const roleTag = (ex: HeroExample, chip: AssistantRole, zh: boolean) =>
  ex.role === chip ? '' : zh ? `（${ROLE_LABEL[ex.role].zh}）` : ` (${ROLE_LABEL[ex.role].en.toLowerCase()})`

/** The placeholder: 「试试「…」」, naming the example's role when it is not the chip's. */
export function examplePlaceholder(ex: HeroExample, chip: AssistantRole, zh: boolean): string {
  const tag = roleTag(ex, chip, zh)
  return zh ? `试试${tag}「${ex.ask.zh}」` : `Try${tag} ‘${ex.ask.en}’`
}

/** What a submit sends: the typed text as the chip's role, or — box empty — the example on show as its own role. */
export function heroSubmit(text: string, role: AssistantRole, example: HeroExample, zh: boolean): string {
  const typed = text.trim().slice(0, ASK_MAX)
  return typed ? assistantPromptHref(role, typed) : assistantPromptHref(example.role, zh ? example.ask.zh : example.ask.en)
}

export default function HeroComposer({ zh, className = '' }: { zh: boolean; className?: string }) {
  const router = useRouter()
  const [i, setI] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [text, setText] = useState('')
  const [role, setRole] = useState<AssistantRole>('tenant')
  const [inside, setInside] = useState({ hover: false, focus: false })
  const [visible, setVisible] = useState(true)
  const [narrow, setNarrow] = useState(false)
  const [said, setSaid] = useState('')
  const [going, setGoing] = useState(false)
  // Only the current and next photos load (all ten sit in the first viewport, so `loading="lazy"` would not help).
  const [seen, setSeen] = useState<Set<number>>(() => new Set([0, 1]))
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const changed = useRef({ at: 0, prev: 0 })
  const n = HERO_EXAMPLES.length
  const ex = HERO_EXAMPLES[i]

  // After mount only (the first render matches the server): reduced motion, phone width, the chosen role.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) setPlaying(false)
    const mq = window.matchMedia('(max-width: 639px)')
    setNarrow(mq.matches)
    const on = () => setNarrow(mq.matches)
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [])
  useEffect(() => {
    try { const r = sessionStorage.getItem(ROLE_KEY); if (isAssistantRole(r)) setRole(r) } catch { /* private mode */ }
  }, [])

  // Pause while the card is off screen or the tab is hidden.
  useEffect(() => {
    const el = rootRef.current
    if (!el || typeof IntersectionObserver === 'undefined' || typeof document === 'undefined') return
    let onScreen = true
    const sync = () => setVisible(onScreen && document.visibilityState !== 'hidden')
    const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; sync() }, { threshold: 0.25 })
    io.observe(el)
    document.addEventListener('visibilitychange', sync)
    return () => { io.disconnect(); document.removeEventListener('visibilitychange', sync) }
  }, [])

  const show = useCallback((next: number) => {
    setI((cur) => { changed.current = { at: Date.now(), prev: cur }; return next })
    setSeen((s) => (s.has(next) && s.has((next + 1) % n) ? s : new Set([...s, next, (next + 1) % n])))
  }, [n])

  // Auto-advance only while nobody is reading or typing in the box.
  const idle = playing && visible && !inside.hover && !inside.focus && !text
  useEffect(() => {
    if (!idle) return
    const t = setTimeout(() => show((i + 1) % n), ROTATE_MS)
    return () => clearTimeout(t)
  }, [idle, i, n, show])

  // Back from the AI Agent page may restore this page from the bfcache: let the button work again.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onShow = () => setGoing(false)
    window.addEventListener('pageshow', onShow)
    return () => window.removeEventListener('pageshow', onShow)
  }, [])

  // Visitor-driven changes are announced; automatic rotation is not.
  const go = (delta: number) => {
    const next = (i + delta + n) % n
    show(next)
    const x = HERO_EXAMPLES[next]
    setSaid(zh ? `例子 ${next + 1} / ${n}（${ROLE_LABEL[x.role].zh}）：${x.ask.zh}` : `Example ${next + 1} of ${n} (${ROLE_LABEL[x.role].en.toLowerCase()}): ${x.ask.en}`)
  }

  const pickRole = (r: AssistantRole) => {
    setRole(r)
    try { sessionStorage.setItem(ROLE_KEY, r) } catch { /* private mode */ }
  }

  const prefetch = () => { for (const r of ASSISTANT_ROLES) router.prefetch?.(`/${r}/agent`) }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (going) return
    // An automatic change just before an empty submit: send the example the visitor was reading.
    const shown = !text.trim() && Date.now() - changed.current.at < CHANGE_GRACE_MS ? HERO_EXAMPLES[changed.current.prev] : ex
    setGoing(true)
    router.push(heroSubmit(text, role, shown, zh))
  }

  // Phones: the example sits on the photo; tapping it puts it in the box, as its own role.
  const fillFromExample = (x: HeroExample) => {
    setText(zh ? x.ask.zh : x.ask.en)
    pickRole(x.role)
    inputRef.current?.focus()
  }

  const onBlurWithin = (e: FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setInside((s) => ({ ...s, focus: false }))
  }

  const placeholder = narrow ? (zh ? '问 AI 助理…' : 'Ask the AI Agent…') : examplePlaceholder(ex, role, zh)

  return (
    <div
      id="ask"
      ref={rootRef}
      data-testid="home-ask"
      className={`scroll-mt-24 ${className}`}
      onPointerEnter={() => setInside((s) => ({ ...s, hover: true }))}
      onPointerLeave={() => setInside((s) => ({ ...s, hover: false }))}
      onFocus={() => { setInside((s) => ({ ...s, focus: true })); prefetch() }}
      onBlur={onBlurWithin}
    >
      <div className="relative mx-auto w-full max-w-[688px] overflow-hidden rounded-[32px] shadow-[0_24px_60px_-28px_rgba(27,27,60,0.35)] sm:rounded-[40px]">
        {/* the photo card — scenes from the three-role film, cross-faded with the example */}
        <div className="relative aspect-square w-full bg-[#EEF5FA] sm:aspect-[3/2]">
          {HERO_EXAMPLES.map((x, k) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={x.img}
              src={seen.has(k) ? x.img : undefined}
              alt={k === i ? (zh ? x.alt.zh : x.alt.en) : ''}
              aria-hidden={k !== i}
              decoding="async"
              {...(k === 0 ? { fetchPriority: 'high' as const } : {})}
              className="absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ease-out"
              style={{ opacity: k === i ? 1 : 0 }}
            />
          ))}
          {/* phones: the example as a caption on the photo — tap to put it in the box */}
          <button
            type="button"
            onClick={() => fillFromExample(ex)}
            data-testid="home-ask-caption"
            className="absolute inset-x-3 bottom-3 rounded-2xl bg-white/90 px-4 py-2.5 text-left text-[14px] leading-snug text-ink shadow-[0_6px_18px_-10px_rgba(27,27,60,0.45)] backdrop-blur sm:hidden"
          >
            <span className="font-semibold text-brand">{zh ? `试试${roleTag(ex, role, zh)}：` : `Try${roleTag(ex, role, zh)}: `}</span>
            <span className="line-clamp-2">{zh ? ex.ask.zh : ex.ask.en}</span>
          </button>
        </div>
        {/* the composer, laid on the card's top edge */}
        <form
          onSubmit={submit}
          aria-label={zh ? '描述你要办的事' : 'Describe what you need'}
          className="absolute inset-x-3 top-3 flex h-[64px] items-center gap-1.5 rounded-full bg-white pl-2 pr-2 shadow-[0_10px_30px_-12px_rgba(27,27,60,0.35)] has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-[#0094C6] sm:inset-x-4 sm:top-4 sm:h-[96px] sm:gap-2 sm:pl-4 sm:pr-4"
        >
          <label className="relative flex-none">
            <span className="sr-only">{zh ? '以哪个身份问' : 'Ask as'}</span>
            <select
              value={role}
              onChange={(e) => { if (isAssistantRole(e.target.value)) pickRole(e.target.value) }}
              data-testid="home-ask-role"
              className="h-10 cursor-pointer appearance-none rounded-full bg-[#EEF5FA] pl-3 pr-7 text-[15px] font-semibold text-ink outline-none transition hover:bg-[#E3F2FC] focus-visible:ring-2 focus-visible:ring-[#0094C6] sm:h-12 sm:pl-4 sm:pr-8 sm:text-[16px]"
            >
              {ASSISTANT_ROLES.map((r) => (
                <option key={r} value={r}>{zh ? ROLE_LABEL[r].zh : ROLE_LABEL[r].en}</option>
              ))}
            </select>
            <svg aria-hidden width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-body-3 sm:right-3"><path d="m6 9 6 6 6-6" /></svg>
          </label>
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={ASK_MAX}
            enterKeyHint="send"
            placeholder={placeholder}
            aria-label={zh ? '描述你要办的事' : 'Describe what you need'}
            data-testid="home-ask-input"
            className="min-w-0 flex-1 overflow-hidden text-ellipsis bg-transparent px-1 text-[16px] text-ink outline-none placeholder:text-body-3 sm:text-[21px]"
          />
          <button
            type="submit"
            disabled={going}
            onPointerDown={prefetch}
            aria-label={zh ? '发送' : 'Send'}
            data-testid="home-ask-send"
            className="flex h-10 w-10 flex-none items-center justify-center rounded-full text-white transition hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0094C6] disabled:opacity-60 sm:h-12 sm:w-12"
            style={{ background: '#00ACE4' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
          </button>
        </form>
      </div>

      {/* prev / pause / next — America.gov's 56px round controls */}
      <div className="mt-6 flex items-center justify-center gap-3" data-testid="home-ask-controls">
        <CtlButton label={zh ? '上一个例子' : 'Previous example'} onClick={() => go(-1)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m15 18-6-6 6-6" /></svg>
        </CtlButton>
        <CtlButton label={playing ? (zh ? '暂停轮换' : 'Pause the examples') : (zh ? '继续轮换' : 'Play the examples')} onClick={() => setPlaying((p) => !p)}>
          {playing
            ? <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
            : <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M7 5v14l12-7z" /></svg>}
        </CtlButton>
        <CtlButton label={zh ? '下一个例子' : 'Next example'} onClick={() => go(1)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m9 18 6-6-6-6" /></svg>
        </CtlButton>
      </div>
      <p className="sr-only" aria-live="polite" data-testid="home-ask-said">{said}</p>

      <p className="mt-6 text-[14px] text-body-3" data-testid="home-ask-account">
        {zh ? '不用登录就能问 · 已有账户？' : 'No account needed to ask · Have an account? '}
        <Link href="/login" className="font-semibold text-brand hover:underline">{zh ? '登录' : 'Sign in'}</Link>
        <span className="mx-1.5">·</span>
        <Link href="/register" className="font-semibold text-brand hover:underline">{zh ? '免费注册' : 'Create a free account'}</Link>
      </p>
    </div>
  )
}

function CtlButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-12 w-12 items-center justify-center rounded-full border border-line-divider bg-[#F3F3F3] text-ink shadow-[0_6px_16px_-10px_rgba(27,27,60,0.35)] transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0094C6] sm:h-14 sm:w-14"
    >
      {children}
    </button>
  )
}
