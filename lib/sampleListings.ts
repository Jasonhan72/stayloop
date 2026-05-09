// V5 sample data — used by listings index, detail, agent search, etc.
// Replace with Supabase queries once backend is wired.
export interface SampleListing {
  slug: string
  address: string
  unit?: string
  neighborhood: string
  city: string
  province: string
  monthly_rent: number
  bedrooms: number
  bathrooms: number
  sqft?: number
  parking?: boolean
  pet?: 'cats' | 'dogs' | 'both' | 'none'
  laundry?: 'in-unit' | 'shared' | 'none'
  trustTier: 1 | 2 | 3 | 4
  match: number
  badges: Array<'luna' | 'new' | 'price-drop' | 'verified'>
  thumb: string // gradient seed string
  description: string
  agent?: {
    name: string
    role: 'landlord' | 'agent'
    rating: number
  }
}

const G = (a: string, b: string) => `${a}|${b}`

export const SAMPLE_LISTINGS: SampleListing[] = [
  {
    slug: 'cn-tower-skybox',
    address: '88 Harbour St',
    unit: 'Unit 4502',
    neighborhood: 'CityPlace · Harbourfront',
    city: 'Toronto',
    province: 'ON',
    monthly_rent: 3450,
    bedrooms: 2,
    bathrooms: 2,
    sqft: 845,
    parking: true,
    pet: 'cats',
    laundry: 'in-unit',
    trustTier: 3,
    match: 96,
    badges: ['luna', 'verified'],
    thumb: G('#7C3AED', '#2563EB'),
    description:
      'Floor-to-ceiling windows on the 45th floor with a clear south view of Lake Ontario. Steps to Union Station and the PATH.',
    agent: { name: 'Sarah Chen', role: 'agent', rating: 4.9 },
  },
  {
    slug: 'liberty-village-loft',
    address: '15 Hanna Ave',
    unit: 'Loft 312',
    neighborhood: 'Liberty Village',
    city: 'Toronto',
    province: 'ON',
    monthly_rent: 2890,
    bedrooms: 1,
    bathrooms: 1,
    sqft: 720,
    parking: false,
    pet: 'both',
    laundry: 'in-unit',
    trustTier: 2,
    match: 92,
    badges: ['new', 'verified'],
    thumb: G('#047857', '#10B981'),
    description:
      '125-year-old converted warehouse loft. Exposed brick, 14ft ceilings, and original timber beams. Walkable to King West.',
    agent: { name: 'Logic · Mike Park', role: 'landlord', rating: 4.7 },
  },
  {
    slug: 'annex-victorian',
    address: '432 Brunswick Ave',
    neighborhood: 'The Annex',
    city: 'Toronto',
    province: 'ON',
    monthly_rent: 4250,
    bedrooms: 3,
    bathrooms: 2,
    sqft: 1380,
    parking: true,
    pet: 'both',
    laundry: 'in-unit',
    trustTier: 3,
    match: 88,
    badges: ['luna'],
    thumb: G('#D4C4A8', '#94815C'),
    description:
      'Whole-of-house Victorian with a finished basement office, walled garden, and original stained glass. Steps to Bloor + Spadina.',
  },
  {
    slug: 'kingston-creek-bach',
    address: '210 Sumach St',
    unit: 'Bachelor 1B',
    neighborhood: 'Cabbagetown',
    city: 'Toronto',
    province: 'ON',
    monthly_rent: 1680,
    bedrooms: 0,
    bathrooms: 1,
    sqft: 380,
    parking: false,
    pet: 'cats',
    laundry: 'shared',
    trustTier: 1,
    match: 84,
    badges: ['price-drop'],
    thumb: G('#FDBA74', '#EA580C'),
    description:
      'Sunny garden-level bachelor in a heritage rowhouse. Suits a quiet professional. Hydro included.',
  },
  {
    slug: 'leslieville-stack',
    address: '1162 Queen St E',
    unit: '#7',
    neighborhood: 'Leslieville',
    city: 'Toronto',
    province: 'ON',
    monthly_rent: 3100,
    bedrooms: 2,
    bathrooms: 1,
    sqft: 760,
    parking: false,
    pet: 'both',
    laundry: 'in-unit',
    trustTier: 2,
    match: 90,
    badges: ['verified'],
    thumb: G('#6EE7B7', '#047857'),
    description:
      'Top floor of a stacked townhouse with a private rooftop terrace overlooking Queen East. Streetcar at the door.',
  },
  {
    slug: 'distillery-courtyard',
    address: '46 Distillery Lane',
    unit: 'Suite 1207',
    neighborhood: 'Distillery District',
    city: 'Toronto',
    province: 'ON',
    monthly_rent: 3680,
    bedrooms: 1,
    bathrooms: 1,
    sqft: 690,
    parking: true,
    pet: 'cats',
    laundry: 'in-unit',
    trustTier: 4,
    match: 79,
    badges: ['verified'],
    thumb: G('#93C5FD', '#1E3A8A'),
    description:
      'Cobblestone-courtyard view, concierge, gym, and steps to the Esplanade. Tier 4 verified building — landlord requires full credit + LTB clearance.',
  },
]

export function findListing(slug: string): SampleListing | undefined {
  return SAMPLE_LISTINGS.find((l) => l.slug === slug)
}
