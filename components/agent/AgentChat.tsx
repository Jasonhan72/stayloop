'use client'

// Claude-style conversation panel for a Personal Agent workspace: a scrolling
// message thread (user ↔ agent bubbles) with the input pinned at the bottom.
import { useEffect, useRef } from 'react'
import { useT } from '@/lib/i18n'
import AgentInputBar from './AgentInputBar'
import DraftListingChatCard from './DraftListingChatCard'
import ListingChatCard from './ListingChatCard'
import TrrebTrendChart from './TrrebTrendChart'
import { ROLE_THEME } from '@/lib/roleTheme'
import type { AgentRole, AgentStatus, ChatAttachment, ChatMessage } from '@/lib/agent/types'

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
    { icon: '🏠', label: { zh: '发布房源', en: 'List a property' }, prompt: { zh: '我要发布一个新房源,你来帮我整理信息。', en: 'I want to list a new property — help me put it together.' } },
    { icon: '📥', label: { zh: '看看新申请', en: 'Review applications' }, prompt: { zh: '帮我看看最新的申请,按质量排序并说明理由。', en: 'Review my latest applications, rank them and explain why.' } },
    { icon: '📝', label: { zh: '续约方案', en: 'Renewal options' }, prompt: { zh: '帮我看看哪些租约快到期了,给我续约方案和合规涨幅。', en: 'Which leases are coming up? Give me renewal options with the legal increase.' } },
    { icon: '⚖️', label: { zh: '合规检查', en: 'Compliance check' }, prompt: { zh: '帮我检查我的房源和租约有没有 RTA 合规风险。', en: 'Check my listings and leases for RTA compliance risks.' } },
  ],
  agent: [
    { icon: '📅', label: { zh: '今天的带看', en: "Today's showings" }, prompt: { zh: '今天有哪些带看任务?帮我把材料包备好。', en: 'What showings do I have today? Prep the packs for me.' } },
    { icon: '👥', label: { zh: '客户跟进', en: 'Client follow-ups' }, prompt: { zh: '哪些客户需要跟进?帮我列出来并起草跟进消息。', en: 'Which clients need follow-ups? List them and draft the messages.' } },
    { icon: '🗺️', label: { zh: '排看房路线', en: 'Plan my route' }, prompt: { zh: '帮我把明天的带看按位置排一条最优路线。', en: 'Plan the best route for tomorrow’s showings by location.' } },
    { icon: '🛡️', label: { zh: 'RECO 边界', en: 'RECO boundaries' }, prompt: { zh: '下一场带看,哪些问题我被授权回答、哪些不能答?', en: 'For my next showing, what am I authorized to answer — and what not?' } },
  ],
}

export default function AgentChat({
  role,
  agentName,
  status,
  messages,
  onSend,
}: {
  role: AgentRole
  agentName: string
  status: AgentStatus
  messages: ChatMessage[]
  onSend: (message: string, attachments?: ChatAttachment[]) => void | Promise<void>
}) {
  const { lang } = useT()
  const accent = ACCENT[role]
  const endRef = useRef<HTMLDivElement>(null)
  const thinking = status === 'understanding' || status === 'working'

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length, thinking])

  return (
    <div className="flex h-[70vh] flex-col overflow-hidden rounded-2xl border border-line-divider bg-white shadow-sm lg:h-full">
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
                {m.text}
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
                  {/* Responsive wrap grid — cards flow onto extra rows instead of
                      widening/clipping the chat container; tracks container width. */}
                  <div className="grid gap-3 pb-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
                    {m.listings.map((l) => (
                      <div key={l.id} className="min-w-0">
                        <ListingChatCard l={l} />
                      </div>
                    ))}
                  </div>
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
                        {marketVerdict(m.market, lang)}
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
            <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm bg-surface-chip px-4 py-3.5">
              <Dot delay="0s" />
              <Dot delay="0.15s" />
              <Dot delay="0.3s" />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* input */}
      <div className="border-t border-line-divider p-3">
        <AgentInputBar agentName={agentName} onSend={onSend} disabled={thinking} />
      </div>
    </div>
  )
}

function marketVerdict(m: NonNullable<ChatMessage['market']>, lang: 'zh' | 'en'): string {
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
