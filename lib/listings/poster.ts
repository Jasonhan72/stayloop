// The QR poster of one listing (分享包 v2, 2026-10-26): 1080×1350 SVG with the
// address, rent, size, availability and a QR code of that channel's short
// link. Server-side (qrcode runs in the route); carries only what the public
// listing page shows.
import { toString as qrSvg } from 'qrcode'

const TYPE: Record<string, { zh: string; en: string }> = {
  condo: { zh: '公寓', en: 'Condo' }, apartment: { zh: '公寓', en: 'Apartment' }, house: { zh: '独立屋', en: 'House' },
  townhouse: { zh: '联排', en: 'Townhouse' }, basement: { zh: '地下室单元', en: 'Basement unit' }, room: { zh: '单间', en: 'Room' },
}
export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export type PosterListing = { address: string; unit: string | null; city: string | null; monthly_rent: number | null; bedrooms: number | null; bathrooms: number | null; sqft: number | null; property_type: string | null; available_date: string | null; is_test: boolean | null }
export type QrPath = { d: string; n: number }

/** The modules of a QR code as one SVG path on a 0..n grid (qrcode's own svg renderer, stripped to the path). */
export async function qrPath(text: string): Promise<QrPath> {
  const svg = await qrSvg(text, { type: 'svg', errorCorrectionLevel: 'M', margin: 0 })
  const n = Number(/viewBox="0 0 (\d+) \d+"/.exec(svg)?.[1] ?? 0)
  const d = /<path stroke="#000000" d="([^"]+)"/.exec(svg)?.[1] ?? ''
  return { d, n }
}

export function posterSvg(l: PosterListing, url: string, lang: 'zh' | 'en', qr: QrPath): string {
  const zh = lang === 'zh'
  const type = l.property_type ? TYPE[l.property_type]?.[lang] ?? '' : ''
  const specs = [
    l.bedrooms != null ? (zh ? `${l.bedrooms} 卧` : `${l.bedrooms} bd`) : '',
    l.bathrooms != null ? (zh ? `${l.bathrooms} 卫` : `${l.bathrooms} ba`) : '',
    l.sqft ? `${l.sqft} sqft` : '',
    type,
  ].filter(Boolean).join(' · ')
  const rent = l.monthly_rent != null ? `$${l.monthly_rent.toLocaleString()}` : ''
  const where = `${l.address}${l.unit ? (zh ? ` · ${l.unit} 单元` : ` · Unit ${l.unit}`) : ''}`
  const city = l.city && !l.address.toLowerCase().includes(l.city.toLowerCase()) ? l.city : ''
  const avail = l.available_date ? (zh ? `可入住 ${l.available_date}` : `Available ${l.available_date}`) : ''
  const qrSize = 440
  const scale = qr.n ? qrSize / qr.n : 1
  const qrX = (1080 - qrSize) / 2
  const font = "font-family=\"Inter Tight, 'PingFang SC', 'Microsoft YaHei', Helvetica, Arial, sans-serif\""
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
  <rect width="1080" height="1350" fill="#FFFFFF"/>
  <rect width="1080" height="18" fill="#00ACE4"/>
  <text x="80" y="110" ${font} font-size="34" font-weight="700" fill="#1B1B3C">stayloop<tspan fill="#00ACE4">.ai</tspan></text>
  <text x="1000" y="110" ${font} font-size="30" font-weight="600" fill="#6B7280" text-anchor="end">${zh ? '出租' : 'FOR RENT'}</text>
  ${l.is_test ? `<text x="80" y="165" ${font} font-size="24" font-weight="700" fill="#9F1239">${zh ? '测试房源 · 非实际房源' : 'TEST LISTING · NOT A REAL RENTAL'}</text>` : ''}
  <text x="80" y="260" ${font} font-size="54" font-weight="700" fill="#1B1B3C">${esc(where)}</text>
  ${city ? `<text x="80" y="320" ${font} font-size="36" fill="#4B5563">${esc(city)}</text>` : ''}
  ${rent ? `<text x="80" y="430" ${font} font-size="96" font-weight="700" fill="#1B1B3C">${esc(rent)}<tspan font-size="40" font-weight="500" fill="#6B7280">${zh ? ' /月' : ' /mo'}</tspan></text>` : ''}
  ${specs ? `<text x="80" y="500" ${font} font-size="36" fill="#1B1B3C">${esc(specs)}</text>` : ''}
  ${avail ? `<text x="80" y="556" ${font} font-size="32" fill="#4B5563">${esc(avail)}</text>` : ''}
  <rect x="${qrX - 30}" y="610" width="${qrSize + 60}" height="${qrSize + 60}" rx="28" fill="#F3F8FB"/>
  <g transform="translate(${qrX} 640) scale(${scale})"><path d="${qr.d}" stroke="#1B1B3C" stroke-width="1" fill="none"/></g>
  <text x="540" y="1180" ${font} font-size="40" font-weight="700" fill="#1B1B3C" text-anchor="middle">${zh ? '扫码看房 · 提问 · 申请' : 'Scan to view · ask · apply'}</text>
  <text x="540" y="1236" ${font} font-size="28" fill="#4B5563" text-anchor="middle">${esc(url)}</text>
  <text x="540" y="1300" ${font} font-size="22" fill="#9CA3AF" text-anchor="middle">${zh ? '看房、提问、申请都在 Stayloop 房源页完成' : 'Viewings, questions and applications happen on the Stayloop listing page'}</text>
</svg>`
}
