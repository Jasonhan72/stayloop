'use client'

// Homepage film (2026-09-28): three people, three assistants, one unit — the
// script is lib/home/film.ts. Each person is a lane: their 3D scene on top and
// their phone below, and the phone IS the product — the real AgentChat in its
// phone layout (`device`), with the real approval / listing cards, thinking
// indicator, undo row and composer, fed by the script instead of a session.
// The pointer taps the card's own approve button, so the card goes through its
// real "提交中…" state and collapses into the real countdown row. Hand-offs fly
// between lanes; emails and pushes arrive as the subjects and texts the
// product actually sends.
//
// Wide screens show the three phones side by side (the people not in the scene
// dimmed); below lg one phone at a time, with a relay bar naming who is on
// screen. Everything that moves is inert and aria-hidden — a screen-reader
// paragraph tells the whole story — and the chapter buttons and the pause
// button are the only controls. It plays only while at least a quarter of it
// is on screen in a visible tab; under prefers-reduced-motion it never plays
// and each chapter shows its key frame.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AgentChat from '@/components/agent/AgentChat'
import type { ComposerDraft } from '@/components/agent/AgentInputBar'
import { useT, type Lang } from '@/lib/i18n'
import type { AgentStatus, ChatMessage, PendingAction } from '@/lib/agent/types'
import { CAST, FACES, PEOPLE, SHOTS, filmFor, filmSummary, greetingFor, type Beat, type FilmChapter, type NotifyKind, type Person, type ShotKey } from '@/lib/home/film'

type Notice = { kind: NotifyKind; title: string; body?: string; n: number; shown: boolean }
type Lane = {
  messages: ChatMessage[]
  status: AgentStatus
  pending: PendingAction[]
  scheduled: Record<string, { title: string; executeAt: number }>
  draft: ComposerDraft | null
  strip: { text: string; note: string } | null
  notice: Notice | null
  ff: boolean
}
type Lanes = Record<Person, Lane>
type Cursor = { x: number; y: number; move: boolean; press: boolean; on: boolean }
type Flight = { from: Person; to: Person; label: string; n: number; x0: number; x1: number; y: number }

const FF_MS = 1500
const NOTICE_MS = 3600
const FLIGHT_MS = 1600
const FIRST_SHOTS: Record<Person, ShotKey> = { mia: 'mia-subway', sarah: 'sarah-kitchen', david: 'david-lobby' }
const noop = () => {}

export default function ThreeRoleFilm() {
  const { lang } = useT()
  const zh = lang === 'zh'
  const chapters = useMemo(() => filmFor(lang, new Date()), [lang])
  // Every shot a lane will show, mounted up front so a scene change never waits on a download.
  const laneShots = useMemo(() => shotsByLane(chapters), [chapters])

  const [ci, setCi] = useState(0)
  const [run, setRun] = useState(0)
  const [lanes, setLanes] = useState<Lanes>(() => freshLanes(lang, () => 'g0', 0))
  const [focus, setFocus] = useState<Person[]>(['sarah', 'david'])
  const [shots, setShots] = useState<Record<Person, ShotKey>>(FIRST_SHOTS)
  const [caption, setCaption] = useState('')
  const [active, setActive] = useState<Person>('sarah')
  const [flight, setFlight] = useState<Flight | null>(null)
  const [cursor, setCursor] = useState<Cursor | null>(null)
  const [playing, setPlaying] = useState(true)
  const [reduced, setReduced] = useState(false)
  const [onScreen, setOnScreen] = useState(false)
  const [pageVisible, setPageVisible] = useState(true)

  const screenRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const laneRefs = useRef<Partial<Record<Person, HTMLDivElement | null>>>({})
  const barRef = useRef<HTMLSpanElement>(null)
  const chRef = useRef<FilmChapter>(chapters[0])
  const tRef = useRef(0)
  const firedRef = useRef<Set<number>>(new Set())
  const typedRef = useRef<Map<number, number>>(new Map())
  const idRef = useRef(1)
  const nonceRef = useRef(1)
  const nRef = useRef(1)
  const tokenRef = useRef(0)
  const timersRef = useRef<number[]>([])

  const nextId = () => `f${idRef.current++}`

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReduced(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    const vis = () => setPageVisible(!document.hidden)
    document.addEventListener('visibilitychange', vis)
    return () => { mq.removeEventListener('change', sync); document.removeEventListener('visibilitychange', vis) }
  }, [])

  // inert (React 18 has no typed prop for it): nothing in the film can be
  // focused, typed into or followed. Programmatic clicks still reach the cards.
  useEffect(() => { screenRef.current?.setAttribute('inert', '') }, [])

  useEffect(() => {
    const el = screenRef.current
    if (!el || !('IntersectionObserver' in window)) { setOnScreen(true); return }
    const io = new IntersectionObserver((es) => setOnScreen(es[es.length - 1].isIntersecting), { threshold: 0.25 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const patch = useCallback((p: Person, fn: (l: Lane) => Lane) => setLanes((all) => ({ ...all, [p]: fn(all[p]) })), [])

  /** A timer that dies with the chapter it was started in. */
  const later = useCallback((ms: number, fn: () => void) => {
    const token = tokenRef.current
    timersRef.current.push(window.setTimeout(() => { if (token === tokenRef.current) fn() }, ms))
  }, [])

  // ── The pointer: a fingertip on the card's own button ─────────────────────
  const target = useCallback((p: Person, option?: 'A' | 'B'): HTMLElement | null => {
    const lane = laneRefs.current[p]
    if (!lane) return null
    return lane.querySelector<HTMLElement>(option ? `[data-decide="approved"][data-option="${option}"]` : '[data-decide="approved"]')
  }, [])

  const pointAt = useCallback((el: HTMLElement): { x: number; y: number } | null => {
    const stage = stageRef.current
    if (!stage) return null
    const R = stage.getBoundingClientRect()
    const b = el.getBoundingClientRect()
    if (!b.width) return null
    // Toward the left of the button: once pressed it narrows to "提交中…".
    return { x: b.left - R.left + Math.min(b.width * 0.3, 40), y: b.top - R.top + b.height * 0.55 }
  }, [])

  // A lane's own chat thread scrolls — never the page (scrolling an element
  // into view also scrolls every ancestor, the homepage included).
  const threadOf = useCallback((p: Person) => laneRefs.current[p]?.querySelector<HTMLElement>('[data-chat-thread]') ?? null, [])
  /** A new card: show its title first, the way it lands on a phone. */
  const showCardTop = useCallback((p: Person, smooth: boolean) => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const thread = threadOf(p)
      const cards = laneRefs.current[p]?.querySelectorAll<HTMLElement>('[data-approval-card]')
      const card = cards && cards[cards.length - 1]
      if (!thread || !card) return
      const top = thread.scrollTop + card.getBoundingClientRect().top - thread.getBoundingClientRect().top - 10
      thread.scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'auto' })
    }))
  }, [threadOf])
  /** Before the tap: bring the card's own button into view. */
  const revealButton = useCallback((p: Person, option?: 'A' | 'B') => {
    const thread = threadOf(p)
    const el = target(p, option)
    if (!thread || !el) return
    const T = thread.getBoundingClientRect()
    const B = el.getBoundingClientRect()
    if (B.bottom > T.bottom - 24) thread.scrollTo({ top: thread.scrollTop + B.bottom - T.bottom + 56, behavior: 'smooth' })
    else if (B.top < T.top + 8) thread.scrollTo({ top: Math.max(0, thread.scrollTop + B.top - T.top - 40), behavior: 'smooth' })
  }, [target, threadOf])

  const aim = useCallback((p: Person, option?: 'A' | 'B') => {
    const el = target(p, option)
    const to = el && pointAt(el)
    const stage = stageRef.current
    const lane = laneRefs.current[p]
    if (!to || !stage || !lane) return
    const R = stage.getBoundingClientRect()
    const L = lane.getBoundingClientRect()
    setCursor({ x: L.left - R.left + L.width * 0.72, y: L.bottom - R.top - 30, move: false, press: false, on: true })
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => setCursor({ ...to, move: true, press: false, on: true })))
  }, [pointAt, target])

  const press = useCallback((p: Person, option?: 'A' | 'B') => {
    const el = target(p, option)
    const at = el && pointAt(el)
    if (at) setCursor({ ...at, move: false, press: true, on: true })
    el?.click()
    const follow = () => { const q = el && el.isConnected ? pointAt(el) : null; if (q) setCursor((c) => (c ? { ...c, ...q, move: false } : c)) }
    window.requestAnimationFrame(() => window.requestAnimationFrame(follow))
    later(160, () => { follow(); setCursor((c) => (c ? { ...c, press: false } : c)) })
    later(700, () => setCursor((c) => (c ? { ...c, on: false } : c)))
  }, [later, pointAt, target])

  /** Whoever acts or is handed something lights up; a new scene ('focus') dims the rest again. */
  const light = useCallback((p: Person) => setFocus((f) => (f.includes(p) ? f : [...f, p])), [])

  // ── One beat ───────────────────────────────────────────────────────────────
  const fire = useCallback((b: Beat, instant: boolean) => {
    switch (b.k) {
      case 'caption':
        setCaption(b.text)
        return
      case 'focus':
        setFocus(b.lanes)
        setShots((s) => ({ ...s, ...b.shots }))
        setActive(b.lanes[0])
        return
      case 'strip':
        patch(b.lane, (l) => ({ ...l, strip: { text: b.text, note: b.note } }))
        return
      case 'type':
        return
      case 'send':
        setActive(b.lane)
        light(b.lane)
        patch(b.lane, (l) => ({ ...l, draft: { text: '', nonce: nonceRef.current++ }, messages: [...l.messages, { id: nextId(), role: 'user', text: b.text }] }))
        return
      case 'status':
        patch(b.lane, (l) => ({ ...l, status: b.status }))
        return
      case 'reply':
        setActive(b.lane)
        light(b.lane)
        patch(b.lane, (l) => ({
          ...l,
          messages: [...l.messages, { id: nextId(), role: 'agent', ...b.msg }],
          pending: b.card ? [...l.pending.filter((a) => a.id !== b.card!.id), b.card] : l.pending,
        }))
        if (b.card) showCardTop(b.lane, !instant)
        return
      case 'card':
        setActive(b.lane)
        light(b.lane)
        // the push was tapped: its banner goes, the card is what opens
        patch(b.lane, (l) => ({ ...l, notice: l.notice ? { ...l.notice, shown: false } : null, pending: [...l.pending.filter((a) => a.id !== b.card.id), b.card] }))
        showCardTop(b.lane, !instant)
        return
      case 'reveal':
        if (!instant) revealButton(b.lane, b.option)
        return
      case 'pointer':
        if (!instant) aim(b.lane, b.option)
        return
      case 'click':
        if (!instant) press(b.lane, b.option)
        return
      case 'done':
        patch(b.lane, (l) => ({ ...l, pending: [], scheduled: {}, ff: !instant, status: 'result', messages: [...l.messages, { id: nextId(), role: 'agent', text: b.text }] }))
        if (!instant) later(FF_MS, () => patch(b.lane, (l) => ({ ...l, ff: false })))
        return
      case 'handoff': {
        setActive(b.to)
        light(b.to)
        if (instant) return
        const stage = stageRef.current
        const a = laneRefs.current[b.from]
        const z = laneRefs.current[b.to]
        const R = stage?.getBoundingClientRect()
        const A = a?.getBoundingClientRect()
        const Z = z?.getBoundingClientRect()
        const n = nRef.current++
        setFlight({
          from: b.from, to: b.to, label: b.label, n,
          x0: R && A ? A.left - R.left + A.width / 2 : 0,
          x1: R && Z ? Z.left - R.left + Z.width / 2 : 0,
          // on the scene, just above the phones
          y: R && A ? A.top - R.top + 108 : 0,
        })
        later(FLIGHT_MS, () => setFlight((f) => (f && f.n === n ? null : f)))
        return
      }
      case 'notify': {
        if (instant) return
        setActive(b.lane)
        light(b.lane)
        const n = nRef.current++
        patch(b.lane, (l) => ({ ...l, notice: { kind: b.kind, title: b.title, body: b.body, n, shown: true } }))
        later(NOTICE_MS, () => patch(b.lane, (l) => (l.notice?.n === n ? { ...l, notice: { ...l.notice, shown: false } } : l)))
        return
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aim, later, light, patch, press, revealButton, showCardTop])

  /** Run every beat whose time has come. `instant` = a key frame: no typing, no pointer, no flights. */
  const step = useCallback((t: number, instant = false) => {
    const beats = chRef.current.beats
    const fired = firedRef.current
    for (let i = 0; i < beats.length; i++) {
      const b = beats[i]
      if (b.at > t) break
      if (fired.has(i)) continue
      if (b.k === 'type') {
        if (instant) { fired.add(i); continue }
        const chars = Array.from(b.text)
        const n = Math.min(chars.length, Math.ceil(((t - b.at) / b.dur) * chars.length))
        if (n !== typedRef.current.get(i)) {
          typedRef.current.set(i, n)
          setActive(b.lane)
          patch(b.lane, (l) => ({ ...l, draft: { text: chars.slice(0, n).join(''), nonce: nonceRef.current++ } }))
        }
        if (n >= chars.length) fired.add(i)
        continue
      }
      fired.add(i)
      fire(b, instant)
    }
  }, [fire, patch])

  // The real card calls this once its approve button is pressed (the pointer
  // taps it). Same shape as useAgentSession.decide: the card leaves the pending
  // list and the approval waits out its undo window.
  const deciders = useMemo(() => {
    const make = (p: Person) => async (id: string, decision: 'approved' | 'rejected') => {
      const token = tokenRef.current
      await new Promise((r) => window.setTimeout(r, 380))
      if (token !== tokenRef.current) return
      patch(p, (l) => {
        const a = l.pending.find((x) => x.id === id)
        return {
          ...l,
          pending: l.pending.filter((x) => x.id !== id),
          scheduled: decision === 'approved' ? { [id]: { title: a?.title ?? '', executeAt: Date.now() + 60_000 } } : {},
          status: 'result',
        }
      })
    }
    return { mia: make('mia'), sarah: make('sarah'), david: make('david') } as Record<Person, (id: string, d: 'approved' | 'rejected') => Promise<void>>
  }, [patch])

  // (Re)start a chapter: every phone opens a new conversation — its greeting.
  useEffect(() => {
    tokenRef.current++
    timersRef.current.forEach((x) => window.clearTimeout(x))
    timersRef.current = []
    chRef.current = chapters[ci]
    tRef.current = 0
    firedRef.current = new Set()
    typedRef.current = new Map()
    // an empty draft (not null) also clears whatever the composer held when the chapter was cut short
    setLanes(freshLanes(lang, () => `f${idRef.current++}`, nonceRef.current++))
    setFlight(null)
    setCursor(null)
    setCaption('')
    if (barRef.current) barRef.current.style.transform = 'scaleX(0)'
    step(0)
  }, [ci, run, lang, chapters, step])

  // Reduced motion: never play — each chapter shows its key frame.
  useEffect(() => {
    if (!reduced) return
    const id = window.requestAnimationFrame(() => {
      const keyAt = chRef.current.keyAt
      if (tRef.current < keyAt) { tRef.current = keyAt; step(keyAt, true) }
    })
    return () => window.cancelAnimationFrame(id)
  }, [reduced, ci, run, lang, step])

  // The clock: only while playing, on screen and in a visible tab.
  const live = playing && !reduced && onScreen && pageVisible
  useEffect(() => {
    if (!live) return
    let raf = 0
    let last: number | null = null
    const tick = (now: number) => {
      const dt = last == null ? 16 : Math.min(80, now - last)
      last = now
      tRef.current += dt
      const end = chRef.current.end
      if (tRef.current >= end) {
        setCi((i) => (i + 1) % chapters.length)
        setRun((r) => r + 1)
        return
      }
      step(tRef.current)
      if (barRef.current) barRef.current.style.transform = `scaleX(${Math.min(1, tRef.current / end)})`
      raf = window.requestAnimationFrame(tick)
    }
    raf = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(raf)
  }, [live, step, chapters.length, ci, run])

  useEffect(() => () => { timersRef.current.forEach((x) => window.clearTimeout(x)) }, [])

  const jump = (i: number) => {
    setCi(i)
    setRun((r) => r + 1)
    if (!reduced) setPlaying(true)
  }

  const summary = useMemo(() => filmSummary(lang), [lang])
  const laneRefSetters = useMemo(() => ({
    mia: (el: HTMLDivElement | null) => { laneRefs.current.mia = el },
    sarah: (el: HTMLDivElement | null) => { laneRefs.current.sarah = el },
    david: (el: HTMLDivElement | null) => { laneRefs.current.david = el },
  }), [])
  const ch = chapters[ci]

  return (
    <div data-testid="three-role-film">
      <p className="sr-only">{summary}</p>
      <div ref={screenRef} aria-hidden data-testid="film-screen">
        <RelayBar active={active} flight={flight} lang={lang} />
        <div ref={stageRef} className="relative mx-auto max-w-[420px] lg:max-w-none" data-testid="film-stage">
          <div className="grid gap-4 lg:grid-cols-3">
            {PEOPLE.map((p) => (
              <LaneView
                key={p}
                p={p}
                lane={lanes[p]}
                shot={shots[p]}
                shotList={laneShots[p]}
                dim={!focus.includes(p)}
                show={active === p}
                thread={`film-${p}-${ch.key}-${run}`}
                onDecide={deciders[p]}
                lang={lang}
                setRef={laneRefSetters[p]}
              />
            ))}
          </div>
          {flight && <FlightChip flight={flight} />}
          {cursor && (
            <span
              className="pointer-events-none absolute left-0 top-0 z-30"
              style={{
                transform: `translate(${cursor.x}px, ${cursor.y}px)`,
                opacity: cursor.on ? 1 : 0,
                transition: cursor.move ? 'transform .8s cubic-bezier(.45,.05,.25,1), opacity .25s ease' : 'opacity .25s ease',
              }}
            >
              <span className="block h-9 w-9 rounded-full border-2 border-white" style={{ background: 'rgba(27,27,60,0.30)', boxShadow: '0 4px 12px rgba(27,27,60,.25)', transform: `translate(-50%,-50%) scale(${cursor.press ? 0.78 : 1})`, transition: 'transform .12s ease' }} />
            </span>
          )}
        </div>
        <p key={caption} className="sl-film-caption mx-auto mt-4 min-h-[74px] max-w-[760px] px-2 text-center text-[15px] font-medium leading-relaxed text-ink md:min-h-[52px] md:text-[16px]">{caption}</p>
      </div>

      {/* one row of chapters under the caption; on a phone it scrolls sideways instead of wrapping into three */}
      <div className="mt-1 flex flex-col items-center gap-2">
        <div className="mx-auto flex w-fit max-w-full items-center gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label={zh ? '示范章节' : 'Sample chapters'}>
          {chapters.map((c, i) => {
            const on = i === ci
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => jump(i)}
                aria-current={on ? 'step' : undefined}
                className={`relative flex-none overflow-hidden whitespace-nowrap rounded-full px-3.5 py-1.5 text-[12.5px] font-bold transition ${on ? 'text-white' : 'border border-line-divider bg-white text-ink hover:border-[#00ACE4]'}`}
                style={on ? { background: '#1B1B3C' } : undefined}
              >
                <span className="relative z-[1]">{c.stage} · {c.title}</span>
                {on && !reduced && <span ref={barRef} aria-hidden className="absolute bottom-0 left-0 h-[2px] w-full origin-left" style={{ background: '#00ACE4', transform: 'scaleX(0)' }} />}
              </button>
            )
          })}
          {!reduced && (
            <button
              type="button"
              onClick={() => setPlaying((p) => !p)}
              aria-label={playing ? (zh ? '暂停动画' : 'Pause animation') : (zh ? '继续播放' : 'Play animation')}
              aria-pressed={!playing}
              className="ml-1 flex h-8 w-8 flex-none items-center justify-center rounded-full border border-line-divider bg-white text-body-2 transition hover:border-[#00ACE4] hover:text-[#00ACE4]"
            >
              {playing ? (
                <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden><rect x="2" y="1.5" width="2.8" height="9" rx=".9" fill="currentColor" /><rect x="7.2" y="1.5" width="2.8" height="9" rx=".9" fill="currentColor" /></svg>
              ) : (
                <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden><path d="M3.2 1.9v8.2c0 .6.6.9 1.1.6l6.2-4.1c.4-.3.4-.9 0-1.2L4.3 1.3c-.5-.3-1.1 0-1.1.6z" fill="currentColor" /></svg>
              )}
            </button>
          )}
        </div>
        <span className="text-center font-mono text-[10.5px] font-bold uppercase tracking-[0.12em] text-body-3">{zh ? '示范动画 · 3D 人物由 AI 生成 · 内容为示范' : 'Sample animation · AI-made 3D characters · illustrative'}</span>
      </div>
      <style jsx global>{`
        .sl-film-shot { transition: opacity .7s ease; animation: sl-film-kb 16s ease-in-out infinite alternate; }
        /* backwards, not both: a finished fade must not pin opacity over the dimming class */
        .sl-film-lane { animation: sl-film-in .35s ease backwards; }
        .sl-film-caption { animation: sl-film-in .45s ease backwards; }
        @keyframes sl-film-kb { from { transform: scale(1.02); } to { transform: scale(1.09); } }
        @keyframes sl-film-in { from { opacity: 0; } to { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) {
          .sl-film-shot, .sl-film-lane, .sl-film-caption { animation: none; }
        }
      `}</style>
    </div>
  )
}

function freshLanes(lang: Lang, id: () => string, nonce: number): Lanes {
  const lane = (p: Person): Lane => ({
    messages: [{ id: id(), role: 'agent', text: greetingFor(p, lang) }],
    status: 'idle',
    pending: [],
    scheduled: {},
    draft: { text: '', nonce },
    strip: null,
    notice: null,
    ff: false,
  })
  return { mia: lane('mia'), sarah: lane('sarah'), david: lane('david') }
}

function shotsByLane(chapters: FilmChapter[]): Record<Person, ShotKey[]> {
  const out: Record<Person, ShotKey[]> = { mia: [FIRST_SHOTS.mia], sarah: [FIRST_SHOTS.sarah], david: [FIRST_SHOTS.david] }
  for (const c of chapters) {
    for (const b of c.beats) {
      if (b.k !== 'focus') continue
      for (const p of PEOPLE) {
        const s = b.shots[p]
        if (s && !out[p].includes(s)) out[p].push(s)
      }
    }
  }
  return out
}

// ── A person: their scene, their phone ──────────────────────────────────────
function LaneView({ p, lane, shot, shotList, dim, show, thread, onDecide, lang, setRef }: {
  p: Person
  lane: Lane
  shot: ShotKey
  shotList: ShotKey[]
  dim: boolean
  show: boolean
  thread: string
  onDecide: (id: string, d: 'approved' | 'rejected') => Promise<void>
  lang: Lang
  setRef: (el: HTMLDivElement | null) => void
}) {
  const c = CAST[p]
  const zh = lang === 'zh'
  return (
    <div
      ref={setRef}
      data-lane={p}
      className={`sl-film-lane relative h-[600px] overflow-hidden rounded-[22px] border border-line-divider bg-[#EEF5FA] transition-[opacity,filter] duration-500 lg:block lg:h-[660px] ${show ? 'block' : 'hidden'} ${dim ? 'lg:opacity-50 lg:saturate-50' : ''}`}
    >
      {/* the scene */}
      <div className="absolute inset-x-0 top-0 h-[210px] overflow-hidden lg:h-[228px]">
        {shotList.map((k) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={k}
            src={SHOTS[k]}
            alt=""
            draggable={false}
            decoding="async"
            data-on={k === shot ? '1' : '0'}
            className="sl-film-shot absolute inset-0 h-full w-full object-cover"
            style={{ objectPosition: '50% 28%', opacity: k === shot ? 1 : 0 }}
          />
        ))}
        <div className="absolute inset-x-0 bottom-0 h-16" style={{ background: 'linear-gradient(180deg, rgba(238,245,250,0) 0%, rgba(238,245,250,.55) 100%)' }} />
        <span className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-white/90 py-1 pl-1 pr-3 shadow-sm backdrop-blur">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={FACES[p]} alt="" className="h-7 w-7 rounded-full object-cover" />
          <span className="text-[13px] font-bold text-ink">{c.name}</span>
          <span className="text-[12px] font-semibold" style={{ color: c.color }}>{zh ? c.hat.zh : c.hat.en}</span>
        </span>
      </div>

      {/* the phone */}
      <div className="absolute inset-x-2.5 bottom-2.5 top-[150px] overflow-hidden rounded-[18px] bg-white shadow-[0_14px_36px_rgba(27,27,60,0.18)] ring-1 ring-black/5 lg:top-[160px]">
        <div className="flex h-full flex-col">
          {lane.strip && (
            // components/delegations/RepresentingStrip.tsx (a guard test keeps the classes in step)
            <div className="flex-none px-2 pt-2">
              <div className="rounded-xl border border-agent/30 bg-agent/[0.06] px-4 py-2.5 text-[12.5px]">
                <div className="text-body">{lane.strip.text}</div>
                <div className="mt-0.5 text-[11px] text-body-3">{lane.strip.note} · <span className="underline">{zh ? '客户表' : 'Client table'}</span></div>
              </div>
            </div>
          )}
          <div className="min-h-0 flex-1">
            <AgentChat
              hero
              device
              role={c.role}
              agentName={c.assistant}
              status={lane.status}
              messages={lane.messages}
              onSend={noop}
              pendingActions={lane.pending}
              onDecide={onDecide}
              memoryCount={0}
              workflow={null}
              scheduled={lane.scheduled}
              onUndo={noop}
              draft={lane.draft}
              avatar={c.avatar}
              avatarFallback="brand"
              currentThreadId={thread}
            />
          </div>
        </div>
        {lane.notice && <NoticeBanner notice={lane.notice} lang={lang} />}
        <div className={`pointer-events-none absolute left-1/2 top-[42%] z-20 -translate-x-1/2 whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] font-semibold text-white shadow-lg transition-opacity duration-300 ${lane.ff ? 'opacity-100' : 'opacity-0'}`} style={{ background: 'rgba(27,27,60,0.88)' }}>
          <svg width="13" height="10" viewBox="0 0 13 10" aria-hidden className="mr-1.5 inline-block align-[-1px]"><path d="M0 0l6 5-6 5zM6.5 0l6 5-6 5z" fill="currentColor" /></svg>
          {zh ? '60 秒后' : '60 seconds later'}
        </div>
      </div>
    </div>
  )
}

/** An email or a push arriving on the phone — the subject / text the product sends. */
function NoticeBanner({ notice, lang }: { notice: Notice; lang: Lang }) {
  const zh = lang === 'zh'
  const mail = notice.kind === 'mail'
  return (
    <div
      className="absolute inset-x-2 top-2 z-20 rounded-2xl border border-white/70 bg-white/95 px-3 py-2.5 shadow-[0_12px_32px_rgba(27,27,60,0.24)] backdrop-blur"
      style={{ transform: notice.shown ? 'translateY(0)' : 'translateY(-140%)', opacity: notice.shown ? 1 : 0, transition: 'transform .45s cubic-bezier(.2,.8,.2,1), opacity .3s ease' }}
    >
      <div className="flex items-center gap-2 text-[11px] text-body-3">
        <span className="flex h-5 w-5 flex-none items-center justify-center rounded-md text-white" style={{ background: mail ? '#1B1B3C' : '#00ACE4' }}>
          {mail ? (
            <svg width="11" height="9" viewBox="0 0 12 9" aria-hidden><rect x=".6" y=".6" width="10.8" height="7.8" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.2" /><path d="M1.2 1.4 6 5l4.8-3.6" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          ) : (
            <svg width="10" height="11" viewBox="0 0 10 11" aria-hidden><path d="M5 1a3 3 0 0 0-3 3v2.2L1 7.8h8L8 6.2V4a3 3 0 0 0-3-3zM4 9.2a1 1 0 0 0 2 0" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          )}
        </span>
        <span className="font-semibold text-body-2">{mail ? (zh ? '邮件' : 'Mail') : 'Stayloop'}</span>
        <span className="ml-auto">{zh ? '现在' : 'now'}</span>
      </div>
      <div className="mt-1 line-clamp-2 text-[13px] font-semibold leading-snug text-ink">{notice.title}</div>
      {notice.body && <div className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-body-2">{notice.body}</div>}
    </div>
  )
}

/** Wide screens: the thing handed over flies from one phone to the next. */
function FlightChip({ flight }: { flight: Flight }) {
  const [go, setGo] = useState(false)
  useEffect(() => {
    const id = window.requestAnimationFrame(() => window.requestAnimationFrame(() => setGo(true)))
    return () => window.cancelAnimationFrame(id)
  }, [])
  const from = CAST[flight.from]
  return (
    <span
      className="pointer-events-none absolute left-0 top-0 z-20 hidden lg:block"
      style={{ transform: `translate(${go ? flight.x1 : flight.x0}px, ${flight.y}px)`, transition: 'transform 1.1s cubic-bezier(.45,.05,.25,1)' }}
    >
      <span className="flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full border border-white bg-white py-1 pl-1 pr-3 text-[12.5px] font-bold text-ink shadow-[0_10px_28px_rgba(27,27,60,0.22)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={FACES[flight.from]} alt="" className="h-6 w-6 rounded-full object-cover" style={{ boxShadow: `0 0 0 2px ${from.color}` }} />
        {flight.label}
        <span aria-hidden className="text-body-3">{flight.x1 >= flight.x0 ? '→' : '←'}</span>
      </span>
    </span>
  )
}

/** Below lg one phone shows at a time: who is on screen, and hand-offs between them. */
function RelayBar({ active, flight, lang }: { active: Person; flight: Flight | null; lang: Lang }) {
  const zh = lang === 'zh'
  const slot = (p: Person) => `${(PEOPLE.indexOf(p) * 2 + 1) * (100 / 6)}%`
  return (
    <div className="relative mx-auto mb-3 max-w-[420px] lg:hidden">
      <div className="grid grid-cols-3 rounded-full border border-line-divider bg-white p-1">
        {PEOPLE.map((p) => {
          const c = CAST[p]
          const on = active === p
          return (
            <span key={p} className={`flex min-w-0 items-center justify-center gap-1.5 rounded-full px-1.5 py-1 transition ${on ? 'bg-surface-chip' : ''}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={FACES[p]} alt="" className="h-6 w-6 flex-none rounded-full object-cover" style={on ? { boxShadow: `0 0 0 2px ${c.color}` } : undefined} />
              <span className={`truncate text-[12.5px] font-semibold ${on ? 'text-ink' : 'text-body-3'}`}>{c.name.split(' ')[0]}</span>
              <span className="hidden flex-none text-[11px] font-semibold min-[380px]:inline" style={{ color: on ? c.color : '#6E6E8A' }}>{zh ? c.hat.zh : c.hat.en}</span>
            </span>
          )
        })}
      </div>
      {flight && <RelayFlight key={flight.n} label={flight.label} from={slot(flight.from)} to={slot(flight.to)} />}
    </div>
  )
}

function RelayFlight({ label, from, to }: { label: string; from: string; to: string }) {
  const [go, setGo] = useState(false)
  useEffect(() => {
    const id = window.requestAnimationFrame(() => window.requestAnimationFrame(() => setGo(true)))
    return () => window.cancelAnimationFrame(id)
  }, [])
  return (
    <span
      className="pointer-events-none absolute top-full z-20 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#1B1B3C] px-3 py-1 text-[12px] font-bold text-white shadow-lg"
      style={{ left: go ? to : from, transition: 'left 1s cubic-bezier(.45,.05,.25,1)' }}
    >
      {label}
    </span>
  )
}
