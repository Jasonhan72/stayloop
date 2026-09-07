'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useT } from '@/lib/i18n'

/**
 * Google Maps split-view for /listings.
 * Loads the JS SDK on demand using NEXT_PUBLIC_GOOGLE_MAPS_KEY.
 * Renders custom price-pin markers; markers sync with the hovered card
 * via the `active` prop and call `onPick` on click.
 *
 * Fallback (when no API key): cream panel with a setup note.
 */

interface MapListing {
  id: string
  slug: string
  lat: number | null
  lng: number | null
  monthly_rent: number
  match_score: number | null
}

interface Props {
  listings: MapListing[]
  active: string | null
  onPick: (id: string) => void
  /** 'split' = the sticky desktop half (default); 'full' = fills its parent
   *  (the phone map mode overlay). */
  mode?: 'split' | 'full'
  /** Pixels reserved at the bottom (the phone peek card) when fitting bounds. */
  bottomInset?: number
  /** Click on a price tag (hover still only calls onPick). */
  onOpen?: (id: string) => void
  /** Renders a fullscreen toggle in the top-right corner. */
  onToggleFull?: () => void
  fullLabel?: string
  /** Overlays (peek card etc.) rendered inside the map frame. */
  children?: ReactNode
  /** Click on a cluster disc: the ids in that group (replaces the zoom-in). */
  onOpenGroup?: (ids: string[]) => void
  /** Fires on every idle with the ids inside the current viewport. */
  onViewport?: (ids: string[]) => void
}

// RealMaster-style price tag: the number only, in thousands.
// 3000 → 3K · 3200 → 3.2K · 13800 → 13.8K · 45000 → 45K · 950 → $950
export function priceTag(rent: number): string {
  if (rent < 1000) return `$${rent}`
  const k = rent / 1000
  const txt = Number.isInteger(k) ? String(k) : k.toFixed(1).replace(/\.0$/, '')
  return `${txt}K`
}

// Red pill with a small tail, sized to the label. Coordinates are px around
// the anchor (the tail tip sits on the listing's position).
function pillPath(label: string): string {
  const w = Math.max(38, 12 + label.length * 8)
  const h = 24
  const r = 6
  const x0 = -w / 2, x1 = w / 2, y0 = -h - 7, y1 = -7
  return [
    `M ${x0 + r} ${y0}`, `L ${x1 - r} ${y0}`, `Q ${x1} ${y0} ${x1} ${y0 + r}`,
    `L ${x1} ${y1 - r}`, `Q ${x1} ${y1} ${x1 - r} ${y1}`,
    `L 5 ${y1}`, `L 0 0`, `L -5 ${y1}`,
    `L ${x0 + r} ${y1}`, `Q ${x0} ${y1} ${x0} ${y1 - r}`,
    `L ${x0} ${y0 + r}`, `Q ${x0} ${y0} ${x0 + r} ${y0}`, 'Z',
  ].join(' ')
}

const TAG_RED = '#E53935'
const CLUSTER_PX = 48
const TAG_RED_ACTIVE = '#B71C1C'

function tagIcon(google: any, label: string, isActive: boolean) {
  return {
    path: pillPath(label),
    fillColor: isActive ? TAG_RED_ACTIVE : TAG_RED,
    fillOpacity: 1,
    strokeColor: '#fff',
    strokeWeight: isActive ? 2.5 : 1.5,
    scale: isActive ? 1.12 : 1,
    labelOrigin: new google.maps.Point(0, -19),
    anchor: new google.maps.Point(0, 0),
  }
}

// Module-level loader state — only inject the script once.
let scriptLoaded = false
let scriptLoading: Promise<void> | null = null

function loadGoogleMaps(apiKey: string): Promise<void> {
  if (scriptLoaded) return Promise.resolve()
  if (scriptLoading) return scriptLoading
  scriptLoading = new Promise((resolve, reject) => {
    const existing = document.getElementById('google-maps-sdk')
    if (existing) {
      // If the SDK already finished loading (e.g. after a remount) the 'load'
      // event will never fire again — resolve immediately so the map inits.
      if ((window as { google?: { maps?: unknown } }).google?.maps) {
        scriptLoaded = true
        resolve()
        return
      }
      existing.addEventListener('load', () => {
        scriptLoaded = true
        resolve()
      })
      existing.addEventListener('error', () => reject(new Error('Google Maps SDK failed to load')))
      return
    }
    const s = document.createElement('script')
    s.id = 'google-maps-sdk'
    s.async = true
    s.defer = true
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      apiKey,
    )}&v=weekly`
    s.onload = () => {
      scriptLoaded = true
      resolve()
    }
    s.onerror = () => reject(new Error('Failed to load Google Maps'))
    document.head.appendChild(s)
  })
  return scriptLoading
}

declare global {
  interface Window {
    google: any
  }
}

export default function ListingsMap({ listings, active, onPick, mode = 'split', bottomInset = 0, onOpen, onToggleFull, fullLabel, children, onOpenGroup, onViewport }: Props) {
  const { lang } = useT()
  const zh = lang === 'zh'
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || ''
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const markersRef = useRef<Map<string, any>>(new Map())
  const infoRef = useRef<any>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Latest props for listeners registered once (map 'idle').
  const listingsRef = useRef(listings); listingsRef.current = listings
  const onOpenGroupRef = useRef(onOpenGroup); onOpenGroupRef.current = onOpenGroup
  const onViewportRef = useRef(onViewport); onViewportRef.current = onViewport
  const onPickRef = useRef(onPick); onPickRef.current = onPick
  const onOpenRef = useRef(onOpen); onOpenRef.current = onOpen
  const bottomInsetRef = useRef(bottomInset); bottomInsetRef.current = bottomInset
  const clustersRef = useRef<any[]>([])
  // Cluster pass bookkeeping: which markers are on the map, and the last
  // cluster layout — so an idle that changes nothing touches nothing.
  const shownRef = useRef<Set<string>>(new Set())
  const clusterKeyRef = useRef('')

  // Clustering (RealMaster-style): tags whose screen positions fall within
  // CLUSTER_PX of each other collapse into one red disc with the count.
  // Recomputed on every idle (pan/zoom); tapping a disc zooms into its group.
  const renderClusters = useCallback(() => {
    const google = window.google
    const map = mapRef.current
    if (!google || !map) return
    const proj = map.getProjection()
    const zoom = map.getZoom()
    if (!proj || zoom == null) return
    const scale = Math.pow(2, zoom)
    type Pt = { l: MapListing; x: number; y: number }
    const pts: Pt[] = []
    for (const l of listingsRef.current) {
      if (l.lat == null || l.lng == null) continue
      const wp = proj.fromLatLngToPoint(new google.maps.LatLng(Number(l.lat), Number(l.lng)))
      if (!wp) continue
      pts.push({ l, x: wp.x * scale, y: wp.y * scale })
    }
    const groups: { x: number; y: number; items: Pt[] }[] = []
    for (const p of pts) {
      let g = groups.find((gr) => Math.hypot(gr.x - p.x, gr.y - p.y) < CLUSTER_PX)
      if (!g) { g = { x: p.x, y: p.y, items: [] }; groups.push(g) }
      g.items.push(p)
      g.x = g.items.reduce((a, it) => a + it.x, 0) / g.items.length
      g.y = g.items.reduce((a, it) => a + it.y, 0) / g.items.length
    }
    const single = new Set<string>()
    const multi = groups.filter((g) => g.items.length > 1)
    groups.forEach((g) => { if (g.items.length === 1) single.add(g.items[0].l.id) })
    const clusterKey = multi.map((g) => g.items.map((it) => it.l.id).sort().join(',')).sort().join('|')
    const clustersChanged = clusterKey !== clusterKeyRef.current
    if (clustersChanged) {
      clustersRef.current.forEach((m) => m.setMap(null))
      clustersRef.current = []
      clusterKeyRef.current = clusterKey
    }
    for (const g of clustersChanged ? multi : []) {
      const lat = g.items.reduce((a, it) => a + Number(it.l.lat), 0) / g.items.length
      const lng = g.items.reduce((a, it) => a + Number(it.l.lng), 0) / g.items.length
      const count = g.items.length
      const disc = new google.maps.Marker({
        position: { lat, lng },
        map,
        zIndex: 5,
        label: { text: String(count), color: '#fff', fontSize: '13px', fontWeight: '800', fontFamily: 'Inter Tight, system-ui, sans-serif' },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: count >= 10 ? 22 : 18,
          fillColor: TAG_RED,
          fillOpacity: 1,
          strokeColor: '#fff',
          strokeWeight: 2.5,
        },
        title: `${count} listings`,
      })
      const members = g.items
      disc.addListener('click', () => {
        if (onOpenGroupRef.current) { onOpenGroupRef.current(members.map((it) => it.l.id)); return }
        const b = new google.maps.LatLngBounds()
        members.forEach((it) => b.extend({ lat: Number(it.l.lat), lng: Number(it.l.lng) }))
        const before = map.getZoom()
        map.fitBounds(b, { top: 90, right: 60, bottom: 90, left: 60 })
        // Identical coordinates never spread — step the zoom instead.
        google.maps.event.addListenerOnce(map, 'idle', () => {
          if (map.getZoom() <= before) map.setZoom(Math.min(before + 2, 20))
        })
      })
      clustersRef.current.push(disc)
    }
    markersRef.current.forEach((m, id) => {
      const want = single.has(id)
      const has = shownRef.current.has(id)
      if (want && !has) { m.setMap(map); shownRef.current.add(id) }
      else if (!want && has) { m.setMap(null); shownRef.current.delete(id) }
    })
    if (ref.current) ref.current.dataset.clusters = String(clustersRef.current.length)
    const vb = map.getBounds()
    if (vb && onViewportRef.current) {
      onViewportRef.current(pts.filter((p) => vb.contains({ lat: Number(p.l.lat), lng: Number(p.l.lng) })).map((p) => p.l.id))
    }
  }, [])

  // Initial mount: load script + create map
  useEffect(() => {
    if (!apiKey) {
      setError('missing-key')
      return
    }
    let cancelled = false
    loadGoogleMaps(apiKey)
      .then(() => {
        if (cancelled || !ref.current) return
        const google = window.google
        mapRef.current = new google.maps.Map(ref.current, {
          center: { lat: 43.7, lng: -79.4 },
          zoom: 12,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: 'greedy',
          styles: MAP_STYLE,
        })
        infoRef.current = new google.maps.InfoWindow({ disableAutoPan: true })
        mapRef.current.addListener('idle', renderClusters)
        setReady(true)
      })
      .catch((e) => {
        if (!cancelled) setError(String(e.message || e))
      })
    return () => {
      cancelled = true
    }
  }, [apiKey, renderClusters])

  // Recreate markers when the listings change OR when the map first becomes ready
  useEffect(() => {
    if (!ready || !mapRef.current) return
    const google = window.google
    // Remove old markers
    markersRef.current.forEach((m) => m.setMap(null))
    markersRef.current.clear()
    clustersRef.current.forEach((m) => m.setMap(null))
    clustersRef.current = []
    clusterKeyRef.current = ''
    shownRef.current = new Set()

    // Initial view frames the Greater Toronto listings; anything far outside
    // (a Montréal import, say) stays on the map but must not drag the zoom
    // out until the whole city collapses into one cluster.
    const inGta = (lat: number, lng: number) => lat > 43.3 && lat < 44.2 && lng > -80.2 && lng < -78.6
    const bounds = new google.maps.LatLngBounds()
    const allBounds = new google.maps.LatLngBounds()
    let placed = 0
    let framed = 0
    listings.forEach((l) => {
      if (l.lat == null || l.lng == null) return
      const pos = { lat: Number(l.lat), lng: Number(l.lng) }
      allBounds.extend(pos)
      if (inGta(pos.lat, pos.lng)) { bounds.extend(pos); framed += 1 }
      placed += 1
      const label = priceTag(l.monthly_rent)
      const marker = new google.maps.Marker({
        position: pos,
        map: null,
        title: `$${l.monthly_rent.toLocaleString()}`,
        label: { text: label, color: '#fff', fontSize: '12px', fontWeight: '800', fontFamily: 'Inter Tight, system-ui, sans-serif' },
        icon: tagIcon(google, label, l.id === active),
        zIndex: l.id === active ? 10 : 1,
      })
      marker.addListener('click', () => { onPickRef.current(l.id); if (onOpenRef.current) onOpenRef.current(l.id) })
      if (mode === 'split') marker.addListener('mouseover', () => onPickRef.current(l.id))
      markersRef.current.set(l.id, marker)
    })
    if (ref.current) ref.current.dataset.markers = String(placed)

    const frame = framed > 0 ? bounds : allBounds
    const n = framed > 0 ? framed : placed
    if (n > 0) {
      if (n === 1) {
        mapRef.current.setCenter(frame.getCenter())
        mapRef.current.setZoom(14)
      } else {
        mapRef.current.fitBounds(frame, { top: 60, right: 40, bottom: 40 + bottomInsetRef.current, left: 40 })
      }
    }
    // fitBounds fires 'idle' → renderClusters; a map that did not move needs it explicitly.
    renderClusters()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, listings, mode, renderClusters])

  // When active changes, re-color the markers
  useEffect(() => {
    if (!ready) return
    const google = window.google
    markersRef.current.forEach((marker, id) => {
      const l = listings.find((x) => x.id === id)
      if (!l) return
      const isActive = id === active
      marker.setIcon(tagIcon(google, priceTag(l.monthly_rent), isActive))
      marker.setZIndex(isActive ? 10 : 1)
    })
  }, [active, listings, ready])

  return (
    <div
      className={mode === 'split' ? 'hidden lg:block' : 'block'}
      style={
        mode === 'split'
          ? { position: 'sticky', top: 66, height: 'calc(100vh - 66px)', borderLeft: '1px solid #E4EEF6', overflow: 'hidden', background: '#E5E3DC' }
          : { position: 'absolute', inset: 0, overflow: 'hidden', background: '#E5E3DC' }
      }
    >
      <div ref={ref} style={{ position: 'absolute', inset: 0 }} />

      {error === 'missing-key' && <NoKeyFallback zh={zh} />}
      {onToggleFull && (
        <button
          type="button"
          onClick={onToggleFull}
          className="absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-[12.5px] font-bold shadow-md"
          style={{ color: '#1B1B3C' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/></svg>
          {fullLabel}
        </button>
      )}
      {children}
      {error && error !== 'missing-key' && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-surface text-[13px] text-body-2"
          style={{ padding: 32, textAlign: 'center' }}
        >
          {zh ? '地图加载失败 — ' : 'Map failed to load — '}{error}
        </div>
      )}

    </div>
  )
}

function NoKeyFallback({ zh }: { zh: boolean }) {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center"
      style={{ background: 'linear-gradient(180deg,#DDE7DA 0%,#C8D6C2 100%)' }}
    >
      <div
        className="sl-card max-w-[420px] p-7 text-center"
        style={{ background: 'rgba(255,255,255,0.95)' }}
      >
        <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
          GOOGLE MAPS · SETUP NEEDED
        </div>
        <h3 className="mt-2 text-[18px] font-bold tracking-tight">
          {zh ? '这里会显示真实地图' : 'A live map will appear here'}
        </h3>
        <p className="mt-3 text-[12.5px] leading-relaxed text-body-2">
          {zh ? '需要在 Cloudflare Pages 项目环境变量里加 ' : 'Add '}
          <code className="font-mono">NEXT_PUBLIC_GOOGLE_MAPS_KEY</code>
          {zh
            ? '（从 Google Cloud Console → APIs & Services → Credentials 创建）。'
            : ' to your Cloudflare Pages environment variables (create it in Google Cloud Console → APIs & Services → Credentials).'}
        </p>
        <p className="mt-2 text-[11.5px] text-body-3">
          {zh ? 'API 需要启用：Maps JavaScript API' : 'Enable the Maps JavaScript API.'}
        </p>
      </div>
    </div>
  )
}

const MAP_STYLE = [
  // Cream-themed Google Maps style to match Stayloop palette
  { elementType: 'geometry', stylers: [{ color: '#F5F0E5' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#3F3F46' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#F5F0E5' }] },
  {
    featureType: 'administrative',
    elementType: 'geometry',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'poi',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#FFFFFF' }],
  },
  {
    featureType: 'road.arterial',
    elementType: 'geometry',
    stylers: [{ color: '#FAFAF5' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: '#E3F2FC' }],
  },
  {
    featureType: 'transit',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#C4D8E0' }],
  },
  {
    featureType: 'landscape.natural',
    elementType: 'geometry',
    stylers: [{ color: '#DDE7DA' }],
  },
]
