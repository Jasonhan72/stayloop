'use client'
// 「发到别处」— the share pack (v1 2026-10-22: one post + photo pack; v2 2026-10-26:
// one piece of copy per channel, each with its own short link, the QR poster,
// a reply template, and the paste-back that records where the ad went up so the
// unit can be taken down everywhere once it is rented). The landlord pastes
// everything themselves — WeChat, 小红书, Facebook, Kijiji and Instagram have
// no publishing API for this, and their terms forbid scripted posting. Every
// piece links back to the Stayloop listing page.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { buildSharePack, SHARE_CHANNELS, type ShareChannel } from '@/lib/listings/sharePack'
import { isPasteBackChannel } from '@/lib/listings/shareChannels'
import { photoFileName, type ShareFacts } from '@/lib/listings/shareCopy'
import type { SyndicationRow } from '@/lib/listings/syndication'

type LinkItem = { channel: ShareChannel; code: string; url: string; clicks: number; last_clicked_at: string | null }

async function bearer(): Promise<Record<string, string> | null> {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : null
}

export default function SharePostPanel({ zh, listing, listingId, images, url, onClose }: { zh: boolean; listing: ShareFacts; listingId: string; images: string[]; url: string; onClose: () => void }) {
  const [lang, setLang] = useState<'zh' | 'en'>(zh ? 'zh' : 'en')
  const [channel, setChannel] = useState<ShareChannel>('wechat')
  const [links, setLinks] = useState<LinkItem[]>([])
  const [rows, setRows] = useState<SyndicationRow[]>([])
  const [pasteUrl, setPasteUrl] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [dl, setDl] = useState<{ n: number; total: number } | null>(null)

  const load = useCallback(async () => {
    const h = await bearer()
    if (!h) return
    const [a, b] = await Promise.all([
      fetch('/api/listings/share-links', { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify({ listing_id: listingId }) }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`/api/listings/syndications?listing_id=${listingId}`, { headers: h }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ])
    if (a?.items) setLinks(a.items as LinkItem[])
    if (b?.items) setRows(b.items as SyndicationRow[])
  }, [listingId])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const linkMap = useMemo(() => Object.fromEntries(links.map((l) => [l.channel, l.url])) as Partial<Record<ShareChannel, string>>, [links])
  const pieces = useMemo(() => buildSharePack(listing, lang, linkMap, url), [listing, lang, linkMap, url])
  const piece = pieces.find((p) => p.channel === channel) ?? pieces[0]
  const def = SHARE_CHANNELS.find((c) => c.key === channel) ?? SHARE_CHANNELS[0]
  const link = links.find((l) => l.channel === channel) ?? null
  const live = rows.find((r) => r.channel === channel && (r.status === 'posted' || r.status === 'requested')) ?? null
  const totalClicks = links.reduce((s, l) => s + (l.clicks || 0), 0)

  const copy = async (text: string, key: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 1800) } catch { /* the textarea is selectable */ }
  }
  const downloadPhotos = async () => {
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
  const downloadPoster = async () => {
    const h = await bearer()
    const code = links.find((l) => l.channel === 'poster')?.code
    if (!h || !code) { setNote(zh ? '海报还没准备好，稍等再试。' : 'The poster is not ready yet; try again in a moment.'); return }
    setBusy('poster')
    try {
      const r = await fetch(`/api/listings/poster?code=${code}&lang=${lang}`, { headers: h })
      if (!r.ok) throw new Error(String(r.status))
      const blob = await r.blob()
      const href = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = href; a.download = `stayloop-poster-${code}.svg`; a.rel = 'noopener'
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(href), 10_000)
    } catch {
      setNote(zh ? '海报没下载成功，再试一次。' : 'The poster did not download; try again.')
    } finally { setBusy(null) }
  }
  const record = async (action: 'posted' | 'removed') => {
    const h = await bearer()
    if (!h || !isPasteBackChannel(channel)) return
    setBusy(action); setNote(null)
    try {
      const r = await fetch('/api/listings/syndications', {
        method: 'POST', headers: { ...h, 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing_id: listingId, channel, action, external_url: action === 'posted' ? pasteUrl.trim() || null : undefined }),
      })
      const j = (await r.json().catch(() => ({}))) as { item?: SyndicationRow; error?: string }
      if (!r.ok || !j.item) {
        setNote(j.error === 'invalid_url' ? (zh ? '链接要以 https:// 开头。' : 'The link must start with https://.') : (zh ? '没记上，再试一次。' : 'Not recorded; try again.'))
        return
      }
      const item = j.item
      setRows((prev) => [item, ...prev.filter((x) => x.id !== item.id)])
      if (action === 'posted') setPasteUrl('')
    } finally { setBusy(null) }
  }

  const tabCls = (on: boolean) => `rounded-full px-3 py-1 text-[12px] font-semibold ${on ? 'bg-ink text-white' : 'border border-line-divider text-body-2 hover:border-brand hover:text-brand'}`
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(zh ? 'zh-CN' : 'en-CA', { month: 'short', day: 'numeric' }) : '')

  return (
    <div role="dialog" aria-modal="true" data-testid="share-post-panel" className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-black/50 p-3" onClick={onClose}>
      <div className="max-h-full w-full max-w-[640px] overflow-y-auto rounded-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">{zh ? '发到别处' : 'Share elsewhere'}</div>
            <h3 className="mt-1 text-[18px] font-bold tracking-tight">{zh ? '分享包：每个平台一份文案，各带自己的链接' : 'Share pack: one post per platform, each with its own link'}</h3>
          </div>
          <button type="button" onClick={onClose} className="-mr-2 min-h-[44px] flex-none whitespace-nowrap px-3 text-body-3">{zh ? '关闭' : 'Close'}</button>
        </div>
        <p className="mt-2 text-[12.5px] leading-relaxed text-body-2">
          {zh
            ? '这些平台没有自动发布接口，由你自己贴。文案只用你发布时填的内容；每份末尾的链接都是这个平台专属的，点了多少次在下面能看到。看房、提问、申请都回到 Stayloop。'
            : 'These platforms have no publishing API, so you paste it yourself. The text uses only what you entered when publishing; each piece ends with a link unique to that platform, and the clicks show below. Viewings, questions and applications come back to Stayloop.'}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-1.5" data-testid="share-channels">
          {SHARE_CHANNELS.map((c) => (
            <button key={c.key} type="button" data-testid={`share-channel-${c.key}`} onClick={() => { setChannel(c.key); setNote(null) }} className={tabCls(channel === c.key)}>
              {zh ? c.label.zh : c.label.en}
              {rows.some((r) => r.channel === c.key && r.status === 'posted') && <span className="ml-1 text-[10px]">●</span>}
            </button>
          ))}
          <span className="ml-auto flex gap-1 text-[12px] font-semibold">
            {(['zh', 'en'] as const).map((l) => (
              <button key={l} type="button" onClick={() => setLang(l)} className={tabCls(lang === l)}>{l === 'zh' ? '中文' : 'English'}</button>
            ))}
          </span>
        </div>
        <p className="mt-3 text-[12.5px] leading-relaxed text-body-2" data-testid="share-hint">{zh ? def.hint.zh : def.hint.en}</p>
        {channel !== 'poster' && (
          <>
            {piece.title && channel !== 'reply' && (
              <div className="mt-3 flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wide text-body-3">{zh ? '标题' : 'Title'}</span>
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold" data-testid="share-title">{piece.title}</span>
                <button type="button" onClick={() => void copy(piece.title, 'title')} className="text-[12px] font-semibold text-brand">{copied === 'title' ? (zh ? '已复制' : 'Copied') : (zh ? '复制' : 'Copy')}</button>
              </div>
            )}
            <textarea readOnly value={piece.body} data-testid="share-post-text" rows={channel === 'reply' ? 4 : 11} className="sl-field mt-2 w-full text-[13px] leading-relaxed" style={{ width: '100%' }} onFocus={(e) => e.currentTarget.select()} />
          </>
        )}
        {channel === 'poster' && (
          <div className="mt-3 rounded-xl border border-line-divider bg-surface-chip/40 p-4 text-[13px]">
            <div className="font-semibold">{zh ? '海报内容' : 'What the poster shows'}</div>
            <div className="mt-1 text-body-2">{zh ? '地址、租金、户型、可入住日期，和一个扫码直达房源页的二维码（带「海报」渠道标记）。' : 'Address, rent, size, availability and a QR code straight to the listing page (tagged as the poster channel).'}</div>
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {channel !== 'poster' && <button type="button" onClick={() => void copy(piece.body, 'body')} className="sl-btn-primary !px-4 !py-2 text-[13px]">{copied === 'body' ? (zh ? '已复制 ✓' : 'Copied ✓') : zh ? '复制文案' : 'Copy text'}</button>}
          {channel === 'poster' && <button type="button" data-testid="share-poster-download" onClick={() => void downloadPoster()} disabled={busy === 'poster' || !links.length} className="sl-btn-primary !px-4 !py-2 text-[13px]">{busy === 'poster' ? (zh ? '生成中…' : 'Building…') : zh ? '下载海报（SVG）' : 'Download poster (SVG)'}</button>}
          {channel !== 'reply' && channel !== 'poster' && images.length > 0 && (
            <button type="button" onClick={() => void downloadPhotos()} disabled={!!dl && dl.n < dl.total} className="sl-btn-secondary !px-4 !py-2 text-[13px]">
              {dl && dl.n < dl.total ? `${zh ? '下载中' : 'Downloading'} ${dl.n}/${dl.total}` : zh ? `下载照片（${Math.min(images.length, 12)} 张）` : `Download photos (${Math.min(images.length, 12)})`}
            </button>
          )}
          {link && (
            <span className="text-[12px] text-body-3" data-testid="share-link-stats">
              {zh ? '专属链接' : 'Link'} <code className="rounded bg-surface-chip px-1.5 py-[1px] font-mono text-[11px]">{link.url.replace(/^https?:\/\//, '')}</code>
              {' · '}{zh ? `点击 ${link.clicks} 次` : `${link.clicks} clicks`}{link.last_clicked_at ? ` · ${zh ? '最近' : 'last'} ${when(link.last_clicked_at)}` : ''}
            </span>
          )}
        </div>
        {isPasteBackChannel(channel) && (
          <div className="mt-4 rounded-xl border border-line-divider p-3.5" data-testid="share-paste-back">
            {live ? (
              <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
                <span className="rounded-full bg-[#ECFDF5] px-2 py-[2px] text-[11px] font-bold text-[#047857]">{zh ? '已发出去' : 'Posted'}</span>
                <span className="text-body-2">{live.posted_at ? when(live.posted_at) : ''}</span>
                {live.external_url && <a href={live.external_url} target="_blank" rel="noreferrer" className="min-w-0 truncate text-brand underline-offset-2 hover:underline">{live.external_url.replace(/^https?:\/\//, '')}</a>}
                <button type="button" data-testid="share-paste-removed" onClick={() => void record('removed')} disabled={busy === 'removed'} className="ml-auto rounded-full border border-line-divider px-3 py-1 text-[12px] font-semibold text-body-2 hover:border-brand hover:text-brand">{zh ? '已撤下' : 'Taken down'}</button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[12.5px] font-semibold">{zh ? '发出去之后' : 'Once it is up'}</span>
                <input className="sl-input min-w-0 flex-1" value={pasteUrl} onChange={(e) => setPasteUrl(e.target.value)} placeholder={zh ? '帖子链接（微信没有就留空）' : 'Post link (leave blank for WeChat)'} data-testid="share-paste-url" />
                <button type="button" data-testid="share-paste-posted" onClick={() => void record('posted')} disabled={busy === 'posted'} className="sl-btn-secondary !px-3 !py-1.5 text-[12.5px]">{zh ? '记下：已发' : 'Record: posted'}</button>
              </div>
            )}
            <p className="mt-2 text-[11.5px] leading-relaxed text-body-3">{zh ? '记下来之后，这套房下架时会提醒你去这些地方撤帖——外面挂着已租出的房子只会招来无效咨询。' : 'Once recorded, taking the unit off market reminds you to pull these ads — a rented unit still advertised only brings dead enquiries.'}</p>
          </div>
        )}
        {note && <p className="mt-2 text-[12.5px] text-[#9F1239]">{note}</p>}
        {links.length > 0 && (
          <p className="mt-3 text-[11.5px] text-body-3">{zh ? `所有渠道合计点击 ${totalClicks} 次。链接只计数，不记录访客身份。` : `${totalClicks} clicks across all channels. Links only count; nothing about the visitor is kept.`}</p>
        )}
        <p className="mt-2 text-[11.5px] leading-relaxed text-body-3">
          {zh ? 'Stayloop 不用脚本代发任何平台（各平台条款禁止）。Kijiji 与 Rentals.ca 的正式同步要等合作接口；MLS® 走经纪交接。' : 'Stayloop never posts to any platform by script (their terms forbid it). Proper feeds to Kijiji and Rentals.ca wait on partner access; MLS® goes through an agent hand-off.'}
        </p>
      </div>
    </div>
  )
}
