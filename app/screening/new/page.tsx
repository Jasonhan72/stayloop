'use client'

// V5.3 · VOL 7 · Artboard 63 — Upload Parse step.
// Route: /screening/new?step=parse
// Shows parsed files, extracted applicant entity, and associated people.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

/* ── Mock data matching VOL 7 design ────────────────────────────── */

interface ParsedFile {
  id: string
  icon: string
  name: string
  pages: number
  size: string
  extractedFields: number
  extractedNote: string
}

const MOCK_FILES: ParsedFile[] = [
  {
    id: 'f1',
    icon: 'PDF',
    name: 'rental_application_mia.pdf',
    pages: 8,
    size: '3.2 MB',
    extractedFields: 14,
    extractedNote: '✓ 14 fields',
  },
  {
    id: 'f2',
    icon: 'PDF',
    name: 'paystub_shopify_may.pdf',
    pages: 2,
    size: '0.8 MB',
    extractedFields: 6,
    extractedNote: '✓ 收入 $9,200',
  },
  {
    id: 'f3',
    icon: 'JPG',
    name: 'passport_scan.jpg',
    pages: 1,
    size: '4.1 MB',
    extractedFields: 5,
    extractedNote: '✓ ID verified',
  },
  {
    id: 'f4',
    icon: 'PDF',
    name: 'reference_letter_goldberg.pdf',
    pages: 12,
    size: '3.3 MB',
    extractedFields: 3,
    extractedNote: '✓ 前房东 REF',
  },
]

interface ExtractedField {
  label: string
  value: string
  badge: string
  badgeColor: string
}

const EXTRACTED_FIELDS: ExtractedField[] = [
  { label: '现地址', value: '88 Harbour St, Unit 2710, Toronto ON', badge: 'VALID', badgeColor: '#047857' },
  { label: '工作单位', value: 'Shopify Inc.', badge: 'VALID', badgeColor: '#047857' },
  { label: '月入', value: '$9,200 CAD (gross)', badge: 'PASS', badgeColor: '#047857' },
  { label: '期望租金', value: '$2,800 / mo', badge: 'PASS', badgeColor: '#047857' },
  { label: '入住日期', value: '2026-07-01', badge: 'VALID', badgeColor: '#047857' },
  { label: '前房东', value: 'M. Goldberg · 416-555-0192', badge: 'REF ✓', badgeColor: '#047857' },
  { label: '联系电话', value: '+1 647-888-2031', badge: 'VALID', badgeColor: '#047857' },
  { label: '邮箱', value: 'mia.chen@gmail.com', badge: 'VALID', badgeColor: '#047857' },
]

interface AssociatedPerson {
  id: string
  initial: string
  name: string
  role: string
  action: string
  actionHref?: string
}

const ASSOCIATED_PEOPLE: AssociatedPerson[] = [
  { id: 'a1', initial: 'M', name: 'M. Goldberg', role: '前房东', action: '查 LTB' },
  { id: 'a2', initial: 'S', name: 'Shopify Inc', role: '雇主', action: '查公司' },
  { id: 'a3', initial: 'A', name: 'Aaron Chen', role: '紧急联系', action: '查同住' },
  { id: 'a4', initial: 'L', name: 'Lisa M. Chen', role: '担保人', action: '查信用' },
  { id: 'a5', initial: 'A', name: 'A. Nguyen', role: '2年前房东', action: '查 LTB' },
]

/* ── Component ──────────────────────────────────────────────────── */

export default function ScreeningNewParsePage() {
  const router = useRouter()
  const [selectedFileId, setSelectedFileId] = useState<string | null>('f1')
  const [expandedFileId, setExpandedFileId] = useState<string | null>(null)

  const totalPages = MOCK_FILES.reduce((s, f) => s + f.pages, 0)
  const totalSize = '11.4 MB'
  const totalFields = EXTRACTED_FIELDS.length

  return (
    <div style={{ background: '#FAF7EE', color: '#171717', minHeight: '100vh' }} className="flex flex-col">
      <Header variant="solid" />

      {/* ── Top bar ─────────────────────────────────────────────── */}
      <div className="border-b border-line-divider" style={{ background: '#F2EEE5' }}>
        <div className="mx-auto flex max-w-[1320px] items-center justify-between px-5 py-3 sm:px-7 lg:px-8">
          <div className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: '#047857' }}>
            <span className="inline-block h-[6px] w-[6px] rounded-full" style={{ background: '#047857', boxShadow: '0 0 6px #047857' }} />
            SCREENING · STEP 1 / 3 · PARSE
          </div>
          <div className="font-mono text-[11px] text-body-3">
            STEP 1 / 3 · PARSING DONE
          </div>
        </div>
      </div>

      {/* ── Title ───────────────────────────────────────────────── */}
      <div className="mx-auto w-full max-w-[1320px] px-5 pt-6 pb-2 sm:px-7 lg:px-8">
        <h1 className="text-[24px] font-extrabold leading-tight tracking-tight sm:text-[28px]">
          已识别 4 份文件 · 抽出主体 + 5 名关联人
        </h1>
        {/* Upload ID bar */}
        <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-line-divider bg-white px-4 py-2">
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-body-3">UPLOAD-ID</span>
          <span className="font-mono text-[11px] text-body-3">·</span>
          <span className="font-mono text-[12px] font-bold" style={{ color: '#047857' }}>up_8m3k</span>
          <span className="font-mono text-[11px] text-body-3">·</span>
          <span className="font-mono text-[11px] text-body-3">{totalSize}</span>
          <span className="font-mono text-[11px] text-body-3">·</span>
          <span className="font-mono text-[11px] text-body-3">{totalPages} PAGES</span>
          <span className="font-mono text-[11px] text-body-3">·</span>
          <span className="font-mono text-[11px] font-bold" style={{ color: '#047857' }}>OCR DONE</span>
        </div>
      </div>

      {/* ── Three-column layout ─────────────────────────────────── */}
      <div className="mx-auto w-full max-w-[1320px] flex-1 px-5 py-5 sm:px-7 lg:px-8">
        <div className="grid gap-5 lg:grid-cols-[280px_1fr_280px]">

          {/* ── LEFT: Files ──────────────────────────────────────── */}
          <div className="rounded-xl border border-line-divider bg-white p-5">
            <div className="flex items-center justify-between">
              <div className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-body-3">
                FILES · 文件
              </div>
              <span className="rounded-md px-2 py-0.5 font-mono text-[10px] font-bold" style={{ color: '#047857', background: '#047857' + '10' }}>
                {MOCK_FILES.length}
              </span>
            </div>

            <div className="mt-4 space-y-2">
              {MOCK_FILES.map((file) => {
                const isSelected = selectedFileId === file.id
                const isExpanded = expandedFileId === file.id
                return (
                  <button
                    key={file.id}
                    className="w-full rounded-lg border p-3 text-left transition"
                    style={{
                      borderColor: isSelected ? '#047857' : '#E0DACE',
                      background: isSelected ? '#F0FDF4' : '#FAFAF8',
                    }}
                    onClick={() => {
                      setSelectedFileId(file.id)
                      setExpandedFileId(isExpanded ? null : file.id)
                    }}
                  >
                    <div className="flex items-start gap-2.5">
                      {/* File icon */}
                      <span
                        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md font-mono text-[10px] font-bold text-white"
                        style={{ background: file.icon === 'PDF' ? '#DC2626' : '#2563EB' }}
                      >
                        {file.icon}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-semibold leading-tight">{file.name}</div>
                        <div className="mt-1 font-mono text-[10px] text-body-3">
                          {file.pages}p · {file.size}
                        </div>
                        <div className="mt-1 font-mono text-[10px] font-medium" style={{ color: '#047857' }}>
                          {file.extractedNote}
                        </div>
                      </div>
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="mt-3 border-t border-line-divider pt-3">
                        <div className="space-y-1.5 font-mono text-[10px] text-body-2">
                          <div className="flex justify-between">
                            <span>Extracted fields</span>
                            <span className="font-bold" style={{ color: '#047857' }}>{file.extractedFields}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>OCR confidence</span>
                            <span className="font-bold" style={{ color: '#047857' }}>98.2%</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Language</span>
                            <span>EN</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Add more files */}
            <button className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-line-strong py-2.5 text-[12px] font-medium text-body-2 transition hover:border-brand hover:text-brand">
              + 加更多文件
            </button>
          </div>

          {/* ── CENTER: Extracted applicant ───────────────────────── */}
          <div className="rounded-xl border border-line-divider bg-white p-5 sm:p-6">
            <div className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-body-3">
              EXTRACTED · 申请主体
            </div>

            {/* Applicant card */}
            <div className="mt-4 flex items-center gap-4 rounded-xl border border-line-divider bg-surface-chip p-4">
              {/* Avatar */}
              <div
                className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full text-[18px] font-bold text-white"
                style={{ background: '#047857' }}
              >
                M
              </div>
              <div>
                <div className="text-[18px] font-extrabold leading-tight">Mia Chen</div>
                <div className="mt-0.5 text-[13px] text-body-2">Senior Product Designer · Shopify Inc.</div>
              </div>
            </div>

            {/* Fields table */}
            <div className="mt-5">
              <table className="w-full">
                <tbody>
                  {EXTRACTED_FIELDS.map((field, i) => (
                    <tr
                      key={field.label}
                      className="border-b border-line-divider last:border-b-0"
                    >
                      <td className="py-2.5 pr-3 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-body-3 whitespace-nowrap">
                        {field.label}
                      </td>
                      <td className="py-2.5 pr-3 text-[13px] text-body">
                        {field.value}
                      </td>
                      <td className="py-2.5 text-right">
                        <span
                          className="inline-block rounded-md px-2 py-0.5 font-mono text-[10px] font-bold"
                          style={{ color: field.badgeColor, background: field.badgeColor + '12' }}
                        >
                          {field.badge}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Logic note */}
            <div className="mt-5 rounded-lg border border-line-divider p-3.5" style={{ background: '#F8F5EC' }}>
              <div className="flex items-start gap-2">
                <span className="mt-0.5 text-[14px]">◐</span>
                <div>
                  <span className="font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-body-3">
                    Logic 备注
                  </span>
                  <p className="mt-1 text-[12px] leading-relaxed text-body-2">
                    14 个字段全部从申请表 + 工资单 + 护照交叉抽出 · 无矛盾 · 已自动归一化
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* ── RIGHT: Associated people ──────────────────────────── */}
          <div className="rounded-xl border border-line-divider bg-white p-5">
            <div className="flex items-center justify-between">
              <div className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-body-3">
                ASSOCIATED · 关联人
              </div>
              <span className="rounded-md px-2 py-0.5 font-mono text-[10px] font-bold" style={{ color: '#047857', background: '#047857' + '10' }}>
                {ASSOCIATED_PEOPLE.length}
              </span>
            </div>

            <div className="mt-4 space-y-2">
              {ASSOCIATED_PEOPLE.map((person) => (
                <div
                  key={person.id}
                  className="flex items-center gap-3 rounded-lg border border-line-divider p-3 transition hover:border-line-strong"
                >
                  {/* Avatar initial */}
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-surface-chip text-[12px] font-bold text-body-2">
                    {person.initial}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold leading-tight">{person.name}</div>
                    <div className="font-mono text-[10px] text-body-3">{person.role}</div>
                  </div>
                  <button
                    className="flex-shrink-0 rounded-md border border-line-divider px-2.5 py-1 font-mono text-[10px] font-bold text-body-2 transition hover:border-brand hover:text-brand"
                  >
                    {person.action}
                  </button>
                </div>
              ))}
            </div>

            {/* Add associated person */}
            <button className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-line-strong py-2.5 text-[12px] font-medium text-body-2 transition hover:border-brand hover:text-brand">
              + 手动加关联人
            </button>
          </div>
        </div>
      </div>

      {/* ── Bottom bar ──────────────────────────────────────────── */}
      <div className="border-t border-line-divider" style={{ background: '#F2EEE5' }}>
        <div className="mx-auto flex max-w-[1320px] flex-col items-center justify-between gap-3 px-5 py-4 sm:flex-row sm:px-7 lg:px-8">
          {/* Summary chips */}
          <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-body-3">
            <span>{totalFields} 字段</span>
            <span>·</span>
            <span>{ASSOCIATED_PEOPLE.length} 关联人</span>
            <span>·</span>
            <span>{MOCK_FILES.length} 文件</span>
            <span>·</span>
            <span className="font-bold" style={{ color: '#047857' }}>OCR ✓</span>
            <span>·</span>
            <span>反 OHRC 字段已 mask</span>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3">
            <button
              className="rounded-lg border border-line-divider bg-white px-5 py-2.5 text-[13px] font-semibold text-body-2 transition hover:border-line-strong"
              onClick={() => router.back()}
            >
              ← 改字段
            </button>
            <button
              className="rounded-lg px-6 py-2.5 text-[13px] font-bold text-white transition hover:opacity-90"
              style={{ background: '#047857' }}
              onClick={() => router.push('/screening/demo/done')}
            >
              ▶ 开始深度扫描 →
            </button>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  )
}
