// Sweep 2026-10-01 · group A7 (applications + messages): decision notices that
// can contradict each other or get stranded, double / half-typed sends from the
// thread composers, a first message wiped by inbox reloads, an apply form that
// could never be submitted without a phone, retries that dropped edits or
// re-uploaded files, and a notify route that announced the wrong message.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { inUndoWindow, noticeConfirmedSent, noticeControls, noticeDecisionOf, noticeReasonText, pickNoticeCards, type NoticeRow } from '../app/landlord/applicants/noticeState'
import { isSendKey, type ComposerKey } from '../components/messages/composerKeys'

const read = (p: string) => readFileSync(p, 'utf8')
const code = (p: string) => read(p).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')

const card = (over: Partial<NoticeRow>): NoticeRow => ({ id: 'c', status: 'pending', created_at: '2026-10-01T10:00:00Z', executed_at: null, metadata: { decision: 'approved' }, ...over })

describe('decision notices · one live card, nothing stranded (#6 #46 #7 #47 #48)', () => {
  it('pickNoticeCards returns the newest pending card and the newest approved-but-unsent card', () => {
    const rows = [
      card({ id: 'old-pending', created_at: '2026-10-01T09:00:00Z' }),
      card({ id: 'new-pending', created_at: '2026-10-01T11:00:00Z', metadata: { decision: 'declined' } }),
      card({ id: 'sent', status: 'approved', executed_at: '2026-10-01T10:30:00Z', created_at: '2026-10-01T10:20:00Z' }),
      card({ id: 'stuck', status: 'approved', executed_at: null, created_at: '2026-10-01T10:10:00Z' }),
    ]
    const { pending, stuck } = pickNoticeCards(rows)
    expect(pending?.id).toBe('new-pending')
    expect(stuck?.id).toBe('stuck')
    expect(pickNoticeCards([card({ status: 'rejected' }), card({ status: 'expired' })])).toEqual({ pending: null, stuck: null })
  })

  it('a decided application keeps its decision; a pending card blocks drafting the same decision again', () => {
    const none = { pending: null, stuck: null }
    expect(noticeControls({ status: 'reviewing', decision_notified_at: null }, none)).toEqual({ canApprove: true, canDecline: true, canAskMore: true, redraft: null })
    expect(noticeControls({ status: 'approved', decision_notified_at: '2026-10-01T00:00:00Z' }, none)).toMatchObject({ canApprove: false, canDecline: false, canAskMore: true, redraft: null })
    const pend = { pending: card({ metadata: { decision: 'approved' } }), stuck: null }
    expect(noticeControls({ status: null, decision_notified_at: null }, pend)).toMatchObject({ canApprove: false, canDecline: true })
  })

  it('「重新起草通知」 appears for a decided application whose notice never went out, and only with no card in flight', () => {
    expect(noticeControls({ status: 'declined', decision_notified_at: null }, { pending: null, stuck: null }).redraft).toBe('declined')
    expect(noticeControls({ status: 'approved', decision_notified_at: null }, { pending: null, stuck: null }).redraft).toBe('approved')
    expect(noticeControls({ status: 'approved', decision_notified_at: null }, { pending: card({}), stuck: null }).redraft).toBeNull()
    expect(noticeControls({ status: 'approved', decision_notified_at: null }, { pending: null, stuck: card({ status: 'approved' }) }).redraft).toBeNull()
    expect(noticeControls({ status: 'approved', decision_notified_at: '2026-10-01T00:00:00Z' }, { pending: null, stuck: null }).redraft).toBeNull()
  })

  it('a just-approved card is inside the undo window; executor reasons read as actions', () => {
    const now = Date.parse('2026-10-01T12:00:00Z')
    expect(inUndoWindow({ decided_at: '2026-10-01T11:59:30Z' }, now)).toBe(true)
    expect(inUndoWindow({ decided_at: '2026-10-01T11:50:00Z' }, now)).toBe(false)
    expect(inUndoWindow({ decided_at: null }, now)).toBe(false)
    expect(noticeReasonText('decision_changed', true)).toContain('不一致')
    expect(noticeReasonText('already_notified', false)).toMatch(/already sent/)
    expect(noticeReasonText('hourly send limit reached', true)).toContain('重试发送')
    expect(noticeReasonText('applicant has no email', true)).toContain('申请对话')
    expect(noticeReasonText('weird', false)).toBe('The notice was not sent (weird).')
    expect(noticeDecisionOf({ metadata: { decision: 'needs_more' } })).toBe('needs_more')
    expect(noticeDecisionOf({ metadata: { decision: 'maybe' } })).toBeNull()
  })

  const page = code('app/landlord/applicants/[id]/page.tsx')
  it('the page never writes applications.status — the executor does when the notice is sent', () => {
    expect(page).not.toMatch(/from\('applications'\)\.update\(\{ status/)
    expect(page).not.toContain("action: status === 'approved' ? 'application_approved'")
    expect(page).toContain("action: 'application_decision_drafted'")
  })
  it('drafting a notice first retires every other unsent send_decision card for the application', () => {
    const expire = page.indexOf(".update({ status: 'expired', execution_result: { ok: false, reason } })")
    const insert = page.indexOf("action_type: 'send_decision', title, summary")
    expect(expire).toBeGreaterThan(0)
    expect(insert).toBeGreaterThan(expire)
    // Review 2026-10-01: same decision → 'superseded'; only a different one is 'decision_changed'.
    expect(page).toContain("retire('superseded', { application_id: app.id, decision })")
    expect(page.indexOf("retire('decision_changed', { application_id: app.id })")).toBeGreaterThan(page.indexOf("retire('superseded'"))
    expect(page).toContain(".eq('action_type', 'send_decision').in('status', ['pending', 'approved']).is('executed_at', null)")
  })
  it('approved-but-unsent cards stay visible with retry / withdraw; the decided-but-unsent state offers a redraft', () => {
    for (const t of ['data-testid="notice-unsent"', 'data-testid="notice-retry"', 'data-testid="notice-redraft"', 'data-testid="notice-redraft-button"', 'data-testid="notice-rejected"']) expect(page).toContain(t)
    expect(page).toContain('await runNotice(stuckCard)')
    expect(page).toContain("if (row.status === 'expired')")
    // the status shown after sending is re-read from the row, not guessed from the card
    expect(page).not.toContain("status: j.result.decision === 'needs_more' ? 'reviewing'")
    expect(page).toContain("select('status, decision_notified_at, decision_reason')")
  })
  it('the list page links a decided-but-unsent application to where the notice can be sent', () => {
    expect(read('app/landlord/applicants/page.tsx')).toContain('data-testid="notice-unsent-link"')
  })
})

describe('thread composers · one send per message, never mid-IME (#51)', () => {
  const k = (over: Partial<ComposerKey> = {}): ComposerKey => ({ key: 'Enter', shiftKey: false, keyCode: 13, nativeEvent: { isComposing: false, keyCode: 13 }, ...over })
  it('isSendKey: Enter sends; Shift+Enter, an IME commit (isComposing / keyCode 229) and other keys do not', () => {
    expect(isSendKey(k())).toBe(true)
    expect(isSendKey(k({ shiftKey: true }))).toBe(false)
    expect(isSendKey(k({ nativeEvent: { isComposing: true, keyCode: 13 } }))).toBe(false)
    expect(isSendKey(k({ keyCode: 229 }))).toBe(false)
    expect(isSendKey(k({ keyCode: undefined, nativeEvent: { keyCode: 229 } }))).toBe(false)
    expect(isSendKey(k({ key: 'a' }))).toBe(false)
  })
  for (const f of ['components/threads/ThreadPanel.tsx', 'components/threads/ExternalThread.tsx']) {
    it(`${f}: ref guard, optimistic clear with restore, IME-safe Enter`, () => {
      const s = code(f)
      expect(s).not.toMatch(/e\.key === 'Enter' && !e\.shiftKey\)/)
      expect(s).toContain('onKeyDown={(e) => { if (isSendKey(e)) {')
      const fn = s.slice(s.indexOf('async function send()'))
      expect(fn.indexOf('if (sendingRef.current) return')).toBeGreaterThan(0)
      expect(fn.indexOf("setDraft('')")).toBeLessThan(fn.indexOf('await '))
      expect(fn).toContain('restore()')
      expect(fn).toContain('sendingRef.current = false')
    })
  }
})

describe('notify announces the message just sent (#68)', () => {
  it('both composers pass the inserted id', () => {
    const p = code('components/threads/ThreadPanel.tsx')
    expect(p).toContain(".select('id').single()")
    expect(p).toContain('JSON.stringify({ thread_id: threadId, message_id: messageId })')
    const n = code('components/messages/NewMessage.tsx')
    expect(n).toContain(".select('id').single()")
    expect(n).toContain('message_id: data ?')
    expect(n).toContain('if (sendingRef.current) return')
  })
  it('the route looks that id up among the caller’s own recent messages on the thread, and announces it once', () => {
    const r = code('app/api/threads/notify/route.ts')
    expect(r).toContain(".eq('thread_id', tid).eq('sender_id', ud.user.id).eq('kind', 'message').gte('created_at', since)")
    expect(r).toContain("messageId !== null ? q.eq('id', messageId) : q.order('id', { ascending: false })")
    expect(r).toContain("from('message_deliveries').select('id').eq('message_id', msg.id)")
    expect(r.indexOf("from('message_deliveries')")).toBeLessThan(r.indexOf('notifyThreadParties(admin'))
  })
})

describe('message centre keeps a first-message draft through inbox reloads (#52)', () => {
  it('the empty-thread shell is not cleared on every rows change', () => {
    const c = code('components/messages/MessageCenter.tsx')
    const eff = c.slice(c.indexOf('const [extra, setExtra]'), c.indexOf('const current = useMemo'))
    expect(eff).not.toContain('setExtra(null)')
    expect(eff).toContain('if (extraIdRef.current === selected) return')
    expect(c).toContain('<ThreadPanel key={current.id}')
  })
})

describe('apply form (#53 #54)', () => {
  const a = code('app/apply/[slug]/page.tsx')
  it('phone is required, checked before the insert, and an RLS refusal names the cause', () => {
    expect(a).toContain("label={zh ? '电话 *' : 'Phone *'}><Input required type=\"tel\"")
    expect(a).toContain('return (v.match(/\\d/g) ?? []).length >= 7')
    expect(a.indexOf('!phoneLooksValid(form.phone)')).toBeLessThan(a.indexOf(".from('applications')"))
    expect(a).toContain("insertError?.code === '42501' || /row-level security/i.test(msg)")
  })
  it('once the row exists the details lock, uploaded files are reused, and a same-tick double submit is blocked', () => {
    expect(a).toContain('<fieldset disabled={!!createdAppId}')
    expect(a).toContain('data-testid="apply-locked"')
    expect(a).toContain('const already = uploadedRef.current.get(raw)')
    expect(a).toContain('uploadedRef.current.set(raw, forThis)')
    expect(a).toContain('if (submittingRef.current || loading) return')
    expect(a).toContain('uploaded.length > MAX_FILES')
  })
  it('a signed-in applicant who already applied to this listing is sent to that application', () => {
    expect(a).toContain("from('applicant_applications').select('id, created_at').eq('listing_id', listingId)")
    expect(a).toContain('data-testid="apply-existing"')
    expect(a).toContain('href={`/tenant/applications/${existingApp.id}`}')
    expect(a.indexOf('const prior = await findExistingApplication(listing.id)')).toBeLessThan(a.indexOf("from('applications')\n        .insert("))
  })
})

describe('decision notices · review follow-ups (honest outcomes after a failed or contested send)', () => {
  const now = Date.parse('2026-10-01T12:00:00Z')
  it('a card whose send already failed is not "waiting out the undo window"', () => {
    expect(inUndoWindow({ decided_at: '2026-10-01T11:59:55Z', execution_result: { ok: false, reason: 'x' } }, now)).toBe(false)
    expect(inUndoWindow({ decided_at: '2026-10-01T11:59:55Z', execution_result: null }, now)).toBe(true)
  })
  it('"already" is only called sent when the row proves it', () => {
    const c = card({ created_at: '2026-10-01T11:00:00Z', metadata: { decision: 'declined' } })
    expect(noticeConfirmedSent(c, { executed_at: '2026-10-01T11:01:00Z', execution_result: { ok: true } }, null)).toBe(true)
    // claimed by another request, email not out yet (or about to fail)
    expect(noticeConfirmedSent(c, { executed_at: '2026-10-01T11:01:00Z', execution_result: null }, { decision_notified_at: null })).toBe(false)
    expect(noticeConfirmedSent(c, { executed_at: '2026-10-01T11:01:00Z', execution_result: { ok: false } }, { decision_notified_at: '2026-10-01T10:00:00Z' })).toBe(false)
    expect(noticeConfirmedSent(c, null, { decision_notified_at: '2026-10-01T11:02:00Z' })).toBe(true)
    // a request for documents never stamps decision_notified_at
    const more = card({ created_at: '2026-10-01T11:00:00Z', metadata: { decision: 'needs_more' } })
    expect(noticeConfirmedSent(more, null, { decision_notified_at: '2026-10-01T11:02:00Z' })).toBe(false)
    expect(noticeReasonText('in_flight', true)).toContain('另一个页面正在发送')
    expect(noticeReasonText('action is not pending', false)).toMatch(/no longer waiting/)
  })

  const page = code('app/landlord/applicants/[id]/page.tsx')
  it('the banner stops promising an automatic send once this page tried and failed', () => {
    expect(page).toContain('setTriedHere((s) => new Set(s).add(card.id))')
    expect(page).toContain('const stuckWaiting = !!stuckCard && inUndoWindow(stuckCard) && !triedHere.has(stuckCard.id)')
  })
  it('runNotice re-reads the card before calling an "already" answer sent', () => {
    const already = page.indexOf('if (j.executed && j.already) {')
    expect(already).toBeGreaterThan(0)
    expect(page.indexOf('noticeConfirmedSent(card, latest, appRow)')).toBeGreaterThan(already)
    expect(page).toContain("setNoticeInfo(noticeReasonText('in_flight', zh))")
  })
  it('withdraw checks it matched a row; a lost race does not claim "nothing was sent"', () => {
    expect(page).toContain(".is('executed_at', null).select('id')")
    expect(page).toContain("if (!hit || hit.length === 0) {")
    expect(page).toContain("noticeReasonText(retired ? 'card_retired' : 'withdraw_too_late', zh)")
  })
  it('a request for documents goes through the busy gate', () => {
    expect(page).toContain('onClick={() => void draftNeedsMore(needsMoreText.trim())}')
    expect(page).not.toContain("void proposeNotice('needs_more'")
    expect(page).toMatch(/async function draftNeedsMore\(text: string\) \{\n\s+if \(busy \|\| !text\) return\n\s+setBusy\(true\)/)
  })
  it('a card retired elsewhere leaves this page (expired event, "not pending" in words)', () => {
    expect(page).toContain('window.addEventListener(PENDING_EXPIRED_EVENT, onExpired)')
    expect(page).toContain("noticeReasonText('action is not pending', zh)")
  })
})
