'use client'

// The disclosure pack as the applicant sees it: the printable HTML the server
// renders (in a sandboxed iframe) + print / JSON buttons, then every item of
// every screening with a "This is wrong" dispute form (CRA s.13).

import { useState } from 'react'
import { DISPUTE_MAX, type DisclosurePack, type PackItem, type PackScreening, correctionActionText, fmtDate, itemKindText } from './types'

export type DisputeDraft = { screening_id: string; item_kind: PackItem['kind']; item_ref: string; item_label: string; statement: string }

export default function PackView({ zh, html, pack, loading, disputedRefs, onDispute, disputeBusy, disputeError }: {
  zh: boolean
  html: string | null
  pack: DisclosurePack | null
  loading: boolean
  /** `${screening_id}:${ref}` of items already disputed on this request */
  disputedRefs: Set<string>
  onDispute: (draft: DisputeDraft) => Promise<boolean>
  disputeBusy: boolean
  disputeError: string | null
}) {
  function printPack() {
    if (!html || typeof window === 'undefined') return
    // Open the tab on the click (popup rule), then hand it the blob — same
    // approach as lib/export/openHtml.ts, but the HTML is already here.
    const win = window.open('about:blank', '_blank')
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }))
    if (win) win.location.href = url; else window.location.assign(url)
  }
  function downloadJson() {
    if (!pack || typeof window === 'undefined') return
    const url = URL.createObjectURL(new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `stayloop-my-file-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <section data-testid="disclosure-pack" className="rounded-2xl border border-line-divider bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-body-3">{zh ? '我的档案' : 'MY FILE'}</div>
          <p className="mt-1 text-[13px] text-body-3">{zh ? '下面是档案的完整内容；每一条旁边都可以提出争议。' : 'The full file is below; every item can be disputed.'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="sl-btn-secondary" disabled={!html} onClick={printPack} data-testid="pack-print">{zh ? '打印 / 保存 PDF' : 'Print / save PDF'}</button>
          <button type="button" className="sl-btn-ghost" disabled={!pack} onClick={downloadJson} data-testid="pack-json">{zh ? '下载 JSON' : 'Download JSON'}</button>
        </div>
      </div>

      {loading && <p className="mt-4 text-[13px] text-body-3" aria-busy="true">{zh ? '正在生成你的档案…' : 'Preparing your file…'}</p>}
      {html && (
        <iframe
          title={zh ? '我的筛查档案' : 'My screening file'}
          srcDoc={html}
          sandbox=""
          className="mt-4 h-[70vh] min-h-[480px] w-full rounded-xl border border-line-divider bg-white"
          data-testid="pack-frame"
        />
      )}

      {pack && pack.screenings.length > 0 && (
        <div className="mt-8 space-y-6" data-testid="pack-items">
          <div className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-body-3">{zh ? '逐条核对 · 这条不对？' : 'ITEM BY ITEM · IS SOMETHING WRONG?'}</div>
          {pack.screenings.map((s) => (
            <ScreeningItems key={s.screening_id} s={s} zh={zh} disputedRefs={disputedRefs} onDispute={onDispute} disputeBusy={disputeBusy} disputeError={disputeError} />
          ))}
        </div>
      )}
    </section>
  )
}

function ScreeningItems({ s, zh, disputedRefs, onDispute, disputeBusy, disputeError }: {
  s: PackScreening
  zh: boolean
  disputedRefs: Set<string>
  onDispute: (draft: DisputeDraft) => Promise<boolean>
  disputeBusy: boolean
  disputeError: string | null
}) {
  const [openRef, setOpenRef] = useState<string | null>(null)
  const [statement, setStatement] = useState('')
  const [sentRef, setSentRef] = useState<string | null>(null)

  async function submit(item: PackItem) {
    const text = statement.trim()
    if (text.length < 5) return
    const ok = await onDispute({ screening_id: s.screening_id, item_kind: item.kind, item_ref: item.ref, item_label: item.label, statement: text })
    if (ok) { setSentRef(item.ref); setOpenRef(null); setStatement('') }
  }

  return (
    <div className="rounded-xl border border-line-divider p-4" data-testid="pack-screening">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-[15px] font-bold">{s.property || (zh ? '房源未记录' : 'Property not recorded')}</div>
        <div className="font-mono text-[11px] text-body-3">{fmtDate(s.created_at, zh)}{s.landlord_name ? ` · ${s.landlord_name}` : ''} · {s.screening_id.slice(0, 8)}</div>
      </div>
      {s.corrections && s.corrections.length > 0 && (
        <ul className="mt-2 space-y-1 rounded-lg px-3 py-2 text-[12.5px]" style={{ background: '#FEF3E2', color: '#92400E' }}>
          {s.corrections.map((c, i) => (
            <li key={c.id || i}>{correctionActionText(c.action, zh)} · {c.item_label || c.item_ref || '—'}{c.note ? ` · ${c.note}` : ''} · {fmtDate(c.created_at, zh)}</li>
          ))}
        </ul>
      )}
      {s.items.length === 0 ? (
        <p className="mt-3 text-[13px] text-body-3">{zh ? '这次筛查没有可逐条列出的记录。' : 'No itemised records for this screening.'}</p>
      ) : (
        <ul className="mt-3 divide-y divide-line-divider">
          {s.items.map((item) => {
            const key = `${s.screening_id}:${item.ref}`
            const already = disputedRefs.has(key) || sentRef === item.ref
            const open = openRef === item.ref
            return (
              <li key={item.ref} className="py-3" data-testid="pack-item">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-surface-chip px-2 py-[2px] font-mono text-[10.5px] font-bold text-body-3">{itemKindText(item.kind, zh)}</span>
                      {item.unverified && <span className="rounded-full px-2 py-[2px] font-mono text-[10.5px] font-bold" style={{ background: '#FEF3E2', color: '#B45309' }}>{zh ? '未佐证' : 'Unverified'}</span>}
                    </div>
                    <div className="mt-1 text-[14px] font-semibold break-words">{item.label}</div>
                    {item.detail && <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-body-2 break-words">{item.detail}</p>}
                  </div>
                  <div className="flex-none">
                    {already ? (
                      <span className="rounded-full px-2.5 py-1 font-mono text-[11px] font-bold" style={{ background: '#FEF3E2', color: '#B45309' }}>{zh ? '已提出争议' : 'Disputed'}</span>
                    ) : (
                      <button type="button" className="rounded-lg border border-line-divider bg-white px-3 py-1.5 text-[12.5px] font-semibold text-body-2 hover:border-line-strong" onClick={() => { setOpenRef(open ? null : item.ref); setStatement('') }} data-testid="dispute-open">
                        {zh ? '这条不对' : 'This is wrong'}
                      </button>
                    )}
                  </div>
                </div>
                {open && !already && (
                  <div className="mt-3 rounded-xl border border-line-divider bg-surface p-3" data-testid="dispute-form">
                    <label htmlFor={`dispute-${item.ref}`} className="block text-[13px] font-semibold">{zh ? '哪里不对？你认为应该是什么？' : 'What is wrong, and what should it say?'}</label>
                    <textarea
                      id={`dispute-${item.ref}`}
                      className="sl-input mt-2 w-full"
                      rows={4}
                      maxLength={DISPUTE_MAX}
                      value={statement}
                      onChange={(e) => setStatement(e.target.value.slice(0, DISPUTE_MAX))}
                      placeholder={zh ? '例如：这条法庭记录里的人不是我，我从没住过那个地址。' : 'For example: the person in this court record is not me; I have never lived at that address.'}
                    />
                    <div className="mt-1 text-[11.5px] text-body-3">{statement.length} / {DISPUTE_MAX}</div>
                    {disputeError && <p className="mt-2 text-[12.5px] text-[#B91C1C]" role="alert">{disputeError}</p>}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" className="sl-btn-primary" disabled={disputeBusy || statement.trim().length < 5} onClick={() => { void submit(item) }} data-testid="dispute-submit">
                        {disputeBusy ? (zh ? '提交中…' : 'Submitting…') : (zh ? '提出争议' : 'Submit dispute')}
                      </button>
                      <button type="button" className="sl-btn-ghost" onClick={() => setOpenRef(null)}>{zh ? '取消' : 'Cancel'}</button>
                    </div>
                    <p className="mt-2 text-[12px] leading-relaxed text-body-3">{zh ? '我们会在合理时间内核实并回复到你的邮箱；更正后会通知最近 60 天内收到报告的人。' : 'We check within a reasonable time and reply to your email; after a correction, everyone who received the report in the last 60 days is notified.'}</p>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
