'use client'
// 「复制文案 + 下载照片」 — the manual syndication line (V0.8 第二项 · 第 4 步, 2026-10-22) for the channels
// with no API (WeChat, 小红书, Facebook groups). The landlord pastes the post themselves; every post
// links back to the Stayloop listing page.
import { useEffect, useMemo, useState } from 'react'
import { buildSharePost, photoFileName, type ShareFacts } from '@/lib/listings/shareCopy'

export default function SharePostPanel({ zh, listing, images, url, onClose }: { zh: boolean; listing: ShareFacts; images: string[]; url: string; onClose: () => void }) {
  const [lang, setLang] = useState<'zh' | 'en'>(zh ? 'zh' : 'en')
  const text = useMemo(() => buildSharePost(listing, lang, url), [listing, lang, url])
  const [copied, setCopied] = useState(false)
  const [dl, setDl] = useState<{ n: number; total: number } | null>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch { /* the textarea is selectable */ }
  }
  const download = async () => {
    const list = images.slice(0, 12)
    setDl({ n: 0, total: list.length })
    for (let i = 0; i < list.length; i++) {
      try {
        const r = await fetch(list[i])
        const blob = await r.blob()
        const href = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = href; a.download = photoFileName(listing.address, i, list[i]); a.rel = 'noopener'
        document.body.appendChild(a); a.click(); a.remove()
        setTimeout(() => URL.revokeObjectURL(href), 10_000)
      } catch { /* a photo that will not download is skipped; the count still advances */ }
      setDl({ n: i + 1, total: list.length })
      await new Promise((res) => setTimeout(res, 350))
    }
  }
  return (
    <div role="dialog" aria-modal="true" data-testid="share-post-panel" className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-black/50 p-3" onClick={onClose}>
      <div className="max-h-full w-full max-w-[560px] overflow-y-auto rounded-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">{zh ? '发到别处' : 'Share elsewhere'}</div>
            <h3 className="mt-1 text-[18px] font-bold tracking-tight">{zh ? '复制文案 · 下载照片' : 'Copy the post · download photos'}</h3>
          </div>
          <button type="button" onClick={onClose} className="-mr-2 min-h-[44px] px-3 text-body-3">{zh ? '关闭' : 'Close'}</button>
        </div>
        <p className="mt-2 text-[12.5px] leading-relaxed text-body-2">
          {zh
            ? '微信、小红书、Facebook 群没有自动发布接口，由你自己贴。文案只用你发布时填的内容，末尾带房源页链接：看房、提问、申请都回到 Stayloop。'
            : 'WeChat, 小红书 and Facebook groups have no publishing API, so you paste this yourself. The text uses only what you entered when publishing and ends with the listing link: viewings, questions and applications come back to Stayloop.'}
        </p>
        <div className="mt-3 flex gap-1 text-[12px] font-semibold">
          {(['zh', 'en'] as const).map((l) => (
            <button key={l} type="button" onClick={() => setLang(l)} className={`rounded-full px-3 py-1 ${lang === l ? 'bg-ink text-white' : 'border border-line-divider text-body-2'}`}>{l === 'zh' ? '中文' : 'English'}</button>
          ))}
        </div>
        <textarea readOnly value={text} data-testid="share-post-text" rows={12} className="sl-field mt-2 w-full text-[13px] leading-relaxed" style={{ width: '100%' }} onFocus={(e) => e.currentTarget.select()} />
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={copy} className="sl-btn-primary !px-4 !py-2 text-[13px]">{copied ? (zh ? '已复制 ✓' : 'Copied ✓') : zh ? '复制文案' : 'Copy text'}</button>
          <button type="button" onClick={download} disabled={!images.length || (dl !== null && dl.n < dl.total)} className="rounded-full border border-line-strong px-4 py-2 text-[13px] font-semibold disabled:opacity-50">
            {dl && dl.n < dl.total ? (zh ? `下载中 ${dl.n}/${dl.total}` : `Downloading ${dl.n}/${dl.total}`) : zh ? `下载照片（${Math.min(images.length, 12)} 张）` : `Download photos (${Math.min(images.length, 12)})`}
          </button>
          <a href={url} target="_blank" rel="noreferrer" className="rounded-full border border-line-divider px-4 py-2 text-[13px] font-semibold text-body-2">{zh ? '打开房源页 ↗' : 'Open listing ↗'}</a>
        </div>
        {dl && dl.n >= dl.total && dl.total > 0 && <div className="mt-2 text-[12px] text-success">{zh ? '照片已逐张下载到浏览器的下载文件夹。' : 'Photos were downloaded one by one to your browser’s downloads folder.'}</div>}
      </div>
    </div>
  )
}
