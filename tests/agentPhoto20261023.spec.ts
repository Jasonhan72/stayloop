// Agent profile photo (2026-10-23). Rules kept here:
//   • Only our bucket can ever be shown: the renderer builds the URL from a key that must match
//     <uid>/<id>.webp|jpg, and the migration's check constraint + profile guard keep a direct
//     client write from pointing the key anywhere.
//   • The route is the only writer (service role), sniffs the bytes, caps at 1 MB, fails closed on
//     its limit, and removes the previous file. No storage policy grants authenticated anything.
//   • Public types carry photo_url, never the key/uid; the editor's remove is a two-step in page.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { AGENT_PHOTO_BUCKET, AGENT_PHOTO_MAX_BYTES, agentPhotoUrl, isAgentPhotoKey, sniffPhoto } from '@/lib/agentPhotoKeys'
import { PUBLIC_AGENT_COLUMNS, toPublicAgent, type AgentProfileRow } from '@/lib/agentPublic'

const read = (p: string) => readFileSync(p, 'utf8')
const code = (p: string) => read(p).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
const UID = '4388a326-5e19-43c7-81ac-80abbdc91d21'

describe('keys and urls', () => {
  it('accepts only <uid>/<id>.webp|jpg', () => {
    expect(isAgentPhotoKey(`${UID}/abcdef1234567890.webp`)).toBe(true)
    expect(isAgentPhotoKey(`${UID}/abcdef12.jpg`)).toBe(true)
    expect(isAgentPhotoKey(`${UID}/abcdef12.png`)).toBe(false)
    expect(isAgentPhotoKey(`${UID}/../x.webp`)).toBe(false)
    expect(isAgentPhotoKey('https://evil.example/x.webp')).toBe(false)
    expect(isAgentPhotoKey(null)).toBe(false)
  })
  it('builds the URL under our storage host only; null for anything else', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://auth.stayloop.ai/'
    expect(agentPhotoUrl(`${UID}/abcdef1234567890.webp`)).toBe(`https://auth.stayloop.ai/storage/v1/object/public/${AGENT_PHOTO_BUCKET}/${UID}/abcdef1234567890.webp`)
    expect(agentPhotoUrl('junk')).toBeNull()
    expect(agentPhotoUrl(null)).toBeNull()
  })
  it('sniffs WebP and JPEG by magic bytes, rejects the rest', () => {
    const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38])
    const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0])
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
    expect(sniffPhoto(webp)).toBe('webp')
    expect(sniffPhoto(jpg)).toBe('jpg')
    expect(sniffPhoto(png)).toBeNull()
    expect(sniffPhoto(new Uint8Array([]))).toBeNull()
  })
  it('the bucket cap is 1 MB, matching the migration', () => {
    expect(AGENT_PHOTO_MAX_BYTES).toBe(1048576)
    expect(read('supabase/migrations/20261023_agent_photos.sql')).toMatch(/'agent-photos', 'agent-photos', true, 1048576, array\['image\/webp', 'image\/jpeg'\]/)
  })
})

describe('public shape', () => {
  const row = (over: Partial<AgentProfileRow> = {}): AgentProfileRow => ({
    auth_id: UID, legal_name: 'Agent Person', reco_number: '1234567', category: 'salesperson', brokerage_name: 'Example Realty Inc., Brokerage', crea_member: false,
    status: 'verified', verified_at: '2026-10-01T00:00:00Z', expires_at: null, created_at: '2026-09-01T00:00:00Z', public_profile: true, profile_slug: 'agent-person',
    bio: null, languages: [], service_areas: [], focus: [], show_activity: false, ...over,
  })
  it('photo_url is derived from the key; the key and uid never leave', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://auth.stayloop.ai'
    const p = toPublicAgent(row({ photo_key: `${UID}/abcdef1234567890.webp` }))
    expect(p.photo_url).toMatch(/^https:\/\/auth\.stayloop\.ai\/storage\/v1\/object\/public\/agent-photos\//)
    expect(JSON.stringify(p)).not.toContain('photo_key')
    expect(toPublicAgent(row()).photo_url).toBeNull()
    expect(toPublicAgent(row({ photo_key: 'junk' })).photo_url).toBeNull()
    expect(PUBLIC_AGENT_COLUMNS).toContain('photo_key')
  })
})

describe('migration, guard and route', () => {
  const sql = read('supabase/migrations/20261023_agent_photos.sql')
  it('check constraint on the key; guard resets photo_key on direct client writes; no storage policy for authenticated', () => {
    expect(sql).toMatch(/agent_profiles_photo_key_format[\s\S]*photo_key ~ '\^\[0-9a-f\]\{8\}/)
    expect(sql).toMatch(/new\.photo_key\s+:= old\.photo_key;/)
    expect(sql).not.toMatch(/create policy[\s\S]*storage\.objects/)
    expect(sql).toMatch(/ap\.photo_key[\s\S]*from public\.agent_profiles ap/)
  })
  it('route: sniffed bytes, size cap, fail-closed limit, profile row required, previous file removed', () => {
    const r = code('app/api/agents/photo/route.ts')
    expect(r).toMatch(/sniffPhoto\(bytes\)/)
    expect(r).toMatch(/file\.size > AGENT_PHOTO_MAX_BYTES/)
    expect(r).toMatch(/underHourlyLimit\(`agent-photo:\$\{uid\}`, PER_USER_PER_HOUR, false\)/)
    expect(r).toMatch(/agent_profile_required/)
    expect(r).toMatch(/remove\(\[cur\.key\]\)/)
    expect(r).toMatch(/export async function DELETE/)
    expect(r).not.toMatch(/file\.type/)
  })
})

describe('UI', () => {
  it('avatar renders the photo when given, initials otherwise; pages, picker and editor pass it', () => {
    const a = code('components/agent/AgentAvatar.tsx')
    expect(a).toMatch(/data-testid="agent-photo"/)
    expect(a).toMatch(/initials\(name\)/)
    expect(code('app/agents/[slug]/page.tsx')).toMatch(/photoUrl=\{agent\.photo_url\}/)
    expect(code('app/agents/page.tsx')).toMatch(/photoUrl=\{a\.photo_url\}/)
    expect(code('components/AgentPicker.tsx')).toMatch(/photoUrl=\{agentPhotoUrl\(a\.photo_key\)\}/)
    expect(code('components/agent/PublicProfileEditor.tsx')).toMatch(/<AgentPhotoControl /)
  })
  it('the control crops in the browser and confirms removal in page (no native confirm)', () => {
    const c = code('components/agent/AgentPhotoControl.tsx')
    expect(c).toMatch(/squarePhoto\(f, AGENT_PHOTO_SIDE\)/)
    expect(c).toMatch(/data-testid="agent-photo-remove-confirm"/)
    expect(c).not.toMatch(/window\.confirm|\bconfirm\(|\balert\(/)
    expect(c).toMatch(/accept="image\/jpeg,image\/png,image\/webp"/)
  })
})
