'use client'

// 租客护照 · 申请包 (V1.0 阶段 4 · 乙 #7 · G14, 2026-10-16).
//
// Everything on this page is real: the applicant's own pack (four
// self-declared sections + files + consent, lib/profile/*), the preview /
// printable export (lib/profile/exportPack.ts), the read-only share link
// (/p/<token>: initials + on-time rent record from leases both sides
// confirmed), the Stayloop API read scopes on that link, and the
// rent-reporting waitlist. The four sample stamps, the sample view log and
// the sample verification history are gone — nothing here is a placeholder.
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import AIProactive, { type AIInsight } from '@/components/AIProactive'
import WorkspaceShell from '@/components/WorkspaceShell'
import { AsideBlock, PageHeader, SectionCard, StatStrip } from '@/components/workspace'
import ProfileConsent from '@/components/profile/ProfileConsent'
import ProfileFiles from '@/components/profile/ProfileFiles'
import ProfileSections, { type ProfileDraft } from '@/components/profile/ProfileSections'
import { writeAuditEvent } from '@/lib/agent/audit'
import { useT, type Lang } from '@/lib/i18n'
import { APPLICANT_PROFILE_CONSENT_VERSION, hasCurrentConsent, presentedMetadata } from '@/lib/profile/consent'
import { packDisplayName, renderApplicantPack, sectionCompleteness, type PackVerified } from '@/lib/profile/exportPack'
import { freshness } from '@/lib/profile/freshness'
import { stayloopHistory } from '@/lib/profile/history'
import { PROFILE_FILE_KINDS, type ApplicantProfile, type ProfileFile, type ProfileHistoryEntry, type StayloopHistoryEntry } from '@/lib/profile/types'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'

/** 24 random bytes → 32-char base64url token (matches the DB check: ≥32, [A-Za-z0-9_-]). */
function generateShareToken(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  let bin = ''
  bytes.forEach((b) => {
    bin += String.fromCharCode(b)
  })
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const PROFILE_COLUMNS = 'auth_id,first_name,last_name,phone,current_address,date_of_birth,employment_status,employer_name,job_title,employment_start_date,monthly_income,employer_phone,employer_email,num_occupants,has_pets,pet_details,is_smoker,additional_notes,consent_version,consent_at,created_at,updated_at'
const HISTORY_COLUMNS = 'id,auth_id,position,prev_address,prev_landlord_name,prev_landlord_phone,prev_landlord_email,prev_rent,prev_move_in,prev_move_out,reason_for_leaving,created_at,updated_at'
const FILE_COLUMNS = 'id,auth_id,kind,path,name,size,mime,sha256,as_of,uploaded_at'

export default function TenantPassport() {
  const { lang } = useT()
  const zh = lang === 'zh'
  const { user } = useAuth()
  const uid = user?.id ?? null
  const [copied, setCopied] = useState(false)

  // ── Applicant pack (own rows, plain RLS) ──
  const [profile, setProfile] = useState<ApplicantProfile | null>(null)
  const [history, setHistory] = useState<ProfileHistoryEntry[]>([])
  const [stayloop, setStayloop] = useState<StayloopHistoryEntry[]>([])
  const [files, setFiles] = useState<ProfileFile[]>([])
  const [verified, setVerified] = useState<PackVerified>({})
  const [packLoaded, setPackLoaded] = useState(false)
  const [consentBusy, setConsentBusy] = useState(false)
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [exportErr, setExportErr] = useState<string | null>(null)

  const loadProfile = useCallback(async () => {
    if (!uid) return
    const { data } = await supabase.from('applicant_profiles').select(PROFILE_COLUMNS).eq('auth_id', uid).maybeSingle()
    setProfile((data as ApplicantProfile | null) ?? null)
  }, [uid])
  const loadHistory = useCallback(async () => {
    if (!uid) return
    const { data } = await supabase.from('applicant_profile_history').select(HISTORY_COLUMNS).eq('auth_id', uid).order('position', { ascending: true })
    setHistory((data as ProfileHistoryEntry[] | null) ?? [])
  }, [uid])
  const loadFiles = useCallback(async () => {
    if (!uid) return
    const { data } = await supabase.from('applicant_profile_files').select(FILE_COLUMNS).eq('auth_id', uid).order('uploaded_at', { ascending: false })
    setFiles((data as ProfileFile[] | null) ?? [])
  }, [uid])

  useEffect(() => {
    if (!uid) {
      setProfile(null); setHistory([]); setStayloop([]); setFiles([]); setVerified({}); setPackLoaded(false)
      return
    }
    let cancelled = false
    const email = user?.email ?? null
    Promise.all([
      loadProfile(),
      loadHistory(),
      loadFiles(),
      stayloopHistory(supabase, uid, email).then((rows) => { if (!cancelled) setStayloop(rows) }).catch(() => {}),
      // Applicant-authorised verification steps (Veriff identity / Flinks bank). The
      // table's policy is landlord-only, so for most tenants this reads nothing and
      // only the Stayloop-confirmed tenancies carry「已核验」. Best-effort, never blocking.
      (async () => {
        if (!email) return
        try {
          const { data } = await supabase.from('verification_requests').select('steps,status').eq('tenant_email', email).in('status', ['consented', 'complete']).order('updated_at', { ascending: false }).limit(5)
          type Step = { status?: string; sandbox?: boolean }
          const ok = (k: string) => (data ?? []).some((r) => { const st = (r.steps as Record<string, Step> | null)?.[k]; return !!st && st.status === 'verified' && !st.sandbox })
          if (!cancelled) setVerified({ identity: ok('identity'), income: ok('bank') })
        } catch { /* tolerated */ }
      })(),
    ]).finally(() => { if (!cancelled) setPackLoaded(true) })
    return () => { cancelled = true }
  }, [uid, user?.email, loadProfile, loadHistory, loadFiles])

  const saveProfile = useCallback(async (patch: ProfileDraft): Promise<string | null> => {
    if (!uid) return zh ? '请先登录。' : 'Please sign in first.'
    const { error } = await supabase.from('applicant_profiles').upsert({ auth_id: uid, ...patch }, { onConflict: 'auth_id' })
    if (error) return zh ? '没保存上，请稍后再试。' : 'Could not save — try again shortly.'
    await loadProfile()
    return null
  }, [uid, zh, loadProfile])

  const consented = hasCurrentConsent(profile)
  const toggleConsent = async (next: boolean) => {
    if (!uid || consentBusy) return
    setConsentBusy(true)
    await saveProfile(next ? { consent_version: APPLICANT_PROFILE_CONSENT_VERSION, consent_at: new Date().toISOString() } : { consent_version: null, consent_at: null })
    setConsentBusy(false)
    if (!next) setPreviewHtml(null)
  }

  const completeness = useMemo(() => sectionCompleteness(profile, history, stayloop), [profile, history, stayloop])
  const filledSections = Object.values(completeness).filter(Boolean).length
  const staleFiles = useMemo(() => files.filter((f) => freshness(f.kind, f.as_of ?? f.uploaded_at).state !== 'fresh'), [files])
  const packScope = useMemo(() => {
    const s: string[] = []
    if (completeness.identity) s.push('identity')
    if (completeness.employment) s.push('employment')
    if (completeness.history) s.push('history')
    if (completeness.other) s.push('other')
    if (files.length) s.push('files')
    return s
  }, [completeness, files.length])

  const buildHtml = () => renderApplicantPack({ profile, history, stayloopHistory: stayloop, files, lang: zh ? 'zh' : 'en', verified })

  const handlePreview = () => {
    if (!consented) return
    setPreviewHtml(buildHtml())
  }
  const handleExport = () => {
    if (!uid || !consented) return
    setExportErr(null)
    const html = buildHtml()
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }))
    const win = window.open(url, '_blank')
    if (!win) { setExportErr(zh ? '浏览器拦住了新标签页，请允许弹出窗口后再试。' : 'The browser blocked the new tab — allow pop-ups and try again.'); return }
    void writeAuditEvent(supabase, { actorId: uid, action: 'applicant_pack_presented', actingRole: 'tenant', metadata: presentedMetadata('pdf', packScope) })
  }

  // ── Off-platform share token (real rows for signed-in tenants) ──
  const [shareToken, setShareToken] = useState<{ token: string; expires_at: string; api_scopes?: string[] | null } | null>(null)
  // Stayloop API (plan §3.2): the applicant decides, scope by scope, whether a
  // third party holding this token may read conclusions through the API.
  const API_SCOPES: { key: string; zh: string; en: string }[] = [
    { key: 'identity', zh: '身份已核验（Veriff）', en: 'Identity verified (Veriff)' },
    { key: 'bank', zh: '银行入账摘要（Flinks）', en: 'Bank deposit summary (Flinks)' },
    { key: 'credit', zh: '信用分档（Equifax）', en: 'Credit score band (Equifax)' },
    { key: 'tenancy', zh: '已确认的租史与付租记录', en: 'Confirmed tenancies & rent record' },
  ]
  const toggleScope = async (key: string) => {
    if (!user || !shareToken) return
    const cur = new Set(shareToken.api_scopes ?? [])
    if (cur.has(key)) cur.delete(key); else cur.add(key)
    const next = Array.from(cur)
    const { error } = await supabase.from('passport_share_tokens').update({ api_scopes: next.length ? next : null }).eq('token', shareToken.token)
    if (!error) setShareToken({ ...shareToken, api_scopes: next.length ? next : null })
  }
  const [shareBusy, setShareBusy] = useState(false)
  const [shareErr, setShareErr] = useState(false)

  // ── Rent-reporting waitlist (user_memories, zero new tables) ──
  const [waitlistJoined, setWaitlistJoined] = useState(false)
  const [waitlistBusy, setWaitlistBusy] = useState(false)

  useEffect(() => {
    if (!user) {
      setShareToken(null)
      setWaitlistJoined(false)
      return
    }
    let cancelled = false
    // Active token, if any (RLS scopes to the tenant's own rows).
    supabase
      .from('passport_share_tokens')
      .select('token,expires_at,api_scopes')
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (!cancelled && data && data.length) setShareToken(data[0])
      })
    // Already on the rent-reporting waitlist?
    supabase
      .from('user_memories')
      .select('id')
      .eq('role', 'tenant')
      .eq('key', 'waitlist_rent_reporting')
      .limit(1)
      .then(({ data }) => {
        if (!cancelled && data && data.length) setWaitlistJoined(true)
      })
    return () => {
      cancelled = true
    }
  }, [user])

  const handleGenerate = async () => {
    if (!user || shareBusy) return
    setShareBusy(true)
    setShareErr(false)
    const token = generateShareToken()
    const { data, error } = await supabase
      .from('passport_share_tokens')
      .insert({ token, tenant_user_id: user.id })
      .select('token,expires_at,api_scopes')
      .single()
    if (!error && data) setShareToken(data)
    else setShareErr(true)
    setShareBusy(false)
  }

  const handleRevoke = async () => {
    if (!user || !shareToken || shareBusy) return
    setShareBusy(true)
    const { error } = await supabase
      .from('passport_share_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('token', shareToken.token)
    if (!error) setShareToken(null)
    setShareBusy(false)
  }

  const handleJoinWaitlist = async () => {
    if (!user || waitlistJoined || waitlistBusy) return
    setWaitlistBusy(true)
    const { error } = await supabase.from('user_memories').upsert(
      {
        user_id: user.id,
        role: 'tenant',
        memory_type: 'system',
        key: 'waitlist_rent_reporting',
        label: '租金上报征信 · 等候名单',
        value: { joined_at: new Date().toISOString() },
        confidence: 1,
        source: 'waitlist',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,role,memory_type,key' }
    )
    if (!error) setWaitlistJoined(true)
    setWaitlistBusy(false)
  }

  const isRealShare = !!(user && shareToken)
  const shareUrlDisplay = isRealShare ? `stayloop.ai/p/${shareToken!.token}` : ''

  const handleCopy = async () => {
    if (!isRealShare) return
    const text = `${window.location.origin}/p/${shareToken!.token}`
    let ok = false
    try {
      await navigator.clipboard.writeText(text)
      ok = true
    } catch {
      // Fallback for contexts where the async clipboard API is unavailable
      try {
        const ta = document.createElement('textarea')
        ta.value = text
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        ok = document.execCommand('copy')
        document.body.removeChild(ta)
      } catch {
        ok = false
      }
    }
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // ── Deterministic suggestions from the pack's completeness (no model call) ──
  const insights: AIInsight[] = useMemo(() => {
    const out: AIInsight[] = []
    const missing: string[] = []
    if (!completeness.identity) missing.push(zh ? '身份' : 'identity')
    if (!completeness.employment) missing.push(zh ? '雇佣与收入' : 'employment & income')
    if (!completeness.history) missing.push(zh ? '租史' : 'rental history')
    if (!completeness.other) missing.push(zh ? '其他' : 'other')
    if (missing.length) {
      out.push({ text: { zh: `申请包还缺「${missing.join('、')}」这${missing.length > 1 ? '几' : '一'}段。房东通常先看联系方式、收入和最近两段租史。`, en: `The pack is still missing ${missing.join(', ')}. Landlords usually look at contact details, income and the last two tenancies first.` } })
    } else {
      out.push({ text: { zh: '四段资料都填了。申请前再看一眼收入和现住址是不是最新的。', en: 'All four sections are filled in. Before applying, check that income and current address are still current.' } })
    }
    if (staleFiles.length) {
      const f = staleFiles[0]
      const fr = freshness(f.kind, f.as_of ?? f.uploaded_at)
      out.push({ text: { zh: `${zh ? fr.suggestZh : fr.suggestEn}${staleFiles.length > 1 ? `（共 ${staleFiles.length} 份要看一下）` : ''}`, en: `${fr.suggestEn}${staleFiles.length > 1 ? ` (${staleFiles.length} files to look at)` : ''}` } })
    } else if (files.length === 0) {
      out.push({ text: { zh: '还没有上传文件。最常被要求的是最近两张工资单和一份证件。', en: 'No files yet. The most commonly requested are your last two pay stubs and one piece of ID.' } })
    } else {
      out.push({ text: { zh: `${files.length} 份文件都在新鲜期内。`, en: `All ${files.length} files are current.` } })
    }
    if (!consented) {
      out.push({ text: { zh: '同意还没有勾选——勾选后才能预览、导出或在申请时一键填入。', en: 'Consent is not ticked yet — tick it to preview, export or fill an application with the pack.' } })
    } else {
      out.push({ text: { zh: '同意已记录。申请房源时选「用我的申请包填写」，一分钟就能提交。', en: 'Consent is on file. When you apply, choose "fill with my pack" and you are done in a minute.' }, link: { label: { zh: '去看房源 →', en: 'Browse listings →' }, href: '/listings' } })
    }
    return out
  }, [completeness, staleFiles, files.length, consented, zh])

  const updatedAt = profile?.updated_at ? new Date(profile.updated_at) : null
  const kindsWithFiles = PROFILE_FILE_KINDS.filter((k) => files.some((f) => f.kind === k.kind)).length

  return (
    <WorkspaceShell role="tenant" aside={<Aside lang={lang} insights={insights} />}>
      <PageHeader
        title={zh ? '租客护照 · 申请包' : 'Tenant Passport · Application pack'}
        sub={
          <>
            <span className="font-mono text-[11px] uppercase tracking-eyebrow text-tenant">APPLICATION PACK</span>
            <span className="mx-1.5 text-body-3">·</span>
            {zh
              ? '把申请要用的资料和文件备在一处：你自己填、自己传，出示给谁由你决定。Stayloop 不替任何人查任何人。'
              : 'Keep everything an application needs in one place: you fill it in, you upload it, you decide who sees it. Stayloop does not look anyone up on anyone’s behalf.'}
          </>
        }
      />

      <StatStrip
        stats={[
          { label: zh ? '资料段' : 'Sections', value: `${filledSections}/4`, sub: filledSections === 4 ? (zh ? '四段都填了' : 'all four filled in') : (zh ? '房东先看联系方式与收入' : 'contact and income first'), tone: filledSections === 4 ? 'up' : 'default' },
          { label: zh ? '文件' : 'Files', value: String(files.length), sub: zh ? `${kindsWithFiles}/${PROFILE_FILE_KINDS.length} 类 · ${staleFiles.length ? `${staleFiles.length} 份要更新` : '都在新鲜期'}` : `${kindsWithFiles}/${PROFILE_FILE_KINDS.length} kinds · ${staleFiles.length ? `${staleFiles.length} to refresh` : 'all current'}`, tone: staleFiles.length ? 'warn' : 'default' },
          { label: zh ? '同意' : 'Consent', value: consented ? (zh ? '已勾选' : 'On file') : (zh ? '未勾选' : 'Not yet'), sub: consented ? APPLICANT_PROFILE_CONSENT_VERSION : (zh ? '出示前必须勾选' : 'required before presenting'), tone: consented ? 'up' : 'warn' },
          { label: zh ? '最近更新' : 'Last updated', value: updatedAt ? updatedAt.toLocaleDateString(zh ? 'zh-CN' : 'en-CA', { month: 'numeric', day: 'numeric' }) : '—', sub: user ? (packLoaded ? (zh ? '资料保存在你的账号里' : 'saved in your account') : (zh ? '读取中…' : 'loading…')) : (zh ? '登录后可用' : 'sign in to use') },
        ]}
      />

      <div className="space-y-4">
        {!user && (
          <div className="rounded-xl border border-dashed border-line-strong bg-surface-chip px-4 py-3 text-[13px] text-body-2">
            {zh ? '申请包存在你的账号里。' : 'Your pack lives in your account. '}
            <Link href="/login?next=/tenant/passport" className="font-semibold text-brand hover:underline">{zh ? '登录后开始填写 →' : 'Sign in to start →'}</Link>
          </div>
        )}

        <ProfileSections
          zh={zh}
          signedIn={!!user}
          uid={uid}
          profile={profile}
          history={history}
          stayloopHistory={stayloop}
          verified={verified}
          onSave={saveProfile}
          onHistoryChanged={loadHistory}
        />

        <ProfileFiles zh={zh} signedIn={!!user} files={files} onChanged={loadFiles} />

        <ProfileConsent
          zh={zh}
          signedIn={!!user}
          consented={consented}
          consentAt={profile?.consent_at ?? null}
          busy={consentBusy}
          onToggle={toggleConsent}
          onPreview={handlePreview}
          onExport={handleExport}
          applyHref="/listings"
        />
        {exportErr && <p className="text-[12.5px] text-danger" role="alert">{exportErr}</p>}

        {previewHtml && (
          <SectionCard
            title={zh ? `预览 · 房东看到的样子（${packDisplayName(profile, 'zh')}）` : `Preview · what a landlord sees (${packDisplayName(profile, 'en')})`}
            meta={zh ? '文件只列名字与指纹' : 'files listed by name and fingerprint only'}
            padded={false}
            action={<button type="button" onClick={() => setPreviewHtml(null)} className="text-[12px] font-semibold text-body-3 hover:text-ink">{zh ? '关闭' : 'Close'}</button>}
          >
            <div className="min-w-0 overflow-x-auto bg-[#E2E8F0]">
              <iframe title={zh ? '申请包预览' : 'Application pack preview'} srcDoc={previewHtml} sandbox="" className="h-[70vh] min-h-[480px] w-full min-w-[320px] border-0" data-testid="pack-preview-frame" />
            </div>
          </SectionCard>
        )}

        {/* ── Off-platform share (read-only snapshot) ── */}
        <SectionCard className="p-4 sm:p-5" padded={false}>
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <h2 className="text-[16px] font-bold tracking-tight">
                {zh ? '分享给站外房东' : 'Share with any landlord'}
              </h2>
              <p className="mt-1 max-w-[520px] text-[13px] leading-relaxed text-body-2">
                {zh
                  ? '房东不在 Stayloop？一条只读链接就够了——对方无需注册，打开只看到你的姓名缩写和按时付租记录，只取自双方都确认过的租约；随时可撤销。完整的申请包请用上面的导出 PDF。'
                  : "Landlord not on Stayloop? One read-only link is all it takes — no sign-up on their side; they see only your initials and on-time rent record, drawn only from leases both sides confirmed, and you can revoke it any time. For the full pack, use Export PDF above."}
              </p>

              {user && !shareToken ? (
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={handleGenerate}
                    disabled={shareBusy}
                    className="sl-btn-primary !px-5 !py-2.5 text-[13px] disabled:opacity-60"
                  >
                    {shareBusy
                      ? zh ? '生成中…' : 'Generating…'
                      : zh ? '生成分享链接' : 'Generate share link'}
                  </button>
                  {shareErr && (
                    <p className="mt-2 text-[12px] text-danger">
                      {zh
                        ? '生成失败，请稍后重试。'
                        : 'Could not generate the link — please try again shortly.'}
                    </p>
                  )}
                </div>
              ) : !user ? (
                <p className="mt-3 text-[12.5px] text-body-3">{zh ? '登录后可以生成链接。' : 'Sign in to generate a link.'}</p>
              ) : (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className="min-w-0 max-w-full truncate rounded-lg bg-surface-chip px-3.5 py-2.5 font-mono text-[12.5px] text-body">
                    {shareUrlDisplay}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="sl-btn-secondary shrink-0 !px-4 !py-2.5 text-[13px]"
                  >
                    {copied ? (zh ? '已复制 ✓' : 'Copied ✓') : zh ? '复制链接' : 'Copy link'}
                  </button>
                  <button
                    type="button"
                    onClick={handleRevoke}
                    disabled={shareBusy}
                    className="shrink-0 rounded-lg px-3 py-2.5 text-[13px] font-semibold text-danger transition hover:bg-danger/5 disabled:opacity-60"
                  >
                    {shareBusy ? (zh ? '撤销中…' : 'Revoking…') : zh ? '撤销' : 'Revoke'}
                  </button>
                </div>
              )}
              {isRealShare && (
                <p className="mt-2 font-mono text-[10.5px] tracking-wide text-body-3">
                  {zh
                    ? `有效至 ${new Date(shareToken!.expires_at).toLocaleDateString('zh-CN')} · 撤销后立即失效`
                    : `Valid until ${new Date(shareToken!.expires_at).toLocaleDateString('en-CA')} · revoking takes effect immediately`}
                </p>
              )}
              {isRealShare && (
                <div className="mt-4 rounded-xl border border-line-divider bg-white p-4">
                  <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">{zh ? '允许第三方通过 API 读取' : 'ALLOW THIRD-PARTY API READS'}</div>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-body-2">
                    {zh ? '默认关闭。勾选后，拿到这个链接的机构可以通过 Stayloop 核验 API 读到勾选项的结论（只有结论，没有文件）；每次读取都会通知你并留痕，撤销链接即失效。' : 'Off by default. When ticked, an organisation holding this link can read the ticked conclusions through the Stayloop verification API (conclusions only, no documents); every read notifies you and is logged, and revoking the link ends it.'}
                  </p>
                  <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                    {API_SCOPES.map((sc) => (
                      <label key={sc.key} className="flex items-center gap-2 text-[13px]">
                        <input type="checkbox" checked={(shareToken?.api_scopes ?? []).includes(sc.key)} onChange={() => toggleScope(sc.key)} className="h-4 w-4 accent-brand" />
                        {zh ? sc.zh : sc.en}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <ul className="mt-4 space-y-1.5 text-[12.5px] leading-relaxed text-body-2">
                {[
                  {
                    zh: '只读快照 —— 姓名缩写与按时付租记录，没有金额，不含任何文件',
                    en: 'Read-only snapshot — initials and on-time rent record, no amounts, never a document',
                  },
                  {
                    zh: '由 Stayloop 直发，房东可验真',
                    en: 'Served directly by Stayloop, so a landlord can check it is genuine',
                  },
                  {
                    zh: '可随时撤销，撤销后立即失效',
                    en: 'Revoke any time and it stops working at once',
                  },
                ].map((b) => (
                  <li key={b.en} className="flex items-start gap-2">
                    <span className="mt-[1px] font-bold text-success">✓</span>
                    <span>{zh ? b.zh : b.en}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </SectionCard>

        {/* ── Rent reporting to credit bureau — waitlist ── */}
        <SectionCard className="p-4 sm:p-5" padded={false}>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[16px] font-bold tracking-tight">
              {zh ? '上报到信用局' : 'Report rent to the credit bureau'}
            </h2>
            <span className="rounded-full bg-tenant/10 px-2.5 py-0.5 font-mono text-[10px] font-bold tracking-wide text-tenant">
              {zh ? '即将上线' : 'COMING SOON'}
            </span>
          </div>
          <p className="mt-2 max-w-[560px] text-[13px] leading-relaxed text-body-2">
            {zh
              ? '按时交租也能积累信用：我们正在接入信用局，把你的按时租金记录上报 Equifax，帮你建立加拿大信用历史——对新移民尤其有用。上线后由你自主选择是否开启。'
              : 'On-time rent can build credit too: we are working on reporting your on-time rent payments to Equifax to help build Canadian credit history — especially useful for newcomers. Opt-in only, once it launches.'}
          </p>
          <div className="mt-3">
            {!user ? (
              <Link href="/login" className="sl-btn-secondary inline-flex !px-4 !py-2 text-[13px]">
                {zh ? '登录后加入等候名单' : 'Log in to join the waitlist'}
              </Link>
            ) : waitlistJoined ? (
              <span className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-semibold text-success">
                {zh ? '已加入 ✓' : 'Joined ✓'}
              </span>
            ) : (
              <button
                type="button"
                onClick={handleJoinWaitlist}
                disabled={waitlistBusy}
                className="sl-btn-secondary !px-4 !py-2 text-[13px] disabled:opacity-60"
              >
                {waitlistBusy
                  ? zh ? '提交中…' : 'Joining…'
                  : zh ? '加入等候名单' : 'Join the waitlist'}
              </button>
            )}
          </div>
        </SectionCard>
      </div>
    </WorkspaceShell>
  )
}

function Aside({ lang, insights }: { lang: Lang; insights: AIInsight[] }) {
  const zh = lang === 'zh'
  return (
    <div>
      <AsideBlock title={zh ? '下一步' : 'NEXT STEPS'}>
        <AIProactive role="tenant" insights={insights} variant="rail" />
      </AsideBlock>

      <AsideBlock title={zh ? '申请包怎么用' : 'HOW TO USE IT'}>
        <ul className="space-y-2 text-[12.5px] leading-relaxed text-body-2">
          <li>{zh ? '· 申请房源时一键填入：表单直接取这里的资料，文件由你勾选后附上' : '· Fill an application in one click: the form takes these details, and you tick which files go with it'}</li>
          <li>{zh ? '· 导出 PDF 给站外房东：一份可打印的申请包，文件只列名字与指纹' : '· Export a PDF for a landlord off Stayloop: a printable pack that lists files by name and fingerprint only'}</li>
          <li>{zh ? '· 分享链接只给姓名缩写与付租记录，取自双方都确认过的租约，随时可撤销' : '· The share link shows only your initials and rent record from leases both sides confirmed, and can be revoked any time'}</li>
        </ul>
      </AsideBlock>
    </div>
  )
}
