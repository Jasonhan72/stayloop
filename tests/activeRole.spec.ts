import { describe, expect, it } from 'vitest'
import { roleFromPath } from '@/lib/activeRole'

// Multi-role accounts (2026-09-13): the URL decides the active hat; the
// stored role only fills in on neutral pages.
describe('roleFromPath', () => {
  it('names the hat from the workspace prefix', () => {
    expect(roleFromPath('/tenant/agent')).toBe('tenant')
    expect(roleFromPath('/landlord/applicants/abc')).toBe('landlord')
    expect(roleFromPath('/agent/verify')).toBe('agent')
    expect(roleFromPath('/agent/clients')).toBe('agent')
  })
  it('treats the screening app and dashboard as landlord surfaces', () => {
    expect(roleFromPath('/screening/app')).toBe('landlord')
    expect(roleFromPath('/dashboard/listings/new')).toBe('landlord')
  })
  it('leaves neutral and marketing pages to the remembered role', () => {
    expect(roleFromPath('/')).toBeNull()
    expect(roleFromPath('/settings')).toBeNull()
    expect(roleFromPath('/listings/king-west-1207')).toBeNull()
    expect(roleFromPath('/screening')).toBeNull()
    expect(roleFromPath('/tenant')).toBeNull()   // the marketing page, not the workspace
    expect(roleFromPath('/agent')).toBeNull()
    expect(roleFromPath(null)).toBeNull()
  })
})
