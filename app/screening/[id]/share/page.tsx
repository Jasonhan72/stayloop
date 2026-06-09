'use client'

// V5.3 · VOL 7 · Artboard 69 — Share Configuration page.
// Route: /screening/[id]/share
// Consent-aware sharing: landlord picks recipients, fields, expiry;
// applicant (Mia) is notified automatically with appeal rights.

import { useState } from 'react'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

/* ── Types ─────────────────────────────────────────────────────── */

interface Recipient {
  id: string
  initial: string
  name: string
  email: string
  role: string
  tag: string
}

interface FieldVisibility {
  id: string
  label: string
  checked: boolean
}

interface ActiveShare {
  id: string
  name: string
  role: string
  status: string
  statusColor: string
  statusBg: string
}

interface AuditEntry {
  time: string
  event: string
  highlight?: boolean
}

/* ── Mock data ─────────────────────────────────────────────────── */

const INITIAL_RECIPIENTS: Recipient[] = [
  {
    id: 'r1',
    initial: 'D',
    name: 'David Park',
    email: 'd.park@law-firm.ca',
    role: '法务',
    tag: '你的',
  },
]

const INITIAL_FIELDS: FieldVisibility[] = [
  { id: 'verdict', label: 'verdict + 综合分', checked: true },
  { id: 'engines', label: '8 engines 摘要', checked: true },
  { id: 'ltb', label: 'LTB / Court 详情', checked: true },
  { id: 'graph', label: '关联人图（已脱敏）', checked: true },
  { id: 'raw_pdf', label: '申请人原始文件 PDF', checked: false },
  { id: 'sin_dob', label: 'SIN / DOB 完整', checked: false },
]

const ACTIVE_SHARES: ActiveShare[] = [
  { id: 's1', name: 'D. Park', role: '法务', status: 'DRAFT', statusColor: '#6B7280', statusBg: '#F3F4F6' },
  { id: 's2', name: 'Mia 本人', role: '', status: '永久', statusColor: '#047857', statusBg: '#F0FDF4' },
  { id: 's3', name: 'S. Wang', role: '房东', status: '活 (7天剩5天)', statusColor: '#D97706', statusBg: '#FFFBEB' },
]

const AUDIT_LOG: AuditEntry[] = [
  { time: '14:46:55', event: 'CREATED' },
  { time: '14:47:02', event: 'NOTIFIED Mia' },
  { time: '14:48:18', event: 'ACK Mia已知情', highlight: true },
]

/* ── Component ─────────────────────────────────────────────────── */

export default function ShareConfigPage() {
  // Visibility mode: 'email' = specific email + password (strictest), 'link' = link + password only
  const [visibilityMode, setVisibilityMode] = useState<'email' | 'link'>('email')

  // Recipients
  const [recipients, setRecipients] = useState<Recipient[]>(INITIAL_RECIPIENTS)
  const [showAddEmail, setShowAddEmail] = useState(false)
  const [newEmail, setNewEmail] = useState('')

  // Field visibility checkboxes
  const [fields, setFields] = useState<FieldVisibility[]>(INITIAL_FIELDS)

  // Settings
  const [expiryDays, setExpiryDays] = useState('7')
  const [viewLimit, setViewLimit] = useState('5')
  const [password, setPassword] = useState('rental-2026')
  const [showPassword, setShowPassword] = useState(false)
  const [watermark, setWatermark] = useState('DAVID PARK · {ts}')

  // Generated link state
  const [linkGenerated, setLinkGenerated] = useState(false)
  const [copied, setCopied] = useState(false)

  const generatedLink = 'https://stayloop.ai/s/sh_m9kqJ4'

  const toggleField = (id: string) => {
    setFields((prev) =>
      prev.map((f) => (f.id === id ? { ...f, checked: !f.checked } : f))
    )
  }

  const removeRecipient = (id: string) => {
    setRecipients((prev) => prev.filter((r) => r.id !== id))
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
        role: '新增',
        tag: '',
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

  // Derive what Mia sees based on checked fields
  const checkedLabels = fields.filter((f) => f.checked).map((f) => f.label)
  const uncheckedLabels = fields.filter((f) => !f.checked).map((f) => f.label)

  return (
    <div style={{ background: '#FAF7EE', color: '#171717', minHeight: '100vh' }} className="flex flex-col">
      <Header variant="solid" />

      {/* ── Top bar ─────────────────────────────────────────────── */}
      <div className="border-b border-line-divider" style={{ background: '#F2EEE5' }}>
        <div className="mx-auto flex max-w-[1320px] items-center justify-between px-5 py-3 sm:px-7 lg:px-8">
          <div className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: '#047857' }}>
            <span className="inline-block h-[6px] w-[6px] rounded-full" style={{ background: '#047857', boxShadow: '0 0 6px #047857' }} />
            SHARE · CONSENT-AWARE
          </div>
          <div className="font-mono text-[11px] text-body-3">
            PIPEDA · RTA COMPLIANT
          </div>
        </div>
      </div>

      {/* ── Title ───────────────────────────────────────────────── */}
      <div className="mx-auto w-full max-w-[1320px] px-5 pt-6 pb-2 sm:px-7 lg:px-8">
        <h1 className="text-[24px] font-extrabold leading-tight tracking-tight sm:text-[28px]">
          配置只读链接 · Mia 同步收到通知
        </h1>
        <div className="mt-3 inline-flex flex-wrap items-center gap-2 rounded-lg border border-line-divider bg-white px-4 py-2">
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-body-3">SHARE-ID</span>
          <span className="font-mono text-[11px] text-body-3">·</span>
          <span className="font-mono text-[12px] font-bold" style={{ color: '#047857' }}>sh_m9kqJ4</span>
          <span className="font-mono text-[11px] text-body-3">·</span>
          <span className="font-mono text-[11px] text-body-3">默认 7 天</span>
          <span className="font-mono text-[11px] text-body-3">·</span>
          <span className="font-mono text-[11px] text-body-3">5 views</span>
          <span className="font-mono text-[11px] text-body-3">·</span>
          <span className="font-mono text-[11px] text-body-3">申请人有申诉权</span>
        </div>
      </div>

      {/* ── Main two-column layout ──────────────────────────────── */}
      <div className="mx-auto w-full max-w-[1320px] flex-1 px-5 py-5 sm:px-7 lg:px-8">
        <div className="grid gap-5 lg:grid-cols-[1fr_380px]">

          {/* ── LEFT: Configuration ─────────────────────────────── */}
          <div className="space-y-5">

            {/* Card: 谁可以看到 */}
            <div className="rounded-xl border border-line-divider bg-white p-5 sm:p-6">
              <div className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-body-3">
                谁可以看到
              </div>
              <div className="mt-4 space-y-2.5">
                {/* Option: email */}
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
                    <input
                      type="radio"
                      name="visibility"
                      value="email"
                      checked={visibilityMode === 'email'}
                      onChange={() => setVisibilityMode('email')}
                      className="sr-only"
                    />
                    <div className="text-[14px] font-semibold">特定邮箱</div>
                    <div className="mt-0.5 text-[12px] text-body-3">需邮箱 + 密码 · 最严</div>
                  </div>
                </label>
                {/* Option: link */}
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
                    <input
                      type="radio"
                      name="visibility"
                      value="link"
                      checked={visibilityMode === 'link'}
                      onChange={() => setVisibilityMode('link')}
                      className="sr-only"
                    />
                    <div className="text-[14px] font-semibold">链接知情者</div>
                    <div className="mt-0.5 text-[12px] text-body-3">仅密码 · 普通</div>
                  </div>
                </label>
              </div>
            </div>

            {/* Card: 分享给 */}
            <div className="rounded-xl border border-line-divider bg-white p-5 sm:p-6">
              <div className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-body-3">
                分享给
              </div>
              <div className="mt-4 space-y-2.5">
                {recipients.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center gap-3 rounded-lg border border-line-divider bg-[#FAFAF8] p-3"
                  >
                    <span
                      className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white"
                      style={{ background: '#047857' }}
                    >
                      {r.initial}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-semibold">{r.name}</span>
                        {r.tag && (
                          <span className="rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold" style={{ color: '#047857', background: '#04785710' }}>
                            {r.tag}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[11px] text-body-3">
                        <span>{r.email}</span>
                        <span>·</span>
                        <span>{r.role}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => removeRecipient(r.id)}
                      className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-[14px] text-body-3 transition hover:bg-red-50 hover:text-red-600"
                      aria-label={`Remove ${r.name}`}
                    >
                      &times;
                    </button>
                  </div>
                ))}

                {/* Add email */}
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
                      添加
                    </button>
                    <button
                      onClick={() => { setShowAddEmail(false); setNewEmail('') }}
                      className="rounded-lg px-3 py-2 text-[13px] text-body-3 transition hover:text-body"
                    >
                      取消
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowAddEmail(true)}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-line-strong py-2.5 text-[12px] font-medium text-body-2 transition hover:border-[#047857] hover:text-[#047857]"
                  >
                    + 加邮箱
                  </button>
                )}
              </div>
            </div>

            {/* Card: 字段可见度 */}
            <div className="rounded-xl border border-line-divider bg-white p-5 sm:p-6">
              <div className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-body-3">
                字段可见度 · 你勾选
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
                      {field.checked ? '✓' : ''}
                    </span>
                    <input
                      type="checkbox"
                      checked={field.checked}
                      onChange={() => toggleField(field.id)}
                      className="sr-only"
                    />
                    <span className="text-[14px]">{field.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Card: Settings */}
            <div className="rounded-xl border border-line-divider bg-white p-5 sm:p-6">
              <div className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-body-3">
                设置
              </div>
              <div className="mt-4 space-y-4">
                {/* Expiry */}
                <div className="flex items-center justify-between">
                  <label className="text-[14px] font-medium">有效期</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min="1"
                      max="365"
                      value={expiryDays}
                      onChange={(e) => setExpiryDays(e.target.value)}
                      className="w-16 rounded-lg border border-line-divider bg-[#FAFAF8] px-3 py-1.5 text-center font-mono text-[13px] outline-none transition focus:border-[#047857]"
                    />
                    <span className="text-[13px] text-body-3">天</span>
                  </div>
                </div>
                {/* View limit */}
                <div className="flex items-center justify-between">
                  <label className="text-[14px] font-medium">查看次数</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min="1"
                      max="999"
                      value={viewLimit}
                      onChange={(e) => setViewLimit(e.target.value)}
                      className="w-16 rounded-lg border border-line-divider bg-[#FAFAF8] px-3 py-1.5 text-center font-mono text-[13px] outline-none transition focus:border-[#047857]"
                    />
                    <span className="text-[13px] text-body-3">次</span>
                  </div>
                </div>
                {/* Password */}
                <div className="flex items-center justify-between">
                  <label className="text-[14px] font-medium">访问密码</label>
                  <div className="flex items-center gap-1.5">
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-40 rounded-lg border border-line-divider bg-[#FAFAF8] px-3 py-1.5 pr-8 font-mono text-[13px] outline-none transition focus:border-[#047857]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-body-3 hover:text-body"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? '隐' : '显'}
                      </button>
                    </div>
                  </div>
                </div>
                {/* Watermark */}
                <div>
                  <label className="text-[14px] font-medium">水印</label>
                  <input
                    type="text"
                    value={watermark}
                    onChange={(e) => setWatermark(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-line-divider bg-[#FAFAF8] px-3 py-1.5 font-mono text-[13px] outline-none transition focus:border-[#047857]"
                  />
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
                &rarr; 生成链接 + 通知 Mia
              </button>
              <button className="text-[14px] text-body-3 transition hover:text-body">
                取消
              </button>
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
                    {copied ? '已复制' : '复制'}
                  </button>
                </div>
                <div className="mt-2 font-mono text-[11px] text-body-3">
                  密码: {password} · 有效 {expiryDays} 天 · 最多 {viewLimit} 次查看 · Mia 已通知
                </div>
              </div>
            )}
          </div>

          {/* ── RIGHT: Mia notification preview ─────────────────── */}
          <div className="space-y-5">

            {/* Email preview card */}
            <div className="rounded-xl border border-line-divider bg-white p-5 sm:p-6">
              <div className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-body-3">
                申请人 MIA 会收到
              </div>

              <div className="mt-4 rounded-lg border border-line-divider bg-[#FAFAF8] p-4">
                {/* Email header */}
                <div className="flex items-center gap-2 pb-3 border-b border-line-divider">
                  <span
                    className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                    style={{ background: '#2563EB' }}
                  >
                    S
                  </span>
                  <div>
                    <div className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-body-3">FROM: STAYLOOP</div>
                    <div className="font-mono text-[10px] text-body-3">TO: mia.chen@gmail.com</div>
                  </div>
                </div>

                {/* Email body */}
                <div className="mt-3">
                  <div className="text-[14px] font-semibold leading-snug">
                    你的尽调报告被 Sarah 分享给 David Park
                  </div>
                  <div className="mt-3 space-y-2 text-[13px] text-body-2">
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 text-[10px]" style={{ color: '#047857' }}>&#9679;</span>
                      <span>
                        查看的是{' '}
                        {checkedLabels.length > 0
                          ? checkedLabels.join(' + ')
                          : '（无字段）'}
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 text-[10px]" style={{ color: '#DC2626' }}>&#9679;</span>
                      <span>
                        不包含{' '}
                        {uncheckedLabels.length > 0
                          ? uncheckedLabels.join(' / ')
                          : '（全部已勾选）'}
                      </span>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="mt-4 flex gap-2">
                    <span
                      className="inline-block rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white"
                      style={{ background: '#2563EB' }}
                    >
                      查看我的报告
                    </span>
                    <span className="inline-block rounded-lg border border-line-divider bg-white px-3 py-1.5 text-[12px] font-semibold text-body-2">
                      提出申诉
                    </span>
                  </div>

                  {/* PIPEDA note */}
                  <div className="mt-4 rounded-md border border-line-divider bg-white p-3">
                    <div className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-body-3">
                      PIPEDA · 申请人权利
                    </div>
                    <div className="mt-1 text-[11px] leading-relaxed text-body-3">
                      根据 PIPEDA 及 Ontario RTA，你有权知道你的个人信息被分享给谁、分享了哪些字段。如果你认为信息不准确或使用不当，可以通过上方按钮提出申诉，我们将在 10 个工作日内回复。
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Active shares table */}
            <div className="rounded-xl border border-line-divider bg-white p-5 sm:p-6">
              <div className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-body-3">
                现有分享 · ACTIVE
              </div>
              <div className="mt-4 space-y-2">
                {ACTIVE_SHARES.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between rounded-lg border border-line-divider bg-[#FAFAF8] px-3 py-2.5"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold">{s.name}</span>
                      {s.role && (
                        <span className="font-mono text-[10px] text-body-3">{s.role}</span>
                      )}
                    </div>
                    <span
                      className="rounded-md px-2 py-0.5 font-mono text-[10px] font-bold"
                      style={{ color: s.statusColor, background: s.statusBg }}
                    >
                      {s.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Audit log */}
            <div className="rounded-xl border border-line-divider bg-white p-5 sm:p-6">
              <div className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-body-3">
                访问 AUDIT · 实时
              </div>
              <div className="mt-4 space-y-0">
                {AUDIT_LOG.map((entry, i) => (
                  <div key={i} className="flex items-start gap-3 py-1.5">
                    {/* Timeline dot + line */}
                    <div className="flex flex-col items-center">
                      <span
                        className="mt-1 block h-[8px] w-[8px] rounded-full"
                        style={{
                          background: entry.highlight ? '#047857' : '#CBD5E1',
                          boxShadow: entry.highlight ? '0 0 6px #047857' : 'none',
                        }}
                      />
                      {i < AUDIT_LOG.length - 1 && (
                        <span className="block w-px flex-1" style={{ background: '#E0DACE', minHeight: 16 }} />
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-body-3">{entry.time}</span>
                      <span
                        className="font-mono text-[11px] font-bold"
                        style={{ color: entry.highlight ? '#047857' : '#171717' }}
                      >
                        {entry.event}
                      </span>
                    </div>
                  </div>
                ))}
                {/* Awaiting entry */}
                <div className="flex items-start gap-3 py-1.5">
                  <div className="flex flex-col items-center">
                    <span className="mt-1 block h-[8px] w-[8px] rounded-full border-2" style={{ borderColor: '#D97706', background: 'transparent' }} />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] animate-pulse" style={{ color: '#D97706' }}>
                      AWAITING
                    </span>
                    <span className="font-mono text-[11px] text-body-3">
                      D.Park first view
                    </span>
                  </div>
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
