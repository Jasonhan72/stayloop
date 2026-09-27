'use client'

// Guided intake card (2026-09-27; design/guided-intake-2026-09.md). Opened by a
// quick-start card in the thread instead of a 【…】 template in the composer:
// one question at a time, quick-reply chips + a free-text field, answered
// steps summarised as chips (tap to revise), an emergency choice with a "do
// this first" line, an optional attachment step, then a review of the composed
// sentence — send it, or drop it into the composer to edit. No model call
// until the send.
import { useEffect, useRef, useState } from 'react'
import type { ChatAttachment } from '@/lib/agent/types'
import { ANSWER_EMPTY, composeIntake, isAnswered, queryFor, type IntakeAnswers, type IntakeSpec, type Lang, type StepAnswer } from '@/lib/agent/intake'
import { ATTACH_ACCEPT, ATTACH_MAX_FILES, readFilesAsAttachments } from '@/lib/agent/attachments'

const DANGER = '#DC2626'

export default function IntakeCard({
  spec,
  lang,
  accent,
  icon,
  onSend,
  onDraft,
  onClose,
}: {
  spec: IntakeSpec
  lang: Lang
  /** role accent (hex) for the selected chips, the progress bar and the send key */
  accent: string
  icon?: string
  onSend: (message: string, attachments?: ChatAttachment[]) => void | Promise<void>
  /** "put it in the composer" — the parent prefills and closes the card */
  onDraft: (message: string) => void
  onClose: () => void
}) {
  const zh = lang === 'zh'
  const total = spec.steps.length
  const [idx, setIdx] = useState(0)
  const [review, setReview] = useState(false)
  const [answers, setAnswers] = useState<IntakeAnswers>({})
  const [atts, setAtts] = useState<ChatAttachment[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const step = spec.steps[Math.min(idx, total - 1)]
  const cur: StepAnswer = answers[step.key] ?? ANSWER_EMPTY
  const boxRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Keep the card in view as it grows / moves on; focus a lone text field.
  useEffect(() => {
    boxRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
    if (!review && step.input && !step.options?.length) (step.input === 'textarea' ? areaRef : inputRef).current?.focus?.()
  }, [idx, review]) // eslint-disable-line react-hooks/exhaustive-deps

  const update = (patch: Partial<StepAnswer>): IntakeAnswers => {
    const next = { ...answers, [step.key]: { ...cur, ...patch } }
    setAnswers(next)
    return next
  }
  const advance = (a: IntakeAnswers) => {
    if (idx + 1 >= total) {
      setText(composeIntake(spec, a, lang, atts.length))
      setReview(true)
    } else setIdx(idx + 1)
  }
  const canNext = !!step.optional || isAnswered(step, cur, atts.length)
  const next = () => { if (canNext) advance(answers) }
  const back = () => { if (review) setReview(false); else if (idx > 0) setIdx(idx - 1) }
  const skip = () => advance({ ...answers, [step.key]: ANSWER_EMPTY })
  const jumpTo = (i: number) => { setReview(false); setIdx(i) }
  const pick = (v: string) => {
    if (step.multi) {
      update({ picks: cur.picks.includes(v) ? cur.picks.filter((x) => x !== v) : [...cur.picks, v] })
      return
    }
    const picks = cur.picks[0] === v ? [] : [v]
    const a = update({ picks })
    const opt = step.options?.find((o) => o.value === v)
    // A single-choice step with nothing else to fill advances on the tap
    // (Typeform speed); a choice that carries a note (the emergency line)
    // stays so the note is read.
    if (picks.length && !step.input && !step.attach && !opt?.note) setTimeout(() => advance(a), 140)
  }
  const addFiles = async (fl: FileList | null) => {
    const read = await readFilesAsAttachments(fl)
    if (read.length) setAtts((prev) => [...prev, ...read].slice(0, ATTACH_MAX_FILES))
    if (fileRef.current) fileRef.current.value = ''
  }
  const send = async () => {
    const msg = text.trim()
    if (!msg || busy) return
    setBusy(true)
    try { await onSend(msg, atts.length ? atts : undefined) } finally { setBusy(false) }
  }
  const q = queryFor(spec, answers, lang, atts.length)
  const summary = spec.steps
    .map((s, i) => ({ i, key: s.key, text: q.labels(s.key).join(zh ? '、' : ', '), answered: isAnswered(s, answers[s.key], s.attach ? atts.length : 0) }))
    .filter((s) => s.answered && (review || s.i < idx))
  const pct = Math.round(((review ? total : idx) / total) * 100)
  const pickedDanger = step.options?.find((o) => o.tone === 'danger' && cur.picks.includes(o.value))
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.stopPropagation(); onClose() }
  }
  const inputEnter = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && step.input !== 'textarea') { e.preventDefault(); next() }
  }

  return (
    <div ref={boxRef} tabIndex={-1} onKeyDown={onKey} data-testid="intake-card" className="rounded-2xl border border-line-divider bg-white shadow-sm outline-none" aria-label={spec.title[lang]}>
      <div className="flex items-center gap-2.5 px-4 pt-3">
        {icon && <span className="flex h-7 w-7 flex-none items-center justify-center rounded-lg text-[14px]" style={{ background: `${accent}14` }}>{icon}</span>}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-bold">{spec.title[lang]}</div>
          <div className="font-mono text-[10.5px] text-body-3" data-testid="intake-progress">
            {review ? (zh ? '最后一步 · 确认并发送' : 'Last step · review and send') : (zh ? `第 ${idx + 1} 步 / 共 ${total} 步` : `Step ${idx + 1} of ${total}`)}
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label={zh ? '关闭' : 'Close'} data-testid="intake-close" className="flex h-8 w-8 items-center justify-center rounded-full text-body-3 hover:bg-surface-chip hover:text-body">×</button>
      </div>
      <div className="mx-4 mt-2 h-1 overflow-hidden rounded-full bg-surface-chip" aria-hidden>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: accent }} />
      </div>

      {summary.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-4 pt-3" data-testid="intake-summary">
          {summary.map((s) => (
            <button key={s.key} type="button" onClick={() => jumpTo(s.i)} title={zh ? '点击修改' : 'Tap to change'} className="max-w-full truncate rounded-full bg-surface-chip px-2.5 py-1 text-[11.5px] font-semibold text-body hover:bg-line-divider">
              {s.text.length > 28 ? `${s.text.slice(0, 28)}…` : s.text}
            </button>
          ))}
        </div>
      )}

      {!review ? (
        <div className="px-4 pb-4 pt-3">
          <div className="text-[15px] font-semibold leading-snug">{step.ask[lang]}</div>
          {step.hint && <div className="mt-1 text-[12px] text-body-3">{step.hint[lang]}</div>}
          {!!step.options?.length && (
            <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={step.ask[lang]}>
              {step.options.map((o) => {
                const on = cur.picks.includes(o.value)
                const danger = o.tone === 'danger'
                return (
                  <button
                    key={o.value}
                    type="button"
                    aria-pressed={on}
                    onClick={() => pick(o.value)}
                    data-testid="intake-chip"
                    className={`min-h-[36px] rounded-full border px-3 py-1.5 text-left text-[12.5px] font-semibold transition ${on ? 'text-white' : danger ? 'bg-danger/[0.04] text-danger' : 'bg-white text-body hover:shadow-sm'}`}
                    style={on ? { background: danger ? DANGER : accent, borderColor: danger ? DANGER : accent } : { borderColor: danger ? 'rgba(220,38,38,0.5)' : undefined }}
                  >
                    {o.label[lang]}
                  </button>
                )
              })}
            </div>
          )}
          {pickedDanger?.note && (
            <div className="mt-3 rounded-lg border border-danger/30 bg-danger/[0.06] px-3 py-2 text-[12px] leading-relaxed text-danger" data-testid="intake-danger-note">
              {pickedDanger.note[lang]}
            </div>
          )}
          {step.input && step.input !== 'textarea' && (
            <div className="relative mt-3">
              {step.input === 'money' && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-body-3">$</span>}
              <input
                ref={inputRef}
                type={step.input === 'date' ? 'date' : 'text'}
                inputMode={step.input === 'money' || step.input === 'number' ? 'numeric' : undefined}
                value={cur.text}
                onChange={(e) => update({ text: step.input === 'money' || step.input === 'number' ? e.target.value.replace(/[^0-9.]/g, '') : e.target.value })}
                onKeyDown={inputEnter}
                placeholder={step.placeholder?.[lang] ?? (step.options?.length ? (zh ? '或者自己写' : 'Or type your own') : '')}
                className={`sl-input w-full ${step.input === 'money' ? 'pl-7' : ''}`}
                aria-label={step.ask[lang]}
                data-testid="intake-input"
              />
            </div>
          )}
          {step.input === 'textarea' && (
            <textarea
              ref={areaRef}
              value={cur.text}
              onChange={(e) => update({ text: e.target.value })}
              placeholder={step.placeholder?.[lang] ?? ''}
              rows={4}
              className="sl-input mt-3 w-full resize-y"
              aria-label={step.ask[lang]}
              data-testid="intake-input"
            />
          )}
          {step.attach && (
            <div className="mt-3">
              <input ref={fileRef} type="file" accept={ATTACH_ACCEPT} multiple className="hidden" onChange={(e) => void addFiles(e.target.files)} aria-label={zh ? '选择文件' : 'Choose files'} />
              <div className="flex flex-wrap items-center gap-2">
                {atts.map((a, i) => (
                  <span key={`${a.name}-${i}`} className="flex items-center gap-1.5 rounded-lg border border-line-divider bg-surface-chip px-2 py-1 text-[11.5px]">
                    {a.isImage ? <img src={a.dataUrl} alt="" className="h-7 w-7 rounded object-cover" /> : <span>📄</span>}
                    <span className="max-w-[140px] truncate">{a.name}</span>
                    <button type="button" onClick={() => setAtts((p) => p.filter((_, j) => j !== i))} aria-label={zh ? '移除' : 'Remove'} className="text-body-3 hover:text-body">×</button>
                  </span>
                ))}
                {atts.length < ATTACH_MAX_FILES && (
                  <button type="button" onClick={() => fileRef.current?.click()} data-testid="intake-attach" className="rounded-full border border-dashed border-line-strong px-3 py-1.5 text-[12.5px] font-semibold text-body hover:border-brand hover:text-brand">
                    {zh ? `＋ 添加文件（最多 ${ATTACH_MAX_FILES} 个）` : `+ Add files (up to ${ATTACH_MAX_FILES})`}
                  </button>
                )}
              </div>
            </div>
          )}
          <div className="mt-4 flex items-center gap-2">
            {idx > 0 && <button type="button" onClick={back} data-testid="intake-back" className="rounded-full px-3 py-2 text-[12.5px] font-semibold text-body-3 hover:text-body">{zh ? '← 上一步' : '← Back'}</button>}
            <div className="flex-1" />
            {step.optional && !isAnswered(step, cur, atts.length) && <button type="button" onClick={skip} data-testid="intake-skip" className="rounded-full px-3 py-2 text-[12.5px] font-semibold text-body-3 hover:text-body">{zh ? '跳过' : 'Skip'}</button>}
            <button type="button" onClick={next} disabled={!canNext} data-testid="intake-next" className="rounded-full px-4 py-2 text-[13px] font-bold text-white transition disabled:opacity-40" style={{ background: accent }}>
              {idx + 1 >= total ? (zh ? '看一眼再发 →' : 'Review →') : (zh ? '下一步 →' : 'Next →')}
            </button>
          </div>
        </div>
      ) : (
        <div className="px-4 pb-4 pt-3" data-testid="intake-review">
          <div className="text-[12px] font-semibold text-body-3">{zh ? '将发送这一句（可以改）' : 'This will be sent (edit if you like)'}</div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} className="sl-input mt-2 w-full resize-y text-[14px] leading-relaxed" aria-label={zh ? '将发送的消息' : 'Message to send'} />
          {atts.length > 0 && <div className="mt-2 text-[11.5px] text-body-3">{zh ? `附件 ${atts.length} 个：` : `${atts.length} attachment(s): `}{atts.map((a) => a.name).join(zh ? '、' : ', ')}</div>}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={back} data-testid="intake-back" className="rounded-full px-3 py-2 text-[12.5px] font-semibold text-body-3 hover:text-body">{zh ? '← 上一步' : '← Back'}</button>
            <div className="flex-1" />
            <button type="button" onClick={() => onDraft(text.trim())} data-testid="intake-draft" className="rounded-full border border-line-strong bg-white px-3 py-2 text-[12.5px] font-semibold text-body hover:border-brand hover:text-brand">{zh ? '放进输入框自己改' : 'Edit in the composer'}</button>
            <button type="button" onClick={() => void send()} disabled={busy || !text.trim()} data-testid="intake-send" className="rounded-full px-4 py-2 text-[13px] font-bold text-white transition disabled:opacity-40" style={{ background: accent }}>
              {busy ? '…' : (zh ? '发送 ↑' : 'Send ↑')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
