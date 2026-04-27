'use client'
// -----------------------------------------------------------------------------
// Network-effect hub-and-spoke diagram for the homepage
// -----------------------------------------------------------------------------
// Five nodes around a Stayloop hub: Tenant / Landlord / Broker / Insurer.
// Pure SVG so it scales cleanly and respects light backgrounds.
// -----------------------------------------------------------------------------

import { v3 } from '@/lib/brand'

interface Props {
  lang: 'zh' | 'en'
}

const NODES: Array<{ key: string; zh: string; en: string; cx: number; cy: number }> = [
  { key: 't', zh: '租客', en: 'Tenant', cx: 70, cy: 70 },
  { key: 'l', zh: '房东', en: 'Landlord', cx: 280, cy: 70 },
  { key: 'b', zh: '经纪', en: 'Broker', cx: 70, cy: 220 },
  { key: 'i', zh: '保险', en: 'Insurer', cx: 280, cy: 220 },
]

const HUB = { cx: 175, cy: 145 }

export default function NetworkDiagram({ lang }: Props) {
  return (
    <svg
      viewBox="0 0 350 290"
      width="100%"
      style={{ maxWidth: 360, display: 'block' }}
      aria-label={lang === 'zh' ? '网络效应示意图' : 'Network effect diagram'}
    >
      {/* spokes */}
      {NODES.map((n) => (
        <line
          key={n.key}
          x1={n.cx}
          y1={n.cy}
          x2={HUB.cx}
          y2={HUB.cy}
          stroke={v3.borderStrong}
          strokeWidth={1}
        />
      ))}

      {/* peripheral nodes */}
      {NODES.map((n) => (
        <g key={n.key}>
          <circle cx={n.cx} cy={n.cy} r={14} fill={v3.surface} stroke={v3.borderStrong} strokeWidth={1.2} />
          <text
            x={n.cx}
            y={n.cy + 32}
            textAnchor="middle"
            fontSize="11"
            fontWeight="600"
            fill={v3.textSecondary}
            style={{ fontFamily: 'inherit' }}
          >
            {lang === 'zh' ? n.zh : n.en}
          </text>
        </g>
      ))}

      {/* hub */}
      <circle cx={HUB.cx} cy={HUB.cy} r={26} fill={v3.brand} />
      <text
        x={HUB.cx}
        y={HUB.cy + 4}
        textAnchor="middle"
        fontSize="12"
        fontWeight="700"
        fill="#fff"
        style={{ fontFamily: 'inherit', letterSpacing: '-0.01em' }}
      >
        Stayloop
      </text>
    </svg>
  )
}
