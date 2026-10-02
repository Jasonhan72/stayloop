// Listing detail page, 2026-10-02 (user: "这个房源详情这里不要中文和英文混杂，除了有些必须
// 要英文的（地址等），其余的都要有语言切换来分开。第二，这个相似房源好像没有相似性，首先是要
// 地段相似，其次，是要房型相似。再次，是要价格相似").
// Guards: (1) English eyebrows render in the English UI only; (2) no hard-coded
// English reaches the Chinese UI (Condo / Studio / + den / VERIFIED /
// (Condominium) / (Freehold) / ", Unit N" / raw utility codes); (3) stored
// description / pet / parking / lease text goes through lib/listingLang.ts;
// (4) similar homes come from lib/listingSimilar.ts with the honest empty state;
// (5) the agent picker hides "[TEST]" agents from everyone but test accounts.
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { addressWithUnit, bedsText, cityOnly, cleanBrokerName, similarDistanceText, similarLayoutText, similarRentText } from '@/components/listing/labels'
import { isTestAgent, isTestViewer, visibleAgents } from '@/components/listing/testAccounts'
import { categoryLabel } from '@/lib/agentProfile'
import { localizeValue, resolveList, resolveValue } from '@/lib/listingLang'
import { fmtDistance, groupFeatures } from '@/lib/listingInsights'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const page = read('app/listings/[slug]/page.tsx')
const section = read('components/listing/ListingSection.tsx')
const costs = read('components/listing/MoveInCosts.tsx')
const descr = read('components/listing/ListingDescription.tsx')
const modal = read('components/ShowingRequestModal.tsx')
const badges = read('components/ListingBadges.tsx')
const picker = read('components/AgentPicker.tsx')
const layout = read('app/listings/[slug]/layout.tsx')
const mapsLoader = read('components/ListingsMap.tsx')
const locMap = read('components/ListingLocationMap.tsx')

const HAN = /[㐀-鿿]/

describe('(1) section eyebrows are English-UI only', () => {
  it('ListingSection renders the eyebrow only when the UI is not Chinese', () => {
    expect(section).toContain('{!zh && eyebrow && (')
    expect(page).not.toMatch(/function Section\(/)
    expect(page).toContain("import { ListingSection as Section } from '@/components/listing/ListingSection'")
  })
  it('every Section on the page and in the move-in card is told the language', () => {
    const all = page.match(/<Section\b/g) || []
    const told = page.match(/<Section zh=\{zh\}/g) || []
    expect(all.length).toBeGreaterThanOrEqual(8)
    expect(told.length).toBe(all.length)
    for (const e of ['ABOUT', 'POLICIES', 'AMENITIES', 'BUILDING', 'PRICE HISTORY', 'LOCATION', 'NEIGHBOURHOOD', 'LANDLORD CRITERIA']) expect(page).toContain(`eyebrow="${e}"`)
    expect(costs).toContain('<ListingSection zh={zh} title={zh ? \'入住前费用一览\' : \'Move-in costs\'} eyebrow="MOVE-IN COSTS">')
  })
  it('the aside and the dialogs: SUBMIT INTENT, SHOWING REQUEST, ASK THE LANDLORD only in English', () => {
    expect(page).toContain('{!zh && <span className="sl-eyebrow">SUBMIT INTENT</span>}')
    expect((page.match(/SUBMIT INTENT/g) || []).length).toBe(1)
    expect(modal).toContain("{!zh && <div className=\"font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3\">{isShowing ? 'SHOWING REQUEST' : 'ASK THE LANDLORD'}</div>}")
  })
})

describe('(2) no hard-coded English reaches the Chinese UI', () => {
  it('no "(Condo)", "Duplex", "(Condominium)", "(Freehold)", "+ den", bare "Studio" or VR Tour on the page', () => {
    for (const bad of ["'整套公寓 (Condo)'", "'整套 Duplex'", "condo: 'Condo'", "duplex: 'Duplex'", '(Condominium)', '(Freehold)', "' + den'", "'+den'", 'VR Tour', 'UTILITY_ZH', '`, Unit ${', '` · Unit ${']) {
      expect(page, bad).not.toContain(bad)
    }
    // Every 'Studio' literal is the English branch of a zh ternary.
    expect((page.match(/'Studio'/g) || []).length).toBe((page.match(/zh \? '开间' : 'Studio'/g) || []).length)
    expect(page).toContain("alt={zh ? `照片 ${idx + 1}` : `Photo ${idx + 1}`}")
  })
  it('zh-branch literals carry no English words except brands, regulators, laws and units', () => {
    const allowed = new Set(['Stayloop', 'Realtor.ca', 'REALTOR.CA', 'OpenStreetMap', 'Google', 'AI', 'TRREB', 'RECO', 'RTA', 's.', 'MLS®', 'OHRC', 'GO', 'km', 'm', 'ft'])
    for (const [name, src] of [['page', page], ['MoveInCosts', costs], ['ListingDescription', descr], ['ListingRulesNote', read('components/listing/ListingRulesNote.tsx')]] as const) {
      const re = /\bzh\s*\?\s*(['`])((?:\\.|(?!\1)[\s\S])*?)\1/g
      let m: RegExpExecArray | null
      while ((m = re.exec(src))) {
        const lit = m[2].replace(/\$\{[^}]*\}/g, ' ')
        if (!HAN.test(lit)) continue // a code value ('zh-CN'), not text
        for (const w of lit.match(/[A-Za-z][A-Za-z.®]*/g) || []) {
          if (/^[a-z]+\.[a-z]/.test(w)) continue // a code identifier in a nested template
          expect(allowed.has(w), `${name}: "${w}" in ${JSON.stringify(m[2].slice(0, 80))}`).toBe(true)
        }
      }
    }
  })
  it('bedrooms, addresses, cities and junk broker names', () => {
    expect(bedsText(0, false, 'zh', 'summary')).toBe('开间')
    expect(bedsText(0, false, 'en', 'stat')).toBe('Studio')
    expect(bedsText(1, true, 'zh', 'summary')).toBe('1 间卧室 + 书房')
    expect(bedsText(1, true, 'en', 'summary')).toBe('1 bedroom + den')
    expect(bedsText(2, false, 'en', 'summary')).toBe('2 bedrooms')
    expect(bedsText(1, true, 'zh', 'stat')).toBe('1 + 书房')
    expect(bedsText(2, false, 'zh', 'short')).toBe('2 卧')
    expect(bedsText(1, true, 'en', 'short')).toBe('1 bed + den')
    for (const style of ['summary', 'stat', 'short'] as const) for (const den of [true, false]) for (const n of [0, 1, 3]) expect(bedsText(n, den, 'zh', style)).not.toMatch(/[A-Za-z]/)
    expect(addressWithUnit('280 Dundas Street W', '515', 'zh')).toBe('280 Dundas Street W #515')
    expect(addressWithUnit('280 Dundas Street W', '515', 'en')).toBe('280 Dundas Street W, Unit 515')
    expect(addressWithUnit('608 - 1080 BAY STREET', '608', 'en')).toBe('608 - 1080 BAY STREET')
    expect(cityOnly('Toronto, ON')).toBe('Toronto')
    expect(cityOnly('Montréal')).toBe('Montréal')
    // no more "Toronto, ON, ON"; the code shown is the listing's real province (lib/provinces, 2026-10-02)
    expect(page).toContain("{city}{listing.province || province !== 'ON' ? `, ${province}` : ''}")
    expect(cleanBrokerName('Agents.')).toBeNull()
    expect(cleanBrokerName('Website')).toBeNull()
    expect(cleanBrokerName('Jane Lee')).toBe('Jane Lee')
    expect(page).toContain('const brokerName = cleanBrokerName(listing.broker_name)')
    expect(page).not.toContain('listing.broker_name ||')
  })
  it('enums and vocabularies through the shared dictionary: 共管公寓 / 共管产权 / 永久产权 / utilities / TRREB', () => {
    expect(localizeValue('property_type', 'condo', 'zh')).toBe('共管公寓')
    expect(localizeValue('ownership_title', 'condominium', 'zh')).toBe('共管产权')
    expect(localizeValue('ownership_title', 'freehold', 'zh')).toBe('永久产权')
    expect(resolveList('utilities_included', ['internet', 'cable'], 'en')).toEqual(['Internet', 'Cable TV'])
    expect(resolveList('utilities_included', ['internet', 'cable'], 'zh')).toEqual(['网络', '有线电视'])
    expect(localizeValue('trreb_period', '2026 Q2', 'zh')).toBe('2026 年第 2 季度')
    expect(page).toContain("localizeValue('property_type', sl.property_type, lang)") // similar cards
    // The building facts read the cached translation too (an unknown code is collected for one by collectTranslatables).
    expect(page).toContain("const ownership = resolveValue('ownership_title', listing.ownership_title, lang, tr)")
    expect(page).toContain("value={resolveValue('property_type', listing.property_type, lang, tr) || (zh ? '其他' : 'Other')}")
    expect(page).toContain("const utilities = resolveList('utilities_included', listing.utilities_included, lang, tr)")
    expect(page).toContain("localizeValue('trreb_area', benchmark.area, lang)")
    expect(page).toContain("localizeValue('trreb_period', benchmark.period, lang)")
  })
  it('the detail badge says 已核验 in Chinese; the agent category is one language at a time', () => {
    expect(badges).toContain("<span className=\"sl-chip fit\">{zh ? '已核验' : 'VERIFIED'}</span>")
    expect(badges).not.toContain('<span className="sl-chip fit">VERIFIED</span>')
    for (const c of ['salesperson', 'broker', 'broker_of_record'] as const) {
      expect(categoryLabel(c, 'zh')).not.toMatch(/[A-Za-z]/)
      expect(categoryLabel(c, 'en')).not.toMatch(HAN)
    }
    expect(categoryLabel('salesperson', 'zh')).toBe('地产销售代表')
    expect(categoryLabel('broker_of_record', 'en')).toBe('Broker of Record')
  })
  it('share sheet, favourites, browser tab and the Maps SDK', () => {
    expect(page).toContain("`${listingTitle(listing.address, listing.unit)} · $${listing.monthly_rent.toLocaleString()}${zh ? '/月' : '/mo'} · Stayloop`")
    expect(page).toContain('  title: listingTitle(l.address, l.unit),')
    // server-rendered before the UI language is known: the address only
    expect(layout).toContain("const title = [addr || 'Stayloop', addr ? 'Stayloop' : null]")
    expect(layout).not.toMatch(/const title = \[[^\]]*(beds|rent|where|l\.title)/)
    expect(mapsLoader).toContain("&language=${mapsLanguage(lang) === 'zh' ? 'zh-CN' : 'en'}&region=CA")
    expect(locMap).toContain("loadGoogleMaps(apiKey, zh ? 'zh' : 'en')")
  })
})

describe('(3) stored text goes through lib/listingLang.ts', () => {
  it('description, pet policy, parking, lease term, heating / cooling / exterior and amenities', () => {
    expect(page).toContain('const desc = resolveDescription(listing.description, lang, tr)')
    expect(page).toContain("resolveValue('pet_policy', listing.pet_policy, lang, tr) || (zh ? '未说明' : 'Not stated')")
    expect(page).toContain("resolveValue('parking', listing.parking, lang, tr) || (zh ? '未说明' : 'Not stated')")
    expect(page).toContain("const leaseTerm = resolveValue('lease_term', listing.lease_term, lang, tr)")
    for (const f of ['heating_type', 'heating_fuel', 'cooling', 'basement_type', 'exterior_finish', 'land_size']) expect(page).toContain(`resolveValue('${f}', listing.${f}, lang, tr)`)
    expect(page).toContain('(raw, field, l) => resolveValue(field, raw, l, l === lang ? tr : null)')
    for (const raw of ['{listing.description ||', 'listing.pet_policy ||', ': listing.parking ?', '{listing.lease_term', 'value={listing.cooling}', 'value={listing.exterior_finish}']) expect(page, raw).not.toContain(raw)
  })
  it('the enrich route is asked in the UI language and asked again when the language changes', () => {
    // 2026-10-02 (later): the translations are their own call beside the facts call, which carries no language
    expect(page).toContain("body: JSON.stringify({ id: listing.id, lang, only: 'translations' })")
    expect(page).toContain('body: JSON.stringify({ id: listing.id })')
    expect(page).toContain('}, [listing?.id, lang]) // eslint-disable-line react-hooks/exhaustive-deps')
    expect(page).toContain("if (t && t.lang === lang && t.strings && typeof t.strings === 'object') setTranslations((p) => ({ ...p, [key]: t.strings }))")
    // keyed by listing and language
    expect(page).toContain('const key = `${listing.id}:${lang}`')
  })
  it('a description only in the other language shows a UI-language note, the original only on request', () => {
    expect(descr).toContain("'这段介绍目前只有英文原文。'")
    expect(descr).toContain("'This description is currently available in Chinese only.'")
    expect(descr).toContain("(zh ? '显示原文' : 'Show original')")
    expect(descr).toContain('const originalBlock = open && original ? (')
    expect(descr).toContain("'这段介绍由 AI 根据英文原文翻译，以原文为准。'")
  })
  it('amenity labels: unresolved values are left out; 室内 "indoor" is not "in the unit"', () => {
    const lab = (raw: string, f: 'amenities' | 'building_features' | 'appliances', l: 'zh' | 'en') => resolveValue(f, raw, l)
    const zh = groupFeatures({ amenities: ['Indoor Pool', 'In suite Laundry', '室内停车 / Indoor Parking', 'Locker', 'Storage - Locker'], appliances: ['Dryer'] }, 'zh', lab)
    expect(zh.unit).toEqual(['烘干机', '室内洗衣机'])
    expect(zh.building).toEqual(['室内泳池', '室内停车', '储物柜'])
    const en = groupFeatures({ amenities: ['厨房 / Kitchen', '室内停车 / Indoor Parking'] }, 'en', lab)
    expect([...en.unit, ...en.building].join(' ')).not.toMatch(HAN)
    expect(groupFeatures({ amenities: ['some unknown english amenity'] }, 'zh', () => null)).toEqual({ unit: [], building: [] })
  })
})

describe('(4) similar homes: location, then layout, then rent', () => {
  it('the page queries a ±6 km box and ranks with rankSimilar; no city filter, no ad-hoc score', () => {
    expect(page).toContain("import { SIMILAR_LIMIT, rankSimilar, similarSearchBox, type SimilarMatch } from '@/lib/listingSimilar'")
    expect(page).toContain('const box = similarSearchBox(origin.lat, origin.lng)')
    expect(page).toContain(".or(LISTING_VISIBILITY_OR)")
    expect(page).toContain("q = q.ilike('neighborhood',") // no coordinates anywhere: the same neighbourhood
    // Two steps: ranking columns for the whole box (a wide pool), card columns for the ranked shortlist only.
    expect(page).toContain("supabase.from('listings').select(SIMILAR_RANK_COLUMNS)")
    expect(page).toContain('.limit(SIMILAR_POOL)')
    expect(page).toContain("const pool = ((rest || []) as unknown as DBListing[]).filter((x) => x.status !== 'archived')")
    expect(page).toContain('const shortlist = rankSimilar(listing, pool, { origin, limit: SIMILAR_SHORTLIST })')
    expect(page).toContain(".select(SIMILAR_CARD_COLUMNS).in('id', shortlist.map((m) => m.listing.id))")
    expect(page).toContain(".filter((m) => m.listing && hasUsablePhotos(m.listing.images) && m.listing.status !== 'archived')")
    expect(page).toContain('.slice(0, SIMILAR_LIMIT)')
    // the rank query carries no description / images / price history
    const rankCols = page.match(/const SIMILAR_RANK_COLUMNS = '([^']+)'/)![1]
    for (const heavy of ['description', 'images', 'price_history', 'transit', '*']) expect(rankCols).not.toContain(heavy)
    expect(page).not.toContain(".ilike('city'")
    expect(page).not.toContain('score(a) - score(b)')
  })
  it('heading, subline and the honest empty state', () => {
    expect(page).toContain("{zh ? '附近的相似房源' : 'Similar homes nearby'}")
    expect(page).toContain("{zh ? '先比位置，再比户型，最后比租金 · 距离为直线距离' : 'Ranked by location, then layout, then rent · straight-line distance'}")
    expect(page).toContain("{zh ? '附近 6 km 内暂无户型、租金相近的在租房源。' : 'No similar homes for rent within 6 km.'}")
    expect(page).toContain("<Link href=\"/listings\" className=\"whitespace-nowrap font-semibold text-brand-strong hover:underline\">{zh ? '查看全部房源 →' : 'See all listings →'}</Link>")
    expect(page).toContain('similarRentText(m.rent_delta, lang)')
    expect(page).toContain('similarLayoutText(m, sl, listing, lang)')
    expect(page).toContain("{zh ? '同社区' : 'Same neighbourhood'}")
    expect(page).toContain('onClick={() => toggle(snapS)}')
    expect(page).toContain('flex snap-x gap-4 overflow-x-auto pb-2 lg:grid lg:grid-cols-3 lg:overflow-visible')
  })
  it('card chips: distance, layout and rent difference in dollars (no percentages)', () => {
    const fmt = (m: number) => fmtDistance(m, 'zh')
    expect(similarDistanceText({ same_building: true, distance_m: 40 }, 'zh', fmt)).toBe('同楼')
    expect(similarDistanceText({ same_building: true, distance_m: 40 }, 'en', fmt)).toBe('Same building')
    expect(similarDistanceText({ same_building: false, distance_m: 350 }, 'zh', fmt)).toBe('350 m')
    expect(similarDistanceText({ same_building: false, distance_m: 1240 }, 'en', fmt)).toBe('1.2 km')
    expect(similarDistanceText({ same_building: false, distance_m: null }, 'en', fmt)).toBeNull()
    const two = { bedrooms: 2, has_den: false }
    expect(similarLayoutText({ unit_tier: 0, bedroom_delta: 0, den_differs: false }, two, two, 'zh')).toBe('同户型 · 2 卧')
    expect(similarLayoutText({ unit_tier: 0, bedroom_delta: 0, den_differs: false }, two, two, 'en')).toBe('Same layout · 2 bed')
    expect(similarLayoutText({ unit_tier: 1, bedroom_delta: 0, den_differs: true }, { bedrooms: 1, has_den: true }, { bedrooms: 1, has_den: false }, 'zh')).toBe('1 卧 + 书房（这套 1 卧）')
    expect(similarLayoutText({ unit_tier: 2, bedroom_delta: 1, den_differs: false }, { bedrooms: 3 }, two, 'zh')).toBe('多 1 卧')
    expect(similarLayoutText({ unit_tier: 2, bedroom_delta: 1, den_differs: false }, { bedrooms: 3 }, two, 'en')).toBe('1 more bedroom')
    expect(similarLayoutText({ unit_tier: 3, bedroom_delta: -2, den_differs: false }, { bedrooms: 0 }, two, 'en')).toBe('2 fewer bedrooms')
    expect(similarLayoutText({ unit_tier: null, bedroom_delta: null, den_differs: false }, two, { bedrooms: null }, 'zh')).toBeNull()
    expect(similarRentText(-1210, 'zh')).toBe('比这套低 $1,210')
    expect(similarRentText(-1210, 'en')).toBe('$1,210 less')
    expect(similarRentText(300, 'zh')).toBe('比这套高 $300')
    expect(similarRentText(300, 'en')).toBe('$300 more')
    expect(similarRentText(0, 'zh')).toBe('与这套同价')
    for (const d of [-1210, 0, 300]) for (const l of ['zh', 'en'] as const) expect(similarRentText(d, l)).not.toContain('%')
  })
})

describe('(5) "[TEST]" agents are listed to test accounts only', () => {
  const rows = [
    { auth_id: 'a', legal_name: '[TEST] Agent Person', brokerage_name: '[TEST] Example Realty Inc., Brokerage' },
    { auth_id: 'b', legal_name: 'Jane Lee', brokerage_name: '[TEST] Example Realty Inc., Brokerage' },
    { auth_id: 'c', legal_name: 'Real Agent', brokerage_name: 'Real Brokerage Inc.' },
  ]
  it('filters by display name or brokerage for everyone else', () => {
    expect(isTestAgent(rows[0])).toBe(true)
    expect(isTestAgent(rows[1])).toBe(true)
    expect(isTestAgent(rows[2])).toBe(false)
    expect(visibleAgents(rows, false).map((r) => r.auth_id)).toEqual(['c'])
    expect(visibleAgents(rows, true).map((r) => r.auth_id)).toEqual(['a', 'b', 'c'])
  })
  it('only user_metadata.test_account === true is a test viewer', () => {
    expect(isTestViewer({ user_metadata: { test_account: true } })).toBe(true)
    expect(isTestViewer({ user_metadata: { test_account: 'true' } })).toBe(false)
    expect(isTestViewer({ user_metadata: {} })).toBe(false)
    expect(isTestViewer(null)).toBe(false)
  })
  it('the picker applies it at render, on the auth user', () => {
    expect(picker).toContain('const rows = allRows && visibleAgents(allRows, isTestViewer(auth.user))')
    expect(picker).toContain('{rows?.map(a => (')
    expect(picker).not.toContain('allRows?.map')
  })
})

describe('the rules note and the move-in card are their own components (next stage edits only those)', () => {
  it('both live under components/listing/ and the page renders them', () => {
    const files = readdirSync(join(process.cwd(), 'components/listing'))
    expect(files).toEqual(expect.arrayContaining(['ListingRulesNote.tsx', 'MoveInCosts.tsx', 'ListingSection.tsx', 'ListingDescription.tsx', 'labels.ts', 'testAccounts.ts']))
    expect(read('components/listing/ListingRulesNote.tsx')).toContain('data-testid="listing-rules-note"')
    expect(page).not.toContain('data-testid="listing-rules-note"')
    expect(page).not.toMatch(/function MoveInCosts|function Row\(/)
  })
})
