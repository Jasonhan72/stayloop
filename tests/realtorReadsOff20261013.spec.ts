// 2026-10-13: PropTx refused the IDX/VOW request and MLS rules forbid third-party /
// AI use, so Stayloop stopped READING Realtor.ca. It links instead.
// See design/proptx-refusal-and-listings-strategy-2026-10.md.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { REALTOR_LIVE_READS, isMlsHost, rentalsCaUrl, kijijiUrl } from '@/lib/listings/externalSources'
import { buildExternalLinks } from '@/lib/agent/listingSearch'

const read = (p: string) => readFileSync(p, 'utf8')

describe('policy constant and host check', () => {
  it('live reads are off and the constant is not an env flag', () => {
    expect(REALTOR_LIVE_READS).toBe(false)
    expect(read('lib/listings/externalSources.ts')).not.toMatch(/process\.env/)
  })
  it('isMlsHost catches realtor.ca and subdomains, not other sites', () => {
    expect(isMlsHost('https://www.realtor.ca/real-estate/123/abc')).toBe(true)
    expect(isMlsHost('https://cdn.realtor.ca/listing/x.jpg')).toBe(true)
    expect(isMlsHost('https://rentals.ca/toronto')).toBe(false)
    expect(isMlsHost('not a url')).toBe(false)
  })
  it('rental-site links fall back to Toronto / GTA pages', () => {
    expect(rentalsCaUrl('Richmond Hill')).toBe('https://rentals.ca/richmond-hill')
    expect(rentalsCaUrl('nowhere')).toBe('https://rentals.ca/toronto')
    expect(kijijiUrl('Toronto')).toContain('city-of-toronto')
    expect(kijijiUrl('Markham')).toContain('gta-greater-toronto-area')
  })
})

describe('buildExternalLinks — deep links with the criteria', () => {
  it('residential: known Toronto neighbourhood → neighbourhood bedroom page + Rentals.ca + Kijiji', () => {
    const links = buildExternalLinks({ area: 'Yonge-Bay Corridor', min_beds: 2, max_price: 2800, pets: null, property_type: null, keywords: null, count: null }, null)
    expect(links.map((l) => l.site)).toEqual(['realtor', 'rentals', 'kijiji'])
    expect(links[0].url).toBe('https://www.realtor.ca/on/toronto/yonge-bay-corridor/2-bedroom-apartments-for-rent')
    expect(links[1].url).toBe('https://rentals.ca/toronto')
  })
  it('residential: GTA city → city rentals page and the matching Rentals.ca city', () => {
    const links = buildExternalLinks({ area: 'Markham', min_beds: null, max_price: null, pets: null, property_type: null, keywords: null, count: null }, null)
    expect(links[0].url).toBe('https://www.realtor.ca/on/markham/rentals')
    expect(links[1].url).toBe('https://rentals.ca/markham')
  })
  it('commercial: one commercial-space page per named city', () => {
    const links = buildExternalLinks({ area: 'Markham/ Richmond Hill /Vaughan', min_beds: null, max_price: null, pets: null, property_type: 'industrial', keywords: null, count: null }, 'industrial')
    expect(links.length).toBe(3)
    for (const l of links) expect(l.url).toMatch(/^https:\/\/www\.realtor\.ca\/on\/[a-z-]+\/commercial-space-for-lease$/)
  })
})

describe('no code path reads Realtor.ca any more', () => {
  it('searchListings gates both the commercial path and the residential fallback on REALTOR_LIVE_READS', () => {
    const s = read('lib/agent/listingSearch.ts')
    expect(s).toContain("if (!REALTOR_LIVE_READS) return { listings: [], external: { status: 'disabled' }, links: buildExternalLinks(cc, ckind), checked: 0 }")
    expect(s).toContain('REALTOR_LIVE_READS\n    ? jinaRealtor(')
  })
  it('the turn route refuses to read MLS hosts and passes the links to the client', () => {
    const t = read('app/api/agent/turn/route.ts')
    expect(t).toContain('if (isMlsHost(url)) return { content: null, images: [], reason: MLS_READ_REFUSED_REASON }')
    expect(t).toContain('external_links: externalLinks')
    expect(t).toContain("result.external.status === 'disabled'")
  })
  it('the chat renders the links as outbound pills and the session hook carries them', () => {
    expect(read('components/agent/AgentChat.tsx')).toContain('data-testid="external-links"')
    expect(read('lib/agent/useAgentSession.ts')).toContain('links = turn.links')
    expect(read('lib/agent/orchestrator.ts')).toContain('links: turn.external_links')
  })
  it('the freshness cron and the import scripts are stopped', () => {
    expect(read('app/api/cron/realtor-freshness/route.ts')).toContain('REALTOR_LIVE_READS')
    expect(read('scripts/realtor-import/README.md')).toMatch(/STOPPED 2026-10-13/)
  })
})
