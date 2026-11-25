'use client'

// 「找经纪和服务商」, finished in the AI conversation (2026-11-24, user: 「接着做找人」). It appears under
// the assistant's reply when a signed-in person asks for an agent, a tradesperson or a professional
// (lib/agent/directoryIntent.ts):
//   who       the directory's own rows, read the way its three tabs read them
//             (lib/marketplace/directoryClient.ts) — a signed-in account only, as on the tabs
//   order     the directory's fixed order (agents with a profile, by verification; providers with
//             every credential first, then by when they joined; professionals by licence category).
//             Nothing is ranked, nothing is featured, and the card says so
//   narrowed  by what the person said — a trade, a language, a city — each shown as a chip they can drop
//   cards     the directory's own cards (components/directory/AgentCard.tsx, ProviderCard.tsx): the
//             brokerage on a line of its own, no phone or e-mail for an agent, both for a provider
//   write     发消息 opens the directory's own form beside the card (AgentContact / ProviderContact):
//             the person writes and sends; nothing is drafted or sent for them
// The assistant sees none of it. It was told a card would be here and still names, counts and
// recommends nobody; what is listed is the system's reading of the directory, not the model's opinion.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useT } from '@/lib/i18n'
import { useAuth } from '@/lib/useAuth'
import AgentCard from '@/components/directory/AgentCard'
import AgentContact from '@/components/directory/AgentContact'
import ProviderCard from '@/components/directory/ProviderCard'
import ProviderContact from '@/components/directory/ProviderContact'
import type { DirectoryOffer } from '@/lib/agent/directoryIntent'
import type { AgentRole } from '@/lib/agent/types'
import { directoryEntries, languageLabel, type BasicAgent, type PublicAgent } from '@/lib/agentPublic'
import { repairDirectory, type DirectoryCredential, type DirectoryProvider, type DirectoryReview } from '@/lib/marketplace/directory'
import { professionalCardData, professionalList, repairCardData, type ProviderCardData } from '@/lib/marketplace/directoryCards'
import { loadAgentDirectory, loadProfessionalDirectory, loadRepairDirectory } from '@/lib/marketplace/directoryClient'
import { useMarketplaceConfig } from '@/lib/marketplace/config'
import { TRADES, type Trade } from '@/lib/marketplace/trades'
import { providerPhotoUrl } from '@/lib/providerPhotoKeys'

/** How many are shown before 「再看几位」. */
export const DIRECTORY_CHAT_PAGE = 3

type Loaded =
  | { kind: 'agents'; items: PublicAgent[]; basic: BasicAgent[] }
  | { kind: 'repairs'; providers: DirectoryProvider[]; creds: DirectoryCredential[]; reviews: DirectoryReview[] }
  | { kind: 'professional'; providers: DirectoryProvider[]; creds: DirectoryCredential[] }

const tradeLabel = (k: string, zh: boolean) => { const d = TRADES.find((x) => x.key === k); return d ? (zh ? d.zh : d.en) : k }

export default function DirectoryChatCard({ offer, role }: { offer: DirectoryOffer; role: AgentRole }) {
  const { lang } = useT()
  const zh = lang === 'zh'
  const { user } = useAuth()
  const uid = user?.id ?? null
  const { graceDays } = useMarketplaceConfig()
  const [trade, setTrade] = useState<Trade | null>(offer.trade)
  const [language, setLanguage] = useState<string | null>(offer.language)
  const [city, setCity] = useState<string | null>(offer.city)
  const [data, setData] = useState<Loaded | null>(null)
  const [failed, setFailed] = useState(false)
  const [shown, setShown] = useState(DIRECTORY_CHAT_PAGE)
  const [writing, setWriting] = useState<string | null>(null)
  const seq = useRef(0)

  // The agent list is filtered where the directory filters it (the API), so it is read again when a
  // condition is dropped; the provider lists are read whole once and filtered here, as on their tabs.
  const kind = offer.kind
  const agentLanguage = kind === 'agents' ? language : null
  const agentArea = kind === 'agents' ? city : null
  const load = useCallback(async () => {
    if (!uid) return
    const n = ++seq.current
    setFailed(false)
    try {
      const next: Loaded = kind === 'agents'
        ? { kind: 'agents', ...(await loadAgentDirectory({ language: agentLanguage, area: agentArea })) }
        : kind === 'repairs'
          ? { kind: 'repairs', ...(await loadRepairDirectory()) }
          : { kind: 'professional', ...(await loadProfessionalDirectory()) }
      if (n === seq.current) setData(next)
    } catch {
      if (n === seq.current) { setData(null); setFailed(true) }
    }
  }, [uid, kind, agentLanguage, agentArea])
  useEffect(() => { void load() }, [load])

  const today = useMemo(() => new Date(), [])
  const rows = useMemo(() => {
    if (!data) return null
    if (data.kind === 'agents') {
      // the directory's default order; only agents with a profile can be opened or written to
      return directoryEntries(data.items, data.basic, 'default').filter((e) => e.kind === 'public').map((e) => ({ key: (e.agent as PublicAgent).slug, agent: e.agent as PublicAgent, card: null as ProviderCardData | null }))
    }
    if (data.kind === 'repairs') {
      return repairDirectory(data.providers, data.creds, data.reviews, { trade: trade ?? 'all', city: city ?? 'all' }, today, graceDays).map((r) => ({ key: r.p.id, agent: null as PublicAgent | null, card: repairCardData(r, zh) }))
    }
    return professionalList(data.providers.filter((p) => !city || (p.service_cities ?? []).includes(city)), trade)
      .map(({ p, t }) => ({ key: p.id, agent: null as PublicAgent | null, card: professionalCardData(p, t, data.creds, zh, today, graceDays) }))
  }, [data, trade, city, zh, today, graceDays])
  // agents registered and verified but without a profile: on the directory, not here — they cannot be opened or written to
  const basicCount = data?.kind === 'agents' ? data.basic.length : 0

  if (!uid) return null

  const TITLE = { agents: zh ? '找经纪' : 'Agents', repairs: zh ? '物业管理服务商' : 'Property maintenance', professional: zh ? '专业服务' : 'Professional services' }[offer.kind]
  const tradeQs = trade ? `?trade=${trade}` : ''
  const ALL = { agents: '/agents', repairs: `/providers${tradeQs}`, professional: `/providers/professional${tradeQs}` }[offer.kind]
  const chips = [
    trade ? { k: 'trade', label: `${offer.kind === 'professional' ? (zh ? '类别：' : 'Category: ') : (zh ? '工种：' : 'Trade: ')}${tradeLabel(trade, zh)}`, drop: () => setTrade(null) } : null,
    language && offer.kind === 'agents' ? { k: 'language', label: `${zh ? '语言：' : 'Language: '}${languageLabel(language, zh ? 'zh' : 'en')}`, drop: () => setLanguage(null) } : null,
    city ? { k: 'city', label: `${offer.kind === 'agents' ? (zh ? '区域：' : 'Area: ') : (zh ? '城市：' : 'City: ')}${city}`, drop: () => setCity(null) } : null,
  ].filter((c): c is { k: string; label: string; drop: () => void } => !!c)
  const unit = offer.kind === 'agents' ? (zh ? '位' : '') : (zh ? '家' : '')
  const n = rows?.length ?? 0
  const page = rows ? rows.slice(0, shown) : []
  const more = Math.max(0, n - shown)

  return (
    <div className="w-full max-w-[560px] rounded-xl border border-line-divider bg-[#F6F9FC] p-3 text-left sm:p-4" data-testid="directory-chat-card" data-kind={offer.kind} data-state={failed ? 'failed' : rows ? 'ready' : 'loading'}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-[#EAF1FF] text-[#2563EB]" aria-hidden>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" /><path d="M2 21v-2a4 4 0 0 1 4-4h4" /><path d="M17 20a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" /><path d="M22 22l-2.8-2.8" /></svg>
        </span>
        <div className="text-[14px] font-bold text-ink">{TITLE}</div>
        {offer.kind === 'repairs' && <span className="rounded-full border border-line-divider bg-white px-2 py-[1px] text-[11.5px] text-body-2">{zh ? '试点 · 多伦多及周边' : 'Pilot · Toronto and nearby'}</span>}
        <Link href={ALL} className="ml-auto text-[12.5px] font-semibold text-brand underline-offset-2 hover:underline" data-testid="directory-chat-all">{zh ? '打开目录 →' : 'Open the directory →'}</Link>
      </div>

      {chips.length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5" data-testid="directory-chat-filters">
          <span className="text-[12px] text-body-3">{zh ? '按你说的筛过：' : 'Narrowed by what you said:'}</span>
          {chips.map((c) => (
            <button key={c.k} type="button" onClick={() => { c.drop(); setShown(DIRECTORY_CHAT_PAGE); setWriting(null) }} data-testid={`directory-chat-filter-${c.k}`}
              aria-label={zh ? `去掉条件 ${c.label}` : `Remove ${c.label}`}
              className="inline-flex min-h-[32px] items-center gap-1 rounded-full border border-line-divider bg-white px-2.5 text-[12px] font-semibold text-ink transition hover:border-brand">
              {c.label}<span aria-hidden className="text-body-3">×</span>
            </button>
          ))}
        </div>
      )}

      {failed && (
        <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2.5 text-[12.5px] text-amber-800" role="alert" data-testid="directory-chat-failed">
          {zh ? '目录暂时读不出来，所以这里没有列出任何人。' : 'The directory could not be read just now, so nobody is listed here.'}{' '}
          <button type="button" onClick={() => void load()} className="font-semibold underline underline-offset-2">{zh ? '重试' : 'Retry'}</button>
        </div>
      )}
      {!failed && !rows && <div className="py-6 text-center text-[12.5px] text-body-3" role="status" data-testid="directory-chat-loading">{zh ? '正在读目录…' : 'Reading the directory…'}</div>}

      {!failed && rows && n === 0 && (
        <div className="mt-3 rounded-lg border border-line-divider bg-white px-3 py-3 text-[13px] leading-relaxed text-body-2" data-testid="directory-chat-empty">
          {chips.length
            ? (zh ? '目录里暂时没有符合这些条件的。去掉一个条件再看，或者打开目录。' : 'Nobody in the directory matches these yet. Drop a condition, or open the directory.')
            : offer.kind === 'agents'
              ? (zh ? '目录里暂时还没有开了主页、可以在站内联系的经纪。' : 'No agent with a profile can be reached on Stayloop yet.')
              : (zh ? '这个类别暂时还没有入驻的服务商。' : 'No provider has joined in this category yet.')}
          {basicCount > 0 && <span className="mt-1 block text-[12px] text-body-3">{zh ? `另有 ${basicCount} 位只列了注册信息，在目录里能看到。` : `${basicCount} more are listed with their registration only, on the directory.`}</span>}
        </div>
      )}

      {!failed && rows && n > 0 && (
        <>
          <p className="mt-2.5 text-[12px] leading-relaxed text-body-3" data-testid="directory-chat-count">
            {zh
              ? `目录里符合的有 ${n} ${unit}，先列 ${page.length} ${unit}。顺序是目录固定的顺序，不是推荐，也不收排名费。`
              : `${n} in the directory match; ${page.length} shown. The order is the directory’s fixed order — not a recommendation, and no fee for position.`}
          </p>
          <div className="mt-2.5 grid gap-3" data-testid="directory-chat-list">
            {page.map((r) => (
              <div key={r.key} data-testid="directory-chat-entry">
                {r.agent
                  ? <AgentCard agent={r.agent} zh={zh} onMessage={() => setWriting((w) => (w === r.key ? null : r.key))} messageOpen={writing === r.key} />
                  : r.card && (
                    <ProviderCard
                      id={r.card.id} name={r.card.name} legalName={r.card.legalName} zh={zh}
                      testid={r.card.professional ? 'professional-provider' : 'provider-card'}
                      badge={r.card.badge} rating={r.card.rating} chips={r.card.chips} cities={r.card.cities} detail={r.card.detail}
                      email={r.card.email} phone={r.card.phone} photoUrl={providerPhotoUrl(r.card.photoKey)} languages={r.card.languages}
                      onMessage={() => setWriting((w) => (w === r.key ? null : r.key))} messageOpen={writing === r.key}
                    />
                  )}
                {writing === r.key && (
                  <div className="mt-2 rounded-xl border border-line-divider bg-white px-3 pb-3 pt-2.5" data-testid="directory-chat-write">
                    <div className="text-[13px] font-semibold text-ink">{zh ? `给 ${r.agent ? r.agent.name : r.card!.name} 发消息` : `Message ${r.agent ? r.agent.name : r.card!.name}`}</div>
                    {r.agent
                      ? <AgentContact slug={r.agent.slug} agentName={r.agent.name} zh={zh} initialRole={role === 'landlord' ? 'landlord' : 'tenant'} />
                      : <ProviderContact providerId={r.card!.id} providerName={r.card!.name} zh={zh} as={role} professional={r.card!.professional} />}
                  </div>
                )}
              </div>
            ))}
          </div>
          {more > 0 && (
            <button type="button" onClick={() => setShown((s) => s + DIRECTORY_CHAT_PAGE)} className="mt-3 w-full rounded-lg border border-line-divider bg-white py-2 text-[13px] font-semibold text-ink transition hover:border-brand" data-testid="directory-chat-more">
              {zh ? `再看 ${Math.min(more, DIRECTORY_CHAT_PAGE)} ${unit}（还有 ${more} ${unit}）` : `Show ${Math.min(more, DIRECTORY_CHAT_PAGE)} more (${more} left)`}
            </button>
          )}
          {basicCount > 0 && <p className="mt-2 text-[12px] text-body-3" data-testid="directory-chat-basic">{zh ? `另有 ${basicCount} 位经纪只列了注册信息、暂时不能在站内联系，在目录里能看到。` : `${basicCount} more agents are listed with their registration only and cannot be reached on Stayloop yet; they are on the directory.`}</p>}
        </>
      )}

      <p className="mt-3 text-[11.5px] leading-relaxed text-body-3" data-testid="directory-chat-note">
        {offer.kind === 'agents'
          ? (zh ? '核验只表示核验当天这位经纪在 RECO 公开注册库上处于注册状态，不是 Stayloop 的推荐或背书。Stayloop 不是经纪公司，不参与交易，不收取佣金或转介费。' : 'Verification only means the agent was registered on RECO’s public register on the day checked; it is not a recommendation or endorsement by Stayloop. Stayloop is not a brokerage, takes no part in trades and receives no commission or referral fee.')
          : offer.kind === 'repairs'
            ? (zh ? '「资质已核」只表示核验当天该编号在公开注册库上有效，不是 Stayloop 的推荐或担保。你和服务商直接联系、直接结算，Stayloop 不经手资金。' : '“Verified” only means the number was valid on the public register on the day checked; it is not a recommendation or guarantee by Stayloop. You contact and pay the provider directly; Stayloop handles no money.')
            : (zh ? '牌照以 LSO / RIBO 公开名册为准，Stayloop 只做人工核对与记录。你和对方直接联系、直接签约；这不是法律意见，也不是保险建议。' : 'Licences are as the LSO / RIBO public registers show them; Stayloop only checks and records. You contact and contract with them directly; this is not legal or insurance advice.')}
      </p>
    </div>
  )
}
