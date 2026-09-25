'use client'

// /landlord/become — the one place the landlord hat is granted on purpose
// (three-role test report 2026-09-24). Before, any landlord page called
// claim_landlord on load, so a tenant who opened the screening page or an
// agent who typed /landlord/agent silently became a landlord. Now the
// workspace sends signed-in accounts without the hat here, and this page
// says what the hat is, what it is not, and grants it only on a click.
import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import Header from '@/components/Header'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { useHats, invalidateHats } from '@/lib/useHats'
import { useI18n } from '@/lib/i18n'
import { safeNext } from '@/lib/landlordHat'

function Become() {
  const { lang } = useI18n()
  const zh = lang === 'zh'
  const auth = useAuth()
  const hats = useHats()
  const router = useRouter()
  const params = useSearchParams()
  const next = safeNext(params?.get('next') ?? null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const signedIn = !!auth.user && !(auth.user as { is_anonymous?: boolean }).is_anonymous
  const myHome = hats.agent ? '/agent/agent' : '/tenant/agent'

  async function become() {
    setBusy(true); setErr(null)
    const { error } = await supabase.rpc('claim_landlord')
    if (error) { setErr(error.message); setBusy(false); return }
    invalidateHats()
    router.replace(next)
  }

  return (
    <>
      <Header variant="solid" />
      <main className="min-h-[calc(100vh-66px)] px-5 py-12" style={{ background: '#F3F8FC' }}>
        <div data-testid="become-landlord" className="sl-card mx-auto max-w-xl p-6 sm:p-9">
          <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-body-3">{zh ? '房东身份' : 'LANDLORD HAT'}</div>
          <h1 className="mt-2 text-[26px] font-bold tracking-tight">{hats.landlord ? (zh ? '你已经是房东' : 'You are already a landlord') : (zh ? '这里是房东工作台' : 'This is the landlord workspace')}</h1>
          {!signedIn ? (
            <>
              <p className="mt-3 text-[14px] leading-relaxed text-body-2">{zh ? '请先登录，再开通房东身份。' : 'Sign in first, then turn on the landlord hat.'}</p>
              <Link href={`/login?redirect=${encodeURIComponent('/landlord/become?next=' + next)}`} className="sl-btn-primary mt-6 inline-block">{zh ? '登录' : 'Sign in'}</Link>
            </>
          ) : hats.landlord ? (
            <Link href={next} className="sl-btn-primary mt-6 inline-block">{zh ? '进入房东工作台 →' : 'Go to the landlord workspace →'}</Link>
          ) : (
            <>
              <p className="mt-3 text-[14px] leading-relaxed text-body-2">
                {zh
                  ? '房源、申请人、筛查、租约、维修和财务都属于房东身份。你的账号目前是' + (hats.agent ? '经纪' : '租客') + '身份，所以没有直接打开。'
                  : 'Listings, applicants, screening, leases, repairs and finance belong to the landlord hat. Your account is currently a ' + (hats.agent ? 'agent' : 'tenant') + ', so the page did not open.'}
              </p>
              <ul className="mt-4 space-y-2 text-[13.5px] leading-relaxed text-body">
                <li>✓ {zh ? '如果你自己有房出租，可以在同一个账号上开通房东身份；租客与经纪身份不受影响，右上角菜单随时切换。' : 'If you rent out your own unit, turn on the landlord hat on this same account; your other hats stay, switch in the top-right menu.'}</li>
                {hats.agent && <li>ⓘ {zh ? '经纪不能代替房东使用房东工作台：Stayloop 目前没有「代管房东账户」，替房东办事请由房东本人账号完成。经纪为客户做租客筛查不需要房东身份：RECO 注册核验通过后，在「客户」表记录代表协议与 Information Guide 的日期，再从客户那一行点「发起筛查」。' : 'Agents cannot use the landlord workspace on a landlord’s behalf — Stayloop has no delegated landlord accounts; acting for a landlord happens in the landlord’s own account. Screening for a client needs no landlord hat: once your RECO registration is verified, record the representation agreement and Information Guide dates in Clients, then use “Screen” on that client’s row.'}</li>}
                {hats.agent && <li>ⓘ {zh ? '你自己作为房东出租时，发布房源和提交申请前会提示你送达 TRESA s.32 注册人披露。' : 'When you rent out your own unit, you will be prompted to deliver the TRESA s.32 registrant disclosure before publishing or applying.'}</li>}
              </ul>
              {err && <p className="mt-4 text-[13px] text-red-700">{err}</p>}
              <div className="mt-6 flex flex-col gap-2 sm:flex-row">
                <button onClick={become} disabled={busy || hats.loading} className="sl-btn-primary flex-1">{busy ? '…' : (zh ? '开通房东身份（我有房出租）' : 'Turn on the landlord hat (I rent out a unit)')}</button>
                <Link href={myHome} className="sl-btn-secondary flex-1 text-center">{zh ? '回到我的工作台' : 'Back to my workspace'}</Link>
              </div>
            </>
          )}
        </div>
      </main>
    </>
  )
}

export default function BecomeLandlordPage() {
  return <Suspense fallback={null}><Become /></Suspense>
}
