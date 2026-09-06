'use client'

// Public Passport snapshot — client view (bilingual via the global I18nProvider).
// Renders either a valid read-only snapshot or a friendly invalid/expired state.
import Link from 'next/link'
import Logo from '@/components/Logo'
import { LanguageToggle, useT } from '@/lib/i18n'
import { STAMPS, STAMP_CHECK_GREEN } from '@/lib/passportStamps'

export interface PassportSnapshot {
  /** Initials only — the page never receives the tenant's full name. */
  initials: string
  /** identity / income / bank / credit+court — stamped yes/no, in STAMPS order. */
  stamps: [boolean, boolean, boolean, boolean]
  stampedCount: number
  /** On-time record (statuses only); null → card hidden. */
  rentRecord: Array<{ dueDate: string; status: 'paid' | 'late' }> | null
  createdAt: string
  expiresAt: string
}

function fmtDate(iso: string, zh: boolean): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  const day = d.getDate()
  return zh ? `${y} 年 ${m} 月 ${day} 日` : d.toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })
}

function monthLabel(iso: string, zh: boolean): string {
  const d = new Date(iso + 'T12:00:00')
  if (isNaN(d.getTime())) return '—'
  return zh ? `${d.getMonth() + 1}月` : d.toLocaleDateString('en-CA', { month: 'short' })
}

export default function PublicPassportView({ snapshot }: { snapshot: PassportSnapshot | null }) {
  const { lang } = useT()
  const zh = lang === 'zh'

  return (
    <div className="min-h-screen bg-surface">
      {/* ── Minimal top bar ── */}
      <header className="mx-auto flex max-w-[680px] items-center justify-between px-5 py-5">
        <Logo size="md" href="/" />
        <LanguageToggle />
      </header>

      <main className="mx-auto max-w-[680px] px-5 pb-16">
        {snapshot ? (
          <>
            {/* ── Snapshot card ── */}
            <div className="sl-card p-6 sm:p-8">
              <div className="flex items-center gap-4">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#C4B5FD] to-tenant text-[20px] font-bold text-white">
                  {snapshot.initials}
                </span>
                <div className="min-w-0">
                  <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-tenant">
                    RENTAL PASSPORT · {zh ? '只读快照' : 'READ-ONLY SNAPSHOT'}
                  </div>
                  {/* With no stamps verified, "0/4 枚章" reads like a poor score
                      rather than an absent record — and the whole point of this
                      page is that a landlord can trust what it says. State the
                      absence in words instead. */}
                  <h1 className="mt-1 text-[22px] font-bold tracking-tight">
                    {snapshot.stampedCount === 0
                      ? zh ? '尚无已验证的认证章' : 'No verified stamps yet'
                      : zh
                        ? `已盖 ${snapshot.stampedCount}/4 枚章`
                        : `${snapshot.stampedCount}/4 stamps earned`}
                  </h1>
                  {snapshot.stampedCount === 0 && (
                    <p className="mt-1 text-[12.5px] leading-relaxed text-body-2">
                      {zh
                        ? '该租客尚未完成任何一项验证。本页只展示 Stayloop 已核实的内容——没有核实的，这里不会显示。'
                        : 'This tenant has not completed any verification yet. This page shows only what Stayloop has verified — nothing is shown that has not been.'}
                    </p>
                  )}
                </div>
                {/* Authenticity badge */}
                <span
                  className="ml-auto hidden shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-[10.5px] font-bold tracking-wide text-white sm:flex"
                  style={{ background: STAMP_CHECK_GREEN }}
                >
                  ✓ {zh ? 'Stayloop 直发 · 可验真' : 'Served by Stayloop · verifiable'}
                </span>
              </div>
              <div className="mt-3 sm:hidden">
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-[10.5px] font-bold tracking-wide text-white"
                  style={{ background: STAMP_CHECK_GREEN }}
                >
                  ✓ {zh ? 'Stayloop 直发 · 可验真' : 'Served by Stayloop · verifiable'}
                </span>
              </div>

              {/* Stamp list */}
              <div className="mt-6 divide-y divide-line-divider rounded-2xl border border-line-divider">
                {STAMPS.map((s, i) => {
                  const on = snapshot.stamps[i]
                  return (
                    <div key={s.key} className="flex items-center gap-3 px-4 py-3.5">
                      <span
                        className={
                          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[16px] ' +
                          (on
                            ? 'bg-gradient-to-br from-[#C4B5FD] to-tenant shadow-[0_3px_10px_rgba(27,27,60,0.35)]'
                            : 'bg-surface-chip grayscale opacity-60')
                        }
                      >
                        {s.icon}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[14px] font-semibold tracking-tight">{zh ? s.zh : s.en}</div>
                        <div className="text-[11.5px] text-body-3">{zh ? s.what_zh : s.what_en}</div>
                      </div>
                      {on ? (
                        <span
                          className="shrink-0 font-mono text-[11px] font-bold tracking-wide"
                          style={{ color: STAMP_CHECK_GREEN }}
                        >
                          ✓ {zh ? '已验证' : 'Verified'}
                        </span>
                      ) : (
                        <span className="shrink-0 font-mono text-[11px] tracking-wide text-body-3">
                          {zh ? '未盖章' : 'Not yet'}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Rent punctuality — only when real data exists */}
              {snapshot.rentRecord && snapshot.rentRecord.length > 0 && (
                <div className="mt-6">
                  <h2 className="text-[14px] font-bold tracking-tight">
                    {zh ? '租金准时记录' : 'Rent punctuality'}
                  </h2>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    {snapshot.rentRecord.map((m) => (
                      <div key={m.dueDate} className="flex flex-col items-center gap-1">
                        <span
                          className={
                            'flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-extrabold text-white ' +
                            (m.status === 'late' ? 'bg-warning' : '')
                          }
                          style={m.status === 'paid' ? { background: STAMP_CHECK_GREEN } : undefined}
                        >
                          {m.status === 'paid' ? '✓' : '!'}
                        </span>
                        <span className="font-mono text-[10px] text-body-3">{monthLabel(m.dueDate, zh)}</span>
                      </div>
                    ))}
                    <span className="ml-1 text-[12.5px] text-body-2">
                      {zh
                        ? `近 ${snapshot.rentRecord.length} 个月 ${snapshot.rentRecord.filter((m) => m.status === 'paid').length} 次准时`
                        : `${snapshot.rentRecord.filter((m) => m.status === 'paid').length} of the last ${snapshot.rentRecord.length} months on time`}
                    </span>
                  </div>
                </div>
              )}

              {/* Meta + privacy disclosure */}
              <div className="mt-6 border-t border-line-divider pt-4 text-[12px] leading-relaxed text-body-3">
                <div className="font-mono text-[10.5px] tracking-wide">
                  {zh
                    ? `快照生成于 ${fmtDate(snapshot.createdAt, true)} · 链接有效至 ${fmtDate(snapshot.expiresAt, true)}`
                    : `Snapshot generated ${fmtDate(snapshot.createdAt, false)} · link valid until ${fmtDate(snapshot.expiresAt, false)}`}
                </div>
                <p className="mt-2">
                  {zh
                    ? '本页由 Stayloop 服务器直接生成，仅展示验证结果 — 不含证件原件、证件号码或联系方式。租客可随时撤销此链接。'
                    : 'This page is served directly by Stayloop and shows verification results only — no original documents, ID numbers or contact details. The tenant can revoke this link at any time.'}
                </p>
              </div>
            </div>

            {/* ── Landlord CTA ── */}
            <div className="mt-6 text-center text-[13px] text-body-2">
              {zh ? '想核实或筛查租客？' : 'Want to verify or screen tenants?'}{' '}
              <Link href="/landlord" className="font-semibold text-brand hover:underline">
                {zh ? '了解 Stayloop →' : 'Learn about Stayloop →'}
              </Link>
            </div>
          </>
        ) : (
          /* ── Invalid / expired / revoked ── */
          <div className="sl-card p-8 text-center">
            <div className="text-[40px]">🔗</div>
            <h1 className="mt-3 text-[20px] font-bold tracking-tight">
              {zh ? '链接已失效' : 'This link is no longer active'}
            </h1>
            <p className="mx-auto mt-2 max-w-[420px] text-[13.5px] leading-relaxed text-body-2">
              {zh
                ? '这条分享链接不存在、已过期或已被租客撤销。请联系租客重新生成一条新的分享链接。'
                : 'This share link does not exist, has expired, or was revoked by the tenant. Ask the tenant to generate a fresh link.'}
            </p>
            <Link href="/" className="sl-btn-secondary mt-5 inline-flex">
              {zh ? '回到 Stayloop 首页' : 'Back to Stayloop'}
            </Link>
          </div>
        )}
      </main>
    </div>
  )
}
