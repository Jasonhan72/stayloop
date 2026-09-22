// Banks are not corporate-registry filings. A bank operating in Canada is
// listed by name in the Schedules to the Bank Act (Schedule I domestic
// banks, Schedule II foreign-bank subsidiaries, Schedule III foreign-bank
// branches) and supervised by OSFI. Case 28 (2026-09-22): KEB Hana Bank
// Canada — Schedule II, CDIC member — came back "not found in the federal
// or provincial registries" and its routine litigation as a lender was
// printed as an employer-stability warning.
//
// Source of truth: laws-lois.justice.gc.ca, Bank Act schedules. The live
// pages are read through the caller's page reader when one is supplied;
// the snapshot below (as at 2025-12-31, read 2026-09-22) is the fallback.

export type BankSchedule = 'I' | 'II' | 'III'
export interface BankActEntry { name: string; schedule: BankSchedule; head_office: string | null; branch_name?: string | null }

export const BANK_ACT_SCHEDULE_URLS: Record<BankSchedule, string> = {
  I: 'https://laws-lois.justice.gc.ca/eng/acts/b-1.01/page-103.html',
  II: 'https://laws-lois.justice.gc.ca/eng/acts/b-1.01/page-104.html',
  III: 'https://laws-lois.justice.gc.ca/eng/acts/b-1.01/page-105.html',
}

const I: Array<[string, string]> = [
  ['B2B Bank', 'Ontario'], ['Bank of Montreal', 'Quebec'], ['Bank of Nova Scotia (The)', 'Nova Scotia'], ['Bridgewater Bank', 'Alberta'],
  ['Caisse populaire acadienne ltée', 'New Brunswick'], ['Canadian Imperial Bank of Commerce', 'Ontario'], ['Canadian Tire Bank', 'Ontario'],
  ['Coast Capital Savings Federal Credit Union', 'British Columbia'], ['Concentra Bank', 'Saskatchewan'], ['CS Alterna Bank', 'Ontario'],
  ['Digital Commerce Bank', 'Alberta'], ['Equitable Bank', 'Ontario'], ['Exchange Bank of Canada', 'Ontario'], ['Fairstone Bank of Canada', 'Ontario'],
  ['First Nations Bank of Canada', 'Saskatchewan'], ['General Bank of Canada', 'Alberta'], ['Haventree Bank', 'Ontario'], ['Home Bank', 'Ontario'],
  ['HomeEquity Bank', 'Ontario'], ['Innovation Federal Credit Union', 'Saskatchewan'], ['Laurentian Bank of Canada', 'Quebec'],
  ['Manulife Bank of Canada', 'Ontario'], ['Motus Bank', 'Ontario'], ['National Bank of Canada', 'Quebec'], ['Peoples Bank of Canada', 'British Columbia'],
  ["President's Choice Bank", 'Ontario'], ['Questbank', 'Ontario'], ['RFA Bank of Canada', 'Ontario'], ['Rogers Bank', 'Ontario'],
  ['Royal Bank of Canada', 'Quebec'], ['Tangerine Bank', 'Ontario'], ['Toronto-Dominion Bank (The)', 'Ontario'],
  ['Vancity Community Investment Bank', 'British Columbia'], ['VersaBank', 'Ontario'], ['Wealth One Bank of Canada', 'Ontario'],
]
const II: Array<[string, string]> = [
  ['Amex Bank of Canada', 'Ontario'], ['Bank of China (Canada)', 'Ontario'], ['Cidel Bank Canada', 'Ontario'], ['Citco Bank Canada', 'Ontario'],
  ['Citibank Canada', 'Ontario'], ['CTBC Bank Corp. (Canada)', 'British Columbia'], ['Habib Canadian Bank', 'Ontario'], ['ICICI Bank Canada', 'Ontario'],
  ['Industrial and Commercial Bank of China (Canada)', 'Ontario'], ['J.P. Morgan Bank Canada', 'Ontario'], ['KEB Hana Bank Canada', 'Ontario'],
  ['Santander Consumer Bank', 'Alberta'], ['SBI Canada Bank', 'Ontario'], ['Shinhan Bank Canada', 'Ontario'], ['UBS Bank (Canada)', 'Ontario'],
]
const III: Array<[string, string, string]> = [
  ['Bank of America, National Association', 'Bank of America, National Association', 'Ontario'], ['Bank of China Limited', 'Bank of China, Toronto Branch', 'Ontario'],
  ['Bank of New York Mellon (The)', 'Bank of New York Mellon (The)', 'Ontario'], ['Barclays Bank PLC', 'Barclays Bank PLC, Canada Branch', 'Ontario'],
  ['BNP Paribas', 'BNP Paribas', 'Quebec'], ['Capital One, National Association', 'Capital One Bank (Canada Branch)', 'Ontario'],
  ['China Construction Bank', 'China Construction Bank Toronto Branch', 'Ontario'], ['Citibank, N.A.', 'Citibank, N.A.', 'Ontario'], ['Comerica Bank', 'Comerica Bank', 'Ontario'],
  ['Coöperatieve Rabobank U.A.', 'Rabobank Canada', 'Ontario'], ['Crédit Agricole Corporate and Investment Bank', 'Crédit Agricole Corporate and Investment Bank (Canada Branch)', 'Quebec'],
  ['Deutsche Bank AG', 'Deutsche Bank AG', 'Ontario'], ['Fifth Third Bank, National Association', 'Fifth Third Bank, National Association', 'Ontario'],
  ['First Commercial Bank', 'First Commercial Bank', 'British Columbia'], ['JPMorgan Chase Bank, National Association', 'JPMorgan Chase Bank, National Association', 'Ontario'],
  ['M&T Bank', 'M&T Bank', 'Ontario'], ['Mega International Commercial Bank Co., Ltd.', 'Mega International Commercial Bank Co., Ltd.', 'Ontario'],
  ['Mizuho Bank, Ltd.', 'Mizuho Bank, Ltd., Canada Branch', 'Ontario'], ['MUFG Bank, Ltd.', 'MUFG Bank, Ltd., Canada Branch', 'Ontario'], ['Natixis', 'Natixis Canada Branch', 'Quebec'],
  ['Northern Trust Company (The)', 'Northern Trust Company, Canada Branch (The)', 'Ontario'], ['PNC Bank, National Association', 'PNC Bank Canada Branch', 'Ontario'],
  ['Société Générale', 'Société Générale (Canada Branch)', 'Quebec'], ['State Street Bank and Trust Company', 'State Street', 'Ontario'],
  ['Sumitomo Mitsui Banking Corporation', 'Sumitomo Mitsui Banking Corporation, Canada Branch', 'Ontario'], ['U.S. Bank National Association', 'U.S. Bank National Association', 'Ontario'],
  ['United Overseas Bank Limited', 'United Overseas Bank Limited', 'British Columbia'], ['Wells Fargo Bank, National Association', 'Wells Fargo Bank, National Association, Canadian Branch', 'Ontario'],
]

export const BANK_ACT_SNAPSHOT: BankActEntry[] = [
  ...I.map(([name, ho]) => ({ name, schedule: 'I' as const, head_office: ho })),
  ...II.map(([name, ho]) => ({ name, schedule: 'II' as const, head_office: ho })),
  ...III.map(([name, branch, ho]) => ({ name, schedule: 'III' as const, head_office: ho, branch_name: branch })),
]
export const BANK_ACT_SNAPSHOT_AS_AT = '2025-12-31'

/** "Toronto-Dominion Bank (The)" ≈ "The Toronto-Dominion Bank" ≈ "TD Bank"?
 *  No — only the statutory name and its "(The)" / punctuation / trade-name
 *  variants match; abbreviations are not guessed. */
export function bankNameKey(s: string): string {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\(the\)|\bthe\b/g, ' ')
    .replace(/\[.*?\]|\(in wind-up.*?\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(limited|ltd|inc|incorporated|corp|corporation|co)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Parse a Bank Act schedule page (as rendered to text): the "| Name | Head Office |" rows. */
export function parseBankActPage(text: string, schedule: BankSchedule): BankActEntry[] {
  const out: BankActEntry[] = []
  for (const line of (text || '').split('\n')) {
    if (!line.startsWith('|')) continue
    const cells = line.split('|').map(c => c.trim()).filter((_, i, a) => i > 0 && i < a.length - 1)
    if (cells.length < 2 || /^-+$/.test(cells[0]) || /^name of/i.test(cells[0])) continue
    if (schedule === 'III') out.push({ name: cells[0], branch_name: cells[1] || null, schedule, head_office: cells[cells.length - 1] || null })
    else out.push({ name: cells[0], schedule, head_office: cells[1] || null })
  }
  return out
}

export function matchBankAct(employerName: string, entries: BankActEntry[] = BANK_ACT_SNAPSHOT): BankActEntry | null {
  const key = bankNameKey(employerName)
  if (key.length < 4) return null
  for (const e of entries) {
    if (bankNameKey(e.name) === key) return e
    if (e.branch_name && bankNameKey(e.branch_name) === key) return e
  }
  // "Hana Bank Canada" is the trade name of "KEB Hana Bank Canada": accept a
  // statutory name that contains the whole employer name when the employer
  // name itself carries the regulated word.
  if (/\b(bank|banque)\b/.test(key)) {
    for (const e of entries) {
      const k = bankNameKey(e.name)
      if (k.includes(key) || (e.branch_name && bankNameKey(e.branch_name).includes(key))) return e
    }
  }
  return null
}

/** Live schedules through the caller's reader, falling back to the snapshot.
 *  The three pages are ~70 KB each; the result is cached per process. */
let liveCache: Promise<BankActEntry[]> | null = null
export function loadBankActSchedules(read?: (url: string) => Promise<string>): Promise<BankActEntry[]> {
  if (!read) return Promise.resolve(BANK_ACT_SNAPSHOT)
  if (!liveCache) {
    liveCache = (async () => {
      try {
        const pages = await Promise.all((['I', 'II', 'III'] as BankSchedule[]).map(async s => parseBankActPage(await read(BANK_ACT_SCHEDULE_URLS[s]), s)))
        const all = pages.flat()
        // a truncated / blocked read must not shadow the snapshot
        return all.length >= BANK_ACT_SNAPSHOT.length * 0.8 ? all : BANK_ACT_SNAPSHOT
      } catch { return BANK_ACT_SNAPSHOT }
    })()
  }
  return liveCache
}

export function bankScheduleLabel(e: BankActEntry, zh: boolean): string {
  const what = e.schedule === 'I' ? (zh ? '国内银行' : 'domestic bank') : e.schedule === 'II' ? (zh ? '外资银行在加子公司' : 'foreign-bank subsidiary') : (zh ? '外资银行在加分行' : 'foreign-bank branch')
  return zh ? `《银行法》附表 ${e.schedule} 银行（${what}）· OSFI 监管` : `Bank Act Schedule ${e.schedule} bank (${what}) · OSFI-supervised`
}
