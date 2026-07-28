// Per-listing metadata, rendered on the server.
//
// The detail page itself is a large client component (photo gallery, favourites,
// map, agent hand-off), so its content is not server-rendered. But metadata IS
// server-rendered, and that is the part search engines and link previews read.
// Without this, every listing inherited the parent /listings title
// ("房源 · Stayloop") — identical titles across every listing URL, which is
// actively harmful for indexing.
//
// Fetched with the anon key and the SAME public-visibility rule the RLS policy
// enforces, so an unverified/inactive listing can never leak a title.
import type { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'
import { LISTING_VISIBILITY_OR } from '@/lib/listingVisibility'

export const runtime = 'edge'

interface ListingMeta {
  address: string | null
  unit: string | null
  city: string | null
  neighborhood: string | null
  monthly_rent: number | null
  bedrooms: number | null
  bathrooms: number | null
  sqft: number | null
  description: string | null
  title: string | null
  images: string[] | null
}

const money = (n: number) => `$${Math.round(n).toLocaleString('en-CA')}`

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params
  const fallback: Metadata = {
    title: '房源 · Stayloop',
    description: '浏览多伦多真实认证房源，AI Agent 帮你问询、看房、递交申请。',
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key || !slug) return fallback

  try {
    const sb = createClient(url, key, { auth: { persistSession: false } })
    const { data } = await sb
      .from('listings')
      .select('address, unit, city, neighborhood, monthly_rent, bedrooms, bathrooms, sqft, description, title, images')
      .eq('slug', slug)
      .eq('is_active', true)
      .or(LISTING_VISIBILITY_OR)
      .maybeSingle()
    const l = data as ListingMeta | null
    if (!l) return fallback

    const where = [l.neighborhood, l.city].filter(Boolean).join(' · ') || 'Toronto'
    const addr = [l.address, l.unit ? `#${l.unit}` : ''].filter(Boolean).join(' ').trim()
    const beds = l.bedrooms != null ? (l.bedrooms === 0 ? 'Studio' : `${l.bedrooms} 房`) : null
    const rent = l.monthly_rent ? `${money(l.monthly_rent)}/月` : null

    // "1207 King West · 2 房 · $2,800/月 · Liberty Village · Stayloop"
    const title = [addr || l.title || '房源', beds, rent, where, 'Stayloop']
      .filter(Boolean)
      .join(' · ')
      .slice(0, 110)

    const specs = [
      beds,
      l.bathrooms != null ? `${l.bathrooms} 浴` : null,
      l.sqft ? `${l.sqft} 平方英尺` : null,
    ].filter(Boolean).join(' · ')
    const description = (
      l.description?.trim() ||
      `${where}的出租房源${specs ? `，${specs}` : ''}${rent ? `，租金 ${rent}` : ''}。平台已核验，可用租客护照一键申请。`
    ).slice(0, 200)

    const image = Array.isArray(l.images) && l.images.length > 0 ? l.images[0] : undefined

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: 'website',
        ...(image ? { images: [image] } : {}),
      },
    }
  } catch {
    return fallback
  }
}

export default function ListingDetailLayout({ children }: { children: React.ReactNode }) {
  return children
}
