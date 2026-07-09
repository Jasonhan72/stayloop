'use client'

// Compact 2-year quarterly trend of the TRREB avg leased rent — rendered
// inside the market card. Single series: the role accent carries the line,
// text stays in text tokens, last point is direct-labeled, every point has a
// hover <title>. No legend (the benchmark line above names the series).

type Point = { period: string; avg: number }

function shortPeriod(p: string): string {
  // '2024 Q3' → '24Q3'
  const m = p.match(/^(\d{4})\s*Q(\d)$/)
  return m ? `${m[1].slice(2)}Q${m[2]}` : p
}

export default function TrrebTrendChart({ history, accent }: { history: Point[]; accent: string }) {
  if (history.length < 4) return null
  const W = 440
  const H = 132
  const L = 42
  const R = 30
  const T = 18
  const B = 24
  const iw = W - L - R
  const ih = H - T - B

  const vals = history.map((p) => p.avg)
  const rawMin = Math.min(...vals)
  const rawMax = Math.max(...vals)
  const pad = Math.max((rawMax - rawMin) * 0.15, 50)
  const yMin = Math.max(0, rawMin - pad)
  const yMax = rawMax + pad
  const x = (i: number) => L + (history.length === 1 ? iw / 2 : (i / (history.length - 1)) * iw)
  const y = (v: number) => T + ih - ((v - yMin) / (yMax - yMin)) * ih

  const pts = history.map((p, i) => ({ ...p, cx: x(i), cy: y(p.avg) }))
  const line = pts.map((p) => `${p.cx.toFixed(1)},${p.cy.toFixed(1)}`).join(' ')
  const area = `${L},${T + ih} ${line} ${(L + iw).toFixed(1)},${T + ih}`
  const grid = [yMin, (yMin + yMax) / 2, yMax]
  const last = pts[pts.length - 1]
  const fmt = (v: number) => `$${Math.round(v).toLocaleString()}`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 block w-full" role="img" aria-label="TRREB quarterly average rent trend">
      {grid.map((v) => (
        <g key={v}>
          <line x1={L} x2={L + iw} y1={y(v)} y2={y(v)} stroke="#E9E7E2" strokeWidth="1" />
          <text x={L - 6} y={y(v) + 3} textAnchor="end" fontSize="8.5" fontFamily="ui-monospace, monospace" fill="#9C978E">
            {fmt(v)}
          </text>
        </g>
      ))}
      <polygon points={area} fill={accent} opacity="0.07" />
      <polyline points={line} fill="none" stroke={accent} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => {
        const isLast = i === pts.length - 1
        return (
          <g key={p.period}>
            {/* generous invisible hit target for the hover tooltip */}
            <circle cx={p.cx} cy={p.cy} r="9" fill="transparent">
              <title>{`${p.period} · ${fmt(p.avg)}`}</title>
            </circle>
            <circle cx={p.cx} cy={p.cy} r={isLast ? 4 : 3} fill={accent} stroke="#fff" strokeWidth="2" pointerEvents="none" />
            <text
              x={p.cx}
              y={H - 8}
              textAnchor={i === 0 ? 'start' : isLast ? 'end' : 'middle'}
              fontSize="8.5"
              fontFamily="ui-monospace, monospace"
              fill="#9C978E"
            >
              {shortPeriod(p.period)}
            </text>
          </g>
        )
      })}
      <text
        x={Math.min(last.cx, L + iw - 2)}
        y={last.cy - 9}
        textAnchor="end"
        fontSize="10.5"
        fontWeight="700"
        fill="#3D3A34"
      >
        {fmt(last.avg)}
      </text>
    </svg>
  )
}
