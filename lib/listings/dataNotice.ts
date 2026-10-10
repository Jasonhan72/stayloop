// Listing-data attribution + accuracy notice (2026-10-10, TRREB readiness).
// MLS rules (PropTx Art. 8.25 / 8.07) want every page that shows listing
// information to say the data is deemed reliable but not guaranteed and to
// carry the supplying association's copyright line. The MLS board line is
// filled in when a feed is live (NEXT_PUBLIC_MLS_ATTRIBUTION); until then the
// notice names the sources we actually have.
export const MLS_ATTRIBUTION = (process.env.NEXT_PUBLIC_MLS_ATTRIBUTION || '').trim()

/** The sponsoring MLS member whose IDX/VOW agreement the site runs under — shown on listing pages (Art. 8.12). */
export const SPONSOR_MEMBER = (() => {
  const name = (process.env.NEXT_PUBLIC_MLS_SPONSOR_NAME || '').trim()
  if (!name) return null
  return {
    name,
    brokerage: (process.env.NEXT_PUBLIC_MLS_SPONSOR_BROKERAGE || '').trim() || null,
    email: (process.env.NEXT_PUBLIC_MLS_SPONSOR_EMAIL || '').trim() || null,
    phone: (process.env.NEXT_PUBLIC_MLS_SPONSOR_PHONE || '').trim() || null,
  }
})()

export function dataNoticeText(zh: boolean): { reliability: string; sources: string; copyright: string } {
  const year = new Date().getFullYear()
  return {
    reliability: zh
      ? '房源信息被认为可靠，但不保证准确；请在决定前向挂牌经纪公司或房东核实。'
      : 'Listing information is deemed reliable but is not guaranteed accurate. Verify with the listing brokerage or landlord before you decide.',
    sources: zh
      ? `来源：房东在 Stayloop 直接发布的房源、Realtor.ca${MLS_ATTRIBUTION ? `、${MLS_ATTRIBUTION}` : ''}。每套房源都标明了来源与挂牌经纪公司。`
      : `Sources: listings published directly by landlords on Stayloop, Realtor.ca${MLS_ATTRIBUTION ? `, ${MLS_ATTRIBUTION}` : ''}. Every listing shows its source and listing brokerage.`,
    copyright: zh
      ? `© ${year} 各挂牌经纪公司与提供数据的房地产协会 / MLS® 系统保留房源信息的版权；Stayloop 自有内容 © ${year} Stayloop。MLS®、REALTOR® 是加拿大房地产协会（CREA）的商标。`
      : `© ${year} Listing information is copyright of the listing brokerages and the real estate associations / MLS® systems that supply it; Stayloop’s own content © ${year} Stayloop. MLS® and REALTOR® are trademarks of The Canadian Real Estate Association (CREA).`,
  }
}
