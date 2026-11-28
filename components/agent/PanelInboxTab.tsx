'use client'

// 收件 — the panel's fourth tab: the AI Agent's own mailbox (第一期, 2026-11-27,
// design/assistant-inbox-plan-2026-11-27.md; user: 「这个收件还是改成邮件的吧」).
//
// The person gives their assistant a receiving address and FORWARDS mail to it. What the tab shows:
//   · no mailbox yet     the Muse panel's empty state — one sentence, what is kept and for how long,
//                        「创建邮箱」;
//   · a mailbox          its address (copy), who may write to it, the mail — newest first;
//   · one mail           who, when, the text as plain text, its attachments, and what can be done:
//                        「交给 AI 助理」 (the mail goes into the composer of the person's own
//                        conversation, NOT sent), download, delete;
//   · settings           allowed senders · a new address · close the mailbox and delete everything.
// Rules that hold everywhere here: the address only receives, nothing is ever sent from it; a mail
// that arrives is not read, filed or answered by the assistant until the person hands it over; mail
// text is shown as text — never as HTML, never with live links; files leave only as downloads.
//
// Accounts the mailbox is not open to yet (app_config 'assistant_mail' audience) keep what the tab
// showed before: the messages other people wrote to them (SiteMessages below).
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { useT } from '@/lib/i18n'
import { MESSAGES_CHANGED_EVENT, useUnreadMessages } from '@/lib/messages/unread'
import { counterpartLine } from '@/lib/threads/shared'
import { pickCardLang } from '@/lib/ui/cardLang'
import { agoLabel } from '@/lib/agent/approvalHistory'
import type { ChatAttachment } from '@/lib/agent/types'
import { handoffText } from '@/lib/assistantMail/handoff'
import { MAIL_CHANGED_EVENT, carriable, fetchMailbox, listMail, loadAttachments, mailAction, mailFileUrl, mailboxAction, readMail, type MailFile, type MailRow, type MailboxAction, type MailboxState } from '@/lib/assistantMail/client'
import { RowIcon } from './PanelFold'
import { BackIcon, MailIcon, SlidersIcon } from './panelIcons'

export type MailHandoff = { text: string; attachments: ChatAttachment[] }
type View = { at: 'list' } | { at: 'mail'; id: string } | { at: 'settings' }

const ERR: Record<string, { zh: string; en: string }> = {
  bad_email: { zh: '这不像一个邮箱地址。', en: 'That does not look like an email address.' },
  too_many: { zh: '最多加 10 个发件人。', en: 'Ten extra senders at most.' },
  not_available: { zh: '这个账号暂时还不能开邮箱。', en: 'A mailbox is not available to this account yet.' },
  partly_deleted: { zh: '地址已经失效，但有邮件没删干净。请再点一次「关闭邮箱」。', en: 'The address is closed, but some mail could not be deleted. Press “Close mailbox” once more.' },
  rate_limited: { zh: '操作太频繁，过一会儿再试。', en: 'Too many changes — try again in a little while.' },
}
const errText = (code: string, zh: boolean) => (ERR[code] ? (zh ? ERR[code].zh : ERR[code].en) : (zh ? '没有成功，请再试一次。' : 'That did not work — please try again.'))

function fmtBytes(n: number): string {
  if (n >= 1048576) return `${(n / 1048576).toFixed(1)} MB`
  return `${Math.max(1, Math.round(n / 1024))} KB`
}
function fmtDay(iso: string, zh: boolean): string {
  const d = new Date(iso)
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString(zh ? 'zh-CN' : 'en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }) : ''
}
function fmtWhen(iso: string, zh: boolean): string {
  const d = new Date(iso)
  return Number.isFinite(d.getTime()) ? d.toLocaleString(zh ? 'zh-CN' : 'en-CA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : ''
}

export default function PanelInboxTab({ live, visible, onHandOff, onClose }: {
  live: boolean
  visible: boolean
  /** Put a mail into the composer of the conversation (the page owns the composer). */
  onHandOff?: (d: MailHandoff) => void
  /** Sheet only: close it once the mail is in the composer underneath. */
  onClose?: () => void
}) {
  const { lang } = useT()
  const zh = lang === 'zh'
  const auth = useAuth()
  const uid = live ? auth.user?.id ?? null : null
  const [state, setState] = useState<MailboxState | null | 'error'>(null)
  const [view, setView] = useState<View>({ at: 'list' })
  useEffect(() => {
    if (!uid || !visible) return
    let cancelled = false
    fetchMailbox().then((s) => { if (!cancelled) setState(s ?? 'error') })
    return () => { cancelled = true }
  }, [uid, visible])

  if (!live) {
    return (
      <div data-testid="panel-inbox">
        <h3 className="flex min-h-10 items-center pt-2 text-[15px] font-semibold tracking-tight text-ink">{zh ? 'AI 助理的邮箱' : 'Your AI Agent’s mailbox'}</h3>
        <p className="pb-1 text-[13px] leading-relaxed text-body-3">{zh ? '预览模式没有邮箱。登录后可以给 AI 助理开一个收信地址，把邮件转发给它。' : 'Preview has no mailbox. Once signed in, you can give your AI Agent a receiving address and forward mail to it.'}</p>
      </div>
    )
  }
  if (state === null) return <p data-testid="panel-inbox" className="py-3 text-[12.5px] text-body-3">{zh ? '读取中…' : 'Loading…'}</p>
  // The mailbox is not open to this account (or its state could not be read): what the tab showed before.
  if (state === 'error' || !state.available) return <SiteMessages live={live} visible={visible} />
  if (!state.address) return <NoMailbox state={state} zh={zh} onState={setState} />
  if (view.at === 'settings') return <Settings state={state} zh={zh} onState={(s) => { setState(s); if (!s.address) setView({ at: 'list' }) }} onBack={() => setView({ at: 'list' })} />
  if (view.at === 'mail') return <OneMail id={view.id} zh={zh} onBack={() => setView({ at: 'list' })} onHandOff={onHandOff} onClose={onClose} />
  return <Mailbox state={state} zh={zh} live={live} visible={visible} onOpen={(id) => setView({ at: 'mail', id })} onSettings={() => setView({ at: 'settings' })} />
}

// ── no mailbox yet ──────────────────────────────────────────────────────────────

function NoMailbox({ state, zh, onState }: { state: MailboxState; zh: boolean; onState: (s: MailboxState) => void }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const create = async () => {
    setBusy(true); setErr(null)
    const r = await mailboxAction('create')
    setBusy(false)
    if ('error' in r) setErr(errText(r.error, zh))
    else onState(r.state)
  }
  return (
    <div data-testid="panel-inbox" className="pt-6 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-chip text-brand-strong [&>svg]:h-7 [&>svg]:w-7"><MailIcon /></div>
      <h3 className="mt-3 text-[15px] font-semibold tracking-tight text-ink">{zh ? '给 AI 助理一个邮箱地址' : 'Give your AI Agent an email address'}</h3>
      <p className="mx-auto mt-1.5 max-w-[280px] text-[13px] leading-relaxed text-body-2">
        {zh ? '把邮件转发给它：签好的租约、工资单、看不懂的通知。它只收信、不发信；要不要让它读，每一封都由你点。' : 'Forward mail to it — a signed lease, a pay stub, a notice you cannot make sense of. It only receives, never sends; whether it reads a mail is your call, one mail at a time.'}
      </p>
      <button type="button" data-testid="mailbox-create" disabled={busy} onClick={() => void create()} className="mt-4 inline-flex min-h-11 items-center rounded-full px-5 text-[14px] font-bold text-white transition disabled:opacity-60" style={{ background: '#00ACE4' }}>
        {busy ? '…' : zh ? '创建邮箱' : 'Create mailbox'}
      </button>
      {err && <p role="alert" className="mt-2 text-[12px] text-danger">{err}</p>}
      <ul className="mx-auto mt-4 max-w-[290px] space-y-1 text-left text-[11.5px] leading-relaxed text-body-3" data-testid="mailbox-terms">
        <li>· {zh ? `只收你的登录邮箱（${state.loginEmail ?? '—'}）和你自己加的地址发来的信。` : `Only mail from your sign-in email (${state.loginEmail ?? '—'}) and addresses you add yourself is accepted.`}</li>
        <li>· {zh ? `每封保存 ${state.limits.keepDays} 天，到期自动删除，附件和原件一起删。` : `Each mail is kept ${state.limits.keepDays} days, then deleted — attachments and the original with it.`}</li>
        <li>· {zh ? `单封不超过 ${state.limits.maxMb} MB，只留 PDF 和图片附件。` : `Up to ${state.limits.maxMb} MB a mail; only PDF and image attachments are kept.`}</li>
        <li>· {zh ? '只有你读得到。你让 AI 助理读的时候，内容才会送到模型。' : 'Only you can read it. Its content goes to the model only when you ask your AI Agent to read it.'}</li>
      </ul>
    </div>
  )
}

// ── the mailbox ─────────────────────────────────────────────────────────────────

function AddressLine({ address, zh }: { address: string; zh: boolean }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try { await navigator.clipboard.writeText(address); setCopied(true); setTimeout(() => setCopied(false), 1600) } catch { /* the address is selectable text */ }
  }
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-surface-chip px-3.5 py-2.5">
      {/* Breaks before the @ when the line is short — never in the middle of a word. Still one string to select and copy. */}
      <span data-testid="mailbox-address" className="min-w-0 flex-1 select-all break-words font-mono text-[12.5px] leading-snug text-ink">{address.split('@')[0]}<wbr />@{address.split('@')[1] ?? ''}</span>
      <button type="button" data-testid="mailbox-copy" onClick={() => void copy()} className="flex-none rounded-full bg-white px-3 py-1.5 text-[12px] font-bold text-body shadow-[0_1px_2px_rgba(27,27,60,.08)]">{copied ? (zh ? '已复制' : 'Copied') : (zh ? '复制' : 'Copy')}</button>
    </div>
  )
}

function Mailbox({ state, zh, live, visible, onOpen, onSettings }: { state: MailboxState; zh: boolean; live: boolean; visible: boolean; onOpen: (id: string) => void; onSettings: () => void }) {
  const [rows, setRows] = useState<MailRow[] | null | 'error'>(null)
  const [tick, setTick] = useState(0)
  const unreadMessages = useUnreadMessages(live && visible)
  useEffect(() => {
    const h = () => setTick((t) => t + 1)
    window.addEventListener(MAIL_CHANGED_EVENT, h)
    window.addEventListener('focus', h)
    return () => { window.removeEventListener(MAIL_CHANGED_EVENT, h); window.removeEventListener('focus', h) }
  }, [])
  useEffect(() => {
    if (!visible) return
    let cancelled = false
    listMail().then((r) => { if (!cancelled) setRows(r) }, () => { if (!cancelled) setRows('error') })
    return () => { cancelled = true }
  }, [visible, tick])

  return (
    <div data-testid="panel-inbox" className="space-y-3 pt-1">
      <div>
        <div className="flex min-h-10 items-center justify-between gap-2">
          <h3 className="text-[15px] font-semibold tracking-tight text-ink">{zh ? 'AI 助理的邮箱' : 'Your AI Agent’s mailbox'}</h3>
          <button type="button" data-testid="mailbox-settings" onClick={onSettings} aria-label={zh ? '邮箱设置' : 'Mailbox settings'} title={zh ? '邮箱设置' : 'Mailbox settings'} className="flex h-10 w-10 items-center justify-center rounded-lg text-body-3 transition hover:bg-surface-chip hover:text-body"><SlidersIcon /></button>
        </div>
        <AddressLine address={state.address as string} zh={zh} />
        <p className="mt-1.5 px-1 text-[11.5px] leading-relaxed text-body-3">
          {zh
            ? `把邮件转发到这个地址。只收你的登录邮箱${state.senders.length ? `和你加的 ${state.senders.length} 个地址` : ''}发来的信；它只收不发。`
            : `Forward mail to this address. Only your sign-in email${state.senders.length ? ` and the ${state.senders.length} address${state.senders.length === 1 ? '' : 'es'} you added` : ''} can write to it; it never sends.`}
        </p>
      </div>

      {rows === null ? (
        <p className="py-2 text-[12.5px] text-body-3">{zh ? '读取中…' : 'Loading…'}</p>
      ) : rows === 'error' ? (
        <p role="alert" className="py-2 text-[12.5px] text-danger">{zh ? '邮件没有读出来，请稍后再试。' : 'The mail could not be read — try again in a moment.'}</p>
      ) : rows.length === 0 ? (
        <p className="py-1 text-[13px] leading-relaxed text-body-3" data-testid="mailbox-empty">{zh ? '还没有邮件。从你的登录邮箱转发一封到上面的地址试试，一两分钟内会出现在这里。' : 'No mail yet. Forward one from your sign-in email to the address above — it shows up here within a minute or two.'}</p>
      ) : (
        <ul data-testid="mailbox-list">
          {rows.map((r) => (
            <li key={r.id} data-status={r.status}>
              <button type="button" onClick={() => onOpen(r.id)} className="-mx-2 flex w-[calc(100%+16px)] items-start gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-surface-chip/70">
                <RowIcon><MailIcon /></RowIcon>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className={`min-w-0 flex-1 truncate text-[14px] leading-snug text-ink ${r.status === 'new' ? 'font-bold' : 'font-semibold'}`}>{r.subject || (zh ? '（没有主题）' : '(no subject)')}</span>
                    <span className="flex-none font-mono text-[10.5px] text-body-3">{agoLabel(r.received_at, zh)}</span>
                  </span>
                  <span className="mt-0.5 flex items-center gap-2 text-[12.5px] leading-snug text-body-3">
                    <span className="min-w-0 flex-1 truncate">{r.from_name?.trim() || r.from_addr}{r.file_count > 0 ? (zh ? ` · ${r.file_count} 个附件` : ` · ${r.file_count} attachment${r.file_count === 1 ? '' : 's'}`) : ''}</span>
                    {r.status === 'new' && <span className="flex-none rounded-full bg-brand px-1.5 font-mono text-[10px] font-bold leading-4 text-white">{zh ? '新' : 'new'}</span>}
                    {r.status === 'handed' && <span className="flex-none text-[11px] text-body-3">{zh ? '已交给助理' : 'handed over'}</span>}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Link href="/messages" data-testid="mailbox-messages-link" className="inline-flex min-h-9 items-center text-[12.5px] font-semibold text-brand-strong">
        {zh ? `别人在站内写给你的消息在「消息」里${unreadMessages > 0 ? `（${unreadMessages} 条未读）` : ''} →` : `What people write to you on Stayloop is under Messages${unreadMessages > 0 ? ` (${unreadMessages} unread)` : ''} →`}
      </Link>
    </div>
  )
}

// ── one mail ────────────────────────────────────────────────────────────────────

function Back({ zh, onBack, children }: { zh: boolean; onBack: () => void; children?: ReactNode }) {
  return (
    <button type="button" onClick={onBack} data-testid="mailbox-back" className="-ml-1.5 mb-1 inline-flex min-h-10 items-center gap-1 rounded-lg px-1.5 text-[13px] font-semibold text-body-2 transition hover:text-ink">
      <BackIcon /> {children ?? (zh ? '收件' : 'Inbox')}
    </button>
  )
}

/** Body characters shown before 「显示全部」. */
const BODY_FIRST = 2400

function OneMail({ id, zh, onBack, onHandOff, onClose }: { id: string; zh: boolean; onBack: () => void; onHandOff?: (d: MailHandoff) => void; onClose?: () => void }) {
  const [row, setRow] = useState<MailRow | null>(null)
  const [detail, setDetail] = useState<{ body: string; files: MailFile[] } | null | 'error'>(null)
  const [whole, setWhole] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [{ data }, d] = await Promise.all([
        supabase.from('assistant_mail').select('id, from_addr, from_name, subject, size_bytes, file_count, skipped_files, status, received_at, expires_at').eq('id', id).maybeSingle(),
        readMail(id),
      ])
      if (cancelled) return
      setRow((data as MailRow | null) ?? null)
      setDetail(d ?? 'error')
      if (data && (data as MailRow).status === 'new') void mailAction(id, 'seen')
    })()
    return () => { cancelled = true }
  }, [id])

  const download = useCallback(async (f: MailFile) => {
    setBusy(`f${f.idx}`); setNote(null)
    const url = await mailFileUrl(id, f.idx)
    setBusy(null)
    if (!url) { setNote(zh ? '下载链接没有拿到，请再试一次。' : 'Could not get the download link — try again.'); return }
    // A signed link with Content-Disposition: attachment — the file is saved, never opened in the page.
    window.location.assign(url)
  }, [id, zh])

  if (detail === null) return <div data-testid="mailbox-mail"><Back zh={zh} onBack={onBack} /><p className="py-2 text-[12.5px] text-body-3">{zh ? '读取中…' : 'Loading…'}</p></div>
  if (detail === 'error' || !row) return <div data-testid="mailbox-mail"><Back zh={zh} onBack={onBack} /><p role="alert" className="py-2 text-[13px] text-body-3">{zh ? '这封邮件已经不在了（可能已到期或被删除）。' : 'This mail is no longer here (it may have expired or been deleted).'}</p></div>

  const { take, left } = carriable(detail.files)
  const handOff = async () => {
    if (!onHandOff) return
    setBusy('hand'); setNote(null)
    const attachments = await loadAttachments(id, take)
    onHandOff({ text: handoffText({ from_addr: row.from_addr, from_name: row.from_name, subject: row.subject, body_text: detail.body, received_at: row.received_at }, zh, attachments.length), attachments })
    void mailAction(id, 'handed')
    setBusy(null)
    onClose?.()
    setNote(zh ? '已经放进输入框，还没有发送：看一眼，按发送键才交给它。' : 'It is in the message box and not sent yet: have a look, then press send.')
  }
  const remove = async () => {
    setBusy('del'); setConfirm(false)
    const ok = await mailAction(id, 'delete')
    setBusy(null)
    if (ok) onBack()
    else setNote(zh ? '没有删掉，请再试一次。' : 'Could not delete — try again.')
  }
  const body = whole ? detail.body : detail.body.slice(0, BODY_FIRST)
  const skipped = (row.skipped_files ?? []).filter((s) => typeof s === 'string')

  return (
    <div data-testid="mailbox-mail">
      <Back zh={zh} onBack={onBack} />
      <h3 className="text-[15px] font-semibold leading-snug tracking-tight text-ink">{row.subject || (zh ? '（没有主题）' : '(no subject)')}</h3>
      <p className="mt-1 break-all text-[12.5px] leading-snug text-body-2">{row.from_name?.trim() ? `${row.from_name.trim()} · ` : ''}{row.from_addr}</p>
      <p className="mt-0.5 text-[11.5px] leading-snug text-body-3">{fmtWhen(row.received_at, zh)} · {zh ? `${fmtDay(row.expires_at, zh)} 自动删除` : `deleted on ${fmtDay(row.expires_at, zh)}`}</p>

      {/* Plain text only: a mail's HTML is never rendered and nothing in it is a live link. */}
      <div data-testid="mailbox-body" className="mt-3 whitespace-pre-wrap break-words rounded-2xl bg-surface-chip px-3.5 py-3 text-[13px] leading-relaxed text-body">
        {body || (zh ? '（正文是空的）' : '(the body is empty)')}
        {!whole && detail.body.length > BODY_FIRST && (
          <button type="button" onClick={() => setWhole(true)} className="mt-2 block text-[12.5px] font-semibold text-brand-strong">{zh ? `显示全部（还有 ${detail.body.length - BODY_FIRST} 个字）` : `Show all (${detail.body.length - BODY_FIRST} more characters)`}</button>
        )}
      </div>

      {detail.files.length > 0 && (
        <ul className="mt-3 space-y-1.5" data-testid="mailbox-files">
          {detail.files.map((f) => (
            <li key={f.idx} className="flex items-center gap-2 rounded-xl border border-line-divider px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-ink">{f.name}</span>
                <span className="block font-mono text-[10.5px] text-body-3">{fmtBytes(f.size_bytes)}</span>
              </span>
              <button type="button" disabled={busy === `f${f.idx}`} onClick={() => void download(f)} className="min-h-9 flex-none text-[12.5px] font-semibold text-brand-strong disabled:opacity-50">{busy === `f${f.idx}` ? '…' : zh ? '下载' : 'Download'}</button>
            </li>
          ))}
        </ul>
      )}
      {skipped.length > 0 && <p className="mt-2 text-[11.5px] leading-relaxed text-body-3">{zh ? `没有保存：${skipped.join('、')}（只留 PDF 和图片，最多 5 个）。` : `Not kept: ${skipped.join(', ')} (PDF and images only, five at most).`}</p>}

      <div className="mt-4 space-y-2">
        {onHandOff && (
          <button type="button" data-testid="mailbox-handoff" disabled={busy === 'hand'} onClick={() => void handOff()} className="flex min-h-11 w-full items-center justify-center rounded-full px-4 text-[14px] font-bold text-white transition disabled:opacity-60" style={{ background: '#1B1B3C' }}>
            {busy === 'hand' ? (zh ? '正在取附件…' : 'Fetching attachments…') : zh ? '交给 AI 助理' : 'Hand to your AI Agent'}
          </button>
        )}
        <p className="px-1 text-[11.5px] leading-relaxed text-body-3">
          {zh ? '会把这封信放进对话的输入框，不会自动发送。' : 'This puts the mail into the conversation’s message box. Nothing is sent on its own.'}
          {take.length > 0 && (zh ? ` 带上 ${take.length} 个附件。` : ` ${take.length} attachment${take.length === 1 ? '' : 's'} go with it.`)}
          {left > 0 && (zh ? ` 另有 ${left} 个太大或超出 3 个，没有带上，可以下载后自己加。` : ` ${left} more are too large or beyond three and stay here — download them and add them yourself.`)}
        </p>
        {note && <p role="status" className="px-1 text-[12px] leading-relaxed text-body-2">{note}</p>}
        {confirm ? (
          <div data-testid="mail-delete-confirm" className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-body">
            <span className="min-w-0 flex-1 basis-[160px]">{zh ? '删除这封邮件？附件和原件一起删，不能恢复。' : 'Delete this mail? Its attachments and the original go with it; this cannot be undone.'}</span>
            <button type="button" onClick={() => void remove()} className="font-bold text-danger">{zh ? '确认删除' : 'Delete'}</button>
            <button type="button" onClick={() => setConfirm(false)}>{zh ? '取消' : 'Cancel'}</button>
          </div>
        ) : (
          <button type="button" data-testid="mail-delete" disabled={busy === 'del'} onClick={() => setConfirm(true)} className="min-h-9 px-1 text-[12.5px] font-semibold text-danger disabled:opacity-50">{busy === 'del' ? '…' : zh ? '删除这封邮件' : 'Delete this mail'}</button>
        )}
      </div>
    </div>
  )
}

// ── settings ────────────────────────────────────────────────────────────────────

function Settings({ state, zh, onState, onBack }: { state: MailboxState; zh: boolean; onState: (s: MailboxState) => void; onBack: () => void }) {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<'rotate' | 'close' | null>(null)
  const run = async (action: MailboxAction, extra: { email?: string; id?: string } = {}, key: string = action) => {
    setBusy(key); setErr(null); setConfirm(null)
    const r = await mailboxAction(action, extra)
    setBusy(null)
    if ('error' in r) { setErr(errText(r.error, zh)); return false }
    onState(r.state)
    return true
  }
  const warn = 'flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-body'
  return (
    <div data-testid="mailbox-settings-page" className="space-y-4">
      <div>
        <Back zh={zh} onBack={onBack} />
        <AddressLine address={state.address as string} zh={zh} />
      </div>

      <section>
        <h3 className="text-[13.5px] font-semibold text-ink">{zh ? '允许的发件人' : 'Allowed senders'}</h3>
        <p className="mt-0.5 text-[11.5px] leading-relaxed text-body-3">{zh ? '只有这些地址发来、并且通过发件人验证的信才会收下。别的信会被退回给发信的人。' : 'Only mail from these addresses that passes sender verification is accepted. Anything else is returned to whoever sent it.'}</p>
        <ul className="mt-2 divide-y divide-line-soft" data-testid="mailbox-senders">
          <li className="flex items-center gap-2 py-2 text-[13px]">
            <span className="min-w-0 flex-1 break-all text-ink">{state.loginEmail ?? '—'}</span>
            <span className="flex-none text-[11px] text-body-3">{zh ? '登录邮箱' : 'sign-in email'}</span>
          </li>
          {state.senders.map((s) => (
            <li key={s.id} className="flex items-center gap-2 py-2 text-[13px]">
              <span className="min-w-0 flex-1 break-all text-ink">{s.email}</span>
              <button type="button" disabled={busy === s.id} onClick={() => void run('remove_sender', { id: s.id }, s.id)} className="min-h-9 flex-none text-[12.5px] font-semibold text-body-3 disabled:opacity-50">{busy === s.id ? '…' : zh ? '移除' : 'Remove'}</button>
            </li>
          ))}
        </ul>
        {state.senders.length < state.limits.senders && (
          <form className="mt-2 flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (!email.trim()) return; void run('add_sender', { email: email.trim() }, 'add').then((ok) => { if (ok) setEmail('') }) }}>
            <input type="email" inputMode="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={zh ? '你的另一个邮箱地址' : 'Another address of yours'} aria-label={zh ? '要加的发件人邮箱' : 'Sender email to add'} data-testid="mailbox-sender-input" className="min-w-0 flex-1 rounded-full border border-line-divider bg-white px-3 py-2 text-[13px] outline-none focus:border-brand" />
            <button type="submit" disabled={busy === 'add' || !email.trim()} data-testid="mailbox-sender-add" className="flex-none rounded-full px-3.5 py-2 text-[12.5px] font-bold text-white disabled:opacity-50" style={{ background: '#1B1B3C' }}>{busy === 'add' ? '…' : zh ? '加上' : 'Add'}</button>
          </form>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-[13.5px] font-semibold text-ink">{zh ? '地址' : 'Address'}</h3>
        {confirm === 'rotate' ? (
          <div data-testid="mailbox-rotate-confirm" className={warn}>
            <span className="min-w-0 flex-1 basis-[160px]">{zh ? '换一个地址？旧地址立刻失效，发到旧地址的信会被退回。已经收到的邮件不受影响。' : 'Change the address? The old one stops working at once and mail sent to it is returned. Mail already received stays.'}</span>
            <button type="button" onClick={() => void run('rotate')} className="font-bold text-danger">{zh ? '确认更换' : 'Change it'}</button>
            <button type="button" onClick={() => setConfirm(null)}>{zh ? '取消' : 'Cancel'}</button>
          </div>
        ) : (
          <button type="button" data-testid="mailbox-rotate" disabled={busy === 'rotate'} onClick={() => setConfirm('rotate')} className="block min-h-9 text-[12.5px] font-semibold text-body-2 disabled:opacity-50">{busy === 'rotate' ? '…' : zh ? '换一个地址' : 'Change the address'}</button>
        )}
        {confirm === 'close' ? (
          <div data-testid="mailbox-close-confirm" className={warn}>
            <span className="min-w-0 flex-1 basis-[160px]">{zh ? '关闭邮箱？地址失效，这里的全部邮件、附件和原件会被删除，不能恢复。已经导入到别处的内容不受影响。' : 'Close the mailbox? The address stops working and every mail, attachment and original here is deleted for good. Anything already imported elsewhere stays.'}</span>
            <button type="button" onClick={() => void run('close')} className="font-bold text-danger">{zh ? '确认关闭' : 'Close it'}</button>
            <button type="button" onClick={() => setConfirm(null)}>{zh ? '取消' : 'Cancel'}</button>
          </div>
        ) : (
          <button type="button" data-testid="mailbox-close" disabled={busy === 'close'} onClick={() => setConfirm('close')} className="block min-h-9 text-[12.5px] font-semibold text-danger disabled:opacity-50">{busy === 'close' ? '…' : zh ? '关闭邮箱并删除全部邮件' : 'Close the mailbox and delete all mail'}</button>
        )}
      </section>
      {err && <p role="alert" className="text-[12px] text-danger">{err}</p>}
      <p className="text-[11.5px] leading-relaxed text-body-3">{zh ? `每封邮件保存 ${state.limits.keepDays} 天后自动删除；每天最多收 ${state.limits.perDay} 封。这个地址只收信，从不发信。` : `Each mail is deleted after ${state.limits.keepDays} days; up to ${state.limits.perDay} mails a day. This address only receives — it never sends.`}</p>
    </div>
  )
}

// ── before the mailbox is open to an account: the messages people wrote to them ──

type InboxRow = {
  id: string; kind: string; party: string; last_at: string; last_body: string | null; last_sender_id: string | null
  unread: number; counterpart_names: string[] | null; counterpart_roles: string[] | null
}
/** How many threads the tab lists; the rest are one tap away in the message centre. */
const KEEP = 8

function SiteMessages({ live, visible }: { live: boolean; visible: boolean }) {
  const { lang } = useT()
  const zh = lang === 'zh'
  const auth = useAuth()
  const uid = live ? auth.user?.id ?? null : null
  const [rows, setRows] = useState<InboxRow[] | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const h = () => setTick((t) => t + 1)
    window.addEventListener(MESSAGES_CHANGED_EVENT, h)
    return () => window.removeEventListener(MESSAGES_CHANGED_EVENT, h)
  }, [])
  useEffect(() => {
    if (!uid) { setRows([]); return }
    if (!visible) return
    let cancelled = false
    supabase.rpc('my_threads').then(({ data }) => {
      if (cancelled) return
      // Unread threads first, then newest first — an unread one from last month must not fall off the end of the list.
      const all = ((data ?? []) as InboxRow[]).slice().sort((a, b) => (Number(b.unread > 0) - Number(a.unread > 0)) || String(b.last_at).localeCompare(String(a.last_at)))
      setRows(all)
    }, () => { if (!cancelled) setRows([]) })
    return () => { cancelled = true }
  }, [uid, visible, tick])

  const nameLine = (r: InboxRow) => r.kind === 'support' && r.party !== 'admin' ? (zh ? 'Stayloop 客服' : 'Stayloop support') : counterpartLine(r.counterpart_names ?? [], r.counterpart_roles ?? [], zh)
  const unread = (rows ?? []).reduce((n, r) => n + (r.unread > 0 ? 1 : 0), 0)

  return (
    <div data-testid="panel-inbox" data-mode="messages">
      <h3 className="flex min-h-10 items-baseline justify-between gap-2 pt-2 text-[15px] font-semibold tracking-tight text-ink">
        <span>{zh ? '写给你的消息' : 'Messages to you'}</span>
        {unread > 0 && <span className="text-[12px] font-semibold text-brand-strong" data-testid="panel-inbox-unread">{zh ? `${unread} 段有未读` : `${unread} with unread`}</span>}
      </h3>
      {rows === null ? (
        <p className="py-2 text-[12.5px] text-body-3">{zh ? '读取中…' : 'Loading…'}</p>
      ) : rows.length === 0 ? (
        <p className="pb-1 text-[13px] leading-relaxed text-body-3">{zh ? '还没有人给你写消息。' : 'Nobody has written to you yet.'}</p>
      ) : (
        <ul data-testid="panel-inbox-list">
          {rows.slice(0, KEEP).map((r) => {
            // System lines (a cancelled work order, a decision notice) are stored as 「中文 / English」.
            const body = pickCardLang((r.last_body ?? '').replace(/\s+/g, ' ').trim(), zh ? 'zh' : 'en')
            const mine = !!uid && r.last_sender_id === uid
            return (
              <li key={r.id}>
                <Link href={`/messages?t=${r.id}`} className="-mx-2 flex w-[calc(100%+16px)] items-start gap-3 rounded-xl px-2 py-2 transition hover:bg-surface-chip/70">
                  <RowIcon><MailIcon /></RowIcon>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className={`min-w-0 flex-1 truncate text-[14px] leading-snug text-ink ${r.unread > 0 ? 'font-bold' : 'font-semibold'}`}>{nameLine(r)}</span>
                      <span className="flex-none font-mono text-[10.5px] text-body-3">{agoLabel(r.last_at, zh)}</span>
                    </span>
                    <span className="mt-0.5 flex items-start gap-2">
                      <span className={`line-clamp-2 min-w-0 flex-1 text-[12.5px] leading-snug ${r.unread > 0 ? 'text-body' : 'text-body-3'}`}>{mine ? (zh ? '你：' : 'You: ') : ''}{body || (zh ? '（没有文字）' : '(no text)')}</span>
                      {r.unread > 0 && <span className="mt-0.5 flex-none rounded-full bg-brand px-1.5 font-mono text-[10px] font-bold leading-4 text-white" aria-label={zh ? `${r.unread} 条未读` : `${r.unread} unread`}>{r.unread}</span>}
                    </span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
      <Link href="/messages" className="inline-flex min-h-9 items-center text-[12.5px] font-semibold text-brand-strong">{rows && rows.length > KEEP ? (zh ? `全部 ${rows.length} 段对话 → 消息` : `All ${rows.length} threads → Messages`) : (zh ? '打开消息 →' : 'Open Messages →')}</Link>
      <p className="mt-1 text-[11.5px] leading-relaxed text-body-3">
        {zh ? '这是别人写给你的。AI 助理每次对话会读其中没读的几条来提醒你，不会替你回复——回复由你在「消息」里自己发。' : 'These are written to you. Your AI Agent reads the unread ones each time you talk, to remind you — it never replies for you; you reply yourself in Messages.'}
      </p>
    </div>
  )
}
