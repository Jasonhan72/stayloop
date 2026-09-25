'use client'

// The listing's own map (Airbnb "房源位置" + StreetEasy transit map, user
// 2026-09-25): a pin for the unit and a small dot per nearby station, on the
// same Google Maps JS SDK the /listings browse map already loads. Without a
// key or coordinates it renders nothing — the section beside it still lists
// the stations and links to Google Maps.
import { useEffect, useRef, useState } from 'react'
import { loadGoogleMaps } from '@/components/ListingsMap'
import type { TransitStop } from '@/lib/listingInsights'

export default function ListingLocationMap({ lat, lng, label, stations, zh }: { lat: number; lng: number; label: string; stations: TransitStop[]; zh: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || ''
  useEffect(() => {
    if (!apiKey || !ref.current) return
    let cancelled = false
    loadGoogleMaps(apiKey)
      .then(() => {
        if (cancelled || !ref.current) return
        const g = window.google
        const map = new g.maps.Map(ref.current, {
          center: { lat, lng },
          zoom: 15,
          disableDefaultUI: true,
          zoomControl: true,
          clickableIcons: false,
          gestureHandling: 'cooperative',
        })
        new g.maps.Marker({ position: { lat, lng }, map, title: label })
        const bounds = new g.maps.LatLngBounds({ lat, lng })
        for (const s of stations) {
          if (s.lat == null || s.lng == null) continue
          const color = s.kind === 'subway' ? '#1B1B3C' : s.kind === 'go' ? '#047857' : s.kind === 'streetcar' ? '#B91C1C' : '#6E6E8A'
          new g.maps.Marker({
            position: { lat: s.lat, lng: s.lng },
            map,
            title: `${s.name} · ${s.distance_m} m`,
            icon: { path: g.maps.SymbolPath.CIRCLE, scale: 6, fillColor: color, fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 },
            label: { text: s.name, color: '#1B1B3C', fontSize: '11px', fontWeight: '600', className: 'sl-map-label' },
          })
          bounds.extend({ lat: s.lat, lng: s.lng })
        }
        if (stations.some((s) => s.lat != null)) map.fitBounds(bounds, 48)
      })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [apiKey, lat, lng, label, stations])
  if (!apiKey || failed) return null
  return (
    <div className="overflow-hidden rounded-[14px] border border-line-divider bg-surface-muted">
      <div ref={ref} className="h-[280px] w-full lg:h-full lg:min-h-[320px]" aria-label={zh ? '房源位置地图' : 'Listing location map'} />
    </div>
  )
}
