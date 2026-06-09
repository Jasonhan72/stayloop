'use client'

export const runtime = 'edge'

// V5.3 · Share Configuration page — loads real data from Supabase.
// Route: /screening/[id]/share

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { useAuth } from '@/lib/useAuth'
import { supabase } from '@/lib/supabase'

/* ── Types ─────────────────────────────────────────────────────── */

interface Recipient {
  id: string
  initial: string
  name: string
  email: string
  role: string
}

interface FieldVisibility {
  id: string
  label: string
  checked: boolean
}

/* ── Loading / Error ───────────────────────────────────────────── */

function LoadingShell() {
  return (
    <div style={{ background: '#FAF7EE', minHeight: '100vh' }} className="flex flex-col">
      <Header variant="solid" />
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-10 w-10 animate-spin rounded-full border-2 border-[#047857] border-t-transparent" />
          <p className="mt-4 font-mono text-[13px] text-[#999]">Loading share options...</p>
        </div>
      </div>
      <Footer />
    </div>
  )
}

function NotFoundShell() {
  return (
    <div style={{ background: '#FAF7EE', minHeight: '100vh' }} className="flex flex-col">
      <Header variant="solid" />
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <div className="text-[48px]">&#128269;</div>
          <h2 className="mt-4 text-[22px] font-extrabold">Screening not found</h2>
          <p className="mt-2 text-[14px] text-[#999]">This screening does not exist or you do not have access.</p>
          <Link href="/screening" className="mt-6 inline-block rounded-lg px-5 py-2.5 text-[13px] font-bold text-white" style={{ background: '#047857' }}>
            Back to Screenings
          </Link>
        </div>
      </div>
      <Footer />
    </div>
  )
}

/* ── Component ─────────────────────────────────────────────────── */

export default function ShareConfigPage() {
  const params = useParams()
  const id = params?.id as string
  const { loading: authLoading, user } = useAuth()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [screening, setScreening] = useState<any>(null)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    if (!user || !id) return
    supabase
      .from('screenings')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data, error }) => {
        if (error || !data) setLoadError(true)
        else setScreening(data)
      })
  }, [user, id])

  // Share config state
  const [visibilityMode, setVisibilityMode] = useState<'email' | 'link'>('email')
  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [showAddEmail, setShowAddEmail] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [fields, setFields] = useState<FieldVisibility[]>([
    { id: 'verdict', label: 'Verdict + overall score', checked: true },
    { id: 'dimensions', label: 'Dimension scores', checked: true },
    { id: 'court', label: 'LTB / Court details', checked: true },
    { id: 'forensics', label: 'Document forensics', checked: true },
    { id: 'raw_files', label: 'Original uploaded files', checked: false },
    { id: 'summary', label: 'AI summary', checked: true },
  ])
  const [expiryDays, setExpiryDays] = useState('7')
  const [viewLimit, setViewLimit] = useState('5')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [linkGenerated, setLinkGenerated] = useState(false)
  const [copied, setCopied] = useState(false)

  if (authLoading || (!screening && !loadError)) return <LoadingShell />
  if (loadError) return <NotFoundShell />

  const applicantName = screening.ai_extracted_name || screening.tenant_name || 'Applicant'
  const score = screening.ai_score ?? 0
  const tier = screening.v3_tier ?? 'decline'
  const generatedLink = `https://app.stayloop.ai/s/${id.slice(0, 8)}`

  const toggleField = (fieldId: string) => {
    setFields((prev) =>
      prev.map((f) => (f.id === fieldId ? { ...f, checked: !f.checked } : f))
    )
  }

  const removeRecipient = (rid: string) => {
    setRecipients((prev) => prev.filter((r) => r.id !== rid))
  }

  const addRecipient = () => {
    if (!newEmail.trim()) return
    const name = newEmail.split('@')[0]
    setRecipients((prev) => [
      ...prev,
      {
        id: `r_${Date.now()}`,
        initial: name[0].toUpperCase(),
        name,
        email: newEmail.trim(),
        role: 'Added',
      },
    ])
    setNewEmail('')
    setShowAddEmail(false)
  }

  const handleGenerateLink = () => {
    setLinkGenerated(true)
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedLink).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const checkedLabels = fields.filter((f) => f.checked).map((f) => f.label)
  const uncheckedLabels = fields.filter((f) => !f.checked).map((f) => f.label)

  return (
    <div style={{ background: '#FAF7EE', color: '#171717', minHeight: '100vh' }} className="flex flex-col">
      <Header variant="solid" />

      {/* Top bar */}
      <div className="border-b border-line-divider" style={{ background: '#F2EEE5' }}>
        <div className="mx-auto flex max-w-[1320px] items-center justify-between px-5 py-3 sm:px-7 lg:px-8">
          <div className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: '#047857' }}>
            <span className="inline-block h-[6px] w-[6px] rounded-full" style={{ background: '#047857', boxShadow: '0 0 6px #047857' }} />
            SHARE &middot; CONSENT-AWARE
          </div>
          <Link href={`/screening/${id}/report`} className="font-mono text-[11px] text-body-3 hover:text-body">
            &larr; Back to Report
          </Link>
        </div>
      </div>

      {/* Title */}
      <div className="mx-auto w-full max-w-[1320px] px-5 pt-6 pb-2 sm:px-7 lg:px-8">
        <h1 className="text-[24px] font-extrabold leading-tight tracking-tight sm:text-[28px]">
          Share Report &middot; {applicantName}
        </h1>
        <div className="mt-3 inline-flex flex-wrap items-center gap-2 rounded-lg border border-line-divider bg-white px-4 py-2">
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-body-3">SCORE</span>
          <span className="font-mono text-[12px] font-bold" style={{ color: '#047857' }}>{score}</span>
          <span className="font-mono text-[11px] text-body-3">&middot;</span>
          <span className="font-mono text-[11px] font-bold uppercase" style={{ color: tier === 'approve' ? '#047857' : tier === 'conditional' ? '#D97706' : '#DC2626' }}>
            {tier}
          </span>
          <span className="font-mono text-[11px] text-body-3">&middot;</span>
          <span className="font-mono text-[11px] text-body-3">Default {expiryDays} days</span>
          <span className="font-mono text-[11px] text-body-3">&middot;</span>
          <span className="font-mono text-[11px] text-body-3">{viewLimit} views</span>
        </div>
      </div>

      {/* Main two-column layout */}
      <div className="mx-auto w-full max-w-[1320px] flex-1 px-5 py-5 sm:px-7 lg:px-8">
        <div className="grid gap-5 lg:grid-cols-[1fr_380px]">

          {/* LEFT: Configuration */}
          <div className="space-y-5">

            {/* Card: Visibility mode */}
            <div className="rounded-xl border border-line-divider bg-white p-5 sm:p-6">
              <div className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-body-3">
                Access Mode
              </div>
              <div className="mt-4 space-y-2.5">
                <label
                  className="flex cursor-pointer items-start gap-3 rounded-lg border p-3.5 transition"
                  style={{
                    borderColor: visibilityMode === 'email' ? '#047857' : '#E0DACE',
                    background: visibilityMode === 'email' ? '#F0FDF4' : '#FAFAF8',
                  }}
                >
                  <span className="mt-0.5 flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-full border-2" style={{ borderColor: visibilityMode === 'email' ? '#047857' : '#CBD5E1' }}>
                    {visibilityMode === 'email' && (
                      <span className="block h-[8px] w-[8px] rounded-full" style={{ background: '#047857' }} />
                    )}
                  </span>
                  <div className="flex-1">
                    <input type="radio" name="visibility" value="email" checked={visibilityMode === 'email'} onChange={() => setVisibilityMode('email')} className="sr-only" />
                    <div className="text-[14px] font-semibold">Specific email</div>
                    <div className="mt-0.5 text-[12px] text-body-3">Email + password required (strictest)</div>
                  </div>
                </label>
                <label
                  className="flex cursor-pointer items-start gap-3 rounded-lg border p-3.5 transition"
                  style={{
                    borderColor: visibilityMode === 'link' ? '#047857' : '#E0DACE',
                    background: visibilityMode === 'link' ? '#F0FDF4' : '#FAFAF8',
                  }}
                >
                  <span className="mt-0.5 flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-full border-2" style={{ borderColor: visibilityMode === 'link' ? '#047857' : '#CBD5E1' }}>
                    {visibilityMode === 'link' && (
                      <span className="block h-[8px] w-[8px] rounded-full" style={{ background: '#047857' }} />
                    )}
                  </span>
                  <div className="flex-1">
                    <input type="radio" name="visibility" value="link" checked={visibilityMode === 'link'} onChange={() => setVisibilityMode('link')} className="sr-only" />
                    <div className="text-[14px] font-semibold">Link with password</div>
                    <div className="mt-0.5 text-[12px] text-body-3">Anyone with link + password can view</div>
                  </div>
                </label>
              </div>
            </div>

            {/* Card: Recipients */}
            <div className="rounded-xl border border-line-divider bg-white p-5 sm:p-6">
              <div className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-body-3">
                Share with
              </div>
              <div className="mt-4 space-y-2.5">
                {recipients.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 rounded-lg border border-line-divider bg-[#FAFAF8] p-3">
                    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white" style={{ background: '#047857' }}>
                      {r.initial}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-semibold">{r.name}</div>
                      <div className="mt-0.5 font-mono text-[11px] text-body-3">{r.email} &middot; {r.role}</div>
                    </div>
                    <button
                      onClick={() => removeRecipient(r.id)}
                      className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-[14px] text-body-3 transition hover:bg-red-50 hover:text-red-600"
                    >
                      &times;
                    </button>
                  </div>
                ))}

                {showAddEmail ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addRecipient()}
                      placeholder="name@example.com"
                      autoFocus
                      className="flex-1 rounded-lg border border-line-divider bg-white px-3 py-2 font-mono text-[13px] outline-none transition focus:border-[#047857]"
                    />
                    <button
                      onClick={addRecipient}
                      className="rounded-lg px-3 py-2 text-[13px] font-semibold text-white transition hover:opacity-90"
                      style={{ background: '#047857' }}
                    >
                      Add
                    </button>
                    <button
                      onClick={() => { setShowAddEmail(false); setNewEmail('') }}
                      className="rounded-lg px-3 py-2 text-[13px] text-body-3 transition hover:text-body"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowAddEmail(true)}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-line-strong py-2.5 text-[12px] font-medium text-body-2 transition hover:border-[#047857] hover:text-[#047857]"
                  >
                    + Add email
                  </button>
                )}
              </div>
            </div>

            {/* Card: Field visibility */}
            <div className="rounded-xl border border-line-divider bg-white p-5 sm:p-6">
              <div className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-body-3">
                Field Visibility
              </div>
              <div className="mt-4 space-y-2">
                {fields.map((field) => (
                  <label
                    key={field.id}
                    className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition hover:bg-[#FAFAF8]"
                    style={{
                      borderColor: field.checked ? '#047857' : '#E0DACE',
                      background: field.checked ? '#F0FDF410' : 'transparent',
                    }}
                  >
                    <span
                      className="flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded border-2 text-[11px] font-bold transition"
                      style={{
                        borderColor: field.checked ? '#047857' : '#CBD5E1',
                        background: field.checked ? '#047857' : 'transparent',
                        color: field.checked ? '#fff' : 'transparent',
                      }}
                    >
                      {field.checked ? '&#10003;' : ''}
                    </span>
                    <input type="checkbox" checked={field.checked} onChange={() => toggleField(field.id)} className="sr-only" />
                    <span className="text-[14px]">{field.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Card: Settings */}
            <div className="rounded-xl border border-line-divider bg-white p-5 sm:p-6">
              <div className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-body-3">
                Settings
              </div>
              <div className="mt-4 space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-[14px] font-medium">Expiry</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number" min="1" max="365" value={expiryDays}
                      onChange={(e) => setExpiryDays(e.target.value)}
                      className="w-16 rounded-lg border border-line-divider bg-[#FAFAF8] px-3 py-1.5 text-center font-mono text-[13px] outline-none transition focus:border-[#047857]"
                    />
                    <span className="text-[13px] text-body-3">days</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-[14px] font-medium">View limit</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number" min="1" max="999" value={viewLimit}
                      onChange={(e) => setViewLimit(e.target.value)}
                      className="w-16 rounded-lg border border-line-divider bg-[#FAFAF8] px-3 py-1.5 text-center font-mono text-[13px] outline-none transition focus:border-[#047857]"
                    />
                    <span className="text-[13px] text-body-3">views</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-[14px] font-medium">Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Set password"
                      className="w-40 rounded-lg border border-line-divider bg-[#FAFAF8] px-3 py-1.5 pr-8 font-mono text-[13px] outline-none transition focus:border-[#047857]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-body-3 hover:text-body"
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* CTA */}
            <div className="flex items-center gap-4">
              <button
                onClick={handleGenerateLink}
                className="rounded-xl px-6 py-3 text-[15px] font-bold text-white shadow-sm transition hover:opacity-90"
                style={{ background: '#047857' }}
              >
                Generate Share Link
              </button>
              <Link href={`/screening/${id}/report`} className="text-[14px] text-body-3 transition hover:text-body">
                Cancel
              </Link>
            </div>

            {/* Generated link banner */}
            {linkGenerated && (
              <div className="rounded-xl border-2 p-4" style={{ borderColor: '#047857', background: '#F0FDF4' }}>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: '#047857' }}>
                    LINK GENERATED
                  </span>
                  <span className="inline-block h-[6px] w-[6px] rounded-full" style={{ background: '#047857', boxShadow: '0 0 6px #047857' }} />
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <code className="flex-1 rounded-lg border border-line-divider bg-white px-3 py-2 font-mono text-[13px] text-body select-all">
                    {generatedLink}
                  </code>
                  <button
                    onClick={handleCopy}
                    className="flex-shrink-0 rounded-lg px-3 py-2 text-[13px] font-semibold text-white transition hover:opacity-90"
                    style={{ background: copied ? '#059669' : '#047857' }}
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <div className="mt-2 font-mono text-[11px] text-body-3">
                  {password ? `Password: ${password} · ` : ''}Valid {expiryDays} days &middot; Max {viewLimit} views
                </div>
              </div>
            )}
          </div>

          {/* RIGHT: Preview */}
          <div className="space-y-5">

            {/* Share preview card */}
            <div className="rounded-xl border border-line-divider bg-white p-5 sm:p-6">
              <div className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-body-3">
                Share Preview
              </div>

              <div className="mt-4 rounded-lg border border-line-divider bg-[#FAFAF8] p-4">
                <div className="flex items-center gap-2 pb-3 border-b border-line-divider">
                  <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: '#047857' }}>
                    S
                  </span>
                  <div>
                    <div className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-body-3">STAYLOOP</div>
                    <div className="font-mono text-[10px] text-body-3">Screening Report Share</div>
                  </div>
                </div>

                <div className="mt-3">
                  <div className="text-[14px] font-semibold leading-snug">
                    Screening report for {applicantName}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="font-mono text-[20px] font-extrabold" style={{ color: '#047857' }}>{score}</span>
                    <span className="font-mono text-[11px] text-body-3">/ 100</span>
                    <span
                      className="rounded-md px-2 py-0.5 font-mono text-[10px] font-bold uppercase"
                      style={{
                        color: tier === 'approve' ? '#047857' : tier === 'conditional' ? '#D97706' : '#DC2626',
                        background: tier === 'approve' ? '#04785714' : tier === 'conditional' ? '#D9770614' : '#DC262614',
                      }}
                    >
                      {tier}
                    </span>
                  </div>

                  <div className="mt-3 space-y-1.5 text-[13px] text-body-2">
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 text-[10px]" style={{ color: '#047857' }}>&#9679;</span>
                      <span>
                        Includes: {checkedLabels.length > 0 ? checkedLabels.join(', ') : '(no fields selected)'}
                      </span>
                    </div>
                    {uncheckedLabels.length > 0 && (
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 text-[10px]" style={{ color: '#DC2626' }}>&#9679;</span>
                        <span>
                          Excludes: {uncheckedLabels.join(', ')}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* PIPEDA note */}
                  <div className="mt-4 rounded-md border border-line-divider bg-white p-3">
                    <div className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-body-3">
                      PIPEDA &middot; Applicant Rights
                    </div>
                    <div className="mt-1 text-[11px] leading-relaxed text-body-3">
                      Per PIPEDA and Ontario RTA, the applicant has the right to know who their information is shared with and which fields are included. They may file an appeal if they believe information is inaccurate.
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Access controls summary */}
            <div className="rounded-xl border border-line-divider bg-white p-5 sm:p-6">
              <div className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-body-3">
                Access Controls
              </div>
              <div className="mt-4 grid gap-3">
                <div className="rounded-xl border border-line-divider p-4">
                  <div className="font-mono text-[10px] font-bold uppercase text-body-3">MODE</div>
                  <div className="mt-1 text-[13px] font-semibold text-body">
                    {visibilityMode === 'email' ? 'Email + Password' : 'Link + Password'}
                  </div>
                </div>
                <div className="rounded-xl border border-line-divider p-4">
                  <div className="font-mono text-[10px] font-bold uppercase text-body-3">VIEW LIMIT</div>
                  <div className="mt-1 text-[13px] font-semibold text-body">{viewLimit} views</div>
                </div>
                <div className="rounded-xl border border-line-divider p-4">
                  <div className="font-mono text-[10px] font-bold uppercase text-body-3">EXPIRY</div>
                  <div className="mt-1 text-[13px] font-semibold text-body">{expiryDays} days</div>
                </div>
                <div className="rounded-xl border border-line-divider p-4">
                  <div className="font-mono text-[10px] font-bold uppercase text-body-3">PASSWORD</div>
                  <div className="mt-1 text-[13px] font-semibold text-body">
                    {password ? 'Set' : 'Not set'}
                  </div>
                </div>
              </div>
            </div>

            {/* Recipients count */}
            <div className="rounded-xl border border-line-divider bg-white p-5 sm:p-6">
              <div className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-body-3">
                Recipients
              </div>
              <div className="mt-4 text-center">
                <div className="font-mono text-[28px] font-extrabold" style={{ color: '#047857' }}>
                  {recipients.length}
                </div>
                <div className="mt-1 text-[12px] text-body-3">
                  {recipients.length === 0 ? 'No recipients added yet' : `${recipients.length} recipient(s)`}
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

      <Footer />
    </div>
  )
}
