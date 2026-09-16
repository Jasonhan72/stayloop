'use client'

// Claude-style conversation panel for a Personal Agent workspace: a scrolling
// message thread (user ↔ agent bubbles) with the input pinned at the bottom.
import {useEffect, useRef, useState} from 'react'
import { useT } from '@/lib/i18n'
import AgentInputBar from './AgentInputBar'
import DraftListingChatCard from './DraftListingChatCard'
import ListingChatCard from './ListingChatCard'
import TrrebTrendChart from './TrrebTrendChart'
import Link from 'next/link'
import { ROLE_THEME } from '@/lib/roleTheme'
import type { AgentRole, AgentStatus, ChatAttachment, ChatMessage } from '@/lib/agent/types'
import { LISTINGS_PAGE, nextBatchPrompt, pageListings } from '@/lib/agent/listingPaging'

const ACCENT: Record<AgentRole, string> = {
  tenant: ROLE_THEME.tenant.accent,
  landlord: ROLE_THEME.landlord.accent,
  agent: ROLE_THEME.agent.accent,
}
const ORB: Record<AgentRole, string> = {
  tenant: ROLE_THEME.tenant.avatarGradient,
  landlord: ROLE_THEME.landlord.avatarGradient,
  agent: ROLE_THEME.agent.avatarGradient,
}

// Quick-start prompts shown while the thread is empty — one tap sends the
// prompt, so the blank console teaches what the agent can do.
const SUGGESTIONS: Record<AgentRole, { icon: string; label: { zh: string; en: string }; prompt: { zh: string; en: string } }[]> = {
  tenant: [
    { icon: '🔍', label: { zh: '帮我找房', en: 'Find me a home' }, prompt: { zh: '帮我找市中心 $2,500 以内的一居室,最好离地铁近。', en: 'Find me a downtown 1-bed under $2,500, close to the subway.' } },
    { icon: '📄', label: { zh: '解读租约', en: 'Explain my lease' }, prompt: { zh: '帮我逐条解释租约里最需要注意的条款。', en: 'Walk me through the lease clauses I should watch out for.' } },
    { icon: '🔧', label: { zh: '发起报修', en: 'Report a repair' }, prompt: { zh: '厨房水槽漏水,帮我整理成报修工单发给房东。', en: 'The kitchen sink is leaking — turn this into a repair ticket for my landlord.' } },
    { icon: '⭐', label: { zh: '盖下一枚章', en: 'Earn my next stamp' }, prompt: { zh: '我现在盖了几枚章?下一枚怎么盖,能解锁什么?', en: 'How many stamps do I have? How do I earn the next one, and what does it unlock?' } },
  ],
  landlord: [
    { icon: '🔎', label: { zh: '租客筛查', en: 'Tenant screening' }, prompt: { zh: '我要筛查一位申请人：告诉我报告会查什么、需要准备哪些材料，然后带我开始。', en: 'I want to screen an applicant: tell me what the report checks, what documents I need, then take me to start.' } },
    { icon: '🏠', label: { zh: '发布房源', en: 'List a property' }, prompt: { zh: '我要发布一个新房源,你来帮我整理信息。', en: 'I want to list a new property — help me put it together.' } },
    { icon: '📥', label: { zh: '看看新申请', en: 'Review applications' }, prompt: { zh: '帮我看看最新的申请,按质量排序并说明理由。', en: 'Review my latest applications, rank them and explain why.' } },
    { icon: '📝', label: { zh: '续约方案', en: 'Renewal options' }, prompt: { zh: '帮我看看哪些租约快到期了,给我续约方案和合规涨幅。', en: 'Which leases are coming up? Give me renewal options with the legal increase.' } },
    { icon: '⚖️', label: { zh: '合规检查', en: 'Compliance check' }, prompt: { zh: '帮我检查我的房源和租约有没有 RTA 合规风险。', en: 'Check my listings and leases for RTA compliance risks.' } },
  ],
  // Agent cards follow the Ontario leasing-agent workflow (research
  // 2026-09-13: RECO/TRESA leasing obligations, RTA s.106/s.134, OHRC
  // rental policy): screen the landlord client's applicants, price the
  // unit against real listings + TRREB, prep the showing, paper the lease,
  // stay inside the rules. Each card is backed by a real capability of
  // /api/agent/turn — no card promises what Brief cannot do.
  agent: [
    { icon: '🔎', label: { zh: '租客筛查', en: 'Tenant screening' }, prompt: { zh: '我替房东客户收到一份租房申请。帮我筛查这位申请人：告诉我报告会查什么、要申请人提交哪些材料，然后带我开始。', en: 'I have a rental application for my landlord client. Screen the applicant: tell me what the report checks, what the applicant must submit, then take me to start.' } },
    { icon: '📊', label: { zh: '挂牌定价', en: 'Price the listing' }, prompt: { zh: '帮客户的房源定租金：拉这个区域同户型的实时挂牌和 TRREB 官方成交数据做比价。', en: "Price my client's unit: pull live listings for the same area and unit type plus the TRREB benchmark for comparison." } },
    { icon: '📋', label: { zh: '带看准备包', en: 'Showing prep pack' }, prompt: { zh: '帮我为下一场带看准备材料包：房东授权回答与不授权回答的清单、现场 checklist、要向申请人收的材料。', en: 'Prep my next showing: what the landlord authorised me to answer and what not, an on-site checklist, and the documents to collect from applicants.' } },
    { icon: '📝', label: { zh: '租约与押金', en: 'Lease & deposit' }, prompt: { zh: '客户要签约了：安省标准租约和 OREA Form 400 各管什么、押金最多收多少、哪些费用不能收、签后几天内要给租客副本？', en: 'My client is ready to sign: what do the Ontario Standard Lease and OREA Form 400 each cover, how much deposit is allowed, which charges are prohibited, and when must the tenant get a copy?' } },
    { icon: '🛡️', label: { zh: '合规边界', en: 'Compliance boundaries' }, prompt: { zh: '带看和收申请时：哪些问题不能问（人权法）、哪些话不能替房东答、TRESA 要我先给客户什么文件？', en: 'At showings and intake: which questions are off-limits (Human Rights Code), what must I not answer for the landlord, and what does TRESA require me to give a client first?' } },
  ],
}

export default function AgentChat({
  role,
  agentName,
  status,
  messages,
  onSend,
  fill = false,
}: {
  role: AgentRole
  agentName: string
  status: AgentStatus
  messages: ChatMessage[]
  onSend: (message: string, attachments?: ChatAttachment[]) => void | Promise<void>
  // `fill`: the parent sets the height (homepage hero sizes the chat to the
  // phone viewport). Default keeps the 70vh phone height the workspaces use.
  fill?: boolean
}) {
  const { lang } = useT()
  const accent = ACCENT[role]
  const endRef = useRef<HTMLDivElement>(null)
  const thinking = status === 'understanding' || status === 'working'
  // Listing cards come in pages of six; the server sends up to two pages per
  // turn. offset per message id: 0 = first page, 6 = the six ranked after.
  const [listingOffset, setListingOffset] = useState<Record<string, number>>({})

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length, thinking])

  return (
    <div className={`flex flex-col overflow-hidden rounded-2xl border border-line-divider bg-white shadow-sm ${fill ? 'h-full' : 'h-[70vh] lg:h-full'}`}>
      {/* header */}
      <div className="flex items-center gap-3 border-b border-line-divider px-5 py-3.5">
        <span className="h-9 w-9 flex-none rounded-full" style={{ background: ORB[role] }} />
        <div>
          <div className="text-[15px] font-bold tracking-tight">{agentName}</div>
          <div className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-eyebrow text-body-3">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: '#34D399' }} /> {lang === 'zh' ? '在线 · 读取你的记忆' : 'ONLINE · READING YOUR MEMORY'}
          </div>
        </div>
      </div>

      {/* thread */}
      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
        {messages.map((m) => (
          <div key={m.id} className={'flex ' + (m.role === 'user' ? 'justify-end' : 'justify-start')}>
            {m.role === 'agent' && (
              <span className="mr-2 mt-0.5 h-7 w-7 flex-none rounded-full" style={{ background: ORB[role] }} />
            )}
            <div
              className={
                'flex min-w-0 flex-col gap-2 ' +
                (m.role === 'user' ? 'max-w-[82%] items-end' : m.listings?.length ? 'max-w-full flex-1' : 'max-w-[92%]')
              }
            >
              <div
                className={
                  'whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed ' +
                  (m.role === 'user' ? 'rounded-tr-sm text-white' : 'rounded-tl-sm bg-surface-chip text-body')
                }
                style={m.role === 'user' ? { background: accent } : undefined}
              >
                {linkifyPaths(m.text)}
              </div>
              {m.role === 'user' && m.attachments && m.attachments.length > 0 && (
                <div className="flex flex-wrap justify-end gap-2">
                  {m.attachments.map((a, i) => {
                    const k = a.dataUrl.slice(0, 48) + a.name + i
                    return a.isImage && a.dataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={k} src={a.dataUrl} alt={a.name} className="h-24 w-24 rounded-lg border border-line-divider object-cover" />
                    ) : (
                      <span key={k} className="flex items-center gap-1.5 rounded-lg border border-line-divider bg-surface-chip px-2.5 py-1.5 text-[12px] text-body-2">
                        {a.isImage ? '🖼' : '📄'} {a.name}
                      </span>
                    )
                  })}
                </div>
              )}
              {m.role === 'agent' && m.listings && m.listings.length > 0 && (
                <div className="w-full">
                  <div className="mb-1.5 font-mono text-[10.5px] uppercase tracking-eyebrow text-body-3">
                    {listingsHeader(m.listings, lang)}
                  </div>
                  {/* Street/building query with no exact-address hit — the
                      honest "same area, not that building" caveat. Matches
                      the external note bar's amber. */}
                  {m.listingsNotice && (
                    <div className="mb-1.5 text-[12px] leading-snug" style={{ color: '#B45309' }}>
                      {m.listingsNotice}
                    </div>
                  )}
                  {/* Responsive wrap grid — cards flow onto extra rows instead of
                      widening/clipping the chat container; tracks container width. */}
                  {(() => {
                    const page = pageListings(m.listings, listingOffset[m.id] ?? 0)
                    const shownTo = Math.min((listingOffset[m.id] ?? 0) + LISTINGS_PAGE, m.listings.length)
                    return (
                      <>
                        <div className="grid gap-3 pb-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
                          {page.visible.map((l) => (
                            <div key={l.id} className="min-w-0">
                              <ListingChatCard l={l} />
                            </div>
                          ))}
                        </div>
                        {/* 「换一批」: first click reveals the six ranked after (no
                            model turn); once nothing is held back it becomes a
                            real search — the server excludes every shown address. */}
                        <div className="flex items-center justify-between gap-3 pb-1">
                          <span className="font-mono text-[10.5px] uppercase tracking-eyebrow text-body-3">
                            {lang === 'zh' ? `第 ${(listingOffset[m.id] ?? 0) + 1}–${shownTo} 套` : `${(listingOffset[m.id] ?? 0) + 1}–${shownTo} of ${m.listings.length}`}
                          </span>
                          <button
                            type="button"
                            disabled={thinking}
                            onClick={() => {
                              if (page.next === 'reveal') setListingOffset((cur) => ({ ...cur, [m.id]: (cur[m.id] ?? 0) + LISTINGS_PAGE }))
                              else void onSend(nextBatchPrompt(lang === 'zh'))
                            }}
                            className="rounded-full border border-line-strong bg-white px-4 py-1.5 text-[13px] font-semibold text-body transition hover:bg-surface-chip disabled:opacity-50"
                          >
                            {page.next === 'reveal'
                              ? (lang === 'zh' ? `换一批 · 还有 ${page.remaining} 套` : `Next batch · ${page.remaining} more`)
                              : (lang === 'zh' ? '换一批 · 再找 6 套' : 'Next batch · find 6 more')}
                          </button>
                        </div>
                      </>
                    )
                  })()}
                </div>
              )}
              {/* Proactive market context — real prices computed server-side */}
              {m.role === 'agent' && m.market && (
                <div className="w-full max-w-[480px] rounded-xl border border-line-divider bg-white p-3.5">
                  <div className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-eyebrow text-body-3">
                    📊 {lang === 'zh' ? `${m.market.area}${m.market.beds ? ` · ${m.market.beds} 房+` : ''} 真实行情` : `${m.market.area}${m.market.beds ? ` · ${m.market.beds}bd+` : ''} live market`}
                    {m.market.sample > 0 && (
                      <span className="font-normal normal-case">· {lang === 'zh' ? `样本 ${m.market.sample} 套` : `${m.market.sample} listings`}</span>
                    )}
                  </div>
                  {/* sample-derived rows only when a live asking-price sample
                      exists — a trreb-only market (sample 0) skips straight to
                      the official benchmark below */}
                  {m.market.sample > 0 && (
                    <>
                      <div className="mt-2 flex items-baseline gap-3">
                        <span className="text-[18px] font-extrabold tracking-tight">${m.market.min.toLocaleString()}–${m.market.max.toLocaleString()}</span>
                        <span className="text-[12px] text-body-3">{lang === 'zh' ? '中位' : 'median'} <b className="text-body">${m.market.median.toLocaleString()}</b></span>
                      </div>
                      {/* budget position bar */}
                      <div className="relative mt-2.5 h-[6px] rounded-full bg-surface-chip">
                        <div className="absolute inset-y-0 rounded-full" style={{ left: '0%', width: '100%', background: 'linear-gradient(90deg,#6EE7B7,#FBBF24,#F87171)' , opacity: 0.35 }} />
                        {m.market.budget != null && m.market.max > m.market.min && (
                          <span
                            className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
                            style={{ background: accent, left: `${Math.min(98, Math.max(2, ((m.market.budget - m.market.min) / (m.market.max - m.market.min)) * 100))}%` }}
                            title={lang === 'zh' ? '你的预算' : 'Your budget'}
                          />
                        )}
                      </div>
                      <p className="mt-2 text-[12px] leading-relaxed text-body-2">
                        {marketVerdict(m.market, lang, role)}
                      </p>
                    </>
                  )}
                  {/* Official TRREB quarterly benchmark — leased (closed) rents,
                      thousands of transactions, vs the asking-price sample above */}
                  {m.market.trreb && (
                    <p className="mt-2 border-t border-line-divider pt-2 text-[11.5px] leading-relaxed text-body-3">
                      {lang === 'zh'
                        ? `官方基准 · TRREB ${m.market.trreb.area} · ${m.market.trreb.period}：${m.market.beds ? `${Math.min(m.market.beds, 3)} 房` : ''} condo 成交均价 $${m.market.trreb.avg.toLocaleString()}`
                        : `Official benchmark · TRREB ${m.market.trreb.area} · ${m.market.trreb.period}: ${m.market.beds ? `${Math.min(m.market.beds, 3)}-bed ` : ''}condo avg leased rent $${m.market.trreb.avg.toLocaleString()}`}
                      {m.market.trreb.leased != null && (lang === 'zh' ? ` · ${m.market.trreb.leased.toLocaleString()} 宗成交` : ` · ${m.market.trreb.leased.toLocaleString()} leases`)}
                      {m.market.trreb.prev_avg != null && m.market.trreb.prev_avg > 0 && (
                        <> · {lang === 'zh' ? '同比' : 'YoY'} {(((m.market.trreb.avg - m.market.trreb.prev_avg) / m.market.trreb.prev_avg) * 100).toFixed(1)}%</>
                      )}
                    </p>
                  )}
                  {m.market.trreb?.history && m.market.trreb.history.length >= 4 && (
                    <TrrebTrendChart history={m.market.trreb.history} accent={accent} />
                  )}
                </div>
              )}
              {/* Proactive clarifying questions — tap an answer to send it */}
              {m.role === 'agent' && m.followups && m.followups.length > 0 && (
                <div className="w-full max-w-[480px] space-y-2.5">
                  {m.followups.map((f) => (
                    <div key={f.question}>
                      <div className="mb-1.5 text-[12px] font-bold text-body-2">{f.question}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {f.options.map((o) => (
                          <button
                            key={o}
                            onClick={() => onSend(o)}
                            className="rounded-full border border-line-strong bg-white px-3 py-1.5 text-[12.5px] font-semibold text-body transition hover:text-white"
                            onMouseEnter={(e) => { e.currentTarget.style.background = accent; e.currentTarget.style.borderColor = accent }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = ''; e.currentTarget.style.borderColor = '' }}
                          >
                            {o}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {m.role === 'agent' && m.draftListing && (
                <div className="w-[280px]">
                  <DraftListingChatCard draft={m.draftListing} />
                </div>
              )}
            </div>
          </div>
        ))}
        {/* Empty-state quick starts — one tap sends the prompt */}
        {messages.length <= 1 && !thinking && (
          <div className="pl-9 pt-1">
            <div className="mb-2.5 font-mono text-[10.5px] font-bold uppercase tracking-eyebrow text-body-3">
              {lang === 'zh' ? '试试这些 · 一句话开工' : 'Try one — a single sentence starts the work'}
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {SUGGESTIONS[role].map((s) => (
                <button
                  key={s.label.en}
                  onClick={() => onSend(s.prompt[lang])}
                  className="group flex items-center gap-3 rounded-xl border border-line-divider bg-white px-3.5 py-3 text-left transition hover:shadow-sm"
                  style={{ borderColor: undefined }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = accent }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = '' }}
                >
                  <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg text-[15px]" style={{ background: `${accent}14` }}>
                    {s.icon}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-bold">{s.label[lang]}</span>
                    <span className="block truncate text-[11.5px] text-body-3">{s.prompt[lang]}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
        {thinking && (
          <div className="flex justify-start">
            <span className="mr-2 mt-0.5 h-7 w-7 flex-none rounded-full" style={{ background: ORB[role] }} />
            <ThinkingIndicator status={status} lang={lang} />
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* input */}
      <div className="border-t border-line-divider p-3">
        <AgentInputBar agentName={agentName} role={role} onSend={onSend} disabled={thinking} />
      </div>
    </div>
  )
}

function marketVerdict(m: NonNullable<ChatMessage['market']>, lang: 'zh' | 'en', role: AgentRole = 'tenant'): string {
  // Agent pricing turns: the sample is comparables for a client's unit, so
  // the verdict reads as a pricing anchor rather than a tenant's budget.
  if (role === 'agent') {
    return lang === 'zh'
      ? `同区域同户型当前挂牌中位数 $${m.median.toLocaleString()}；按房源自身条件（楼层、朝向、家具、车位、入住时间）在区间内上下调整。`
      : `Current asking median for this area and unit type is $${m.median.toLocaleString()}; adjust within the range for the unit's own attributes (floor, exposure, furnishing, parking, move-in date).`
  }
  if (m.budget == null) {
    return lang === 'zh'
      ? '还没有预算 — 参考这个区间设一个,我按它帮你筛。'
      : 'No budget set yet — pick one from this range and I filter to it.'
  }
  if (m.budget < m.min) {
    return lang === 'zh'
      ? `你的预算 $${m.budget.toLocaleString()} 低于该区域当前区间,建议放宽预算或看邻近区域。`
      : `Your $${m.budget.toLocaleString()} budget sits below the current range — consider stretching it or nearby areas.`
  }
  if (m.budget < m.median) {
    return lang === 'zh'
      ? `你的预算 $${m.budget.toLocaleString()} 在中位以下,选择偏紧但可行 — 手快有。`
      : `Your $${m.budget.toLocaleString()} budget is below median — doable but tight; move fast on good ones.`
  }
  return lang === 'zh'
    ? `你的预算 $${m.budget.toLocaleString()} 在中位以上,该区域选择充裕,可以挑剔一点。`
    : `Your $${m.budget.toLocaleString()} budget clears the median — plenty of choice here, be picky.`
}

function listingsHeader(listings: NonNullable<ChatMessage['listings']>, lang: 'zh' | 'en'): string {
  const stay = listings.filter((l) => l.source === 'stayloop').length
  const ext = listings.filter((l) => l.source === 'realtor').length
  const parts: string[] = []
  if (stay) parts.push(lang === 'zh' ? `STAYLOOP ${stay} 套` : `STAYLOOP ${stay}`)
  if (ext) parts.push(lang === 'zh' ? `REALTOR.CA ${ext} 套` : `REALTOR.CA ${ext}`)
  return parts.join(' · ') + (ext ? (lang === 'zh' ? ' · 外部未经验证' : ' · UNVERIFIED EXTERNAL') : '')
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 animate-bounce rounded-full"
      style={{ background: '#A1A1AA', animationDelay: delay }}
    />
  )
}


// "Thinking…" indicator (2026-08-24): staged labels that advance with wall
// time, so a 10-second generation reads as progress instead of silence —
// understanding → thinking → checking your data → drafting the answer.
const THINKING_STAGES: { zh: string; en: string }[] = [
  { zh: '正在理解你的问题', en: 'Understanding your question' },
  { zh: '思考中', en: 'Thinking' },
  { zh: '正在核对你的数据', en: 'Checking your data' },
  { zh: '正在整理建议', en: 'Drafting the answer' },
]

function ThinkingIndicator({ status, lang }: { status: AgentStatus; lang: 'zh' | 'en' }) {
  const [stage, setStage] = useState(0)
  useEffect(() => {
    setStage(status === 'understanding' ? 0 : 1)
    if (status !== 'working') return
    // Advance 思考中 → 核对数据 → 整理建议, then hold on the last stage.
    const timers = [
      setTimeout(() => setStage(2), 4000),
      setTimeout(() => setStage(3), 9000),
    ]
    return () => timers.forEach(clearTimeout)
  }, [status])
  const label = THINKING_STAGES[stage][lang === 'zh' ? 'zh' : 'en']
  return (
    <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm bg-surface-chip px-4 py-3">
      <span className="flex items-center gap-1">
        <Dot delay="0s" />
        <Dot delay="0.15s" />
        <Dot delay="0.3s" />
      </span>
      <span className="sl-thinking-shimmer text-[12.5px] font-medium">{label}…</span>
      <style jsx>{`
        .sl-thinking-shimmer {
          background: linear-gradient(90deg, #94a3b8 20%, #334155 50%, #94a3b8 80%);
          background-size: 200% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          animation: sl-shimmer 1.8s linear infinite;
        }
        @keyframes sl-shimmer {
          0% { background-position: 180% 0; }
          100% { background-position: -20% 0; }
        }
      `}</style>
    </div>
  )
}

// Internal paths the assistant is told to mention (e.g. /screening/app) render
// as links; everything else stays plain text.
const PATH_RE = /(\/screening\/app|\/screening|\/verify\/[A-Za-z0-9-]+|\/leases\/import|\/landlord\/applicants)(?![\w/-])/g
function linkifyPaths(text: string) {
  const parts = text.split(PATH_RE)
  if (parts.length === 1) return text
  return parts.map((part, i) =>
    i % 2 === 1
      ? <Link key={i} href={part} className="font-semibold underline underline-offset-2" style={{ color: '#00ACE4' }}>{part}</Link>
      : part,
  )
}
