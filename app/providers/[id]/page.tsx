'use client'

// /providers/<id> — a service provider's page (2026-11-22, user: 「维修服务，专业服务和经纪的页面
// 一样，同时也要可以点击进去看主页」). Laid out like the agent's page (app/agents/[slug]/page.tsx):
// a head card with 发消息 / 分享, what they do and where, the credentials Stayloop checked, the
// rating, and a contact panel on the right with the message form and the provider's own contact
// details. Built only from what the directory already shows a signed-in account
// (provider_directory, provider_credentials_public, provider_review_stats) — an anonymous visitor
// reads nothing about any provider and is asked to sign in. Providers have no slug, so the address
// carries the id.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { FIND_TABS, TestDataTag } from '@/components/directory/FindHeader'
import ProviderAvatar from '@/components/directory/ProviderAvatar'
import ProviderContact from '@/components/directory/ProviderContact'
import { isTestName } from '@/components/listing/testAccounts'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { activeHat, useHats } from '@/lib/useHats'
import { useT } from '@/lib/i18n'
import { externalHref, externalHrefLabel } from '@/lib/ui/externalHref'
import { CREDENTIAL_LABEL, TRADES } from '@/lib/marketplace/trades'
import { credentialRows, isProviderId, priceLine, providerDisplayName, ratingFor, tradeCoverage, type DirectoryCredential, type DirectoryProvider, type DirectoryReview } from '@/lib/marketplace/directory'
import { useMarketplaceConfig } from '@/lib/marketplace/config'
import { providerPhotoUrl } from '@/lib/providerPhotoKeys'
import { languageLabel } from '@/lib/agentPublic'

const COLS = 'id, legal_name, trade_name, trades, service_cities, pricing_mode, call_out_fee, hourly_rate, contact_email, contact_phone, website, verified_at, bio, languages, photo_key'

export default function ProviderProfilePage() {
  const params = useParams()
  const id = String(params?.id || '')
  const valid = isProviderId(id)
  const { lang } = useT()
  const zh = lang === 'zh'
  const auth = useAuth()
  const hats = useHats()
  const { graceDays } = useMarketplaceConfig()

  const [prov, setProv] = useState<DirectoryProvider | null | 'missing' | 'failed'>(null)
  const [creds, setCreds] = useState<DirectoryCredential[]>([])
  const [reviews, setReviews] = useState<DirectoryReview[]>([])
  const [isMine, setIsMine] = useState(false)

  useEffect(() => {
    if (auth.loading || !auth.user || !valid) return
    let on = true
    void (async () => {
      const [{ data, error }, { data: c }, { data: r }, { data: own }] = await Promise.all([
        supabase.from('provider_directory').select(COLS).eq('id', id).maybeSingle(),
        supabase.from('provider_credentials_public').select('provider_id, kind, expires_at, verified_at').eq('provider_id', id),
        supabase.from('provider_review_stats').select('provider_id, overall, reviews, on_time, communication, quality').eq('provider_id', id),
        // Is this the visitor's own provider record? (Their row is theirs to read whether or not it is verified yet.)
        supabase.from('service_providers').select('id').eq('id', id).eq('auth_id', auth.user!.id).maybeSingle(),
      ])
      if (!on) return
      setIsMine(!!own)
      if (error) { setProv('failed'); return }
      setCreds((c ?? []) as DirectoryCredential[])
      setReviews((r ?? []) as DirectoryReview[])
      setProv(data ? (data as DirectoryProvider) : 'missing')
    })()
    return () => { on = false }
  }, [auth.loading, auth.user, id, valid])

  // 「发消息」 in the head card goes to the panel. The panel mounts after the provider loads, so a
  // #contact arrival (the directory card's 发消息) is scrolled to here as well.
  const toContact = (e?: { preventDefault: () => void }) => {
    e?.preventDefault()
    document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const loaded = !!prov && prov !== 'missing' && prov !== 'failed'
  useEffect(() => {
    if (loaded && window.location.hash === '#contact') document.getElementById('contact')?.scrollIntoView({ block: 'start' })
  }, [loaded])
  const [copied, setCopied] = useState(false)
  const share = async () => {
    const url = window.location.origin + window.location.pathname
    try {
      if (navigator.share) { await navigator.share({ title: document.title, url }); return }
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch { /* dismissed share sheet or no clipboard permission: nothing to report */ }
  }

  const p = loaded ? (prov as DirectoryProvider) : null
  const name = p ? providerDisplayName(p) : ''
  const trades = p ? tradeCoverage(p, creds, new Date(), graceDays) : []
  const repair = trades.some((t) => !t.professional)
  const professionalOnly = trades.length > 0 && !repair
  // the crumb is the tab the provider is listed under, by that tab's own name
  const tab = FIND_TABS.find((t) => t.key === (professionalOnly ? 'professional' : 'repairs'))!
  const back = { href: tab.href, label: zh ? tab.zh : tab.en }
  const tradeLabel = (k: string) => { const d = TRADES.find((x) => x.key === k); return d ? (zh ? d.zh : d.en) : k }
  const rating = p ? ratingFor(p.id, reviews) : null
  const credRows = p ? credentialRows(p.id, creds) : []
  const site = p ? externalHref(p.website) : null
  const photo = p ? providerPhotoUrl(p.photo_key) : null
  const langs = p?.languages ?? []
  const bio = (p?.bio ?? '').trim()
  const verifiedOn = p?.verified_at ? p.verified_at.slice(0, 10) : ''
  const complete = trades.length > 0 && trades.every((t) => t.ok)
  const card = 'rounded-2xl border border-line-divider bg-white p-6'

  if (!valid || prov === 'missing') {
    return (
      <div className="text-body">
        <Header />
        <main className="mx-auto max-w-[1320px] px-6 py-20 sm:px-8 lg:px-12" data-testid="provider-profile-missing">
          <h1 className="text-[22px] font-bold">{zh ? '没有找到这家服务商的主页' : 'This provider page was not found'}</h1>
          <p className="mt-2 text-[14px] text-body-2">
            {isMine
              ? (zh ? '你的资料还没有通过核验，核验通过后才会出现在目录里。' : 'Your profile has not been verified yet; it appears in the directory once it is.')
              : (zh ? '可能还没有通过核验，或者已经不在目录里。' : 'It may not be verified yet, or it is no longer in the directory.')}
          </p>
          <Link href={isMine ? '/provider/onboard' : '/providers'} className="sl-btn-primary mt-6 inline-block">{isMine ? (zh ? '查看入驻资料' : 'Open my profile') : (zh ? '去找服务商' : 'Find a provider')}</Link>
        </main>
        <Footer />
      </div>
    )
  }

  return (
    <div style={{ background: '#FFFFFF' }} className="text-body">
      <Header />
      <main className="mx-auto max-w-[1320px] px-6 pb-16 pt-8 sm:px-8 lg:px-12">
        <nav className="text-[13px] text-body-3" data-testid="provider-profile-crumb"><Link href={back.href} className="hover:underline">{back.label}</Link>{p ? <> / <span className="text-body-2">{name}</span></> : null}</nav>
        {auth.loading ? (
          <div className="py-16 text-[14px] text-body-3">…</div>
        ) : !auth.user ? (
          // Anonymous: nothing about the provider is read. The same rule as the directory itself.
          <div className="mt-5 max-w-[640px] rounded-2xl border border-line-divider bg-surface-chip/40 p-6" data-testid="provider-profile-signin">
            <h1 className="text-[20px] font-bold">{zh ? '登录后查看这家服务商' : 'Sign in to see this provider'}</h1>
            <p className="mt-2 text-[14px] leading-relaxed text-body-2">{zh ? '服务商的资料、资质和联系方式只给登录的账号看。登录后可以在站内直接给对方发消息。' : 'A provider’s details, credentials and contact information are shown to signed-in accounts only. Once signed in you can message them on Stayloop.'}</p>
            <Link href={`/login?next=${encodeURIComponent(`/providers/${id}`)}`} className="sl-btn-primary mt-5 inline-block">{zh ? '去登录' : 'Sign in'}</Link>
          </div>
        ) : prov === 'failed' ? (
          <div className="mt-5 rounded-xl bg-amber-50 px-4 py-3 text-[13.5px] text-amber-800">{zh ? '暂时读不到这家服务商，请稍后刷新。' : 'Could not load this provider right now. Please refresh shortly.'}</div>
        ) : !p ? (
          <div className="py-16 text-[14px] text-body-3">…</div>
        ) : (
          <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
            <div className="min-w-0 space-y-6">
              <section className={card} data-testid="provider-profile-head">
                <div className="flex flex-wrap items-start gap-4 sm:gap-5">
                  {/* 128px from sm up; 88px on phones so the name sits beside the avatar instead of under it. */}
                  <span className="hidden sm:block"><ProviderAvatar name={name} size={128} photoUrl={photo} /></span>
                  <span className="sm:hidden"><ProviderAvatar name={name} size={88} photoUrl={photo} /></span>
                  <div className="min-w-0 flex-1 basis-[150px]">
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="min-w-0 break-words text-[22px] font-extrabold leading-tight tracking-tight sm:text-[28px]">{name}</h1>
                      {isTestName(name) && <TestDataTag zh={zh} />}
                    </div>
                    <div className="mt-1 text-[14px] text-body-2" data-testid="provider-profile-descriptor">{trades.map((t) => tradeLabel(t.t)).join(' · ')}</div>
                    {p.legal_name && p.legal_name.trim() !== name && (
                      <div className="break-words text-[14px] text-body-2" data-testid="provider-profile-legal">{zh ? '注册名：' : 'Registered as '}<span className="font-semibold text-body">{p.legal_name}</span></div>
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px] text-body-2">
                      <span className={'rounded-full px-2.5 py-[3px] text-[11.5px] font-bold ' + (complete ? 'bg-[#ECFDF5] text-[#047857]' : 'bg-amber-50 text-amber-800')} data-testid="provider-profile-badge">
                        {complete ? (zh ? '资质已核' : 'Verified') : (zh ? '部分资质待补' : 'Some credentials pending')}
                      </span>
                      {verifiedOn && <span>{zh ? `核于 ${verifiedOn}` : `checked ${verifiedOn}`}</span>}
                      {repair && rating && <span data-testid="provider-profile-rating-line">{rating.avg != null ? `★ ${rating.avg} (${rating.n})` : (zh ? '还没有评价' : 'No reviews yet')}</span>}
                    </div>
                  </div>
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  {!isMine && (
                    <a href="#contact" onClick={toContact} className="sl-btn-primary flex min-h-[44px] items-center justify-center !px-6 !py-0 !text-[14px]" data-testid="provider-profile-message">{zh ? '发消息' : 'Message'}</a>
                  )}
                  {isMine && (
                    <Link href="/provider/onboard" className="sl-btn-primary flex min-h-[44px] items-center justify-center !px-6 !py-0 !text-[14px]" data-testid="provider-profile-edit">{zh ? '编辑资料' : 'Edit profile'}</Link>
                  )}
                  <button type="button" onClick={share} className="flex min-h-[44px] items-center justify-center rounded-xl border border-line-strong px-5 text-[14px] font-semibold text-body transition hover:border-[#C2410C]" data-testid="provider-profile-share">
                    {copied ? (zh ? '链接已复制' : 'Link copied') : (zh ? '分享' : 'Share')}
                  </button>
                </div>
              </section>

              {bio && (
                <section className={card} data-testid="provider-profile-about">
                  <h2 className="text-[16px] font-bold">{zh ? '关于我们' : 'About'}</h2>
                  <p className="mt-2 whitespace-pre-line text-[14.5px] leading-[1.7] text-body-2">{bio}</p>
                </section>
              )}

              <section className={card} data-testid="provider-profile-services">
                <h2 className="text-[16px] font-bold">{zh ? '服务信息' : 'Services'}</h2>
                <div className="mt-3 grid gap-5 sm:grid-cols-2">
                  <div>
                    <div className="text-[12.5px] font-semibold text-body-3">{zh ? '做什么' : 'What they do'}</div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {trades.map((t) => (
                        <span key={t.t} className={'rounded-full px-3 py-1 text-[12.5px] ' + (t.ok ? 'bg-[#FFF3EA] font-semibold text-[#9A3412]' : 'bg-amber-50 text-amber-800')}>
                          {tradeLabel(t.t)}{t.ok ? '' : (zh ? ' · 资质待补' : ' · credentials pending')}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[12.5px] font-semibold text-body-3">{zh ? '服务城市' : 'Serves'}</div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {(p.service_cities ?? []).length > 0
                        ? p.service_cities.map((c) => <span key={c} className="rounded-full border border-line-divider px-3 py-1 text-[12.5px] text-body-2">{c}</span>)
                        : <span className="text-[13px] text-body-3">{zh ? '没有填写' : 'Not given'}</span>}
                    </div>
                  </div>
                  {langs.length > 0 && (
                    <div data-testid="provider-profile-languages">
                      <div className="text-[12.5px] font-semibold text-body-3">{zh ? '语言' : 'Languages'}</div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">{langs.map((c) => <span key={c} className="rounded-full border border-line-divider px-3 py-1 text-[12.5px] text-body-2">{languageLabel(c, zh ? 'zh' : 'en')}</span>)}</div>
                    </div>
                  )}
                  {repair && (
                    <div data-testid="provider-profile-price">
                      <div className="text-[12.5px] font-semibold text-body-3">{zh ? '怎么收费' : 'How they charge'}</div>
                      <div className="mt-1.5 text-[14px] font-semibold">{priceLine(p, zh)}</div>
                      <p className="mt-1 text-[12px] leading-relaxed text-body-3">{zh ? '这是服务商自己登记的价格，实际费用以对方报价为准，由你们直接结算。' : 'These are the provider’s own listed rates; the real cost is whatever they quote, settled between you.'}</p>
                    </div>
                  )}
                </div>
              </section>

              <section className={card} data-testid="provider-profile-credentials">
                <h2 className="text-[16px] font-bold">{zh ? '资质与牌照' : 'Credentials and licences'}</h2>
                {credRows.length === 0 ? (
                  <p className="mt-2 text-[13.5px] text-body-3">{zh ? '还没有核过的资质。' : 'No verified credentials yet.'}</p>
                ) : (
                  <ul className="mt-3 divide-y divide-line-divider">
                    {credRows.map((c) => {
                      const label = CREDENTIAL_LABEL[c.kind]
                      return (
                        <li key={c.kind} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 text-[13.5px]">
                          <span className="min-w-0 flex-1 basis-[220px] font-semibold">{label ? (zh ? label.zh : label.en) : c.kind}</span>
                          <span className={c.expired ? 'text-amber-800' : 'text-body-2'}>
                            {c.expires ? (c.expired ? `${zh ? '已过期' : 'Expired'} ${c.expires}` : `${zh ? '到期' : 'Expires'} ${c.expires}`) : (zh ? '已核' : 'Checked')}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                )}
                <p className="mt-3 text-[12px] leading-relaxed text-body-3">
                  {zh ? '每一项都由 Stayloop 工作人员对照公开注册库或证明文件人工核过；到期后就不再算数。' : 'Each item was checked by a Stayloop staff member against the public register or the certificate; once expired it stops counting.'}
                </p>
              </section>

              {repair && rating && (
                <section className={card} data-testid="provider-profile-reviews">
                  <h2 className="text-[16px] font-bold">{zh ? '评价' : 'Reviews'}</h2>
                  {rating.avg == null ? (
                    <p className="mt-2 text-[13.5px] text-body-3">{zh ? '还没有评价。' : 'No reviews yet.'}</p>
                  ) : (
                    <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {[
                        { n: rating.avg, zh: `总体 · ${rating.n} 条`, en: `Overall · ${rating.n} ${rating.n === 1 ? 'review' : 'reviews'}` },
                        { n: rating.onTime, zh: '准时', en: 'On time' },
                        { n: rating.communication, zh: '沟通', en: 'Communication' },
                        { n: rating.quality, zh: '质量', en: 'Quality' },
                      ].filter((x) => x.n != null).map((x) => (
                        <div key={x.en} className="rounded-xl bg-[#FFF7F0] px-3 py-3">
                          <div className="text-[24px] font-extrabold text-[#9A3412]">{x.n}</div>
                          <div className="text-[12px] leading-snug text-body-2">{zh ? x.zh : x.en}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="mt-2 text-[11.5px] leading-relaxed text-body-3">{zh ? '满分 5 分。只有在 Stayloop 上验收过这家工单的房东和租客可以评价，每张工单每人一次。' : 'Out of 5. Only landlords and tenants whose work order with this provider was accepted on Stayloop can leave one, once per work order.'}</p>
                </section>
              )}
            </div>

            <aside className="min-w-0">
              <div id="contact" className="scroll-mt-24 rounded-2xl border border-line-divider bg-white p-6 lg:sticky lg:top-24" data-testid="provider-profile-contact">
                <h2 className="text-[16px] font-bold">{zh ? `联系 ${name}` : `Contact ${name}`}</h2>
                {isMine ? (
                  <div className="mt-2 text-[13.5px] text-body-2" data-testid="provider-profile-own">
                    {zh ? '这是你在目录里的主页。' : 'This is your page in the directory.'} <Link href="/provider/onboard" className="font-semibold text-brand underline">{zh ? '编辑资料' : 'Edit profile'}</Link>
                  </div>
                ) : (
                  <ProviderContact providerId={p.id} providerName={name} zh={zh} as={activeHat(hats, auth.role)} professional={professionalOnly} />
                )}
                <div className="mt-5 border-t border-line-divider pt-4" data-testid="provider-profile-details">
                  <div className="text-[12.5px] font-semibold text-body-3">{zh ? '对方留的联系方式' : 'Their own contact details'}</div>
                  <div className="mt-2 flex flex-col gap-1.5 text-[13.5px]">
                    {p.contact_email && <a href={`mailto:${p.contact_email}`} className="break-all text-brand underline-offset-2 hover:underline">{p.contact_email}</a>}
                    {p.contact_phone && <a href={`tel:${p.contact_phone.replace(/[^\d+]/g, '')}`} className="text-brand underline-offset-2 hover:underline">{p.contact_phone}</a>}
                    {/* Only a real http(s) address becomes a link; anything else is not shown. */}
                    {site && <a href={site} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-brand underline-offset-2 hover:underline" data-testid="provider-website">{externalHrefLabel(site)}</a>}
                    {!p.contact_email && !p.contact_phone && !site && <span className="text-body-3">{zh ? '这家还没有留联系方式。' : 'No contact details on file.'}</span>}
                  </div>
                </div>
              </div>
            </aside>
          </div>
        )}
        {p && (
          <p className="mt-8 max-w-[860px] text-[12px] leading-relaxed text-body-3" data-testid="provider-profile-note">
            {zh
              ? `「已核」只表示核验当天该编号在公开注册库上有效，不是 Stayloop 的推荐或担保。你和 ${name} 直接联系、直接结算，Stayloop 不抽成、不经手资金${professionalOnly ? '，也不给法律意见、不卖保险' : ''}。`
              : `“Verified” only means the number was valid on the public register on the day checked; it is not a recommendation or guarantee by Stayloop. You contact and pay ${name} directly; Stayloop takes no commission and handles no money${professionalOnly ? ', gives no legal advice and sells no insurance' : ''}.`}
          </p>
        )}
      </main>
      <Footer />
    </div>
  )
}
