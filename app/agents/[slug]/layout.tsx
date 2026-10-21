// Per-agent metadata, rendered on the server (the page itself is a client component).
// Read from the public agent_directory view, which carries profile_slug only for agents
// who published — an unpublished or unverified profile never leaks a title.
import type { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'
import { categoryLabel, type AgentCategory } from '@/lib/agentProfile'
import { isValidSlug } from '@/lib/agentPublic'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const fallback: Metadata = { title: '经纪 · Stayloop' }
  if (!isValidSlug(slug)) return fallback
  try {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data } = await sb.from('agent_directory').select('legal_name, brokerage_name, category').eq('profile_slug', slug).maybeSingle()
    const a = data as { legal_name: string; brokerage_name: string; category: AgentCategory } | null
    if (!a) return fallback
    const title = `${a.legal_name} · ${categoryLabel(a.category, 'zh')} · ${a.brokerage_name} · Stayloop`
    return { title, description: `${a.legal_name}（${a.brokerage_name}）在 Stayloop 上的经纪主页：RECO 注册已核，可在站内直接联系。` }
  } catch {
    return fallback
  }
}

export default function AgentProfileLayout({ children }: { children: React.ReactNode }) {
  return children
}
