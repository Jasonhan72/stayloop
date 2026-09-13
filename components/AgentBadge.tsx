'use client'

// The verified-agent mark. It says exactly what was checked and when — a
// re-verification against RECO's public register on a date, by a person —
// never "licensed and endorsed by Stayloop". RECO itself disclaims the
// register's completeness, so the badge links to it and to RECO's
// complaints desk (design/roles-and-agent-verification-2026-09.md §5).
import { RECO_COMPLAINTS_URL, RECO_REGISTER_URL, categoryLabel, type AgentProfile } from '@/lib/agentProfile'

export function AgentBadge({ agent, lang, compact = false }: { agent: Pick<AgentProfile, 'status' | 'reco_number' | 'brokerage_name' | 'verified_at' | 'category' | 'crea_member'>; lang: 'zh' | 'en'; compact?: boolean }) {
  const zh = lang === 'zh'
  if (agent.status !== 'verified') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-[2px] text-[11px] font-bold text-amber-800">
        {zh ? '未认证' : 'Not verified'}
      </span>
    )
  }
  const date = agent.verified_at ? new Date(agent.verified_at).toLocaleDateString(zh ? 'zh-CN' : 'en-CA') : ''
  if (compact) {
    return (
      <a href={RECO_REGISTER_URL} target="_blank" rel="noopener noreferrer" title={zh ? `RECO 注册已核 · #${agent.reco_number} · ${agent.brokerage_name} · 核于 ${date}` : `RECO registration verified · #${agent.reco_number} · ${agent.brokerage_name} · checked ${date}`}
        className="inline-flex items-center gap-1 rounded-full px-2 py-[2px] text-[11px] font-bold" style={{ background: '#E4EEE3', color: '#065F46' }}>
        ✓ {zh ? 'RECO 注册已核' : 'RECO verified'}
      </a>
    )
  }
  return (
    <div className="rounded-xl border px-3 py-2 text-[12px] leading-relaxed" style={{ borderColor: '#C5E3D3', background: '#F4FAF6', color: '#065F46' }}>
      <div className="font-bold">✓ {zh ? 'RECO 注册已核' : 'RECO registration verified'} · #{agent.reco_number}</div>
      <div className="text-[11.5px]" style={{ color: '#3F6B54' }}>
        {categoryLabel(agent.category, lang)}{agent.crea_member ? ' · REALTOR®' : ''} · {agent.brokerage_name}{date ? ` · ${zh ? '核于' : 'checked'} ${date}` : ''}
      </div>
      <div className="mt-1 text-[11px]" style={{ color: '#3F6B54' }}>
        {zh ? '核验 = 该日在 RECO 公开注册库上处于注册状态，不是 Stayloop 的背书。' : 'Verified = registered on RECO’s public register on that date; not an endorsement by Stayloop.'}{' '}
        <a href={RECO_REGISTER_URL} target="_blank" rel="noopener noreferrer" className="underline">{zh ? '在 RECO 核实' : 'Check on RECO'}</a>
        {' · '}
        <a href={RECO_COMPLAINTS_URL} target="_blank" rel="noopener noreferrer" className="underline">{zh ? '向 RECO 投诉' : 'Complain to RECO'}</a>
      </div>
    </div>
  )
}
