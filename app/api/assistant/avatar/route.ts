// POST /api/assistant/avatar — make the assistant's face (2026-09-28).
//
// Two modes: JSON { mode: 'prompt', prompt, style } or multipart
// (mode=photo, style, prompt?, image=<file>). Signed-in users only; six
// generations an hour each (each costs money) under a site-wide ceiling. The
// picture comes from OpenAI's gpt-image-1 — generations for a description,
// edits for a photo (high input fidelity keeps the person recognizable) —
// 1024², transparent WebP, the same framing as the built-in presets. It is
// stored in the public `assistant-avatars` bucket under <uid>/<id>.webp and
// the response carries the short key the profile stores (`custom:<uid>/<id>`;
// lib/agent/avatars.tsx builds the URL from our own storage host). The
// uploaded photo goes to the model once and is never written anywhere. Usage
// lands in ai_usage (slot 'avatar') and the event in the user's audit log.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { underHourlyLimit } from '@/lib/rateLimit'
import { AVATAR_PROMPT_MAX, AVATAR_STYLES, type AvatarStyle } from '@/lib/agent/avatarImage'
import { CUSTOM_AVATAR_BUCKET, isCustomAvatarKey } from '@/lib/agent/avatarKeys'

export const runtime = 'edge'

const MODEL = 'gpt-image-1'
const PER_USER_PER_HOUR = 6
const SITE_PER_HOUR = 240
const MAX_PHOTO_BYTES = 4 * 1024 * 1024
// USD per 1M tokens (OpenAI list price for gpt-image-1): text in / image in / image out.
const PRICE = { text_in: 5, image_in: 10, out: 40 }

const STYLE_WORDS: Record<AvatarStyle, string> = {
  plush: 'a cute plush toy: soft fluffy fur or felt, chubby round head, tiny black bead eyes with a bright highlight, gentle smile, rosy blush cheeks',
  pixar: 'a Pixar-style 3D animated character: big expressive eyes, soft subsurface-scattering skin, a friendly warm smile, clean stylized shapes',
  clay: 'a handmade clay figurine: matte polymer clay, softly finger-smoothed surfaces, simple rounded forms, tiny charming imperfections',
  memoji: 'an Apple Memoji-like 3D avatar: smooth glossy surfaces, simplified friendly features, large eyes',
}
// Same frame as the forty presets, so a made face sits on the 28px orb and the 72px panel alike.
const FRAME = 'Front-facing bust portrait, perfectly centered, looking at the camera, kawaii-friendly, 3D render, soft studio lighting, subtle rim light, isolated on a fully transparent background. No text, no letters, no logos, no watermark, no props, no frame, no border, a single subject only.'

function cleanText(raw: unknown): string {
  return String(raw ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, AVATAR_PROMPT_MAX)
}
function buildPrompt(mode: 'prompt' | 'photo', style: AvatarStyle, text: string): string {
  if (mode === 'prompt') return `Create ${STYLE_WORDS[style]} of: ${text}. ${FRAME}`
  return `Turn the person in this photo into ${STYLE_WORDS[style]}. Keep them recognizable — hairstyle and hair colour, glasses, facial hair, skin tone, face shape and expression — but render a stylized character, not a photograph.${text ? ` Also: ${text}.` : ''} ${FRAME}`
}

type Usage = { text_in: number; image_in: number; out: number }
type Gen = { ok: true; b64: string; usage: Usage } | { ok: false; status: number; error: string }

function parseUsage(j: Record<string, unknown>): Usage {
  const u = (j.usage ?? {}) as { input_tokens?: number; output_tokens?: number; input_tokens_details?: { image_tokens?: number; text_tokens?: number } }
  const image_in = u.input_tokens_details?.image_tokens ?? 0
  const text_in = u.input_tokens_details?.text_tokens ?? Math.max(0, (u.input_tokens ?? 0) - image_in)
  return { text_in, image_in, out: u.output_tokens ?? 0 }
}
function classify(status: number, body: string): { status: number; error: string } {
  if (/moderation|safety|content_policy|not allowed/i.test(body)) return { status: 422, error: 'blocked' }
  if (status === 429) return { status: 503, error: 'busy' }
  return { status: 502, error: 'generation_failed' }
}

async function openaiImage(key: string, kind: 'generations' | 'edits', body: BodyInit, headers: Record<string, string>): Promise<Gen> {
  const r = await fetch(`https://api.openai.com/v1/images/${kind}`, { method: 'POST', headers: { Authorization: `Bearer ${key}`, ...headers }, body, signal: AbortSignal.timeout(100_000) })
  const text = await r.text()
  if (!r.ok) return { ok: false, ...classify(r.status, text) }
  let j: Record<string, unknown>
  try { j = JSON.parse(text) as Record<string, unknown> } catch { return { ok: false, status: 502, error: 'generation_failed' } }
  const b64 = (j.data as { b64_json?: string }[] | undefined)?.[0]?.b64_json
  if (!b64) return { ok: false, status: 502, error: 'generation_failed' }
  return { ok: true, b64, usage: parseUsage(j) }
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export async function POST(req: Request) {
  const authHeader = (req.headers.get('authorization') || '').replace(/[^\x20-\x7E]/g, '').trim()
  if (!authHeader) return NextResponse.json({ error: 'sign_in_required' }, { status: 401 })
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: ud } = await sb.auth.getUser()
  if (!ud?.user || ud.user.is_anonymous) return NextResponse.json({ error: 'sign_in_required' }, { status: 401 })
  const uid = ud.user.id
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'not_configured' }, { status: 503 })

  // ---- input: JSON (description) or multipart (photo)
  let mode: 'prompt' | 'photo'
  let style: AvatarStyle = 'plush'
  let text = ''
  let photo: Blob | null = null
  let photoName = 'photo.jpg'
  const ct = req.headers.get('content-type') || ''
  try {
    if (ct.includes('multipart/form-data')) {
      const fd = await req.formData()
      mode = 'photo'
      const s = String(fd.get('style') ?? 'plush')
      if ((AVATAR_STYLES as readonly string[]).includes(s)) style = s as AvatarStyle
      text = cleanText(fd.get('prompt'))
      const f = fd.get('image')
      if (!(f instanceof Blob) || f.size === 0) return NextResponse.json({ error: 'photo_required' }, { status: 400 })
      if (f.size > MAX_PHOTO_BYTES) return NextResponse.json({ error: 'photo_too_large' }, { status: 413 })
      if (!/^image\/(jpeg|png|webp)$/.test(f.type)) return NextResponse.json({ error: 'photo_type' }, { status: 415 })
      photo = f
      photoName = f.type === 'image/png' ? 'photo.png' : f.type === 'image/webp' ? 'photo.webp' : 'photo.jpg'
    } else {
      const j = (await req.json()) as { mode?: string; prompt?: string; style?: string }
      mode = 'prompt'
      if (j.mode && j.mode !== 'prompt') return NextResponse.json({ error: 'bad_mode' }, { status: 400 })
      if (j.style && (AVATAR_STYLES as readonly string[]).includes(j.style)) style = j.style as AvatarStyle
      text = cleanText(j.prompt)
      if (text.length < 2) return NextResponse.json({ error: 'prompt_required' }, { status: 400 })
    }
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }

  // ---- limits (fail-closed: every generation costs money)
  if (!(await underHourlyLimit(`avatar-gen:${uid}`, PER_USER_PER_HOUR, false))) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  if (!(await underHourlyLimit('avatar-gen:global', SITE_PER_HOUR, false))) return NextResponse.json({ error: 'busy' }, { status: 503 })

  // ---- generate
  const prompt = buildPrompt(mode, style, text)
  const t0 = Date.now()
  let gen: Gen
  if (mode === 'photo' && photo) {
    const form = (fidelity: boolean) => {
      const fd = new FormData()
      fd.append('model', MODEL); fd.append('prompt', prompt); fd.append('n', '1'); fd.append('size', '1024x1024'); fd.append('quality', 'medium')
      fd.append('background', 'transparent'); fd.append('output_format', 'webp'); fd.append('output_compression', '75')
      if (fidelity) fd.append('input_fidelity', 'high')
      fd.append('image', photo as Blob, photoName)
      return fd
    }
    gen = await openaiImage(apiKey, 'edits', form(true), {})
    // Older deployments of the edits endpoint reject the fidelity flag — the picture is still worth making.
    if (!gen.ok && gen.error === 'generation_failed') gen = await openaiImage(apiKey, 'edits', form(false), {})
  } else {
    gen = await openaiImage(apiKey, 'generations', JSON.stringify({ model: MODEL, prompt, n: 1, size: '1024x1024', quality: 'medium', background: 'transparent', output_format: 'webp', output_compression: 75, moderation: 'auto' }), { 'Content-Type': 'application/json' })
  }
  const latency = Date.now() - t0
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const usageRow = (ok: boolean, usage: Usage | null, error: string | null) => admin.from('ai_usage').insert({
    user_id: uid, slot: 'avatar', source: `assistant_avatar_${mode}`, provider: 'openai', model: MODEL,
    input_tokens: usage ? usage.text_in + usage.image_in : 0, output_tokens: usage ? usage.out : 0, cache_read_tokens: 0, cache_write_tokens: 0,
    cost_usd: usage ? (usage.text_in * PRICE.text_in + usage.image_in * PRICE.image_in + usage.out * PRICE.out) / 1e6 : 0,
    latency_ms: latency, ok, error,
  }).then(() => undefined, () => undefined)
  if (!gen.ok) {
    await usageRow(false, null, gen.error)
    return NextResponse.json({ error: gen.error }, { status: gen.status })
  }

  // ---- store the result (only the generated picture — never the photo)
  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 16)
  const path = `${uid}/${id}.webp`
  const bytes = base64ToBytes(gen.b64)
  const { error: upErr } = await admin.storage.from(CUSTOM_AVATAR_BUCKET).upload(path, bytes, { contentType: 'image/webp', upsert: false, cacheControl: '31536000' })
  if (upErr) {
    await usageRow(true, gen.usage, `store: ${upErr.message}`)
    return NextResponse.json({ error: 'store_failed' }, { status: 500 })
  }
  const key = `custom:${uid}/${id}`
  if (!isCustomAvatarKey(key)) return NextResponse.json({ error: 'store_failed' }, { status: 500 })
  const url = admin.storage.from(CUSTOM_AVATAR_BUCKET).getPublicUrl(path).data.publicUrl
  const cost = (gen.usage.text_in * PRICE.text_in + gen.usage.image_in * PRICE.image_in + gen.usage.out * PRICE.out) / 1e6

  // Keep the folder small: the saved face + this one; earlier tries go.
  try {
    const [{ data: prof }, { data: files }] = await Promise.all([
      admin.from('assistant_profiles').select('avatar').eq('user_id', uid).maybeSingle(),
      admin.storage.from(CUSTOM_AVATAR_BUCKET).list(uid, { limit: 100 }),
    ])
    const savedId = (prof as { avatar?: string | null } | null)?.avatar?.startsWith(`custom:${uid}/`) ? String(prof!.avatar).split('/')[1] : null
    const stale = (files ?? []).map((f) => f.name).filter((n) => n !== `${id}.webp` && n !== (savedId ? `${savedId}.webp` : '')).map((n) => `${uid}/${n}`)
    if (stale.length) await admin.storage.from(CUSTOM_AVATAR_BUCKET).remove(stale)
  } catch { /* best effort */ }

  await Promise.all([
    usageRow(true, gen.usage, null),
    admin.from('agent_audit_events').insert({
      actor_id: uid, actor_type: 'user', action: 'assistant_avatar_generated', target_type: 'assistant_profile', target_id: uid,
      metadata: { mode, style, cost_usd: Number(cost.toFixed(4)), latency_ms: latency, bytes: bytes.length },
    }).then(() => undefined, () => undefined),
  ])
  return NextResponse.json({ ok: true, key, url, cost_usd: Number(cost.toFixed(4)) })
}
