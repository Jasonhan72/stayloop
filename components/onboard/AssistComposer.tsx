'use client'

// The box an applicant hands their material to (2026-11-23): a sentence about themselves, a link to
// their own site, photos or a PDF of a card, a licence, an insurance certificate. One button sends
// it to POST /api/onboard/assist and the answer goes to `onResult` — the entrance page routes on it,
// a form lays it into its empty fields. Used large on /onboard and compact at the top of each form.
// Nothing is submitted from here; what was typed survives a trip through sign-in.
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import type { JoinKind } from '@/lib/onboard/assist'
import { ASSIST_MAX_FILES, ASSIST_MAX_TEXT } from '@/lib/onboard/assist'
import { prepareFiles, recallText, rememberText, requestAssist, type AssistError, type AssistLink, type AssistResult } from '@/lib/onboard/client'

type Words = { zh: string; en: string }

const ERR: Record<AssistError | 'register', Words> = {
  sign_in_required: { zh: '请先登录。', en: 'Please sign in first.' },
  rate_limited: { zh: '用得太频繁了，过一会儿再试。', en: 'That is a lot in one hour; try again a little later.' },
  nothing_to_read: { zh: '先写一句你是做什么的，或者加一张照片。', en: 'Write a line about what you do, or add a photo.' },
  link_unreadable: { zh: '这个链接读不了。把网页上的介绍复制过来，或者直接写几句。', en: 'That link could not be read. Paste the text from the page, or write a few lines instead.' },
  register: { zh: '官方注册库的页面 AI 不读。写下你的注册名和编号就行，核验由工作人员人工完成。', en: 'The AI does not read official registers. Write your registered name and number; staff check them by hand.' },
  image_type: { zh: '有一张图片读不了，请换成 JPG 或 PNG。', en: 'One of the images could not be read; use a JPG or PNG.' },
  image_too_large: { zh: '有一张图片太大了，请换一张小一点的。', en: 'One of the images is too large; try a smaller one.' },
  model_failed: { zh: '这次没读成，请再试一次；也可以直接手动填写。', en: 'That did not work this time. Try again, or fill the form in by hand.' },
  failed: { zh: '这次没读成，请再试一次；也可以直接手动填写。', en: 'That did not work this time. Try again, or fill the form in by hand.' },
}

export function SparkIcon({ size = 18 }: { size?: number }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
      <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />
    </svg>
  )
}
function ClipIcon() {
  return (
    <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.4 11.1l-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5" />
    </svg>
  )
}

export default function AssistComposer({ zh, hint = null, variant = 'hero', signedIn, loginHref, onResult, placeholder, cta }: {
  zh: boolean
  /** the form this sits on, when it sits on one */
  hint?: JoinKind | null
  variant?: 'hero' | 'compact'
  signedIn: boolean
  /** where the button goes for someone who is not signed in */
  loginHref: string
  onResult: (r: AssistResult) => void
  placeholder?: Words
  cta?: Words
}) {
  const L = zh ? 'zh' : 'en'
  const [text, setText] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  // What was typed before signing in comes back (first paint stays the server's empty box).
  useEffect(() => { const t = recallText(); if (t) setText(t) }, [])

  const hero = variant === 'hero'
  const ph = placeholder ?? (hero
    ? { zh: '例如：我是 Northline Home Services 的水管工，持 306A 证书，服务多伦多和密西沙加，上门费 $90、每小时 $120，电话 416-555-0134。也可以直接贴上你的网站链接。', en: 'For example: I am a plumber at Northline Home Services with a 306A certificate, serving Toronto and Mississauga, $90 call-out and $120 an hour, 416-555-0134. Or just paste a link to your website.' }
    : { zh: '写几句，或贴上你的网站链接…', en: 'Write a few lines, or paste a link to your website…' })
  const label = cta ?? { zh: '让 AI 助理填表', en: 'Let the AI Agent fill it in' }

  const add = (list: FileList | null) => {
    if (!list) return
    const next = [...files, ...Array.from(list)].slice(0, ASSIST_MAX_FILES)
    setFiles(next); setErr(null)
    if (fileRef.current) fileRef.current.value = ''
  }
  const badLink = (links: AssistLink[] | undefined) => (links ?? []).find((l) => !l.ok)

  const run = async () => {
    if (busy) return
    setErr(null); setNote(null)
    if (!text.trim() && !files.length) { setErr(ERR.nothing_to_read[L]); return }
    setBusy(true)
    try {
      const { blobs, skipped } = await prepareFiles(files)
      if (files.length && !blobs.length && !text.trim()) { setErr(zh ? '这些文件这台设备读不了，请换成 JPG、PNG 或 PDF。' : 'These files could not be read on this device; use a JPG, PNG or PDF.'); return }
      const r = await requestAssist({ text, blobs, hint, zh })
      if (!r.ok) {
        setErr(r.error === 'link_unreadable' && badLink(r.links)?.reason === 'register' ? ERR.register[L] : ERR[r.error][L])
        return
      }
      const bad = badLink(r.result.links)
      const said = [
        skipped.length ? (zh ? `有 ${skipped.length} 个文件读不了，已跳过。` : `${skipped.length} file(s) could not be read and were skipped.`) : '',
        bad ? (bad.reason === 'register' ? ERR.register[L] : zh ? '有一个链接没读成，已按其余内容填写。' : 'One link could not be read; the rest was used.') : '',
      ].filter(Boolean).join(' ')
      if (r.result.found === 0) {
        setErr((zh ? '没读到能填进表里的内容。多写两句：做什么、在哪些城市、怎么联系；或者换一张更清楚的照片。' : 'Nothing here could be put into the form. Add a line or two — what you do, where, how to reach you — or try a clearer photo.') + (said ? ` ${said}` : ''))
        return
      }
      if (said) setNote(said)
      rememberText('')
      setText(''); setFiles([])
      onResult(r.result)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div data-testid="assist-composer" data-variant={variant}>
      <div className={hero
        ? 'rounded-[28px] border border-line-divider bg-white p-4 shadow-[0_24px_60px_-28px_rgba(27,27,60,0.28)] transition focus-within:border-brand sm:p-5'
        : 'rounded-2xl border border-[#BFE6F5] bg-[#F4FBFE] p-4 transition focus-within:border-brand'}>
        {!hero && (
          <div className="mb-2 flex items-center gap-2 text-[13.5px] font-semibold text-ink">
            <span className="text-brand"><SparkIcon size={16} /></span>
            {zh ? '有材料？交给 AI 助理填' : 'Have something to hand over? Let the AI Agent fill it in'}
          </div>
        )}
        <label className="sr-only" htmlFor={`assist-text-${variant}`}>{zh ? '介绍一下你自己，或贴上网站链接' : 'Tell us about yourself, or paste a link to your site'}</label>
        <textarea
          id={`assist-text-${variant}`}
          rows={hero ? 4 : 2}
          maxLength={ASSIST_MAX_TEXT}
          value={text}
          onChange={(e) => { setText(e.target.value); setErr(null); if (!signedIn) rememberText(e.target.value) }}
          placeholder={ph[L]}
          disabled={busy}
          className={(hero ? 'min-h-[112px] ' : 'min-h-[56px] ') + 'block w-full resize-y bg-transparent text-[16px] leading-relaxed text-ink outline-none placeholder:text-body-3 disabled:opacity-60'}
          data-testid="assist-text"
        />
        {files.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-2" data-testid="assist-files">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex max-w-full items-center gap-1.5 rounded-full bg-[#EEF5FA] py-1 pl-3 pr-1 text-[12.5px] text-body-2">
                <span className="max-w-[180px] truncate">{f.name}</span>
                <button type="button" disabled={busy} onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label={zh ? `移除 ${f.name}` : `Remove ${f.name}`} className="flex h-6 w-6 flex-none items-center justify-center rounded-full text-body-3 transition hover:bg-white hover:text-ink">×</button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <input ref={fileRef} type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={(e) => add(e.target.files)} data-testid="assist-file-input" />
          <button type="button" disabled={busy || files.length >= ASSIST_MAX_FILES} onClick={() => fileRef.current?.click()} className="flex min-h-[44px] items-center gap-2 rounded-full border border-line-divider bg-white px-4 text-[14px] font-semibold text-ink transition hover:border-brand hover:text-brand disabled:opacity-50" data-testid="assist-attach">
            <ClipIcon />{zh ? '加照片或 PDF' : 'Add photos or a PDF'}
          </button>
          <span className="min-w-0 flex-1 basis-[180px] text-[12.5px] leading-snug text-body-3">{zh ? '名片、牌照、保险证明、清关证明都可以' : 'A business card, a licence, an insurance or clearance certificate'}</span>
          {signedIn ? (
            <button type="button" disabled={busy} onClick={() => void run()} className="sl-btn-primary min-h-[44px] !py-0 max-sm:w-full" data-testid="assist-run">
              <SparkIcon size={16} />{busy ? (zh ? 'AI 助理正在读…' : 'The AI Agent is reading…') : label[L]}
            </button>
          ) : (
            <Link href={loginHref} className="sl-btn-primary min-h-[44px] !py-0 max-sm:w-full" data-testid="assist-signin">
              {zh ? '登录后让 AI 助理填表' : 'Sign in to let the AI Agent fill it in'}
            </Link>
          )}
        </div>
      </div>
      <div aria-live="polite">
        {busy && <p className="mt-3 text-[13px] text-body-2" data-testid="assist-busy">{zh ? '正在读你给的文字、网页和图片，一般十几秒。' : 'Reading your text, page and images. This usually takes ten to twenty seconds.'}</p>}
        {err && <p role="alert" className="mt-3 text-[13.5px] font-semibold text-danger" data-testid="assist-error">{err}</p>}
        {note && !err && <p className="mt-3 text-[13px] text-amber-800" data-testid="assist-note">{note}</p>}
      </div>
      <p className="mt-3 text-[12px] leading-relaxed text-body-3" data-testid="assist-disclosure">
        {zh
          ? '你写的文字、链接指向的网页和图片会发送给 AI 模型读取，只用来填这张申请表；图片不保存。官方注册库的页面 AI 不读，核验由 Stayloop 工作人员人工完成。'
          : 'Your text, the page a link points to and your images are sent to an AI model to be read, only to fill in this application; the images are not kept. The AI does not read official registers — Stayloop staff verify by hand.'}
      </p>
    </div>
  )
}
