'use client'

// The listing description in the UI language only (2026-10-02 · user: "不要中文和
// 英文混杂"). Bilingual text shows its matching half; text written only in the
// other language shows the cached machine translation (labelled), or — while
// that is still running or has failed — a one-line note in the UI language with
// a button that reveals the original. The other language never prints inline.
import { useState } from 'react'
import { descriptionParts, type ResolvedDescription } from '@/lib/listingLang'

export function ListingDescription({ raw, lang, resolved, fallback }: { raw: string | null; lang: 'zh' | 'en'; resolved: ResolvedDescription; fallback: string }) {
  const zh = lang === 'zh'
  const [open, setOpen] = useState(false)
  const other: 'zh' | 'en' = zh ? 'en' : 'zh'
  const original = resolved.translated ? descriptionParts(raw)[other] : resolved.original
  const originalLang = resolved.translated ? other : resolved.originalLang
  const toggle = original ? (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      aria-expanded={open}
      className="whitespace-nowrap font-semibold text-brand-strong underline underline-offset-2"
    >
      {open ? (zh ? '收起原文' : 'Hide original') : (zh ? '显示原文' : 'Show original')}
    </button>
  ) : null
  const originalBlock = open && original ? (
    <div
      lang={originalLang === 'zh' ? 'zh-CN' : 'en'}
      className="mt-3 whitespace-pre-line rounded-[10px] border border-line-divider bg-surface-chip px-4 py-3 text-[13.5px] leading-relaxed text-body-2"
    >
      {original}
    </div>
  ) : null

  if (resolved.text) {
    return (
      <>
        <p className="whitespace-pre-line text-[14.5px] leading-relaxed text-body-2">{resolved.text}</p>
        {resolved.translated && toggle && (
          <div className="mt-2 text-[11.5px] text-body-3">
            {zh ? '这段介绍由 AI 根据英文原文翻译，以原文为准。' : 'Machine-translated from the Chinese original; the original prevails.'}{' '}
            {toggle}
          </div>
        )}
        {originalBlock}
      </>
    )
  }
  if (original) {
    return (
      <>
        <p className="text-[14.5px] leading-relaxed text-body-2">
          {zh ? '这段介绍目前只有英文原文。' : 'This description is currently available in Chinese only.'}{' '}
          {toggle}
        </p>
        {originalBlock}
      </>
    )
  }
  return <p className="whitespace-pre-line text-[14.5px] leading-relaxed text-body-2">{fallback}</p>
}
