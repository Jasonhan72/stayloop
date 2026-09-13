'use client'

// /agent/verify — an agent submits their RECO registration for manual
// verification (design/roles-and-agent-verification-2026-09.md §5).
// We collect only what the public register shows; no ID upload, no SIN.
// A Stayloop admin checks the entries against registrantsearch.reco.on.ca
// by hand (its terms forbid automated / commercial use) and stamps the row.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import WorkspaceShell from '@/components/WorkspaceShell'
import { AgentBadge } from '@/components/AgentBadge'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { useT } from '@/lib/i18n'
import { RECO_REGISTER_URL, categoryLabel, isRecoNumber, statusLabel, type AgentCategory, type AgentProfile } from '@/lib/agentProfile'

export default function AgentVerifyPage() {
  const auth = useAuth()
  const { lang } = useT()
  const zh = lang === 'zh'
  const [row, setRow] = useState<AgentProfile | null | 'loading'>('loading')
  const [f, setF] = useState({ legal_name: '', trade_name: '', reco_number: '', category: 'salesperson' as AgentCategory, brokerage_name: '', business_email: '', business_phone: '', expires_at: '', crea_member: false, attest: false })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (auth.loading) return
    if (!auth.user) { setRow(null); return }
    supabase.from('agent_profiles').select('*').eq('auth_id', auth.user.id).maybeSingle().then(({ data }) => {
      const r = (data as AgentProfile | null) ?? null
      setRow(r)
      if (r) setF({ legal_name: r.legal_name, trade_name: r.trade_name || '', reco_number: r.reco_number, category: r.category, brokerage_name: r.brokerage_name, business_email: r.business_email || '', business_phone: r.business_phone || '', expires_at: r.expires_at || '', crea_member: r.crea_member, attest: !!r.attested_at })
    })
  }, [auth.loading, auth.user])

  async function submit() {
    setErr(null)
    if (!auth.user) return
    if (f.legal_name.trim().length < 3) return setErr(zh ? '请填写与 RECO 注册一致的法定姓名。' : 'Enter your legal name exactly as registered with RECO.')
    if (!isRecoNumber(f.reco_number)) return setErr(zh ? 'RECO 注册号是 7 位数字。' : 'A RECO registration number has 7 digits.')
    if (f.brokerage_name.trim().length < 3) return setErr(zh ? '请填写所属经纪公司的注册名。' : 'Enter your brokerage’s registered name.')
    if (!f.attest) return setErr(zh ? '请勾选承诺。' : 'Please tick the attestation.')
    setBusy(true)
    try {
      const payload = {
        auth_id: auth.user.id,
        legal_name: f.legal_name.trim(), trade_name: f.trade_name.trim() || null,
        reco_number: f.reco_number.trim(), category: f.category, brokerage_name: f.brokerage_name.trim(),
        business_email: f.business_email.trim() || null, business_phone: f.business_phone.trim() || null,
        expires_at: f.expires_at || null, crea_member: f.crea_member, attested_at: new Date().toISOString(),
      }
      const { error } = row && row !== 'loading'
        ? await supabase.from('agent_profiles').update(payload).eq('auth_id', auth.user.id)
        : await supabase.from('agent_profiles').insert(payload)
      if (error) throw error
      await supabase.from('agent_verification_events').insert({ agent_auth_id: auth.user.id, action: row && row !== 'loading' ? 'edited' : 'submitted', actor: auth.user.id })
      const { data } = await supabase.from('agent_profiles').select('*').eq('auth_id', auth.user.id).maybeSingle()
      setRow((data as AgentProfile | null) ?? null)
      setSaved(true)
    } catch (e: any) {
      setErr(/duplicate|unique/i.test(String(e?.message)) ? (zh ? '这个 RECO 注册号已被另一个账号提交。' : 'This RECO number is already submitted by another account.') : String(e?.message || 'failed'))
    } finally {
      setBusy(false)
    }
  }

  const input = 'w-full rounded-lg border border-line-divider bg-white px-3 py-2 text-[14px]'
  const label = 'block text-[12.5px] font-semibold text-body-2'

  return (
    <WorkspaceShell role="agent" hideAside>
      <div className="mx-auto max-w-[720px]">
        <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-body-3">{zh ? '经纪认证' : 'Agent verification'}</div>
        <h1 className="mt-1 text-[24px] font-extrabold tracking-tight">{zh ? '提交你的 RECO 注册信息' : 'Submit your RECO registration'}</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-body-2">
          {zh
            ? '安省交易不动产（含租赁）须在 RECO 注册。我们只收集 RECO 公开注册库上已有的信息，由 Stayloop 工作人员人工对照注册库核验，通常 1 个工作日内完成。不上传证件，不收社会保险号。'
            : 'Trading in real estate in Ontario (rentals included) requires RECO registration. We collect only what RECO’s public register already shows; a Stayloop staff member checks it against the register by hand, usually within one business day. No ID upload, no SIN.'}
          {' '}<a href={RECO_REGISTER_URL} target="_blank" rel="noopener noreferrer" className="underline">{zh ? '查看 RECO 注册库 ↗' : 'Open the RECO register ↗'}</a>
        </p>

        {row && row !== 'loading' && (
          <div className="mt-5 rounded-2xl border border-line-divider bg-white p-4">
            <div className="text-[13px] font-bold">{zh ? '当前状态' : 'Current status'}: {statusLabel(row.status, lang as 'zh' | 'en')}</div>
            <div className="mt-2"><AgentBadge agent={row} lang={lang as 'zh' | 'en'} /></div>
            {row.status === 'rejected' && row.review_note && <div className="mt-2 text-[12.5px] text-red-700">{zh ? '原因：' : 'Reason: '}{row.review_note}</div>}
            {row.status === 'pending' && <div className="mt-2 text-[12.5px] text-body-3">{zh ? '已收到，等待人工核验。改动注册信息会重新进入核验。' : 'Received — awaiting manual verification. Editing the registration facts re-queues it.'}</div>}
          </div>
        )}

        <div className="mt-5 grid gap-4 rounded-2xl border border-line-divider bg-white p-5 sm:grid-cols-2">
          <label className={label}>{zh ? '法定姓名（与 RECO 注册一致）' : 'Legal name (as registered)'}<input className={input} value={f.legal_name} onChange={e => setF({ ...f, legal_name: e.target.value })} autoComplete="name" /></label>
          <label className={label}>{zh ? '常用名（可选，不对外显示）' : 'Trade name (optional, never shown)'}<input className={input} value={f.trade_name} onChange={e => setF({ ...f, trade_name: e.target.value })} /></label>
          <label className={label}>{zh ? 'RECO 注册号（7 位）' : 'RECO registration number (7 digits)'}<input className={input} inputMode="numeric" pattern="[0-9]*" maxLength={7} value={f.reco_number} onChange={e => setF({ ...f, reco_number: e.target.value.replace(/\D/g, '').slice(0, 7) })} /></label>
          <label className={label}>{zh ? '注册类别' : 'Category'}
            <select className={input} value={f.category} onChange={e => setF({ ...f, category: e.target.value as AgentCategory })}>
              {(['salesperson', 'broker', 'broker_of_record'] as AgentCategory[]).map(c => <option key={c} value={c}>{categoryLabel(c, lang as 'zh' | 'en')}</option>)}
            </select>
          </label>
          <label className={`${label} sm:col-span-2`}>{zh ? '所属经纪公司（注册名）' : 'Employing brokerage (registered name)'}<input className={input} value={f.brokerage_name} onChange={e => setF({ ...f, brokerage_name: e.target.value })} autoComplete="organization" /></label>
          <label className={label}>{zh ? '注册到期日' : 'Registration expiry'}<input className={input} type="date" value={f.expires_at} onChange={e => setF({ ...f, expires_at: e.target.value })} /></label>
          <label className={label}>{zh ? '业务邮箱（对租客显示）' : 'Business email (shown to tenants)'}<input className={input} type="email" autoComplete="email" value={f.business_email} onChange={e => setF({ ...f, business_email: e.target.value })} /></label>
          <label className={label}>{zh ? '业务电话（对租客显示）' : 'Business phone (shown to tenants)'}<input className={input} type="tel" autoComplete="tel" value={f.business_phone} onChange={e => setF({ ...f, business_phone: e.target.value })} /></label>
          <label className="flex items-start gap-2 text-[13px] sm:col-span-2"><input type="checkbox" className="mt-[3px]" checked={f.crea_member} onChange={e => setF({ ...f, crea_member: e.target.checked })} /><span>{zh ? '我是 CREA 会员（勾选后可显示 REALTOR® 标记）' : 'I am a CREA member (allows the REALTOR® mark)'}</span></label>
          <label className="flex items-start gap-2 text-[13px] sm:col-span-2"><input type="checkbox" className="mt-[3px]" checked={f.attest} onChange={e => setF({ ...f, attest: e.target.checked })} />
            <span>{zh
              ? '我确认以上信息与 RECO 注册一致；在 Stayloop 上只以注册名与所属经纪公司名展示；向客户提供任何服务前会给出 RECO Information Guide 并签订书面代表协议；转所或注册变更后 24 小时内更新。'
              : 'I confirm the above matches my RECO registration; I will be shown on Stayloop only under my registered name and brokerage; I give clients the RECO Information Guide and a written representation agreement before any service; I will update within 24 hours of a brokerage or registration change.'}</span>
          </label>
          {err && <div className="text-[12.5px] font-semibold text-red-700 sm:col-span-2">⚠ {err}</div>}
          {saved && !err && <div className="text-[12.5px] font-semibold text-emerald-700 sm:col-span-2">✓ {zh ? '已提交，等待人工核验。' : 'Submitted — awaiting manual verification.'}</div>}
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button onClick={submit} disabled={busy || !auth.user} className="sl-btn-primary !py-[10px] disabled:opacity-50">{busy ? '…' : (row && row !== 'loading' ? (zh ? '更新并重新核验' : 'Update and re-verify') : (zh ? '提交核验' : 'Submit for verification'))}</button>
            <Link href="/agent/agent" className="rounded-xl border border-line-divider px-4 py-[10px] text-[13px] text-body-3">{zh ? '稍后再说' : 'Later'}</Link>
          </div>
        </div>

        <p className="mt-4 text-[11.5px] leading-relaxed text-body-3">
          {zh
            ? '认证只表示核验日你在 RECO 公开注册库上处于注册状态；Stayloop 不是经纪公司，不参与交易，不收取任何佣金或转介费。'
            : 'Verification only means you were registered on RECO’s public register on the date checked; Stayloop is not a brokerage, takes no part in trades and receives no commission or referral fee.'}
        </p>
      </div>
    </WorkspaceShell>
  )
}
