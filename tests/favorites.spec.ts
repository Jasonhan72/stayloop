// favKey — the stable identity for a listing across every surface that shows
// a heart. If this drifts, favorites saved on /listings stop reading as
// favorited on the agent-chat cards (and vice versa).
import { describe, expect, it } from 'vitest'
import { favKey } from '@/lib/favorites'

describe('favKey — stable listing identity', () => {
  it('stayloop rows key on their DB id with the sl: prefix', () => {
    expect(favKey({ id: 'abc-123' })).toBe('sl:abc-123')
    expect(favKey({ source: 'stayloop', id: 'abc-123' })).toBe('sl:abc-123')
  })

  it('realtor externals key on their URL with the rc: prefix, lowercased + trimmed', () => {
    expect(favKey({ source: 'realtor', url: '  https://www.REALTOR.ca/real-estate/123/Unit-5 ' })).toBe(
      'rc:https://www.realtor.ca/real-estate/123/unit-5',
    )
  })

  it('realtor falls back to address when there is no URL', () => {
    expect(favKey({ source: 'realtor', address: '123 King St W' })).toBe('rc:123 king st w')
  })

  it('same inputs always produce the same key (stability)', () => {
    const input = { source: 'realtor', url: 'https://realtor.ca/x' }
    expect(favKey(input)).toBe(favKey({ ...input }))
    const slInput = { id: 'listing-9' }
    expect(favKey(slInput)).toBe(favKey({ ...slInput }))
  })

  it('sl: and rc: namespaces never collide for the same basis', () => {
    const basis = 'https://example.com/listing'
    expect(favKey({ source: 'realtor', url: basis })).not.toBe(favKey({ id: basis }))
  })

  it('stayloop rows without an id fall back to url/address, normalized', () => {
    expect(favKey({ url: ' HTTPS://Stayloop.ai/listings/king-west ' })).toBe('sl:https://stayloop.ai/listings/king-west')
    expect(favKey({ address: ' 88 Blue Jays Way ' })).toBe('sl:88 blue jays way')
  })

  it('the DB id is used verbatim (no case-folding of ids)', () => {
    expect(favKey({ id: 'AbC' })).toBe('sl:AbC')
  })
})
