// External listing sources policy (2026-10-13).
//
// PropTx (TRREB) refused Stayloop's IDX/VOW request on 2026-10-13: MLS feeds
// may only power a member brokerage's own branded site, and no MLS data may be
// processed by any AI. CREA's DDF has the same structure and REALTOR.ca's terms
// forbid commercial use without written authority. Stayloop therefore no longer
// READS Realtor.ca (listings, market samples, commercial space, listing-URL
// imports). Linking to it is fine, reading it is not.
//
// REALTOR_LIVE_READS is a constant, not an env flag: switching it back on is a
// product decision that needs a licence, not a config change.
// See design/proptx-refusal-and-listings-strategy-2026-10.md.

export const REALTOR_LIVE_READS = false as const

export type ExternalLink = { label: string; url: string; site: 'realtor' | 'rentals' | 'kijiji' }

const MLS_HOSTS = /(^|\.)(realtor\.ca|realtor\.com|mls\.ca|propertysearch\.ca|onregional\.ca|torontomls\.net|treb3pv\.com)$/i

/** True for Realtor.ca / MLS hosts whose pages Stayloop must not read. */
export function isMlsHost(url: string): boolean {
  try {
    return MLS_HOSTS.test(new URL(url).hostname)
  } catch {
    return false
  }
}

export const MLS_READ_REFUSED_REASON = 'Realtor.ca / MLS pages are not read by Stayloop (MLS rules do not allow it); ask the person for the details instead'

// Rentals.ca city pages (verified format: rentals.ca/<city>) and Kijiji's
// for-rent category for the GTA / City of Toronto. Only cities whose slug is
// known are linked; anything else falls back to the Toronto / GTA page.
const RENTALS_CA_CITIES: Record<string, string> = {
  toronto: 'toronto', mississauga: 'mississauga', markham: 'markham', 'richmond hill': 'richmond-hill', vaughan: 'vaughan',
  brampton: 'brampton', oakville: 'oakville', burlington: 'burlington', pickering: 'pickering', ajax: 'ajax', whitby: 'whitby',
  oshawa: 'oshawa', newmarket: 'newmarket', aurora: 'aurora', scarborough: 'toronto', 'north york': 'toronto', etobicoke: 'toronto',
  hamilton: 'hamilton', ottawa: 'ottawa', montreal: 'montreal', montréal: 'montreal', 'kitchener': 'kitchener', waterloo: 'waterloo', london: 'london',
}

export function rentalsCaUrl(city: string | null | undefined): string {
  const key = (city || '').trim().toLowerCase()
  const slug = RENTALS_CA_CITIES[key] || 'toronto'
  return `https://rentals.ca/${slug}`
}

export function kijijiUrl(city: string | null | undefined): string {
  const key = (city || '').trim().toLowerCase()
  const toronto = !key || key === 'toronto' || key === 'scarborough' || key === 'north york' || key === 'etobicoke'
  return toronto
    ? 'https://www.kijiji.ca/b-for-rent/city-of-toronto/c30349001l1700273'
    : 'https://www.kijiji.ca/b-for-rent/gta-greater-toronto-area/c30349001l1700272'
}

export const EXTERNAL_LINKS_NOTE = {
  zh: 'Stayloop 不再替你读取 Realtor.ca 的房源（MLS 规则不允许第三方平台与 AI 使用其数据）。按你的条件直接打开这些站点：',
  en: 'Stayloop no longer reads Realtor.ca listings for you (MLS rules do not allow third-party platforms or AI to use that data). Open these sites with your criteria:',
}
