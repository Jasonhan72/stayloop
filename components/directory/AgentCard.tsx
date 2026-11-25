// The agent directory's card for an agent who published a profile (2026-11-24: taken out of
// app/agents/page.tsx unchanged, so the AI conversation's directory card can show the same card —
// components/agent/DirectoryChatCard). Photo on the left; the registered name, descriptor, brokerage
// and RECO number in plain sight; languages, focus, service areas; 看主页 / 发消息. No phone number
// and no e-mail address: an agent is reached through Stayloop. The brokerage has a line of its own,
// in the name's colour — O. Reg. 567/05 s.12.1 wants it clear and prominent wherever the agent is shown.
//
// `onMessage`: where the message form opens beside the card (the conversation) instead of on the
// agent's page; without it 发消息 is the link to that page's form, as in the directory.
import Link from 'next/link'
import { AgentBadge } from '@/components/AgentBadge'
import { TestDataTag } from '@/components/directory/FindHeader'
import { FilterIcon } from '@/components/directory/FilterBar'
import { CARD, CARD_ACTIONS, CARD_FACT, CARD_FOOT, CARD_MESSAGE, CARD_META, CARD_NAME, CARD_VIEW, CHIP, CHIP_QUIET } from '@/components/directory/cardStyle'
import { isTestName } from '@/components/listing/testAccounts'
import AgentAvatar from '@/components/agent/AgentAvatar'
import { categoryLabel } from '@/lib/agentProfile'
import { focusLabel, languageLabel, SIGNAL_MIN_SAMPLES, type AgentSignals, type PublicAgent } from '@/lib/agentPublic'

// Station-only signals (2026-10-27): counts from Stayloop's own records; a thin sample says so instead of a number.
export function signalLine(s: AgentSignals, L: 'zh' | 'en'): string {
  const zh = L === 'zh'
  const reply = s.response_samples >= SIGNAL_MIN_SAMPLES && s.response_median_minutes != null
    ? (zh ? `回复中位 ${s.response_median_minutes < 60 ? `${s.response_median_minutes} 分钟` : `${Math.round(s.response_median_minutes / 60)} 小时`}` : `median reply ${s.response_median_minutes < 60 ? `${s.response_median_minutes} min` : `${Math.round(s.response_median_minutes / 60)} h`}`)
    : (zh ? '回复速度：尚无足够数据' : 'reply time: not enough data yet')
  return [zh ? `站内筛查 ${s.screenings}` : `${s.screenings} screenings here`, zh ? `签约 ${s.leases}` : `${s.leases} leased`, reply].join(' · ')
}

/** How many service areas a card lists before folding the rest into 「+N」. */
export const AREAS_ON_CARD = 3

export default function AgentCard({ agent: a, zh, onMessage, messageOpen }: { agent: PublicAgent; zh: boolean; onMessage?: () => void; messageOpen?: boolean }) {
  const L = zh ? 'zh' : 'en'
  const href = `/agents/${a.slug}`
  return (
    <article className={CARD} data-testid="agent-card">
      <div className="flex items-start gap-4">
        {/* The name beside it is the link; the photo repeats it for pointer users only. */}
        <Link href={href} tabIndex={-1} aria-hidden className="shrink-0"><AgentAvatar name={a.name} size={72} photoUrl={a.photo_url} shape="square" /></Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={href} className={`${CARD_NAME} transition hover:text-brand`} data-testid="agent-card-name">{a.name}</Link>
            {isTestName(a.name) && <TestDataTag zh={zh} />}
          </div>
          <div className={`mt-0.5 ${CARD_META}`}>{categoryLabel(a.category, L)}{a.crea_member ? ' · REALTOR®' : ''}</div>
          {/* On its own line, in the name's colour: the brokerage is named clearly and prominently (O. Reg. 567/05 s.12.1). */}
          <div className="break-words text-[14px] font-semibold leading-snug text-ink" data-testid="agent-card-brokerage">{a.brokerage_name}</div>
          <div className="mt-2"><AgentBadge agent={a} lang={L} compact withNumber /></div>
        </div>
      </div>
      {(a.languages.length > 0 || a.focus.length > 0) && (
        <div className="mt-4 flex flex-wrap gap-1.5" data-testid="agent-card-chips">
          {a.languages.map((c) => <span key={`l-${c}`} className={`${CHIP} bg-[#EAF1FF] text-[#1D4ED8]`}>{languageLabel(c, L)}</span>)}
          {a.focus.map((c) => <span key={`f-${c}`} className={CHIP_QUIET}>{focusLabel(c, L)}</span>)}
        </div>
      )}
      {a.service_areas.length > 0 && (
        <div className={`mt-3 ${CARD_FACT}`} data-testid="agent-card-areas">
          <span className="mt-[3px] text-body-3">{FilterIcon.pin}</span>
          <span className="min-w-0">{zh ? '服务区域：' : 'Areas: '}{a.service_areas.slice(0, AREAS_ON_CARD).join(' · ')}{a.service_areas.length > AREAS_ON_CARD ? ` +${a.service_areas.length - AREAS_ON_CARD}` : ''}</span>
        </div>
      )}
      {a.signals && <div className="mt-1.5 text-[12px] leading-relaxed text-body-3" data-testid="agent-signals">{signalLine(a.signals, L)}</div>}
      <div className={CARD_FOOT}>
        <div className={CARD_ACTIONS}>
          <Link href={href} className={CARD_VIEW} data-testid="agent-card-view">{zh ? '看主页' : 'View profile'}</Link>
          {onMessage
            ? <button type="button" onClick={onMessage} aria-expanded={!!messageOpen} className={CARD_MESSAGE} data-testid="agent-card-message">{zh ? '发消息' : 'Message'}</button>
            : <Link href={`${href}#contact`} className={CARD_MESSAGE} data-testid="agent-card-message">{zh ? '发消息' : 'Message'}</Link>}
        </div>
      </div>
    </article>
  )
}
