// Cartoon avatars for the seeded "[TEST]" entries in 「找经纪和服务商」 (2026-11-23).
// Original flat illustrations, drawn here from a handful of parts (background, clothes, head, hair,
// face, one accessory, a small trade badge) so the set reads as one family. No photo of a real
// person and no third-party artwork. `avatarSvg(spec)` returns a 512×512 SVG string;
// scripts/demo/seed-directory.mjs rasterises them to WebP and uploads them.
//
//   node scripts/demo/avatars.mjs <out-dir>     writes <id>.svg for every entry of AVATARS

const INK = '#2B2540'

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16)
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(v * f))))
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('')
}

const TORSO = 'M 84 512 C 84 424 146 384 212 374 C 232 392 280 392 300 374 C 366 384 428 424 428 512 Z'

function backHair(style, hair) {
  if (style === 'long') return `<path d="M 138 244 C 126 128 196 86 256 86 C 316 86 386 128 374 244 L 384 396 C 360 420 318 416 304 388 L 208 388 C 194 416 152 420 128 396 Z" fill="${hair}"/>`
  if (style === 'bob') return `<rect x="134" y="96" width="244" height="268" rx="114" fill="${hair}"/>`
  if (style === 'pony') return `<path d="M 336 132 C 404 136 420 214 392 300 C 376 262 356 228 338 200 Z" fill="${hair}"/>`
  return ''
}

function frontHair(style, hair) {
  const short = `<path d="M 160 232 C 150 142 200 104 256 104 C 312 104 362 142 352 232 C 340 196 318 172 256 172 C 194 172 172 196 160 232 Z" fill="${hair}"/>`
  const side = `<path d="M 160 236 C 146 140 202 100 262 102 C 322 104 366 146 352 236 C 344 204 330 184 308 172 C 270 204 208 206 180 190 C 168 204 162 220 160 236 Z" fill="${hair}"/>`
  const fringe = `<path d="M 160 240 C 150 150 198 108 256 108 C 314 108 362 150 352 240 C 340 196 302 172 256 180 C 210 172 172 196 160 240 Z" fill="${hair}"/>`
  switch (style) {
    case 'short': return short
    case 'pony': return short
    case 'side': return side
    case 'long': return side
    case 'bob': return fringe
    case 'bun': return `<circle cx="256" cy="86" r="40" fill="${hair}"/>` + short
    case 'buzz': return `<path d="M 164 214 C 160 150 204 118 256 118 C 308 118 352 150 348 214 C 334 180 306 160 256 160 C 206 160 178 180 164 214 Z" fill="${hair}" opacity=".9"/>`
    case 'curly': return `<g fill="${hair}"><ellipse cx="256" cy="152" rx="90" ry="48"/><circle cx="174" cy="200" r="30"/><circle cx="186" cy="152" r="34"/><circle cx="222" cy="120" r="36"/><circle cx="264" cy="110" r="38"/><circle cx="306" cy="124" r="36"/><circle cx="336" cy="160" r="32"/><circle cx="342" cy="204" r="28"/></g>`
    default: return ''
  }
}

function torsoLayers(top, c, c2, skinD, tie) {
  const neck = `<rect x="220" y="296" width="72" height="96" rx="30" fill="${skinD}"/>`
  const clip = `<clipPath id="torso"><path d="${TORSO}"/></clipPath>`
  if (top === 'tee') return `<path d="${TORSO}" fill="${c}"/>${neck}<path d="M 212 374 C 232 398 280 398 300 374" fill="none" stroke="${shade(c, 0.82)}" stroke-width="8" stroke-linecap="round"/>`
  if (top === 'shirt') return `<path d="${TORSO}" fill="${c}"/>${neck}<path d="M 212 374 L 256 412 L 226 436 Z" fill="${c2}"/><path d="M 300 374 L 256 412 L 286 436 Z" fill="${c2}"/><circle cx="256" cy="446" r="6" fill="${shade(c, 0.78)}"/><circle cx="256" cy="482" r="6" fill="${shade(c, 0.78)}"/>`
  if (top === 'blazer') {
    return `<path d="${TORSO}" fill="${c}"/><path d="M 212 376 L 256 480 L 300 376 C 280 394 232 394 212 376 Z" fill="${c2}"/>${neck}`
      + (tie ? `<path d="M 244 400 L 268 400 L 264 420 L 248 420 Z" fill="${shade(tie, 0.82)}"/><path d="M 248 420 L 264 420 L 272 462 L 256 480 L 240 462 Z" fill="${tie}"/>` : '')
      + `<path d="M 210 376 L 256 480 L 222 470 L 186 404 Z" fill="${shade(c, 0.84)}"/><path d="M 302 376 L 256 480 L 290 470 L 326 404 Z" fill="${shade(c, 0.84)}"/>`
  }
  if (top === 'overalls') {
    return `${clip}<path d="${TORSO}" fill="${c2}"/>${neck}<path d="M 212 374 C 232 398 280 398 300 374" fill="none" stroke="${shade(c2, 0.84)}" stroke-width="8" stroke-linecap="round"/>`
      + `<g clip-path="url(#torso)"><path d="M 186 384 L 214 378 L 232 452 L 204 452 Z" fill="${c}"/><path d="M 326 384 L 298 378 L 280 452 L 308 452 Z" fill="${c}"/><rect x="190" y="436" width="132" height="90" rx="14" fill="${c}"/><rect x="232" y="462" width="48" height="34" rx="8" fill="${shade(c, 0.86)}"/></g>`
      + `<circle cx="210" cy="450" r="8" fill="#FBBF24"/><circle cx="302" cy="450" r="8" fill="#FBBF24"/>`
  }
  if (top === 'vest') {
    return `${clip}<path d="${TORSO}" fill="${c}"/><path d="M 212 376 L 256 462 L 300 376 C 280 394 232 394 212 376 Z" fill="${c2}"/>${neck}`
      + `<g clip-path="url(#torso)" fill="#FEF08A"><rect x="158" y="396" width="24" height="130"/><rect x="330" y="396" width="24" height="130"/><rect x="80" y="476" width="352" height="22"/></g>`
  }
  if (top === 'camera') {
    return `<path d="${TORSO}" fill="${c}"/>${neck}<path d="M 212 374 C 232 398 280 398 300 374" fill="none" stroke="${shade(c, 0.82)}" stroke-width="8" stroke-linecap="round"/>`
      + `<path d="M 204 382 L 236 462 M 308 382 L 276 462" stroke="#374151" stroke-width="9" stroke-linecap="round"/><rect x="200" y="446" width="112" height="72" rx="14" fill="#374151"/><rect x="222" y="434" width="36" height="18" rx="6" fill="#374151"/><circle cx="256" cy="486" r="25" fill="#111827" stroke="#D1D5DB" stroke-width="6"/><circle cx="256" cy="486" r="10" fill="#60A5FA"/><circle cx="296" cy="460" r="5" fill="#F87171"/>`
  }
  return `<path d="${TORSO}" fill="${c}"/>${neck}`
}

const BADGES = {
  drop: `<path d="M 414 374 C 440 408 448 424 448 436 A 34 34 0 0 1 380 436 C 380 424 388 408 414 374 Z" fill="#0EA5E9"/><path d="M 396 436 A 18 18 0 0 0 410 452" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" opacity=".75"/>`,
  bolt: `<polygon points="426,370 386,422 410,422 400,458 442,404 418,404" fill="#F59E0B"/>`,
  wrench: `<g transform="rotate(40 414 414)"><rect x="405" y="398" width="18" height="62" rx="9" fill="#64748B"/><circle cx="414" cy="388" r="22" fill="#64748B"/><rect x="405" y="362" width="18" height="26" rx="3" fill="#fff"/></g>`,
  key: `<circle cx="394" cy="414" r="17" fill="none" stroke="#B45309" stroke-width="11"/><rect x="408" y="408" width="46" height="12" rx="6" fill="#B45309"/><rect x="432" y="416" width="9" height="16" rx="3" fill="#B45309"/><rect x="446" y="416" width="8" height="12" rx="3" fill="#B45309"/>`,
  camera: `<rect x="380" y="394" width="68" height="48" rx="11" fill="#7C3AED"/><rect x="396" y="384" width="24" height="16" rx="5" fill="#7C3AED"/><circle cx="414" cy="418" r="15" fill="#fff"/><circle cx="414" cy="418" r="8" fill="#7C3AED"/>`,
  plan: `<rect x="382" y="384" width="64" height="60" rx="7" fill="#F5F3FF" stroke="#7C3AED" stroke-width="7"/><path d="M 382 410 H 412 V 444 M 412 424 H 446 M 428 384 V 404" stroke="#7C3AED" stroke-width="6" fill="none" stroke-linecap="round"/>`,
  shield: `<path d="M 414 374 L 448 388 V 416 C 448 440 432 452 414 458 C 396 452 380 440 380 416 V 388 Z" fill="#059669"/><path d="M 399 416 L 411 428 L 431 404" stroke="#fff" stroke-width="8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  scales: `<path d="M 414 378 V 450 M 394 452 H 434 M 384 394 H 444" stroke="#1D4ED8" stroke-width="7" stroke-linecap="round" fill="none"/><path d="M 370 422 L 384 396 L 398 422 A 14 10 0 0 1 370 422 Z" fill="#1D4ED8"/><path d="M 430 422 L 444 396 L 458 422 A 14 10 0 0 1 430 422 Z" fill="#1D4ED8"/>`,
  doc: `<rect x="388" y="374" width="52" height="68" rx="8" fill="#DB2777"/><path d="M 399 394 H 429 M 399 408 H 429 M 399 422 H 418" stroke="#fff" stroke-width="6" stroke-linecap="round"/><circle cx="440" cy="442" r="15" fill="#fff"/><path d="M 432 442 L 438 448 L 448 436" stroke="#DB2777" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  house: `<path d="M 378 418 L 414 382 L 450 418 V 450 H 378 Z" fill="#2563EB"/><path d="M 370 420 L 414 376 L 458 420" fill="none" stroke="#1E3A8A" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/><rect x="405" y="424" width="18" height="26" rx="3" fill="#fff"/>`,
}

/**
 * @param {{ bg: string, bg2: string, skin: string, hair: string, hairStyle: string, top: string, c: string, c2?: string, tie?: string,
 *           hat?: 'hard'|'cap', hatColor?: string, glasses?: boolean, beard?: boolean, headset?: boolean, earrings?: string, mouth?: 'smile'|'open', badge?: keyof typeof BADGES }} s
 */
export function avatarSvg(s) {
  const skinD = shade(s.skin, 0.86)
  const brow = shade(s.hair, 0.7)
  const out = []
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">`)
  out.push(`<rect width="512" height="512" fill="${s.bg}"/>`)
  out.push(`<circle cx="402" cy="112" r="156" fill="${s.bg2}" opacity=".6"/><circle cx="84" cy="436" r="124" fill="${s.bg2}" opacity=".45"/>`)
  out.push(backHair(s.hairStyle, s.hair))
  out.push(torsoLayers(s.top, s.c, s.c2 || '#FFFFFF', skinD, s.tie))
  // ears, head
  out.push(`<circle cx="166" cy="246" r="18" fill="${s.skin}"/><circle cx="346" cy="246" r="18" fill="${s.skin}"/><circle cx="166" cy="246" r="8" fill="${skinD}"/><circle cx="346" cy="246" r="8" fill="${skinD}"/>`)
  if (s.earrings) out.push(`<circle cx="164" cy="270" r="7" fill="${s.earrings}"/><circle cx="348" cy="270" r="7" fill="${s.earrings}"/>`)
  out.push(`<rect x="166" y="130" width="180" height="206" rx="88" fill="${s.skin}"/>`)
  if (s.beard) out.push(`<path d="M 172 256 C 168 334 210 360 256 360 C 302 360 344 334 340 256 C 326 290 298 282 256 282 C 214 282 186 290 172 256 Z" fill="${s.hair}"/><ellipse cx="256" cy="304" rx="32" ry="17" fill="${s.skin}"/>`)
  out.push(frontHair(s.hairStyle, s.hair))
  if (s.hat === 'hard') out.push(`<path d="M 150 172 C 150 96 202 66 256 66 C 310 66 362 96 362 172 Z" fill="${s.hatColor || '#FBBF24'}"/><rect x="242" y="60" width="28" height="112" rx="14" fill="${shade(s.hatColor || '#FBBF24', 1.12)}"/><rect x="124" y="160" width="264" height="26" rx="13" fill="${shade(s.hatColor || '#FBBF24', 0.86)}"/>`)
  if (s.hat === 'cap') out.push(`<path d="M 156 174 C 156 102 204 76 256 76 C 308 76 356 102 356 174 Z" fill="${s.hatColor || '#2563EB'}"/><rect x="150" y="160" width="268" height="26" rx="13" fill="${shade(s.hatColor || '#2563EB', 0.8)}"/><circle cx="256" cy="122" r="16" fill="#fff" opacity=".92"/>`)
  // face
  out.push(`<path d="M 204 222 Q 222 210 240 222" fill="none" stroke="${brow}" stroke-width="7" stroke-linecap="round"/><path d="M 272 222 Q 290 210 308 222" fill="none" stroke="${brow}" stroke-width="7" stroke-linecap="round"/>`)
  out.push(`<ellipse cx="222" cy="250" rx="9" ry="11" fill="${INK}"/><ellipse cx="290" cy="250" rx="9" ry="11" fill="${INK}"/><circle cx="225" cy="246" r="3.2" fill="#fff"/><circle cx="293" cy="246" r="3.2" fill="#fff"/>`)
  out.push(`<path d="M 256 262 q -7 14 5 18" fill="none" stroke="${skinD}" stroke-width="6" stroke-linecap="round"/>`)
  out.push(`<circle cx="198" cy="284" r="16" fill="#FF6B6B" opacity=".26"/><circle cx="314" cy="284" r="16" fill="#FF6B6B" opacity=".26"/>`)
  out.push(s.mouth === 'open'
    ? `<path d="M 230 292 Q 256 328 282 292 Z" fill="#7A2233"/><path d="M 236 294 Q 256 302 276 294" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round"/>`
    : `<path d="M 232 296 Q 256 320 280 296" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>`)
  if (s.glasses) out.push(`<g fill="rgba(255,255,255,.2)" stroke="${INK}" stroke-width="6"><circle cx="222" cy="250" r="28"/><circle cx="290" cy="250" r="28"/></g><path d="M 250 250 H 262 M 194 246 L 170 240 M 318 246 L 342 240" stroke="${INK}" stroke-width="6" stroke-linecap="round" fill="none"/>`)
  if (s.headset) out.push(`<path d="M 152 240 C 148 100 364 100 360 240" fill="none" stroke="#374151" stroke-width="13" stroke-linecap="round"/><rect x="134" y="220" width="32" height="60" rx="14" fill="#374151"/><rect x="346" y="220" width="32" height="60" rx="14" fill="#374151"/><path d="M 150 278 Q 158 326 214 322" fill="none" stroke="#374151" stroke-width="7" stroke-linecap="round"/><circle cx="220" cy="322" r="9" fill="#374151"/>`)
  if (s.badge && BADGES[s.badge]) out.push(`<circle cx="414" cy="414" r="66" fill="#fff"/><circle cx="414" cy="414" r="66" fill="none" stroke="${shade(s.bg, 0.8)}" stroke-width="6" opacity=".5"/>${BADGES[s.badge]}`)
  out.push(`</svg>`)
  return out.join('')
}

const SKIN = { a: '#FFDCC2', b: '#F6C9A4', c: '#E3AC84', d: '#BC7F58', e: '#8C5A3B' }

/** id → spec. The ids are what the seed script refers to. */
export const AVATARS = {
  // 经纪
  'agent-person': { bg: '#DCEBFF', bg2: '#BFD8FF', skin: SKIN.b, hair: '#2F2A3A', hairStyle: 'long', top: 'blazer', c: '#1E3A8A', c2: '#FFFFFF', earrings: '#FBBF24', badge: 'house' },
  'agent-muse': { bg: '#D9F5EC', bg2: '#B4EAD8', skin: SKIN.c, hair: '#3B2A20', hairStyle: 'short', top: 'blazer', c: '#0F766E', c2: '#FFFFFF', tie: '#F59E0B', glasses: true, badge: 'key' },
  // 维修服务
  'repair-northline': { bg: '#FFE8D6', bg2: '#FFD0AE', skin: SKIN.d, hair: '#1F1B24', hairStyle: 'buzz', top: 'vest', c: '#F97316', c2: '#334155', hat: 'hard', mouth: 'open', badge: 'wrench' },
  'repair-muse': { bg: '#FFF4C7', bg2: '#FFE58A', skin: SKIN.a, hair: '#B45309', hairStyle: 'pony', top: 'overalls', c: '#2563EB', c2: '#F8FAFC', hat: 'cap', hatColor: '#1D4ED8', badge: 'bolt' },
  'repair-maple': { bg: '#DDF1FF', bg2: '#B8E0FF', skin: SKIN.b, hair: '#6B3A1E', hairStyle: 'short', top: 'overalls', c: '#B91C1C', c2: '#F8FAFC', hat: 'cap', hatColor: '#DC2626', beard: true, badge: 'drop' },
  // 专业服务 · 房源摄影 / 户型图
  'photo-a': { bg: '#EDE4FF', bg2: '#D6C4FF', skin: SKIN.e, hair: '#1B1622', hairStyle: 'curly', top: 'camera', c: '#111827', mouth: 'open', badge: 'camera' },
  'photo-b': { bg: '#FFE3EF', bg2: '#FFC4DC', skin: SKIN.a, hair: '#D97706', hairStyle: 'bun', top: 'tee', c: '#7C3AED', glasses: true, badge: 'plan' },
  // 专业服务 · 保险经纪
  'insure-a': { bg: '#DDF7E6', bg2: '#B7EDCB', skin: SKIN.c, hair: '#111827', hairStyle: 'bob', top: 'blazer', c: '#065F46', c2: '#FFFFFF', earrings: '#F472B6', badge: 'shield' },
  'insure-b': { bg: '#E3F2F5', bg2: '#BFE3EA', skin: SKIN.a, hair: '#9CA3AF', hairStyle: 'side', top: 'blazer', c: '#334155', c2: '#E0F2FE', tie: '#059669', glasses: true, headset: true, badge: 'shield' },
  // 专业服务 · 持牌 Paralegal
  'para-a': { bg: '#FFE4F1', bg2: '#FFC7E0', skin: SKIN.d, hair: '#231A1E', hairStyle: 'long', top: 'blazer', c: '#9D174D', c2: '#FFFFFF', earrings: '#FDE68A', badge: 'doc' },
  'para-b': { bg: '#FFEFD9', bg2: '#FFDCAE', skin: SKIN.e, hair: '#15121A', hairStyle: 'buzz', top: 'shirt', c: '#F8FAFC', c2: '#E2E8F0', beard: true, glasses: true, badge: 'doc' },
  // 专业服务 · 律师
  'law-a': { bg: '#E1E8FF', bg2: '#C3D0FF', skin: SKIN.b, hair: '#D1D5DB', hairStyle: 'side', top: 'blazer', c: '#111827', c2: '#FFFFFF', tie: '#B91C1C', glasses: true, badge: 'scales' },
  'law-b': { bg: '#F3E8D8', bg2: '#E7D1B0', skin: SKIN.c, hair: '#4A2B1A', hairStyle: 'bun', top: 'blazer', c: '#7F1D1D', c2: '#FFF7ED', earrings: '#FBBF24', badge: 'scales' },
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { mkdirSync, writeFileSync } = await import('node:fs')
  const dir = process.argv[2]
  if (!dir) { console.error('usage: node scripts/demo/avatars.mjs <out-dir>'); process.exit(2) }
  mkdirSync(dir, { recursive: true })
  for (const [id, spec] of Object.entries(AVATARS)) writeFileSync(`${dir}/${id}.svg`, avatarSvg(spec))
  console.log(`${Object.keys(AVATARS).length} avatars → ${dir}`)
}
