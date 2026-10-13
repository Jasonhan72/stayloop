// Listing-data attribution + accuracy notice (2026-10-10; rewritten 2026-10-13).
// Every page that shows listing information says the data is deemed reliable
// but not guaranteed, names the sources we actually have and gives a
// corrections channel. Since 2026-10-13 the only source is landlords who
// publish directly on Stayloop: PropTx refused an IDX/VOW feed and Realtor.ca
// is no longer read (lib/listings/externalSources.ts), so there is no MLS
// attribution line and no sponsoring member to name.
export const CORRECTIONS_EMAIL = 'hello@stayloop.ai'

export function dataNoticeText(zh: boolean): { reliability: string; sources: string; copyright: string; corrections: string } {
  const year = new Date().getFullYear()
  return {
    reliability: zh
      ? '房源信息被认为可靠，但不保证准确；请在决定前向房东核实。'
      : 'Listing information is deemed reliable but is not guaranteed accurate. Verify with the landlord before you decide.',
    sources: zh
      ? '来源：房东在 Stayloop 直接发布的房源，每套都经平台核验后上线并标明发布方。'
      : 'Sources: listings published directly by landlords on Stayloop; each one goes live after platform verification and shows who published it.',
    copyright: zh
      ? `© ${year} 房源信息、照片的版权属于发布房源的房东与挂牌方；Stayloop 自有内容 © ${year} Stayloop。`
      : `© ${year} Listing information and photos are copyright of the landlords and listing parties who publish them; Stayloop’s own content © ${year} Stayloop.`,
    // A channel for the publisher to flag anything Stayloop ADDS beyond what they wrote, fixed within 48 h.
    corrections: zh
      ? `房东或挂牌方若认为本页由 Stayloop 附加的信息（翻译、交通站点、社区简介、租金记录）不准确，请发邮件至 ${CORRECTIONS_EMAIL}，我们会在 48 小时内更正或移除。`
      : `Landlords and listing parties: if anything Stayloop adds on this page beyond what you published (translation, transit, neighbourhood note, rent history) is inaccurate, email ${CORRECTIONS_EMAIL} and we will correct or remove it within 48 hours.`,
  }
}
