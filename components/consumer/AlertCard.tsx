'use client'

// Identity alert (Consumer Reporting Act s.12.1): the applicant writes a note
// (≤500 chars) that every later disclosure of the file carries; expires after
// 6 years; can be withdrawn. Two-step confirm in the page, never window.confirm.

import { useState } from 'react'
import { ALERT_MAX, type ConsumerAlertView, fmtDate } from './types'

export default function AlertCard({ alert, zh, busy, error, onSet, onRevoke }: {
  alert: ConsumerAlertView | null
  zh: boolean
  busy: boolean
  error: string | null
  onSet: (statement: string) => void
  onRevoke: () => void
}) {
  const [text, setText] = useState(alert?.statement || '')
  const [confirmRevoke, setConfirmRevoke] = useState(false)
  const [editing, setEditing] = useState(!alert)

  return (
    <section data-testid="identity-alert" className="rounded-2xl border p-5 sm:p-6" style={{ borderColor: '#FCA5A5', background: '#FFF7F7' }}>
      <div className="font-mono text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: '#B91C1C' }}>{zh ? '身份警示' : 'IDENTITY ALERT'}</div>
      <p className="mt-2 text-[13.5px] leading-relaxed text-body-2">
        {zh
          ? '担心有人冒用你的身份申请租房？在档案上放一条警示（《消费者报告法》s.12.1）。之后每次披露你的档案，这条警示都会一起显示。6 年到期，随时可以撤销。'
          : 'Worried someone may apply in your name? Place an alert on your file (Consumer Reporting Act s.12.1). Every later disclosure of your file shows it. It expires after 6 years and you can withdraw it at any time.'}
      </p>

      {alert && !editing && (
        <div className="mt-4 rounded-xl border border-[#FCA5A5] bg-white p-4" data-testid="identity-alert-current">
          <div className="text-[12px] font-semibold" style={{ color: '#B91C1C' }}>{zh ? '当前警示' : 'Current alert'} · {fmtDate(alert.created_at, zh)}{alert.expires_at ? ` · ${zh ? '到期' : 'expires'} ${fmtDate(alert.expires_at, zh)}` : ''}</div>
          <p className="mt-1 whitespace-pre-line text-[14px] leading-relaxed">{alert.statement}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="sl-btn-secondary" onClick={() => { setText(alert.statement); setEditing(true) }}>{zh ? '修改' : 'Edit'}</button>
            {!confirmRevoke ? (
              <button type="button" className="sl-btn-ghost" onClick={() => setConfirmRevoke(true)}>{zh ? '撤销' : 'Withdraw'}</button>
            ) : (
              <span className="inline-flex flex-wrap items-center gap-2" data-testid="identity-alert-revoke-confirm">
                <span className="text-[13px]">{zh ? '确定撤销这条警示？' : 'Withdraw this alert?'}</span>
                <button type="button" disabled={busy} className="rounded-lg bg-[#B91C1C] px-3 py-1.5 text-[13px] font-semibold text-white" onClick={() => { onRevoke(); setConfirmRevoke(false) }}>{zh ? '确认撤销' : 'Yes, withdraw'}</button>
                <button type="button" className="sl-btn-ghost" onClick={() => setConfirmRevoke(false)}>{zh ? '取消' : 'Cancel'}</button>
              </span>
            )}
          </div>
        </div>
      )}

      {editing && (
        <div className="mt-4">
          <label htmlFor="cf-alert" className="block text-[13px] font-semibold">{zh ? '警示内容' : 'Alert text'}</label>
          <textarea
            id="cf-alert"
            className="sl-input mt-2 w-full"
            rows={3}
            maxLength={ALERT_MAX}
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, ALERT_MAX))}
            placeholder={zh ? '例如：我的身份证件曾在 2026 年 3 月遗失，任何以我名义提交的租房申请请先电话与我核实。' : 'For example: my ID was lost in March 2026; please phone me to verify any rental application in my name.'}
          />
          <div className="mt-1 text-[11.5px] text-body-3">{text.length} / {ALERT_MAX}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={busy || text.trim().length < 5} className="sl-btn-primary" onClick={() => onSet(text.trim())}>
              {busy ? (zh ? '保存中…' : 'Saving…') : (zh ? '设置警示' : 'Set alert')}
            </button>
            {alert && <button type="button" className="sl-btn-ghost" onClick={() => setEditing(false)}>{zh ? '取消' : 'Cancel'}</button>}
          </div>
        </div>
      )}
      {error && <p className="mt-3 text-[12.5px] text-[#B91C1C]" role="alert">{error}</p>}
    </section>
  )
}
