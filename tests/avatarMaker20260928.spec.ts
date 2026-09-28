// Make-your-own assistant avatar (2026-09-28): a photo or a description →
// OpenAI image model → a transparent WebP in our own public bucket → the
// profile stores a short key. Guards: the key format and the URL it resolves
// to (own bucket only), the renderer, the route's limits / prompt frame /
// storage discipline (the photo is never stored), the migration, the picker
// entry and the maker's two modes.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import React from 'react'
import TestRenderer from 'react-test-renderer'

const read = (p: string) => readFileSync(p, 'utf8')
const UID = '11111111-2222-4333-8444-555555555555'

describe('custom avatar keys resolve only to our own bucket', () => {
  it('isCustomAvatarKey / customAvatarUrl / resolveAvatarKey', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://auth.stayloop.ai'
    const { isCustomAvatarKey, customAvatarUrl, resolveAvatarKey, AssistantAvatar, isAvatarPreset } = await import('../lib/agent/avatars')
    const good = `custom:${UID}/abcdef0123456789`
    expect(isCustomAvatarKey(good)).toBe(true)
    expect(customAvatarUrl(good)).toBe(`https://auth.stayloop.ai/storage/v1/object/public/assistant-avatars/${UID}/abcdef0123456789.webp`)
    expect(resolveAvatarKey(good)).toBe(good)
    expect(isAvatarPreset(good)).toBe(false)
    for (const bad of ['custom:../etc', `custom:${UID}/../x`, 'url:https://evil.example/x.webp', `custom:${UID}/ABC DEF`, 'custom:not-a-uuid/abcdef01', `custom:${UID}/short`]) {
      expect(isCustomAvatarKey(bad), bad).toBe(false)
      expect(customAvatarUrl(bad), bad).toBeNull()
    }
    // renders as an <img> on a neutral disc, tagged custom; presets and orbs are untouched
    const r = TestRenderer.create(React.createElement(AssistantAvatar, { avatar: good, role: 'tenant' }))
    expect(r.root.findByType('span').props['data-avatar']).toBe('custom')
    expect(r.root.findByType('img').props.src).toContain('/assistant-avatars/')
    const pet = TestRenderer.create(React.createElement(AssistantAvatar, { avatar: 'panda', role: 'tenant' }))
    expect(pet.root.findByType('span').props['data-avatar']).toBe('panda')
  })
})

describe('the generation route', () => {
  const r = read('app/api/assistant/avatar/route.ts')
  it('edge, signed-in only, six an hour per user under a site ceiling, both fail-closed', () => {
    expect(r).toContain("export const runtime = 'edge'")
    // never import the 'use client' avatars module into the route: inside a Route Handler its
    // exports become client-reference stubs (first live run: "Bucket name invalid")
    expect(r).not.toContain("from '@/lib/agent/avatars'")
    expect(r).toContain("from '@/lib/agent/avatarKeys'")
    expect(read('lib/agent/avatarKeys.ts')).not.toContain("'use client'")
    expect(r).toContain("if (!ud?.user || ud.user.is_anonymous) return NextResponse.json({ error: 'sign_in_required' }, { status: 401 })")
    expect(r).toContain('const PER_USER_PER_HOUR = 6')
    expect(r).toContain('underHourlyLimit(`avatar-gen:${uid}`, PER_USER_PER_HOUR, false)')
    expect(r).toContain("underHourlyLimit('avatar-gen:global', SITE_PER_HOUR, false)")
  })
  it('gpt-image-1, generations for words and edits (high input fidelity) for a photo, the presets’ frame, transparent WebP', () => {
    expect(r).toContain("const MODEL = 'gpt-image-1'")
    expect(r).toContain("openaiImage(apiKey, 'generations'")
    expect(r).toContain("openaiImage(apiKey, 'edits'")
    expect(r).toContain("fd.append('input_fidelity', 'high')")
    expect(r).toContain("background: 'transparent', output_format: 'webp'")
    expect(r).toMatch(/const FRAME = 'Front-facing bust portrait[^']*No text, no letters, no logos/)
    expect(r).toContain('Keep them recognizable')
    for (const s of ['plush', 'pixar', 'clay', 'memoji']) expect(r).toContain(`${s}:`)
  })
  it('stores only the generated picture in our bucket under <uid>/<id>.webp, returns the short key, prunes earlier tries, accounts usage and audits', () => {
    expect((r.match(/\.upload\(/g) || []).length).toBe(1)
    expect(r).toContain("admin.storage.from(CUSTOM_AVATAR_BUCKET).upload(path, bytes, { contentType: 'image/webp', upsert: false")
    expect(r).toContain('const path = `${uid}/${id}.webp`')
    expect(r).toContain('const key = `custom:${uid}/${id}`')
    expect(r).toContain('if (!isCustomAvatarKey(key))')
    expect(r).toContain('.remove(stale)')
    expect(r).toContain("slot: 'avatar'")
    expect(r).toContain("action: 'assistant_avatar_generated'")
    // the photo blob is only ever appended to the OpenAI form
    expect(r).not.toMatch(/upload\([^)]*photo/)
    expect(r).toContain("if (/moderation|safety|content_policy|not allowed/i.test(body)) return { status: 422, error: 'blocked' }")
  })
})

describe('storage + picker + maker', () => {
  it('migration: the avatar key may be 400 chars; the bucket is public-read with no client write policy', () => {
    const m = read('supabase/migrations/20260928_assistant_avatars_bucket.sql')
    expect(m).toContain('char_length(avatar) <= 400')
    expect(m).toContain("values ('assistant-avatars', 'assistant-avatars', true, 2097152, array['image/webp', 'image/png'])")
    expect(m).not.toMatch(/create policy/i)
  })
  it('the picker shows「自己做的」with a ＋ tile for signed-in accounts and swaps to the maker; the maker has both modes, the four styles, the privacy line and the hourly note', () => {
    const p = read('components/agent/AvatarPicker.tsx')
    expect(p).toContain('data-testid="avatar-make"')
    expect(p).toMatch(/\{live && \(\s*<div className="mb-2">\s*<div[^>]*>\{zh \? '自己做的' : 'Your own'\}/)
    expect(p).toContain('<AvatarMaker role={role} zh={zh} onDone={(k) => { setMaking(false); onPick(k) }} onCancel={() => setMaking(false)} />')
    const m = read('components/agent/AvatarMaker.tsx')
    expect(m).toContain("seg('photo', zh ? '用照片' : 'From a photo')")
    expect(m).toContain("seg('prompt', zh ? '用文字' : 'From words')")
    expect(m).toContain('{AVATAR_STYLES.map((s) => (')
    expect(m).toContain('照片只用于这一次生成，不会保存')
    expect(m).toContain('每小时最多 6 次')
    expect(m).toContain("fetch('/api/assistant/avatar', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd })")
    expect(m).toContain('data-testid="avatar-use"')
    expect(m).toContain('downscalePhoto(f)')
    expect(read('lib/agent/avatarImage.ts')).toContain('export const AVATAR_PHOTO_MAX_SIDE = 1024')
    expect(read('lib/agent/ideas.ts')).toContain('assistant_avatar_generated:')
  })
  it('every style has both labels', async () => {
    const { AVATAR_STYLES, AVATAR_STYLE_LABEL } = await import('../lib/agent/avatarImage')
    for (const s of AVATAR_STYLES) { expect(AVATAR_STYLE_LABEL[s].zh).toBeTruthy(); expect(AVATAR_STYLE_LABEL[s].en).toBeTruthy() }
  })
})
