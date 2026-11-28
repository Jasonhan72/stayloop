// @vitest-environment jsdom
// AI 助理的邮箱 · 第一期 — the 收件 tab (2026-11-27). What a person sees and can do there:
// create the mailbox, read a mail as plain text, hand it to the conversation (into the composer,
// not sent), download, delete, manage who may write to it, change or close the address.
// The gate and the storage are pinned in assistantMail20261127.spec.ts; this file is the screen.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import React from 'react'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { all, only, textOf } from './helpers/dom'
import { MAIL_CLOSE_ZH, MAIL_OPEN_ZH } from '@/lib/assistantMail/handoff'

const read = (p: string) => readFileSync(p, 'utf8')
type Row = Record<string, unknown>
const LIMITS = { keepDays: 30, perDay: 20, maxMb: 10, files: 5, senders: 10 }
const ADDRESS = 'ashley-7k3f9q@reply.stayloop.ai'

const net = vi.hoisted(() => ({
  state: null as null | Record<string, unknown>,
  calls: [] as { url: string; body: Record<string, unknown> }[],
  mails: [] as Record<string, unknown>[],
  bodies: {} as Record<string, string>,
  files: {} as Record<string, Record<string, unknown>[]>,
  fail: null as string | null,
  unread: 0,
}))
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => React.createElement('a', { href, ...rest }, children) }))
vi.mock('@/lib/useAuth', () => ({ useAuth: () => ({ loading: false, user: { id: 'u1', email: 'owner@example.org' }, role: null }) }))
vi.mock('@/lib/messages/unread', () => ({ useUnreadMessages: () => net.unread, MESSAGES_CHANGED_EVENT: 'sl-messages-changed' }))
vi.mock('@/lib/supabase', () => {
  const from = (table: string) => {
    const f: Record<string, unknown> = {}
    const q: Record<string, unknown> = {}
    let cols = ''
    q.select = (c: string) => { cols = c; return q }
    q.eq = (k: string, v: unknown) => { f[k] = v; return q }
    q.order = () => q
    q.limit = () => q
    const rows = (): Row[] => {
      if (table === 'assistant_mail') return net.mails.filter((m) => f.id === undefined || m.id === f.id).map((m) => (cols === 'body_text' ? { body_text: net.bodies[String(m.id)] ?? '' } : m))
      if (table === 'assistant_mail_files') return net.files[String(f.mail_id)] ?? []
      return []
    }
    q.maybeSingle = async () => ({ data: rows()[0] ?? null, error: null })
    q.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve({ data: rows(), error: null }).then(res, rej)
    return q
  }
  const supabase = { from, rpc: async () => ({ data: [], error: null }), auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) } }
  return { supabase, getSupabaseBrowser: () => supabase }
})

import PanelInboxTab, { type MailHandoff } from '@/components/agent/PanelInboxTab'

const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } })
const withAddress = (o: Record<string, unknown> = {}) => ({ available: true, address: ADDRESS, createdAt: '2026-11-27T00:00:00Z', loginEmail: 'owner@example.org', senders: [], limits: LIMITS, ...o })
const mail = (o: Row): Row => ({ id: 'm1', from_addr: 'owner@example.org', from_name: 'Owner', subject: 'Fwd: 签好的租约', size_bytes: 300_000, file_count: 1, skipped_files: [], status: 'new', received_at: new Date(Date.now() - 3_600_000).toISOString(), expires_at: '2026-12-27T15:00:00Z', ...o })

beforeEach(() => {
  net.state = withAddress()
  net.calls = []
  net.mails = []
  net.bodies = {}
  net.files = {}
  net.fail = null
  net.unread = 0
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {}
    if (url.startsWith('https://files.test/')) return new Response(new TextEncoder().encode('%PDF-1.4 the file'), { headers: { 'content-type': 'application/octet-stream' } })
    if (init?.method === 'POST') net.calls.push({ url, body })
    expect((init?.headers as Record<string, string> | undefined)?.Authorization).toBe('Bearer tok')
    if (url === '/api/assistant/inbox') {
      if (init?.method !== 'POST') return json(net.state)
      if (net.fail) return json({ error: net.fail }, 400)
      const s = net.state as { address: string | null; senders: { id: string; email: string }[] }
      if (body.action === 'create') s.address = ADDRESS
      if (body.action === 'rotate') s.address = 'ashley-zzzzzz@reply.stayloop.ai'
      if (body.action === 'close') { s.address = null; s.senders = []; net.mails = [] }
      if (body.action === 'add_sender') s.senders = [...s.senders, { id: `s${s.senders.length + 1}`, email: String(body.email).toLowerCase() }]
      if (body.action === 'remove_sender') s.senders = s.senders.filter((x) => x.id !== body.id)
      return json(net.state)
    }
    if (url === '/api/assistant/mail') {
      if (body.action === 'file') return json({ url: `https://files.test/${body.id}/${body.idx}`, name: 'Lease.pdf', mediaType: 'application/pdf' })
      if (body.action === 'delete') net.mails = net.mails.filter((m) => m.id !== body.id)
      return json({ ok: true })
    }
    return json({}, 404)
  }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const mount = (props: Partial<React.ComponentProps<typeof PanelInboxTab>> = {}) => render(<PanelInboxTab live visible {...props} />)

describe('no mailbox yet', () => {
  it('says what it is for and what is kept before anything is created; 「创建邮箱」 makes the address', async () => {
    net.state = withAddress({ address: null })
    const { container } = mount()
    await waitFor(() => expect(only(container, '[data-testid="mailbox-create"]')).toBeTruthy())
    const box = only(container, '[data-testid="panel-inbox"]')
    expect(textOf(box)).toContain('给 AI 助理一个邮箱地址')
    expect(textOf(box)).toContain('它只收信、不发信；要不要让它读，每一封都由你点。')
    const terms = textOf(only(container, '[data-testid="mailbox-terms"]'))
    expect(terms).toContain('只收你的登录邮箱（owner@example.org）和你自己加的地址发来的信。')
    expect(terms).toContain('每封保存 30 天，到期自动删除，附件和原件一起删。')
    expect(terms).toContain('单封不超过 10 MB，只留 PDF 和图片附件。')
    expect(terms).toContain('你让 AI 助理读的时候，内容才会送到模型。')
    expect(net.calls).toEqual([])
    fireEvent.click(only(container, '[data-testid="mailbox-create"]'))
    await waitFor(() => expect(textOf(only(container, '[data-testid="mailbox-address"]'))).toBe(ADDRESS))
    expect(net.calls).toEqual([{ url: '/api/assistant/inbox', body: { action: 'create' } }])
  })
  it('a refusal is said in words', async () => {
    net.state = withAddress({ address: null })
    net.fail = 'not_available'
    const { container } = mount()
    await waitFor(() => expect(only(container, '[data-testid="mailbox-create"]')).toBeTruthy())
    fireEvent.click(only(container, '[data-testid="mailbox-create"]'))
    await waitFor(() => expect(textOf(only(container, '[role="alert"]'))).toBe('这个账号暂时还不能开邮箱。'))
  })
})

describe('the mailbox', () => {
  it('the address, who may write to it, the mail newest first — and one line to the messages people write on the site', async () => {
    net.state = withAddress({ senders: [{ id: 's1', email: 'me@other.example' }] })
    net.mails = [mail({}), mail({ id: 'm2', subject: '', from_name: null, file_count: 0, status: 'handed' })]
    net.unread = 3
    const { container } = mount()
    await waitFor(() => expect(all(container, '[data-testid="mailbox-list"] li').length).toBe(2))
    expect(textOf(only(container, '[data-testid="mailbox-address"]'))).toBe(ADDRESS)
    expect(textOf(only(container, '[data-testid="panel-inbox"]'))).toContain('只收你的登录邮箱和你加的 1 个地址发来的信；它只收不发。')
    const rows = all(container, '[data-testid="mailbox-list"] li')
    expect(rows.map((r) => r.dataset.status)).toEqual(['new', 'handed'])
    expect(textOf(rows[0])).toContain('Fwd: 签好的租约')
    expect(textOf(rows[0])).toContain('Owner · 1 个附件')
    expect(textOf(rows[0])).toContain('1 小时前')
    expect(textOf(rows[1])).toContain('（没有主题）')
    expect(textOf(rows[1])).toContain('已交给助理')
    const link = only<HTMLAnchorElement>(container, '[data-testid="mailbox-messages-link"]')
    expect(link.getAttribute('href')).toBe('/messages')
    expect(textOf(link)).toBe('别人在站内写给你的消息在「消息」里（3 条未读） →')
    // the list of site messages that used to fill this tab is gone for an account with a mailbox
    expect(all(container, '[data-testid="panel-inbox-list"]').length).toBe(0)
  })
  it('an empty mailbox says how to use it', async () => {
    const { container } = mount()
    await waitFor(() => expect(textOf(only(container, '[data-testid="mailbox-empty"]'))).toContain('从你的登录邮箱转发一封到上面的地址试试'))
  })
})

describe('one mail', () => {
  const open = async (props: Partial<React.ComponentProps<typeof PanelInboxTab>> = {}) => {
    const r = mount(props)
    await waitFor(() => expect(all(r.container, '[data-testid="mailbox-list"] li').length).toBeGreaterThan(0))
    fireEvent.click(only(all(r.container, '[data-testid="mailbox-list"] li')[0], 'button'))
    await waitFor(() => expect(only(r.container, '[data-testid="mailbox-body"]')).toBeTruthy())
    return r
  }
  beforeEach(() => {
    net.mails = [mail({ skipped_files: ['notes.docx'] })]
    net.bodies = { m1: 'Hi,\n\n<img src=x onerror="alert(1)"> see https://evil.example/pay now.\n\n<a href="https://evil.example">click</a>' }
    net.files = { m1: [{ idx: 0, name: 'Lease.pdf', media_type: 'application/pdf', size_bytes: 300_000 }] }
  })
  it('is shown as text — nothing in it becomes an element or a live link — with when it will be deleted; opening marks it seen', async () => {
    const { container } = await open()
    const body = only(container, '[data-testid="mailbox-body"]')
    expect(textOf(body)).toContain('<img src=x onerror="alert(1)"> see https://evil.example/pay now.')
    expect(all(body, 'img, a, script, iframe').length).toBe(0)
    const page = only(container, '[data-testid="mailbox-mail"]')
    expect(textOf(page)).toContain('Owner · owner@example.org')
    expect(textOf(page)).toContain('2026/12/27 自动删除')
    expect(textOf(only(container, '[data-testid="mailbox-files"]'))).toContain('Lease.pdf')
    expect(textOf(only(container, '[data-testid="mailbox-files"]'))).toContain('293 KB')
    expect(textOf(page)).toContain('没有保存：notes.docx（只留 PDF 和图片，最多 5 个）。')
    // no anchor anywhere on the page points outside the site
    for (const a of all<HTMLAnchorElement>(page, 'a')) expect(a.getAttribute('href') ?? '').toMatch(/^\//)
    await waitFor(() => expect(net.calls).toContainEqual({ url: '/api/assistant/mail', body: { id: 'm1', action: 'seen' } }))
  })
  it('「交给 AI 助理」: the mail goes to the composer between the two rule lines, its PDF with it — nothing is sent, and the tab says so', async () => {
    const got: MailHandoff[] = []
    const closed = vi.fn()
    const { container } = await open({ onHandOff: (d) => { got.push(d) }, onClose: closed })
    expect(textOf(only(container, '[data-testid="mailbox-mail"]'))).toContain('会把这封信放进对话的输入框，不会自动发送。 带上 1 个附件。')
    fireEvent.click(only(container, '[data-testid="mailbox-handoff"]'))
    await waitFor(() => expect(got.length).toBe(1))
    const lines = got[0].text.split('\n')
    expect(lines[0]).toBe('帮我看看这封转来的邮件。（1 个附件已经加在这条消息上）')
    expect(lines).toContain(MAIL_OPEN_ZH)
    expect(lines[lines.length - 1]).toBe(MAIL_CLOSE_ZH)
    expect(got[0].text).toContain('see https://evil.example/pay now.')
    expect(got[0].attachments).toEqual([expect.objectContaining({ name: 'Lease.pdf', mediaType: 'application/pdf', isPdf: true, isImage: false })])
    expect(got[0].attachments[0].dataUrl).toMatch(/^data:application\/pdf;base64,/)
    await waitFor(() => expect(net.calls).toContainEqual({ url: '/api/assistant/mail', body: { id: 'm1', action: 'handed' } }))
    expect(closed).toHaveBeenCalledTimes(1) // the sheet gets out of the way of the composer
    await waitFor(() => expect(textOf(only(container, '[role="status"]'))).toBe('已经放进输入框，还没有发送：看一眼，按发送键才交给它。'))
    // the only calls were: seen, the file link, handed — no message, no turn
    expect(net.calls.map((c) => c.body.action)).toEqual(['seen', 'file', 'handed'])
  })
  it('files too large for the composer, or beyond three, stay — and the tab says how many', async () => {
    net.files = { m1: [
      { idx: 0, name: 'a.pdf', media_type: 'application/pdf', size_bytes: 1000 },
      { idx: 1, name: 'huge.pdf', media_type: 'application/pdf', size_bytes: 6 * 1024 * 1024 },
      { idx: 2, name: 'b.jpg', media_type: 'image/jpeg', size_bytes: 1000 },
      { idx: 3, name: 'c.png', media_type: 'image/png', size_bytes: 1000 },
      { idx: 4, name: 'd.pdf', media_type: 'application/pdf', size_bytes: 1000 },
    ] }
    const { container } = await open({ onHandOff: () => {} })
    expect(textOf(only(container, '[data-testid="mailbox-mail"]'))).toContain('带上 3 个附件。 另有 2 个太大或超出 3 个，没有带上，可以下载后自己加。')
  })
  it('deleting takes two steps and returns to the list', async () => {
    const { container } = await open()
    expect(all(container, '[data-testid="mail-delete-confirm"]').length).toBe(0)
    fireEvent.click(only(container, '[data-testid="mail-delete"]'))
    const confirm = only(container, '[data-testid="mail-delete-confirm"]')
    expect(textOf(confirm)).toContain('删除这封邮件？附件和原件一起删，不能恢复。')
    expect(net.calls.some((c) => c.body.action === 'delete')).toBe(false)
    fireEvent.click(all(confirm, 'button')[0])
    await waitFor(() => expect(only(container, '[data-testid="mailbox-empty"]')).toBeTruthy())
    expect(net.calls).toContainEqual({ url: '/api/assistant/mail', body: { id: 'm1', action: 'delete' } })
  })
})

describe('settings', () => {
  const openSettings = async () => {
    const r = mount()
    await waitFor(() => expect(only(r.container, '[data-testid="mailbox-settings"]')).toBeTruthy())
    fireEvent.click(only(r.container, '[data-testid="mailbox-settings"]'))
    return r
  }
  it('the login email is always on the list; another address can be added and removed', async () => {
    const { container } = await openSettings()
    const list = () => textOf(only(container, '[data-testid="mailbox-senders"]'))
    expect(list()).toContain('owner@example.org登录邮箱')
    fireEvent.change(only(container, '[data-testid="mailbox-sender-input"]'), { target: { value: ' Me@Other.example ' } })
    fireEvent.click(only(container, '[data-testid="mailbox-sender-add"]'))
    await waitFor(() => expect(list()).toContain('me@other.example'))
    expect(net.calls[0]).toEqual({ url: '/api/assistant/inbox', body: { action: 'add_sender', email: 'Me@Other.example' } })
    expect(only<HTMLInputElement>(container, '[data-testid="mailbox-sender-input"]').value).toBe('')
    fireEvent.click(all(only(container, '[data-testid="mailbox-senders"]'), 'button')[0])
    await waitFor(() => expect(list()).not.toContain('me@other.example'))
    expect(net.calls[1]).toEqual({ url: '/api/assistant/inbox', body: { action: 'remove_sender', id: 's1' } })
  })
  it('a new address and closing the mailbox each take two steps and say what happens', async () => {
    const { container } = await openSettings()
    fireEvent.click(only(container, '[data-testid="mailbox-rotate"]'))
    expect(textOf(only(container, '[data-testid="mailbox-rotate-confirm"]'))).toContain('旧地址立刻失效，发到旧地址的信会被退回。已经收到的邮件不受影响。')
    expect(net.calls).toEqual([])
    fireEvent.click(all(only(container, '[data-testid="mailbox-rotate-confirm"]'), 'button')[0])
    await waitFor(() => expect(textOf(only(container, '[data-testid="mailbox-address"]'))).toBe('ashley-zzzzzz@reply.stayloop.ai'))
    fireEvent.click(only(container, '[data-testid="mailbox-close"]'))
    expect(textOf(only(container, '[data-testid="mailbox-close-confirm"]'))).toContain('这里的全部邮件、附件和原件会被删除，不能恢复。')
    fireEvent.click(all(only(container, '[data-testid="mailbox-close-confirm"]'), 'button')[0])
    // closed: back to the empty state, ready to be created again
    await waitFor(() => expect(only(container, '[data-testid="mailbox-create"]')).toBeTruthy())
    expect(net.calls.map((c) => c.body.action)).toEqual(['rotate', 'close'])
  })
})

describe('the rules, in the source', () => {
  const tab = read('components/agent/PanelInboxTab.tsx')
  it('mail is text: never HTML, never a link built from it; a file leaves as a download', () => {
    expect(tab).not.toContain('dangerouslySetInnerHTML')
    const hrefs = [...tab.matchAll(/href=\{?[`"']?([^\s}>]+)/g)].map((m) => m[1])
    expect(hrefs.length).toBeGreaterThan(0)
    for (const h of hrefs) expect(h).toMatch(/^\/messages/) // the only links on the tab go to the site's own message centre
    expect(tab).toContain('data-testid="mailbox-body" className="mt-3 whitespace-pre-wrap break-words')
    expect(tab).toContain('window.location.assign(url)')
    expect(read('lib/assistantMail/server.ts')).toContain('createSignedUrl(f.path, 600, { download: f.name })')
  })
  it('handing over fills the composer and stops there: the page sets a draft, it does not send', () => {
    const page = read('components/agent/AgentWorkspacePage.tsx')
    expect(page).toContain('const handOffMail = useCallback((d: MailHandoff) => setDraft({ text: d.text, attachments: d.attachments, nonce: Date.now() }), [])')
    expect((page.match(/onHandOffMail=\{handOffMail\}/g) ?? []).length).toBe(2) // the column and the sheet
    expect(page).not.toMatch(/handOffMail[^\n]*sendMessage/)
    const bar = read('components/agent/AgentInputBar.tsx')
    expect(bar).toContain('if (draft.attachments) setAtts(draft.attachments.slice(0, ATTACH_MAX_FILES))')
    expect(tab).not.toMatch(/sendMessage|\/api\/agent\/turn|send=1/)
  })
  it('the tab promises nothing the mailbox does not do: it only receives', () => {
    expect(tab).toContain('它只收信、不发信')
    expect(tab).toContain('这个地址只收信，从不发信。')
    expect(tab).not.toMatch(/自动回复|代你回复|auto-?reply|即将上线|coming soon/i)
  })
})
