'use client'

import { isRegistrationLive } from '@/lib/agentProfile'
import RepresentingStrip from '@/components/delegations/RepresentingStrip'
import React, { ReactNode, useEffect, useRef, useState } from 'react'
import { fetchPendingCount, PENDING_CHANGED_EVENT } from '@/lib/agent/pendingCount'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useHats, bestHat } from '@/lib/useHats'
import Header from './Header'
import { useI18n } from '@/lib/i18n'
import { LiveRowsProvider, useLiveRowsTotal } from '@/lib/liveRows'
import { SampleBanner } from './SampleNotice'
import { supabase } from '@/lib/supabase'
import { roleStorageKey, useAuth } from '@/lib/useAuth'
import { assistantItems, GearIcon, PhoneTabs, PlusIcon, RAIL_BY_ROLE, type RailItem, type WorkspaceRole } from './workspace/rail'
import { useUnreadMessages } from '@/lib/messages/unread'

export type { WorkspaceRole } from './workspace/rail'

interface Props {
  role: WorkspaceRole
  aside?: ReactNode
  children: ReactNode
  // hide aside (e.g. on small surfaces)
  hideAside?: boolean
  // Real rows that must stay visible even when the route's fixture body is
  // gated behind the honest empty state (e2e 2026-09-23: a tenant with live
  // showing requests and an application saw only "还没有租房申请").
  liveSlot?: ReactNode
  /** Phone: no content padding — the page owns the whole viewport (assistant screens). md+ unchanged. */
  phoneApp?: boolean
}

// Workspace routes whose page body is still design-canon fixture content
// (Mia Chen / Thompson / Kevin Tran…). The old treatment kept the fixtures
// on screen with a banner on top; real users still read canned tenants as
// their own data, and new users met a wall of somebody else's numbers.
// Activation plan 2026-08-12: the DEFAULT is an honest empty state carrying
// the next-step CTA for that surface; the fixtures stay one click away
// behind "查看产品演示" (session-scoped).
//
// /tenant/passport and /tenant/lease are deliberately NOT gated: both carry
// real functionality (share-token generation; HouseholdList) mixed with
// demo sections, and blanket-hiding them would hide the real parts too.
// /landlord/leases and /landlord/applicants self-manage (real rows render
// once any exist).
type GateNote = { zh: string; en: string }
/** An optional second, quieter link under the CTA (e.g. the repairs network page). */
type GateMore = { zh: string; en: string; href: string }
const DEMO_GATE: Record<string, { zh: string; en: string; ctaZh: string; ctaEn: string; href: string; note?: GateNote; more?: GateMore }> = {
  '/landlord/finance': {
    zh: '还没有收支记录。导入一份已签租约,租金台账从第一天起自动记录。', en: 'No ledger yet. Import a signed lease and the rent ledger starts itself.',
    ctaZh: '导入已签租约 →', ctaEn: 'Import a signed lease →', href: '/leases/import',
  },
  '/landlord/maintenance': {
    zh: '还没有报修工单。工单来自你的在管租约——导入后租客可直接在站内报修，你可派给已核验的服务商或自己的联系人。', en: 'No tickets yet. Tickets come from your managed tenancies — import a lease and tenants file them here; you dispatch to a verified provider or your own contact.',
    ctaZh: '导入已签租约 →', ctaEn: 'Import a signed lease →', href: '/leases/import',
    more: { zh: '维修与服务网络是怎么运作的 →', en: 'How the repairs network works →', href: '/services' },
  },
  '/tenant/applications': {
    zh: '还没有租房申请。让 AI 助理按你的预算和区域先找几套,再一键申请。', en: 'No applications yet. Let your AI Agent shortlist homes for your budget and area first.',
    ctaZh: '让 AI 助理开始找房 →', ctaEn: 'Let your AI Agent start searching →', href: '/tenant/agent',
  },
  '/tenant/payments': {
    zh: '还没有租金记录。加入或导入你的在管租约后,每月租金在这里留痕——准时记录会进入你的租客护照。', en: 'No rent records yet. Join or import your managed tenancy and every month leaves a record here.',
    ctaZh: '导入已签租约 →', ctaEn: 'Import a signed lease →', href: '/leases/import',
    note: {
      zh: '在线收租尚未上线：「立即支付」不会扣款，没有任何银行或支付机构接入。',
      en: 'Online rent collection is not live yet: "Pay now" does not debit anything — no bank or payment processor is connected.',
    },
  },
  '/tenant/move-in': {
    zh: '入住清单会在你的租约开始时生成。', en: 'Your move-in checklist is generated when a tenancy starts.',
    ctaZh: '导入已签租约 →', ctaEn: 'Import a signed lease →', href: '/leases/import',
  },
  '/tenant/maintenance': {
    zh: '还没有报修记录。加入你的在管租约后,报修、进度、留痕都在这里；房东可把工单派给资质已核的服务商。', en: 'No maintenance yet. Join your managed tenancy and repairs live here; your landlord can dispatch a credential-checked provider.',
    ctaZh: '导入已签租约 →', ctaEn: 'Import a signed lease →', href: '/leases/import',
    more: { zh: '维修与服务网络是怎么运作的 →', en: 'How the repairs network works →', href: '/services' },
  },
  '/agent/tasks': {
    zh: '任务由你的客户表自动生成：缺代表协议 / Information Guide 的日期、超过 7 天没联系、看房中要备带看包、已申请要跟进结果。先在客户表里加第一位客户。', en: 'Tasks come from your client table: missing agreement / Information Guide dates, 7+ days quiet, a showing pack to prepare, an application to follow up. Add your first client in the client table.',
    ctaZh: '去客户表 →', ctaEn: 'Open the client table →', href: '/agent/clients',
  },
  '/agent/clients': {
    zh: '上面是你的真实客户表：加第一位客户，并记录代表协议与 Information Guide 的日期。下面的样例只是演示。', en: 'Your real client table is above: add the first client and record the agreement and Information Guide dates. The samples below are a demo.',
    ctaZh: '和 AI 助理开工 →', ctaEn: 'Start with your AI Agent →', href: '/agent/agent',
  },
  '/agent/calendar': {
    zh: '还没有带看日程。让 AI 助理帮你安排第一场。', en: 'No showings yet. Let your AI Agent schedule your first.',
    ctaZh: '打开 AI 助理 →', ctaEn: 'Open your AI Agent →', href: '/agent/agent',
  },
  '/agent/earnings': {
    zh: '还没有结算记录。完成的转介与筛查服务会在这里对账。', en: 'No settlements yet. Completed referrals and screenings reconcile here.',
    ctaZh: '打开 AI 助理 →', ctaEn: 'Open your AI Agent →', href: '/agent/agent',
  },
  '/tenant/passport/sharing': {
    zh: '还没有授权记录。第一次分享护照后，谁能看到什么会列在这里。', en: 'No grants yet. Once you share your Passport, who can see what is listed here.',
    ctaZh: '打开护照 →', ctaEn: 'Open Passport →', href: '/tenant/passport',
  },
  '/tenant/audit': {
    zh: '还没有审计记录。AI 助理替你做的每件事都会在这里留痕。', en: 'No audit events yet. Everything your AI Agent does for you is logged here.',
    ctaZh: '打开 AI 助理 →', ctaEn: 'Open your AI Agent →', href: '/tenant/agent',
  },
  '/landlord/audit': {
    zh: '还没有审计记录。AI 助理替你做的每件事都会在这里留痕。', en: 'No audit events yet. Everything your AI Agent does for you is logged here.',
    ctaZh: '打开 AI 助理 →', ctaEn: 'Open your AI Agent →', href: '/landlord/agent',
  },
  '/agent/audit': {
    zh: '还没有审计记录。AI 助理替你做的每件事都会在这里留痕。', en: 'No audit events yet. Everything your AI Agent does for you is logged here.',
    ctaZh: '打开 AI 助理 →', ctaEn: 'Open your AI Agent →', href: '/agent/agent',
  },
  '/agent/showings/*': {
    zh: '还没有带看任务。让 AI 助理帮你接第一场。', en: 'No showings yet. Let your AI Agent book your first.',
    ctaZh: '打开 AI 助理 →', ctaEn: 'Open your AI Agent →', href: '/agent/agent',
  },
}

// Routes that mix real functionality with fixture sections (deliberately not
// gated — see above). They carry the banner permanently; the note says which
// parts are real.
const SAMPLE_NOTE: Record<string, GateNote> = {
  '/tenant/passport': {
    zh: '本页只有「分享链接」与「租金上报候补」是真实功能；四枚章的状态、查看记录与验证历史是示范数据。',
    en: 'Only the share link and the rent-reporting waitlist are live here; stamp status, view log and verification history are sample data.',
  },
  '/tenant/lease': {
    zh: '本页只有「在管租约」列表是真实数据；租约条款、签署进度与 AI 助理解读是示范数据。',
    en: 'Only the managed-lease list is live here; the clauses, signing progress and AI Agent commentary are sample data.',
  },
}

function lookupGate(path: string) {
  if (DEMO_GATE[path]) return DEMO_GATE[path]
  const prefix = Object.keys(DEMO_GATE).find((k) => k.endsWith('/*') && path.startsWith(k.slice(0, -1)))
  return prefix ? DEMO_GATE[prefix] : null
}

function useDemoGate() {
  const path = usePathname() || ''
  const gate = lookupGate(path)
  const sampleNote = SAMPLE_NOTE[path] ?? null
  const [showDemo, setShowDemo] = useState(false)
  useEffect(() => {
    try { setShowDemo(sessionStorage.getItem('sl-show-demo') === '1') } catch {}
  }, [])
  return { gate, sampleNote, showDemo, setShowDemo }
}

function DemoGate({ children, gate, showDemo, setShowDemo, liveSlot, role }: {
  children: React.ReactNode
  gate: (typeof DEMO_GATE)[string] | null
  showDemo: boolean
  setShowDemo: (v: boolean) => void
  liveSlot?: ReactNode
  role: WorkspaceRole
}) {
  const { lang } = useI18n()
  const zh = lang === 'zh'
  if (!gate) return <>{children}</>
  if (showDemo) {
    return (
      <>
        <SampleBanner
          zh={zh}
          note={gate.note}
          onExit={() => { try { sessionStorage.removeItem('sl-show-demo') } catch {}; setShowDemo(false) }}
        />
        {children}
      </>
    )
  }
  return (
    <LiveRowsProvider>
      {liveSlot}
      <GateEmptyState gate={gate} zh={zh} setShowDemo={setShowDemo} hasLive={!!liveSlot} role={role} />
    </LiveRowsProvider>
  )
}

function GateEmptyState({ gate, zh, setShowDemo, hasLive, role }: { gate: NonNullable<(typeof DEMO_GATE)[string]>; zh: boolean; setShowDemo: (v: boolean) => void; hasLive: boolean; role: WorkspaceRole }) {
  const live = useLiveRowsTotal()
  // A neutral page's CTA ("回到工作台") must lead to THIS hat's home — /dashboard sent a
  // tenant or provider into the landlord gate (external review 2026-09-26).
  const ctaHref = gate.href === '/dashboard' && role !== 'landlord' ? `/${role}/agent` : gate.href
  // Real rows are on screen: the "nothing yet" copy would contradict them.
  const copy = hasLive && live > 0
    ? (zh ? '以上是你的真实记录。这一页的其余部分仍是产品演示。' : 'Those are your real records. The rest of this page is still a product demo.')
    : (zh ? gate.zh : gate.en)
  return (
    <div className="rounded-2xl border border-line-divider bg-white px-6 py-16 text-center">
      <p className="mx-auto max-w-[420px] text-[14px] leading-relaxed text-body-2">{copy}</p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link href={ctaHref} className="rounded-xl px-6 py-3 text-[14px] font-bold text-white" style={{ background: '#00ACE4' }}>
          {zh ? gate.ctaZh : gate.ctaEn}
        </Link>
        <button
          className="rounded-xl border border-line-divider px-5 py-3 text-[13px] font-semibold text-body-2"
          onClick={() => { try { sessionStorage.setItem('sl-show-demo', '1') } catch {}; setShowDemo(true) }}
        >
          {zh ? '查看产品演示' : 'View product demo'}
        </button>
      </div>
      {gate.more && <p className="mt-4 text-[12.5px]"><Link href={gate.more.href} className="text-body-3 underline underline-offset-2 hover:text-brand">{zh ? gate.more.zh : gate.more.en}</Link></p>}
    </div>
  )
}

// Agents must be RECO-verified before the agent-only surfaces mean anything
// (decision 2026-09-13). The shell shows the state on every agent page; the
// public directory (AgentPicker) only lists status = verified.
function useAgentVerification(role: WorkspaceRole) {
  const auth = useAuth()
  const [status, setStatus] = useState<'loading' | 'none' | 'pending' | 'verified' | 'rejected' | 'renewal_due' | 'expired'>('loading')
  useEffect(() => {
    if (role !== 'agent') return
    if (auth.loading) return
    if (!auth.user) { setStatus('none'); return }
    supabase.from('agent_profiles').select('status').eq('auth_id', auth.user.id).maybeSingle()
      .then(({ data }) => setStatus((data?.status as typeof status) || 'none'))
  }, [role, auth.loading, auth.user])
  return status
}

function AgentVerificationBanner({ status, zh }: { status: ReturnType<typeof useAgentVerification>; zh: boolean }) {
  const path = usePathname() || ''
  if (status === 'loading' || status === 'verified' || path.startsWith('/agent/verify')) return null
  const text = status === 'pending'
    ? (zh ? '你的 RECO 注册信息已提交，等待人工核验。核验通过后进入租客可选的经纪目录。' : 'Your RECO registration is submitted and awaiting manual verification. Once verified you appear in the tenant-facing agent directory.')
    : status === 'rejected'
      ? (zh ? '认证未通过。请检查提交的注册信息并重新提交。' : 'Verification was not approved. Check the submitted registration and resubmit.')
      : status === 'renewal_due'
        ? (zh ? '你的 RECO 注册将在 30 天内到期。续期后在认证页更新到期日，我们会重新核验；到期前你仍在经纪目录中。' : 'Your RECO registration expires within 30 days. After renewing, update the expiry date on the verification page to be re-checked; you stay in the directory until it lapses.')
      : status === 'expired'
        ? (zh ? '你的 RECO 注册已过期，已暂时移出经纪目录。续期后更新到期日即可重新核验。' : 'Your RECO registration has expired and you have been removed from the directory for now. Update the expiry date after renewing to be re-verified.')
        : (zh ? '经纪身份尚未认证：提交 RECO 注册信息，人工核验后获得「RECO 注册已核」标记并进入租客可选目录。Stayloop 不是经纪公司，不收取佣金或转介费。' : 'Not yet verified as an agent: submit your RECO registration; once checked by hand you get the “RECO verified” mark and appear in the tenant-facing directory. Stayloop is not a brokerage and takes no commission or referral fee.')
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] leading-relaxed text-amber-900">
      <span>{text}</span>
      <Link href="/agent/verify" className="rounded-lg px-3 py-1.5 text-[12.5px] font-bold text-white" style={{ background: '#1B1B3C' }}>{zh ? (status === 'none' ? '去认证' : '查看 / 更新') : (status === 'none' ? 'Get verified' : 'View / update')}</Link>
    </div>
  )
}

// Agent-only surfaces (clients, tasks, calendar, earnings, showings) stay an
// empty state until the RECO check passes; the assistant home and the
// verification page remain usable (decision 2026-09-13).
function isAgentOnlyRoute(path: string): boolean {
  if (!path.startsWith('/agent/')) return false
  // The assistant home, verification, and the phone tabs around the
  // assistant (todo / ideas / progress) stay open before RECO verification.
  return !/^\/agent\/(agent|verify|todo|ideas|progress|audit)(\/|$)/.test(path)
}
function usePathnameSafe(): string { return usePathname() || '' }
function AgentLockedState({ status, zh }: { status: string; zh: boolean }) {
  return (
    <div className="rounded-2xl border border-line-divider bg-white px-6 py-16 text-center">
      <p className="mx-auto max-w-[460px] text-[14px] leading-relaxed text-body-2">
        {status === 'pending'
          ? (zh ? '这一页在 RECO 注册核验通过后开放。你的资料已提交，等待人工核验。' : 'This page opens once your RECO registration is verified. Your submission is awaiting a manual check.')
          : (zh ? '这一页只对已认证的经纪开放：提交 RECO 注册信息，人工核验后即可使用客户、带看与目录功能。' : 'This page is for verified agents: submit your RECO registration and, once checked, clients, showings and the directory open up.')}
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link href="/agent/verify" className="rounded-xl px-6 py-3 text-[14px] font-bold text-white" style={{ background: '#00ACE4' }}>{zh ? (status === 'pending' ? '查看认证状态' : '去认证') : (status === 'pending' ? 'View status' : 'Get verified')}</Link>
        <Link href="/agent/agent" className="rounded-xl border border-line-divider px-5 py-3 text-[13px] font-semibold text-body-2">{zh ? '先和 AI 助理聊聊' : 'Talk to your AI Agent meanwhile'}</Link>
      </div>
    </div>
  )
}

// The landlord workspace is for accounts that hold the landlord hat (three-role
// test report 2026-09-24, SL-A-01 / SL-T-06 / SL-T-08). A signed-in tenant or
// agent without one is sent to /landlord/become — an explicit opt-in — rather
// than silently shown (and, before, silently granted) the landlord tools.
// Anonymous visitors keep the preview.
function rememberHeldHat(r: { uid: string; hat: string } | null) {
  if (!r || typeof window === 'undefined') return
  try { window.localStorage.setItem(roleStorageKey(r.uid), r.hat) } catch { /* storage blocked: the hat check still guards */ }
}
function useLandlordHatGuard(role: WorkspaceRole): { blocked: boolean; pending: boolean } {
  const auth = useAuth()
  const hats = useHats()
  const router = useRouter()
  const path = usePathnameSafe()
  const signedIn = !!auth.user && !(auth.user as { is_anonymous?: boolean }).is_anonymous
  const blocked = role === 'landlord' && signedIn && !hats.loading && !hats.landlord
  // Auth or hats not known yet: render nothing on /landlord/* until we know (site test
  // 2026-10-02, L6 D5) — no landlord tool mounts for a hat-less account, and a real
  // landlord's page mounts once (not mount → unmount while hats load → mount again).
  // Server HTML and the first client render agree: auth is loading in both.
  const pending = role === 'landlord' && (auth.loading || (signedIn && hats.loading))
  const uid = auth.user?.id ?? null
  const fallbackHat = bestHat(hats)
  // Redirect exactly once per path. The effect used to depend on `auth` and
  // `hats` — fresh objects every render — and call auth.setRole(), whose
  // sl-role-changed event re-rendered every useAuth() instance, whose route
  // effect wrote "landlord" back: setRole ↔ route effect ↔ router.replace
  // ping-ponged forever (thousands of /landlord/become requests, tab stuck on
  // "…" — site test 2026-10-02, L6 D1).
  const redirectedFor = useRef<string | null>(null)
  const rememberOnLeave = useRef<{ uid: string; hat: string } | null>(null)
  useEffect(() => {
    if (!blocked || redirectedFor.current === path) return
    redirectedFor.current = path
    // Visiting /landlord/* remembered "landlord" for this account before the bounce,
    // and every neutral page (/notifications, /settings) then opened in the landlord
    // shell and bounced too (external review 2026-09-26, provider P1-2). Put the
    // remembered hat back to one the account holds — written straight to storage,
    // not via auth.setRole(): its role-changed event is what re-armed
    // the useAuth route effect above.
    rememberOnLeave.current = uid ? { uid, hat: fallbackHat } : null
    rememberHeldHat(rememberOnLeave.current)
    const q = typeof window !== 'undefined' ? window.location.search : ''
    router.replace('/landlord/become?next=' + encodeURIComponent(path + q))
  }, [blocked, path, uid, fallbackHat, router])
  // Every useAuth() instance on a /landlord/* page remembers "landlord" when its
  // session resolves — some after the guard ran. Write the held hat again as the
  // page goes away (the become page is not remembered as a role).
  useEffect(() => () => rememberHeldHat(rememberOnLeave.current), [])
  return { blocked, pending }
}

// Every workspace page has exactly one h1 (site test 2026-10-02, L6 D7 / D8):
// many pages show a visual title in a styled div, and the assistant pages show
// the AI Agent's name. The shell adds a visually hidden h1 named after the page
// only while no other visible h1 is on screen — never a second one. It starts
// absent (server HTML = first client render) and is decided after mount.
const TITLE_EN: Record<string, string> = { maint: 'Maintenance', apps: 'Applications', pay: 'Payments', lease: 'Leases', screen: 'Screening', fin: 'Finance', cal: 'Calendar' }
const ROLE_TITLE: Record<WorkspaceRole, { zh: string; en: string }> = { tenant: { zh: '租客', en: 'Tenant' }, landlord: { zh: '房东', en: 'Landlord' }, agent: { zh: '经纪', en: 'Agent' } }
export function shellPageTitle(role: WorkspaceRole, path: string, zh: boolean): string {
  const items: { key: string; href: string; label: { zh: string; en: string } }[] = [
    ...assistantItems(role),
    ...RAIL_BY_ROLE[role],
    { key: 'settings', href: '/settings', label: { zh: '设置', en: 'Settings' } },
  ]
  let best: (typeof items)[number] | null = null
  for (const it of items) {
    if ((path === it.href || path.startsWith(it.href + '/')) && (!best || it.href.length > best.href.length)) best = it
  }
  if (best) return zh ? best.label.zh : (TITLE_EN[best.key] ?? best.label.en)
  return zh ? `${ROLE_TITLE[role].zh}工作台` : `${ROLE_TITLE[role].en} workspace`
}
function hasOtherVisibleH1(): boolean {
  return Array.from(document.querySelectorAll('h1')).some((h) => !h.hasAttribute('data-shell-h1') && h.getClientRects().length > 0)
}
function useShellHeadingNeeded(): boolean {
  const [needed, setNeeded] = useState(false)
  useEffect(() => {
    // Chat pages mutate the DOM constantly (typing, streaming, countdown rows): check at most
    // every 250 ms instead of once per frame, so the layout read stays off the hot path.
    let timer: ReturnType<typeof setTimeout> | null = null
    const check = () => { timer = null; setNeeded(!hasOtherVisibleH1()) }
    const schedule = () => { if (!timer) timer = setTimeout(check, 250) }
    check()
    const mo = new MutationObserver(schedule)
    mo.observe(document.body, { childList: true, subtree: true })
    window.addEventListener('resize', schedule)
    return () => { mo.disconnect(); window.removeEventListener('resize', schedule); if (timer) clearTimeout(timer) }
  }, [])
  return needed
}

export default function WorkspaceShell({ role, aside, children, hideAside, liveSlot, phoneApp = false }: Props) {
  const hatGuard = useLandlordHatGuard(role)
  const hatBlocked = hatGuard.blocked || hatGuard.pending
  const { gate, sampleNote, showDemo, setShowDemo } = useDemoGate()
  const agentStatus = useAgentVerification(role)
  const shellPath = usePathnameSafe()
  const { lang } = useI18n()
  const headingNeeded = useShellHeadingNeeded()
  // On a gated route the aside is demo narrative too (Unit 1207 stories) —
  // an honest empty state beside a fixture-driven aside defeats the point.
  const asideHidden = hideAside || (gate != null && !showDemo)
  return (
    <>
      <Header variant="solid" mobileNav={false} />
      <main style={{ background: '#F3F8FC' }}>
        {/* mobile: stacked (Rail becomes a fixed bottom tab bar); md+: navy
            sidebar left · content · aside right (2026-09 console redesign,
            design/redesign-2026-09/Console.dc.html) */}
        <div className="md:flex md:min-h-[calc(100vh-66px)]">
          <Rail role={role} />
          <div className={phoneApp ? 'sl-phone-pb min-w-0 flex-1 p-0 md:p-0' : 'min-w-0 flex-1 px-5 py-6 pb-24 sm:px-7 md:py-9 md:pb-9 lg:px-12'}>
            {headingNeeded && <h1 data-shell-h1="" className="sr-only">{shellPageTitle(role, shellPath, lang === 'zh')}</h1>}
            {(sampleNote || role === 'agent') && (
              <div className={phoneApp ? 'px-5 pt-4 md:px-8 md:pt-4' : ''}>
                {sampleNote && <SampleBanner zh={lang === 'zh'} note={sampleNote} />}
                {role === 'agent' && <AgentVerificationBanner status={agentStatus} zh={lang === 'zh'} />}
                {role === 'agent' && <RepresentingStrip zh={lang === 'zh'} />}
              </div>
            )}
            {hatBlocked
              ? <div className="py-24 text-center font-mono text-[13px] text-body-3">…</div>
              : role === 'agent' && agentStatus !== 'loading' && !isRegistrationLive(agentStatus) && isAgentOnlyRoute(shellPath)
              ? <AgentLockedState status={agentStatus} zh={lang === 'zh'} />
              : <DemoGate gate={gate} showDemo={showDemo} setShowDemo={setShowDemo} liveSlot={liveSlot} role={role}>{children}</DemoGate>}
          </div>
          {!asideHidden && (
            <aside className="border-t border-line-divider bg-white px-5 py-6 md:w-[320px] md:flex-none md:overflow-y-auto md:border-l md:border-t-0 md:p-6">
              {aside}
            </aside>
          )}
        </div>
      </main>
    </>
  )
}

function Rail({ role }: { role: WorkspaceRole }) {
  const path = usePathname() || ''
  const { lang } = useI18n()
  const en = lang === 'en'
  const items = RAIL_BY_ROLE[role]
  const auth = useAuth()
  // 待办 badge = cards waiting on this hat (same shared fetch as the phone tabs).
  const [pendingCount, setPendingCount] = useState(0)
  useEffect(() => {
    if (auth.loading || !auth.user) { setPendingCount(0); return }
    let cancelled = false
    const load = () => fetchPendingCount(role).then((n) => { if (!cancelled) setPendingCount(n) })
    void load()
    window.addEventListener(PENDING_CHANGED_EVENT, load)
    return () => { cancelled = true; window.removeEventListener(PENDING_CHANGED_EVENT, load) }
  }, [auth.loading, auth.user, role, path])
  // 消息 carries the unread count on the desktop rail too (it only showed on the phone's 更多).
  const unreadMessages = useUnreadMessages(!auth.loading && !!auth.user)
  // md+ (Muse web reference, user 2026-09-25): a 64px icon column, light, no
  // text labels — the name appears on hover / focus (kept on 2026-10-04: 「保持
  // 只有图标」). Grouped (2026-10-04): ＋ 新对话 · the AI Agent's four pages ·
  // 消息 · the hat's pages · at the bottom 审计 and 账号设置. One definition of
  // the four pages (assistantItems) for the rail, the phone bar and page titles.
  const assistant = assistantItems(role)
  const inbox = items.filter((it) => it.group === 'inbox')
  const pages = items.filter((it) => it.group === 'pages')
  const records = items.filter((it) => it.group === 'records')
  const settingsItem: RailItem = { key: 'settings', href: '/settings', icon: <GearIcon />, label: { zh: '账号设置', en: 'Account settings' }, desc: { zh: '账号、登录方式、语言、推送', en: 'Account, sign-in, language, notifications' } }
  // The name (and what the page is for) appears beside the icon on hover / focus. It is drawn
  // position:fixed so the rail itself can scroll on short screens without clipping it (review
  // 2026-10-04: the landlord rail is ~700px tall and used to push the whole page into a scroll).
  const [tip, setTip] = useState<{ label: string; desc?: string; x: number; y: number } | null>(null)
  const showTip = (el: HTMLElement, label: string, desc?: string) => {
    const r = el.getBoundingClientRect()
    setTip({ label, desc, x: r.right + 8, y: r.top + r.height / 2 })
  }
  useEffect(() => { setTip(null) }, [path])
  const tipHandlers = (label: string, desc?: string) => ({
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => showTip(e.currentTarget, label, desc),
    onMouseLeave: () => setTip(null),
    onFocus: (e: React.FocusEvent<HTMLElement>) => showTip(e.currentTarget, label, desc),
    onBlur: () => setTip(null),
  })
  const link = (it: RailItem, badge = 0) => {
    const on = path === it.href || path.startsWith(it.href + '/')
    const label = en ? it.label.en : it.label.zh
    const desc = en ? it.desc.en : it.desc.zh
    // The badge is part of the name for screen readers (the red dot is drawn aria-hidden).
    const named = badge > 0 ? (en ? `${label}, ${badge} new` : `${label}，${badge} 条新的`) : label
    return (
      <Link
        key={it.key}
        href={it.href}
        aria-label={named}
        aria-current={on ? 'page' : undefined}
        {...tipHandlers(label, desc)}
        className="relative flex h-11 w-11 flex-none items-center justify-center rounded-[10px] transition hover:bg-white"
        style={on ? { background: '#FFFFFF', color: '#1B1B3C', boxShadow: '0 1px 2px rgba(27,27,60,0.10)' } : { color: '#6E6E8A' }}
      >
        {it.icon}
        {badge > 0 && (
          <span aria-hidden className="absolute right-1 top-1 min-w-[16px] rounded-full px-1 text-center text-[10px] font-extrabold leading-4 text-white" style={{ background: '#EF4444' }}>{badge > 99 ? '99+' : badge}</span>
        )}
      </Link>
    )
  }
  return (
    <>
    <PhoneTabs role={role} items={items} />
    <nav
      className="hidden md:sticky md:top-[66px] md:flex md:h-[calc(100vh-66px)] md:w-16 md:flex-none md:flex-col md:items-center md:gap-0.5 md:self-start md:overflow-y-auto md:border-r md:border-line-divider md:px-2 md:py-3"
      style={{ background: '#F3F8FC', scrollbarWidth: 'none' }}
      aria-label={en ? 'Workspace' : '工作台'}
    >
      {/* ＋ 新对话 (user 2026-09-25, as on claude.ai): on the assistant page it starts
          one in place; elsewhere it opens the page with ?new=1. The only new-chat
          control beside the AI chats column (2026-10-04). No role marker here —
          hats switch in the Header's identity menu only (user 2026-09-25). */}
      <Link
        href={`/${role}/agent?new=1`}
        onClick={(e) => { if (path === `/${role}/agent`) { e.preventDefault(); window.dispatchEvent(new Event('sl-new-thread')) } }}
        aria-label={en ? 'New chat' : '新对话'}
        {...tipHandlers(en ? 'New chat' : '新对话')}
        className="relative flex h-11 w-11 flex-none items-center justify-center rounded-xl text-white transition hover:opacity-90"
        style={{ background: '#1B1B3C' }}
      >
        <PlusIcon />
      </Link>
      <div className="h-1.5 flex-none" />
      {assistant.map((it) => link(it, it.key === 'todo' ? pendingCount : 0))}
      <div className="my-1.5 h-px w-7 flex-none" style={{ background: '#D3E3EF' }} />
      {inbox.map((it) => link(it, it.key === 'msgs' ? unreadMessages : 0))}
      <div className="my-1.5 h-px w-7 flex-none" style={{ background: '#D3E3EF' }} />
      {pages.map((it) => link(it))}
      <div className="mt-auto" />
      {records.map((it) => link(it))}
      {link(settingsItem)}
    </nav>
    {tip && (
      <span role="tooltip" className="pointer-events-none fixed z-[70] hidden max-w-[260px] -translate-y-1/2 rounded-[8px] px-2.5 py-1.5 text-white shadow-lg md:block" style={{ left: tip.x, top: tip.y, background: '#1B1B3C' }}>
        <span className="block whitespace-nowrap text-[12px] font-semibold">{tip.label}</span>
        {tip.desc && <span className="mt-0.5 block text-[11px] leading-snug text-white/75">{tip.desc}</span>}
      </span>
    )}
    </>
  )
}
