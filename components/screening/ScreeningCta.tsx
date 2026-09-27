'use client'

// The screening landing page's call to action, split by hat (节点 2 · 清楚,
// 2026-09-26). The page is reachable from the top nav by everyone; a signed-in
// tenant who tapped 「开始筛查」 was sent into the landlord onboarding gate
// (external review: 错误角色入口). Screening is the landlord's (and the RECO
// agent's) tool — a tenant gets the door that is theirs.
import Link from 'next/link'
import { useAuth } from '@/lib/useAuth'
import { useHats } from '@/lib/useHats'
import { isRegistrationLive } from '@/lib/agentProfile'

export default function ScreeningCta({ zh, variant }: { zh: boolean; variant: 'hero' | 'footer' }) {
  const auth = useAuth()
  const hats = useHats()
  const signedIn = !!auth.user
  const canScreen = !signedIn || hats.loading || hats.landlord || (!!hats.agent && isRegistrationLive(hats.agent))
  const primary = 'rounded-full px-7 py-3.5 text-[15px] font-bold text-white shadow-lg'
  if (canScreen) {
    return (
      <Link href="/screening/app" className={variant === 'hero' ? primary : 'mt-6 inline-block rounded-full px-8 py-4 text-[15px] font-bold text-white shadow-lg'} style={{ background: '#00ACE4' }} data-testid="screening-cta">
        {variant === 'hero' ? (zh ? '开始筛查 · 注册即免费试用 →' : 'Start a screening — free with a quick signup →') : zh ? '开始筛查 →' : 'Start a screening →'}
      </Link>
    )
  }
  // Signed in as a tenant only.
  return (
    <div className={variant === 'hero' ? 'flex flex-wrap items-center justify-center gap-3' : 'mt-6 flex flex-wrap items-center justify-center gap-3'} data-testid="screening-cta-tenant">
      <Link href="/tenant/passport" className={primary} style={{ background: '#00ACE4' }}>{zh ? '我是租客 · 先备好我的材料包 →' : 'I’m a tenant · prepare my documents →'}</Link>
      <Link href="/landlord/become?next=%2Fscreening%2Fapp" className="rounded-full border border-line-divider bg-white px-6 py-3.5 text-[14px] font-semibold text-body-2">{zh ? '我也是房东 · 开通后开始筛查' : 'I’m also a landlord · activate to screen'}</Link>
      <p className="basis-full text-center text-[12px] text-body-3">{zh ? '筛查由房东（或有代表协议的经纪）发起；申请人这边能做的，是把证件、收入与推荐材料先整理进租客护照。' : 'Screening is started by the landlord (or an agent with a representation agreement); as an applicant, get your ID, income and reference documents ready in your passport.'}</p>
    </div>
  )
}
