'use client'

import { useEffect, useRef, useState } from 'react'

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
      existing.addEventListener('load', () => {
        scriptLoaded = true
        resolve()
      })
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

export default function ListingsMap({ listings, active, onPick }: Props) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || ''
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const markersRef = useRef<Map<string, any>>(new Map())
  const infoRef = useRef<any>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
        setReady(true)
      })
      .catch((e) => {
        if (!cancelled) setError(String(e.message || e))
      })
    return () => {
      cancelled = true
    }
  }, [apiKey])

  // Recreate markers when the listings change OR when the map first becomes ready
  useEffect(() => {
    if (!ready || !mapRef.current) return
    const google = window.google
    // Remove old markers
    markersRef.current.forEach((m) => m.setMap(null))
    markersRef.current.clear()

    const bounds = new google.maps.LatLngBounds()
    let placed = 0
    listings.forEach((l) => {
      if (l.lat == null || l.lng == null) return
      const pos = { lat: Number(l.lat), lng: Number(l.lng) }
      bounds.extend(pos)
      placed += 1
      const isLuna = l.match_score && l.match_score >= 85
      const marker = new google.maps.Marker({
        position: pos,
        map: mapRef.current,
        title: `$${l.monthly_rent.toLocaleString()}`,
        label: {
          text: `$${(l.monthly_rent / 1000).toFixed(l.monthly_rent < 10000 ? 1 : 0)}k`,
          color: '#fff',
          fontSize: '11px',
          fontWeight: '700',
        },
        icon: {
          path: 'M -22 -14 L 22 -14 L 22 14 L 4 14 L 0 20 L -4 14 L -22 14 Z',
          fillColor: isLuna ? '#7C3AED' : '#171717',
          fillOpacity: 1,
          strokeColor: '#fff',
          strokeWeight: 2,
          scale: 1,
          labelOrigin: new google.maps.Point(0, 0),
        },
      })
      marker.addListener('click', () => onPick(l.id))
      marker.addListener('mouseover', () => onPick(l.id))
      markersRef.current.set(l.id, marker)
    })

    if (placed > 0) {
      if (placed === 1) {
        mapRef.current.setCenter(bounds.getCenter())
        mapRef.current.setZoom(14)
      } else {
        mapRef.current.fitBounds(bounds, { top: 50, right: 50, bottom: 50, left: 50 })
      }
    }
  }, [ready, listings, onPick])

  // When active changes, re-color the markers
  useEffect(() => {
    if (!ready) return
    const google = window.google
    markersRef.current.forEach((marker, id) => {
      const l = listings.find((x) => x.id === id)
      if (!l) return
      const isActive = id === active
      const isLuna = l.match_score && l.match_score >= 85
      marker.setIcon({
        path: 'M -22 -14 L 22 -14 L 22 14 L 4 14 L 0 20 L -4 14 L -22 14 Z',
        fillColor: isActive ? '#047857' : isLuna ? '#7C3AED' : '#171717',
        fillOpacity: 1,
        strokeColor: '#fff',
        strokeWeight: isActive ? 3 : 2,
        scale: isActive ? 1.15 : 1,
        labelOrigin: new google.maps.Point(0, 0),
      })
      marker.setZIndex(isActive ? 10 : 1)
    })
  }, [active, listings, ready])

  return (
    <div
      className="hidden lg:block"
      style={{
        position: 'sticky',
        top: 0,
        height: 'calc(100vh - 0px)',
        borderLeft: '1px solid #E0DACE',
        overflow: 'hidden',
        background: '#E5E3DC',
      }}
    >
      <div ref={ref} style={{ position: 'absolute', inset: 0 }} />

      {error === 'missing-key' && <NoKeyFallback />}
      {error && error !== 'missing-key' && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-surface text-[13px] text-body-2"
          style={{ padding: 32, textAlign: 'center' }}
        >
          地图加载失败 — {error}
        </div>
      )}

      {/* Top-left "draw region" widget (kept for parity with spec) */}
      <div
        style={{
          position: 'absolute',
          top: 18,
          left: 18,
          background: '#fff',
          border: '1px solid #E0DACE',
          borderRadius: 8,
          padding: '8px 12px',
          fontSize: 12,
          fontWeight: 600,
          boxShadow: '0 4px 12px rgba(0,0,0,0.10)',
          pointerEvents: 'none',
        }}
      >
        ◯ 在地图上画区域
      </div>

    </div>
  )
}

function NoKeyFallback() {
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
          这里会显示真实地图
        </h3>
        <p className="mt-3 text-[12.5px] leading-relaxed text-body-2">
          需要在 Cloudflare Pages 项目环境变量里加 <code className="font-mono">NEXT_PUBLIC_GOOGLE_MAPS_KEY</code>（从 Google Cloud Console → APIs &amp; Services → Credentials 创建）。
        </p>
        <p className="mt-2 text-[11.5px] text-body-3">
          API 需要启用：Maps JavaScript API
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
    stylers: [{ color: '#EAE5D9' }],
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
