// One look for the cards of all three directory tabs (2026-11-23 redesign). The agent card
// (app/agents/page.tsx) and the provider card (components/directory/ProviderCard.tsx) are separate
// markup — they show different facts — but they share these classes so the tabs cannot drift apart
// again: before this, 看主页 was a rounded rectangle beside a pill-shaped 发消息, both stretched across
// the whole card.

/** The card: white on the section's tinted ground, a hairline border, and a lift on hover. */
export const CARD = 'group flex min-w-0 flex-col rounded-2xl border border-line-divider bg-white p-5 shadow-[0_1px_2px_rgba(27,27,60,0.04)] transition hover:border-[#BFD9F2] hover:shadow-[0_18px_40px_-24px_rgba(27,27,60,0.35)] sm:p-6'
/** The name: the one thing on the card that is large. */
export const CARD_NAME = 'min-w-0 break-words text-[18px] font-semibold leading-snug tracking-[-0.01em] text-ink'
/** A quiet line under the name. */
export const CARD_META = 'text-[13px] leading-snug text-body-2'
/** A fact line lower on the card (areas, cities), with a small icon in front. */
export const CARD_FACT = 'flex items-start gap-1.5 text-[12.5px] leading-relaxed text-body-2'
/** The foot of the card: a hairline, then the two actions — side by side across a phone, compact and to the right from `sm` up. */
export const CARD_FOOT = 'mt-auto pt-5'
export const CARD_ACTIONS = 'flex gap-2 border-t border-line-divider pt-4 sm:justify-end'
/** 看主页 — the same pill as 发消息, outlined. */
export const CARD_VIEW = 'flex min-h-[44px] flex-1 items-center justify-center rounded-full border border-line-strong bg-white px-5 text-[13.5px] font-semibold text-ink transition hover:border-brand hover:text-brand sm:min-h-[40px] sm:flex-none'
/** 发消息 — the site's primary pill, at the card's size. */
export const CARD_MESSAGE = 'sl-btn-primary flex min-h-[44px] flex-1 items-center justify-center !px-5 !py-0 !text-[13.5px] sm:min-h-[40px] sm:flex-none'
/** A chip in the card's own tint (languages on an agent, trades on a provider). */
export const CHIP = 'rounded-full px-2.5 py-[3px] text-[12px] font-semibold leading-none'
/** A neutral chip (an agent's focus, a provider's languages). */
export const CHIP_QUIET = 'rounded-full bg-[#F1F5F9] px-2.5 py-[3px] text-[12px] leading-none text-body-2'

// ── the two profile pages (/agents/<slug>, /providers/<id>) — same surfaces as the cards above ──
/** A section of a profile page: the white surface of a directory card, with more room. */
export const PANEL = 'rounded-2xl border border-line-divider bg-white p-6 shadow-[0_1px_2px_rgba(27,27,60,0.04)] sm:p-7'
/** A section's heading. */
export const PANEL_TITLE = 'text-[17px] font-semibold tracking-[-0.01em] text-ink'
/** The small label over a group of chips or a fact. */
export const PANEL_LABEL = 'text-[12.5px] font-semibold text-body-3'
/** The name at the head of a profile page. */
export const PROFILE_NAME = 'min-w-0 break-words text-[24px] font-semibold leading-tight tracking-[-0.02em] text-ink sm:text-[30px]'
/** Chips at profile size: tinted (add the tint's colours) and quiet. */
export const CHIP_LG = 'rounded-full px-3 py-1 text-[12.5px] font-semibold'
export const CHIP_LG_QUIET = 'rounded-full bg-[#F1F5F9] px-3 py-1 text-[12.5px] text-body-2'
/** The outlined pill beside a profile's primary button (分享). */
export const PROFILE_SECOND = 'flex min-h-[44px] items-center justify-center rounded-full border border-line-strong bg-white px-5 text-[14px] font-semibold text-ink transition hover:border-brand hover:text-brand'
/** A figure in a profile's row of counts. */
export const STAT_NUM = 'sl-type-num text-[26px] font-semibold leading-none'
