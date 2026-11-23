'use client'

// /provider/onboard — a contractor submits their business and credentials
// for manual verification (services marketplace §5). Same trust model as
// /agent/verify: we collect what public registers already show (STO C of Q,
// ESA contractor licence, TSSA gas cert, WSIB clearance number, business
// registration, insurance certificate) and a Stayloop admin checks them by
// hand. The guard trigger keeps status out of self-service reach.
// 2026-11-23: the form asks first which kind of provider is joining — 上门维修 or 专业服务 — the
// same split as the two directory tabs (lib/marketplace/onboardKind.ts). The kind chooses the
// heading, the trades offered, whether rates are asked for, the credential kinds and the wording;
// it is not stored, and a record that lists trades of both kinds keeps all of them.
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import ProviderShell from '@/components/provider/ProviderShell'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { useT } from '@/lib/i18n'
import { invalidateHats } from '@/lib/useHats'
import { externalHref } from '@/lib/ui/externalHref'
import { CITIES, CREDENTIAL_LABEL, TRADES, coverageFor, coverageLabel, isSuperseded, renewalStanding, renewHintText, type CredentialKind, type Trade } from '@/lib/marketplace/trades'
import { useMarketplaceConfig } from '@/lib/marketplace/config'
import ProviderPhotoControl from '@/components/provider/ProviderPhotoControl'
import { providerPhotoUrl } from '@/lib/providerPhotoKeys'
import { providerHref } from '@/lib/marketplace/directory'
import { AGENT_LANGUAGES, BIO_MAX, LANG_MAX, cleanLanguages } from '@/lib/agentPublic'
import { ONBOARD_COPY, ONBOARD_KINDS, PROFESSIONAL_REMOVE_CONFIRM, attestText, credentialKindsFor, onboardHref, onboardKindOf, selectedOfKind, selectedOfOtherKind, tradesOfKind, type OnboardKind } from '@/lib/marketplace/onboardKind'

type Provider = { id: string; legal_name: string; trade_name: string | null; business_number: string | null; service_cities: string[]; trades: string[]; pricing_mode: string; call_out_fee: number | null; hourly_rate: number | null; contact_name: string | null; contact_email: string | null; contact_phone: string | null; website: string | null; status: string; review_note: string | null; verified_at: string | null; attested_at: string | null; bio: string | null; languages: string[] | null; photo_key: string | null }
type Cred = { id: string; kind: CredentialKind; number: string | null; holder_name: string | null; expires_at: string | null; verified_at: string | null }

const STATUS_LABEL: Record<string, { zh: string; en: string }> = { pending: { zh: '待核验', en: 'pending verification' }, verified: { zh: '已核验', en: 'verified' }, rejected: { zh: '未通过', en: 'rejected' }, suspended: { zh: '已暂停', en: 'suspended' }, expired: { zh: '已过期', en: 'expired' } }

// The shared provider frame (rail + phone bar once the account has a provider record).
function Shell({ children }: { children: React.ReactNode }) {
  return <ProviderShell narrow>{children}</ProviderShell>
}

export default function ProviderOnboardPage() {
  const auth = useAuth()
  const { lang } = useT()
  const zh = lang === 'zh'
  const [row, setRow] = useState<Provider | null | 'loading'>('loading')
  const [creds, setCreds] = useState<Cred[]>([])
  const [f, setF] = useState({ legal_name: '', trade_name: '', business_number: '', service_cities: [] as string[], trades: [] as string[], pricing_mode: 'hourly', call_out_fee: '', hourly_rate: '', contact_name: '', contact_email: '', contact_phone: '', website: '', attest: false, bio: '', languages: [] as string[] })
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  // Which form is showing. Set once the record is known (or from ?type= for a newcomer) — never on first paint.
  const [kind, setKind] = useState<OnboardKind>('repair')
  const [cf, setCf] = useState({ kind: 'business_registration' as CredentialKind, number: '', holder_name: '', expires_at: '' })
  // Edit a row in place (a typo, a new expiry) or renew it as a new row; the
  // reminder email says "update the number and expiry" — this is where.
  const [editing, setEditing] = useState<string | null>(null)
  const [ef, setEf] = useState({ number: '', holder_name: '', expires_at: '' })
  // The row being renewed (not just its kind): the hint depends on whether that record still counts.
  const [renewHint, setRenewHint] = useState<Cred | null>(null)
  // Inline two-step confirm for removing a credential (no native window.confirm).
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const { graceDays } = useMarketplaceConfig()

  const load = useCallback(async () => {
    if (!auth.user) { setRow(null); setKind(onboardKindOf(null, new URLSearchParams(window.location.search).get('type'))); return }
    const { data } = await supabase.from('service_providers').select('*').eq('auth_id', auth.user.id).maybeSingle()
    const r = (data as Provider | null) ?? null
    setRow(r)
    const opened = onboardKindOf(r?.trades, new URLSearchParams(window.location.search).get('type'))
    setKind(opened)
    setCf((c) => ({ ...c, kind: credentialKindsFor(opened)[0] }))
    if (r) {
      setF({ legal_name: r.legal_name, trade_name: r.trade_name || '', business_number: r.business_number || '', service_cities: r.service_cities || [], trades: r.trades || [], pricing_mode: r.pricing_mode, call_out_fee: r.call_out_fee != null ? String(r.call_out_fee) : '', hourly_rate: r.hourly_rate != null ? String(r.hourly_rate) : '', contact_name: r.contact_name || '', contact_email: r.contact_email || auth.user.email || '', contact_phone: r.contact_phone || '', website: r.website || '', attest: !!r.attested_at, bio: r.bio || '', languages: cleanLanguages(r.languages) })
      setPhotoUrl(providerPhotoUrl(r.photo_key))
      const { data: c } = await supabase.from('provider_credentials').select('id, kind, number, holder_name, expires_at, verified_at').eq('provider_id', r.id).order('created_at')
      setCreds((c ?? []) as Cred[])
    } else setF((x) => ({ ...x, contact_email: auth.user?.email || '' }))
  }, [auth.user])
  useEffect(() => { if (!auth.loading) void load() }, [auth.loading, load])

  async function submit() {
    setErr(null); setSaved(false)
    if (!auth.user) return
    if (f.legal_name.trim().length < 2) return setErr(zh ? '请填写注册的法定名称。' : 'Enter the registered legal name.')
    if (!f.trades.length) return setErr(kind === 'professional' ? (zh ? '至少选一个服务类别。' : 'Pick at least one service.') : (zh ? '至少选一个工种。' : 'Pick at least one trade.'))
    if (!f.service_cities.length) return setErr(zh ? '至少选一个服务城市。' : 'Pick at least one city.')
    if (!f.attest) return setErr(zh ? '请勾选承诺。' : 'Please tick the attestation.')
    // The website is shown as a link to landlords and tenants: save only a full http(s) address (S3-32).
    const website = f.website.trim() ? externalHref(f.website) : null
    if (f.website.trim() && !website) return setErr(zh ? '请填写完整网址，例如 https://example.com' : 'Enter a full web address, for example https://example.com')
    if (f.bio.trim().length > BIO_MAX) return setErr(zh ? `简介最多 ${BIO_MAX} 个字。` : `The introduction is at most ${BIO_MAX} characters.`)
    setBusy(true)
    const payload = { auth_id: auth.user.id, legal_name: f.legal_name.trim(), trade_name: f.trade_name.trim() || null, business_number: f.business_number.trim() || null, service_cities: f.service_cities, trades: f.trades, pricing_mode: f.pricing_mode, call_out_fee: f.call_out_fee === '' ? null : Number(f.call_out_fee), hourly_rate: f.hourly_rate === '' ? null : Number(f.hourly_rate), contact_name: f.contact_name.trim() || null, contact_email: f.contact_email.trim() || null, contact_phone: f.contact_phone.trim() || null, website, bio: f.bio.trim() || null, languages: cleanLanguages(f.languages), attested_at: new Date().toISOString() }
    const { error } = row && row !== 'loading' ? await supabase.from('service_providers').update(payload).eq('auth_id', auth.user.id) : await supabase.from('service_providers').insert(payload)
    if (error) setErr(error.message)
    else { invalidateHats(); setSaved(true); await load() }
    setBusy(false)
  }
  async function addCred() {
    if (!row || row === 'loading') return
    setBusy(true); setErr(null)
    const { error } = await supabase.from('provider_credentials').insert({ provider_id: row.id, kind: cf.kind, number: cf.number.trim() || null, holder_name: cf.holder_name.trim() || null, expires_at: cf.expires_at || null })
    if (error) setErr(error.message); else { setCf({ kind: credentialKindsFor(kind)[0], number: '', holder_name: '', expires_at: '' }); setRenewHint(null); await load() }
    setBusy(false)
  }
  async function saveCred(c: Cred) {
    setBusy(true); setErr(null)
    // The guard trigger un-verifies the row when the number or expiry changes.
    const { error } = await supabase.from('provider_credentials').update({ number: ef.number.trim() || null, holder_name: ef.holder_name.trim() || null, expires_at: ef.expires_at || null }).eq('id', c.id)
    if (error) setErr(error.message); else { setEditing(null); await load() }
    setBusy(false)
  }
  function renewCred(c: Cred) {
    setEditing(null)
    setCf({ kind: c.kind, number: '', holder_name: c.holder_name || '', expires_at: '' })
    setRenewHint(c)
  }
  async function delCred(id: string) { setConfirmDel(null); await supabase.from('provider_credentials').delete().eq('id', id); await load() }

  const input = 'w-full rounded-lg border border-line-divider bg-white px-3 py-2 text-[14px]'
  const label = 'block text-[12.5px] font-semibold text-body-2'
  const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])
  const L = zh ? 'zh' : 'en'
  const copy = ONBOARD_COPY[kind]
  const shownTrades = selectedOfKind(f.trades, kind)
  const otherTrades = selectedOfOtherKind(f.trades, kind)
  const credKinds = credentialKindsFor(kind)
  // Switching the form never touches the trades already picked; it only changes what is on screen.
  const chooseKind = (k: OnboardKind) => { if (k === kind) return; setKind(k); setCf({ kind: credentialKindsFor(k)[0], number: '', holder_name: '', expires_at: '' }); setRenewHint(null); setErr(null); setSaved(false) }

  if (auth.loading || row === 'loading') return <Shell><div className="text-body-3">…</div></Shell>
  if (!auth.user) return <Shell><div className="rounded-2xl border border-line-divider bg-white p-6 text-[14px]">{zh ? '请先登录再入驻。' : 'Sign in to onboard.'} <Link href={`/login?next=${encodeURIComponent(onboardHref(kind))}`} className="underline">{zh ? '登录' : 'Sign in'}</Link></div></Shell>

  return (
    <Shell>
      <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-body-3">{zh ? '服务商入驻' : 'Provider onboarding'}</div>
      <h1 className="mt-1 text-[24px] font-extrabold tracking-tight" data-testid="onboard-title">{copy.title[L]}</h1>
      <p className="mt-2 text-[13.5px] leading-relaxed text-body-2" data-testid="onboard-intro">{copy.intro[L]}</p>

      <div className="mt-5 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={zh ? '你提供哪一类服务' : 'Which kind of service you provide'} data-testid="onboard-kind">
        {ONBOARD_KINDS.map((k) => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => chooseKind(k)} data-testid={`onboard-kind-${k}`}
            className={'min-w-0 rounded-2xl border bg-white px-4 py-3 text-left transition ' + (kind === k ? 'border-brand ring-1 ring-brand' : 'border-line-divider hover:border-line-strong')}>
            <div className={'text-[14.5px] font-extrabold ' + (kind === k ? 'text-brand' : '')}>{ONBOARD_COPY[k].choice[L]}</div>
            <div className="mt-0.5 text-[12px] leading-relaxed text-body-2">{ONBOARD_COPY[k].choiceSub[L]}</div>
          </button>
        ))}
      </div>

      {row && (
        <div className="mt-5 rounded-2xl border border-line-divider bg-white p-4 text-[13px]">
          <b>{zh ? '当前状态' : 'Status'}:</b> {zh ? STATUS_LABEL[row.status]?.zh ?? row.status : STATUS_LABEL[row.status]?.en ?? row.status}{row.verified_at ? ` · ${zh ? '核于' : 'verified'} ${row.verified_at.slice(0, 10)}` : ''}
          {row.review_note && row.status !== 'verified' && <div className="mt-1 text-danger">{row.review_note}</div>}
          {row.status === 'verified' && <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">{selectedOfKind(row.trades ?? [], 'repair').length > 0 && <Link href="/provider/jobs" className="font-bold text-brand underline underline-offset-2" data-testid="onboard-jobs-link">{zh ? '去看工单 →' : 'Go to jobs →'}</Link>}<Link href={providerHref(row.id)} className="font-bold text-brand underline underline-offset-2" data-testid="onboard-view-page">{zh ? '看我的主页 →' : 'View my page →'}</Link></div>}
        </div>
      )}

      <div className="mt-5 grid gap-4 rounded-2xl border border-line-divider bg-white p-5 sm:grid-cols-2">
        <label className={label}>{zh ? '法定名称（注册名）' : 'Legal name (as registered)'}<input className={input} value={f.legal_name} onChange={(e) => setF({ ...f, legal_name: e.target.value })} /></label>
        <label className={label}>{copy.tradeName[L]}<input className={input} value={f.trade_name} onChange={(e) => setF({ ...f, trade_name: e.target.value })} /></label>
        <label className={label}>{zh ? '企业注册号 / BN' : 'Business number / BN'}<input className={input} value={f.business_number} onChange={(e) => setF({ ...f, business_number: e.target.value })} /></label>
        <label className={label}>{zh ? '网站（可选）' : 'Website (optional)'}<input className={input} type="text" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="https://example.com" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} data-testid="provider-website" /></label>
        <div className="sm:col-span-2"><div className={label}>{copy.tradesLabel[L]}</div><div className="mt-1 flex flex-wrap gap-1.5" data-testid="onboard-trades">{TRADES.filter((t) => tradesOfKind(kind).includes(t.key)).map((t) => <button key={t.key} type="button" aria-pressed={f.trades.includes(t.key)} onClick={() => setF({ ...f, trades: toggle(f.trades, t.key) })} className={'rounded-full border px-3 py-1 text-[12.5px] ' + (f.trades.includes(t.key) ? 'border-brand bg-brand/10 font-bold text-brand' : 'border-line-divider')}>{zh ? t.zh : t.en}</button>)}</div>
          {otherTrades.length > 0 && (
            <p className="mt-2 text-[12px] leading-relaxed text-body-2" data-testid="onboard-other-kind">
              {zh ? `你的资料里还有「${ONBOARD_COPY[kind === 'repair' ? 'professional' : 'repair'].choice.zh}」的项目：` : `Your record also lists ${ONBOARD_COPY[kind === 'repair' ? 'professional' : 'repair'].choice.en.toLowerCase()}: `}
              {otherTrades.map((t) => { const d = TRADES.find((x) => x.key === t); return d ? (zh ? d.zh : d.en) : t }).join(zh ? '、' : ', ')}{zh ? '。' : '. '}
              <button type="button" onClick={() => chooseKind(kind === 'repair' ? 'professional' : 'repair')} className="font-semibold text-brand underline underline-offset-2">{zh ? '切过去查看' : 'Switch to see them'}</button>
            </p>
          )}
          {row && shownTrades.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5" data-testid="trade-coverage">
              {shownTrades.map((t) => { const d = TRADES.find((x) => x.key === t); const c = coverageLabel(t as Trade, creds, zh, new Date(), graceDays); return <span key={t} className={'rounded-full px-2.5 py-[3px] text-[11.5px] ' + (c.ok ? 'bg-success/10 text-success' : 'bg-amber-50 text-amber-800')}>{d ? (zh ? d.zh : d.en) : t} · {c.text}</span> })}
            </div>
          )}
          <p className="mt-1 text-[11.5px] text-body-3">{kind === 'professional' ? (zh ? '每个类别要求的牌照：' : 'Required per service: ') : (zh ? '每个工种要求的资质：' : 'Required per trade: ')}{shownTrades.map((t) => { const d = TRADES.find((x) => x.key === t); return d ? `${zh ? d.zh : d.en} → ${d.required.map((k) => (zh ? CREDENTIAL_LABEL[k].zh : CREDENTIAL_LABEL[k].en)).join(zh ? '、' : ', ')}` : '' }).filter(Boolean).join('；') || (kind === 'professional' ? (zh ? '先选类别。' : 'pick a service first.') : (zh ? '先选工种。' : 'pick a trade first.'))}</p>
        </div>
        <div className="sm:col-span-2"><div className={label}>{zh ? '服务城市' : 'Service cities'}</div><div className="mt-1 flex flex-wrap gap-1.5">{CITIES.map((c) => <button key={c} type="button" onClick={() => setF({ ...f, service_cities: toggle(f.service_cities, c) })} className={'rounded-full border px-3 py-1 text-[12.5px] ' + (f.service_cities.includes(c) ? 'border-brand bg-brand/10 font-bold text-brand' : 'border-line-divider')}>{c}</button>)}</div></div>
        {/* Rates are what a dispatch offer quotes from; nothing is dispatched to a professional, and a licensed one posts no fee here. */}
        {kind === 'repair' && <label className={label} data-testid="onboard-pricing">{zh ? '定价方式' : 'Pricing'}<select className={input} value={f.pricing_mode} onChange={(e) => setF({ ...f, pricing_mode: e.target.value })}><option value="hourly">{zh ? '按工时' : 'Hourly'}</option><option value="fixed">{zh ? '固定报价' : 'Fixed quotes'}</option></select></label>}
        {kind === 'repair' && <div className="grid grid-cols-2 gap-2">
          <label className={label}>{zh ? '时薪 $' : 'Hourly $'}<input className={input} inputMode="decimal" value={f.hourly_rate} onChange={(e) => setF({ ...f, hourly_rate: e.target.value })} /></label>
          <label className={label}>{zh ? '上门费 $' : 'Call-out $'}<input className={input} inputMode="decimal" value={f.call_out_fee} onChange={(e) => setF({ ...f, call_out_fee: e.target.value })} /></label>
        </div>}
        <label className={label}>{zh ? '联系人' : 'Contact name'}<input className={input} value={f.contact_name} onChange={(e) => setF({ ...f, contact_name: e.target.value })} /></label>
        <label className={label}>{copy.email[L]}<input className={input} type="email" value={f.contact_email} onChange={(e) => setF({ ...f, contact_email: e.target.value })} /></label>
        <label className={label}>{zh ? '电话' : 'Phone'}<input className={input} type="tel" value={f.contact_phone} onChange={(e) => setF({ ...f, contact_phone: e.target.value })} /></label>
        {/* 2026-11-23: what the provider's page shows about them beyond the registered facts. None of it
            is verified by Stayloop and changing it does not send the record back to pending. */}
        <div className="border-t border-line-divider pt-4 sm:col-span-2" data-testid="onboard-profile-content">
          <div className="text-[13.5px] font-extrabold">{zh ? '主页上的介绍' : 'What your page says about you'}</div>
          <p className="mt-0.5 text-[12px] leading-relaxed text-body-3">{zh ? '显示在目录卡片和你的主页上，给房东和租客看。这部分不属于核验内容，随时可以改。' : 'Shown on your directory card and your page, to landlords and tenants. It is not part of verification and can be changed at any time.'}</p>
          {row ? (
            <div className="mt-3"><ProviderPhotoControl zh={zh} name={f.trade_name.trim() || f.legal_name.trim() || '?'} photoUrl={photoUrl} onChange={setPhotoUrl} /></div>
          ) : (
            <p className="mt-2 text-[12px] text-body-3" data-testid="onboard-photo-later">{zh ? '提交资料后可以在这里上传头像或标志。' : 'You can upload a photo or logo here once your details are submitted.'}</p>
          )}
          <label className={label + ' mt-4'}>{zh ? '简介（可选）' : 'Introduction (optional)'}
            <textarea className={input + ' h-28'} maxLength={BIO_MAX} value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} placeholder={copy.bioHint[L]} data-testid="onboard-bio" />
          </label>
          <div className="mt-1 text-right text-[11.5px] text-body-3">{f.bio.length} / {BIO_MAX}</div>
          <div className={label}>{zh ? '服务语言（可选）' : 'Languages (optional)'}</div>
          <div className="mt-1 flex flex-wrap gap-1.5" data-testid="onboard-languages">
            {AGENT_LANGUAGES.map((l) => {
              const on = f.languages.includes(l.code)
              return <button key={l.code} type="button" aria-pressed={on} disabled={!on && f.languages.length >= LANG_MAX} onClick={() => setF({ ...f, languages: toggle(f.languages, l.code) })} className={'rounded-full border px-3 py-1 text-[12.5px] disabled:opacity-40 ' + (on ? 'border-brand bg-brand/10 font-semibold text-brand' : 'border-line-divider bg-white text-body-2')}>{zh ? l.zh : l.en}</button>
            })}
          </div>
        </div>
        <label className="flex items-start gap-2 text-[13px] sm:col-span-2"><input type="checkbox" className="mt-[3px]" checked={f.attest} onChange={(e) => setF({ ...f, attest: e.target.checked })} /><span data-testid="onboard-attest">{attestText(f.trades, kind, zh)}</span></label>
        {err && <div role="alert" className="text-[12.5px] font-semibold text-danger sm:col-span-2">⚠ {err}</div>}
        {saved && !err && (() => {
          const gaps = shownTrades.map((t) => { const d = TRADES.find((x) => x.key === t); const cov = coverageFor(t as Trade, creds, new Date(), graceDays); return d && !cov.ok ? `${zh ? d.zh : d.en} → ${[...cov.missing, ...cov.expired, ...cov.unverified].map((k) => (zh ? CREDENTIAL_LABEL[k].zh : CREDENTIAL_LABEL[k].en)).join(zh ? '、' : ', ')}` : null }).filter(Boolean) as string[]
          return <div className="text-[12.5px] font-semibold text-success sm:col-span-2" data-testid="save-coverage-hint">✓ {zh ? '已保存。' : 'Saved.'} {gaps.length ? <span className="text-amber-800">{copy.missing[L]}{gaps.join(zh ? '；' : '; ')}</span> : <span>{kind === 'professional' ? (zh ? '所选类别的牌照都已登记。' : 'Every service has its licence on file.') : (zh ? '所有工种的资质都已登记。' : 'Every trade has its credentials on file.')}</span>}</div>
        })()}
        <div className="sm:col-span-2"><button onClick={() => void submit()} disabled={busy} className="sl-btn-primary !py-[10px] disabled:opacity-50">{row ? (zh ? '更新（改注册事实会重新核验）' : 'Update (changing facts re-verifies)') : (zh ? '提交入驻' : 'Submit')}</button></div>
      </div>

      {row && (
        <div className="mt-5 rounded-2xl border border-line-divider bg-white p-5">
          <h2 className="text-[15px] font-extrabold" data-testid="onboard-cred-title">{copy.credTitle[L]}</h2>
          <p className="mt-1 text-[12px] text-body-3">{copy.credHint[L]}</p>
          <div className="mt-3 divide-y divide-line-divider">
            {creds.map((c) => (
              <div key={c.id} className="py-2 text-[12.5px]" data-testid="credential-row">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{zh ? CREDENTIAL_LABEL[c.kind].zh : CREDENTIAL_LABEL[c.kind].en}</span>
                  <span className="font-mono text-body-2">{c.number || '—'}</span>
                  {c.holder_name && <span className="text-body-3">{c.holder_name}</span>}
                  <span className="text-body-3">{c.expires_at ? `${zh ? '到期' : 'exp'} ${c.expires_at}` : (zh ? '无到期' : 'no expiry')}</span>
                  {isSuperseded(c, creds) && <span className="rounded-full bg-surface-chip px-2 py-[2px] text-[10.5px] text-body-3" data-testid="credential-superseded">{zh ? '已有核验过的续期记录 · 不再提醒' : 'renewal verified · no more reminders'}</span>}
                  <span className={'ml-auto rounded-full px-2 py-[2px] font-mono text-[10.5px] font-bold ' + (c.verified_at ? 'bg-success/10 text-success' : 'bg-amber-50 text-amber-800')}>{c.verified_at ? (zh ? '已核' : 'verified') : (zh ? '待核' : 'pending')}</span>
                  <button onClick={() => { setEditing(editing === c.id ? null : c.id); setEf({ number: c.number || '', holder_name: c.holder_name || '', expires_at: c.expires_at || '' }) }} className="min-h-[36px] px-2 text-[11px] text-body-3 underline" data-testid="credential-edit">{zh ? '更新' : 'edit'}</button>
                  {c.expires_at && <button onClick={() => renewCred(c)} className="min-h-[36px] px-2 text-[11px] text-body-3 underline" data-testid="credential-renew">{zh ? '续期' : 'renew'}</button>}
                  {confirmDel !== c.id && <button type="button" onClick={() => setConfirmDel(c.id)} className="min-h-[36px] px-2 text-[11px] text-body-3 underline" data-testid="credential-remove">{zh ? '删除' : 'remove'}</button>}
                </div>
                {confirmDel === c.id && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-surface-chip p-3 text-[12px]" data-testid="credential-remove-confirm">
                    <span className="text-body-2">{kind === 'professional' ? PROFESSIONAL_REMOVE_CONFIRM[L] : zh ? '删除这条资质？已核验的记录也会一起删除；如果它是该工种唯一有效的一条，派单会立刻跳过你。续期请用「续期」。' : 'Remove this credential? Its verification goes with it; if it is the only valid one for a trade, dispatch skips you at once. To renew, use “renew”.'}</span>
                    <button type="button" disabled={busy} onClick={() => void delCred(c.id)} className="rounded-full bg-danger px-3 py-1 text-[12px] font-semibold text-white disabled:opacity-50">{zh ? '确认删除' : 'Confirm remove'}</button>
                    <button type="button" onClick={() => setConfirmDel(null)} className="rounded-full border border-line-divider bg-white px-3 py-1 text-[12px] text-body-3">{zh ? '取消' : 'Cancel'}</button>
                  </div>
                )}
                {editing === c.id && (
                  <div className="mt-2 grid gap-2 rounded-lg bg-surface-chip p-3 sm:grid-cols-3">
                    <input className={input} placeholder={zh ? '编号' : 'Number'} value={ef.number} onChange={(e) => setEf({ ...ef, number: e.target.value })} />
                    <input className={input} placeholder={zh ? '持证人（如与公司不同）' : 'Holder (if a person)'} value={ef.holder_name} onChange={(e) => setEf({ ...ef, holder_name: e.target.value })} />
                    <input className={input} type="date" value={ef.expires_at} onChange={(e) => setEf({ ...ef, expires_at: e.target.value })} />
                    <p className="text-[11.5px] text-body-3 sm:col-span-3">{zh ? '改编号或到期日后这条资质要重新核验，核验通过前不计入工种覆盖。只是续期、又不想中断派单？点「续期」添加新记录：新记录核验通过后，旧记录不再提醒。' : 'Changing the number or expiry sends this credential back for verification; until then it does not count toward coverage. Renewing and do not want a gap? Use “renew” to add a new record — once it is verified, the old one stops sending reminders.'}</p>
                    <div className="flex gap-2 sm:col-span-3">
                      <button onClick={() => void saveCred(c)} disabled={busy} className="rounded-full bg-brand px-4 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-50">{zh ? '保存' : 'Save'}</button>
                      <button onClick={() => setEditing(null)} className="rounded-full border border-line-strong px-4 py-1.5 text-[12.5px] font-bold">{zh ? '取消' : 'Cancel'}</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          {renewHint && <p className="mt-3 rounded-lg bg-brand/5 px-3 py-2 text-[12px] text-body-2" data-testid="credential-renew-hint">{renewHintText(renewHint.kind, renewalStanding(creds.find((x) => x.id === renewHint.id) ?? renewHint, creds, new Date(), graceDays), zh)}</p>}
          <div className="mt-3 grid gap-2 sm:grid-cols-4">
            <select className={input} value={cf.kind} onChange={(e) => setCf({ ...cf, kind: e.target.value as CredentialKind })}>{(credKinds.includes(cf.kind) ? credKinds : [cf.kind, ...credKinds]).map((k) => <option key={k} value={k}>{zh ? CREDENTIAL_LABEL[k].zh : CREDENTIAL_LABEL[k].en}</option>)}</select>
            <input className={input} placeholder={zh ? '编号' : 'Number'} value={cf.number} onChange={(e) => setCf({ ...cf, number: e.target.value })} />
            <input className={input} placeholder={zh ? '持证人（如与公司不同）' : 'Holder (if a person)'} value={cf.holder_name} onChange={(e) => setCf({ ...cf, holder_name: e.target.value })} />
            <input className={input} type="date" value={cf.expires_at} onChange={(e) => setCf({ ...cf, expires_at: e.target.value })} />
            <div className="sm:col-span-4"><button onClick={() => void addCred()} disabled={busy} className="rounded-full border border-brand px-4 py-1.5 text-[12.5px] font-bold text-brand disabled:opacity-50">{zh ? '+ 添加资质' : '+ Add credential'}</button>{CREDENTIAL_LABEL[cf.kind].url && <a className="ml-3 text-[11.5px] text-body-3 underline" href={CREDENTIAL_LABEL[cf.kind].url} target="_blank" rel="noopener noreferrer">{CREDENTIAL_LABEL[cf.kind].register} ↗</a>}</div>
          </div>
        </div>
      )}
      <p className="mt-4 text-[11.5px] leading-relaxed text-body-3" data-testid="onboard-footer">{copy.footer[L]}</p>
    </Shell>
  )
}
