'use client'
// Manual Screening Workspace — two-pane layout with file dropzone and live results

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/lib/useUser'
import { useT } from '@/lib/i18n'
import { v3, size } from '@/lib/brand'
import AppHeader from '@/components/AppHeader'

interface ScreeningResult {
  screening_id: string
  applicant_name: string
  applicant_email: string
  ai_score?: number
  status: string
  created_at: string
}

export default function ManualScreeningPage() {
  const { lang } = useT()
  const isZh = lang === 'zh'
  const { user, loading: authLoading } = useUser({ redirectIfMissing: true })

  const [applicantName, setApplicantName] = useState('')
  const [applicantEmail, setApplicantEmail] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<ScreeningResult | null>(null)
  const [progress, setProgress] = useState('')
  const dropRef = useRef<HTMLDivElement>(null)

  async function handleSubmit() {
    if (!user || !applicantName || !applicantEmail || files.length === 0) return
    setSubmitting(true)
    setProgress(isZh ? '创建筛查案例...' : 'Creating screening case...')

    try {
      const { data: caseData, error: caseError } = await supabase
        .from('screening_cases')
        .insert({
          source: 'landlord_manual',
          owner_id: user.profileId,
          applicant_email: applicantEmail,
          applicant_name: applicantName,
          status: 'in_progress',
        })
        .select()
        .single()

      if (caseError) throw caseError

      setProgress(isZh ? '上传文件...' : 'Uploading files...')

      const formData = new FormData()
      files.forEach((f) => formData.append('files', f))
      formData.append('screening_id', caseData.id)

      const response = await fetch('/api/screen-score', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) throw new Error('Screening failed')

      setProgress(isZh ? '评分完毕' : 'Scoring complete')
      setResult({
        screening_id: caseData.id,
        applicant_name: applicantName,
        applicant_email: applicantEmail,
        status: 'completed',
        created_at: new Date().toISOString(),
      })

      setApplicantName('')
      setApplicantEmail('')
      setFiles([])
    } catch (err) {
      setProgress(isZh ? '错误：' + String(err) : 'Error: ' + String(err))
    } finally {
      setSubmitting(false)
    }
  }

  if (authLoading) {
    return (
      <div style={{ minHeight: '100vh', background: v3.surface, display: 'grid', placeItems: 'center' }}>
        <div style={{ color: v3.textMuted }}>{isZh ? '加载中…' : 'Loading…'}</div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: v3.surface }}>
      <AppHeader
        title={isZh ? '手动筛查' : 'Manual Screening'}
        titleZh={isZh ? '手动筛查' : undefined}
      />

      <div
        style={{
          maxWidth: size.content.wide,
          margin: '0 auto',
          padding: '32px 24px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))',
          gap: 32,
        }}
      >
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 20, color: v3.textPrimary }}>
            {isZh ? '租客信息' : 'Applicant Info'}
          </div>

          <input
            type="text"
            placeholder={isZh ? '姓名' : 'Full name'}
            value={applicantName}
            onChange={(e) => setApplicantName(e.target.value)}
            style={{
              width: '100%',
              padding: '11px 14px',
              marginBottom: 12,
              border: `1px solid ${v3.border}`,
              borderRadius: 10,
              fontSize: 14,
              color: v3.textPrimary,
              boxSizing: 'border-box',
            }}
          />

          <input
            type="email"
            placeholder={isZh ? '邮箱' : 'Email'}
            value={applicantEmail}
            onChange={(e) => setApplicantEmail(e.target.value)}
            style={{
              width: '100%',
              padding: '11px 14px',
              marginBottom: 20,
              border: `1px solid ${v3.border}`,
              borderRadius: 10,
              fontSize: 14,
              color: v3.textPrimary,
              boxSizing: 'border-box',
            }}
          />

          <div
            ref={dropRef}
            onDragOver={(e) => {
              e.preventDefault()
              if (dropRef.current) {
                dropRef.current.style.borderColor = v3.brand
                dropRef.current.style.background = v3.brandSoft
              }
            }}
            onDragLeave={() => {
              if (dropRef.current) {
                dropRef.current.style.borderColor = v3.border
                dropRef.current.style.background = 'transparent'
              }
            }}
            onDrop={(e) => {
              e.preventDefault()
              if (dropRef.current) {
                dropRef.current.style.borderColor = v3.border
                dropRef.current.style.background = 'transparent'
              }
              const dropped = Array.from(e.dataTransfer.files)
              setFiles([...files, ...dropped])
            }}
            style={{
              border: `2px dashed ${v3.border}`,
              borderRadius: 12,
              padding: 32,
              textAlign: 'center',
              cursor: 'pointer',
              marginBottom: 20,
              transition: 'all 0.2s',
              color: v3.textMuted,
            }}
          >
            <div style={{ fontSize: 14, marginBottom: 8 }}>
              {isZh ? '拖放文件或点击选择' : 'Drop files or click to select'}
            </div>
            <input
              type="file"
              multiple
              onChange={(e) => {
                const selected = Array.from(e.currentTarget.files || [])
                setFiles([...files, ...selected])
              }}
              style={{ display: 'none', cursor: 'pointer' }}
            />
          </div>

          {files.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              {files.map((f, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: 12,
                    color: v3.textMuted,
                    padding: '6px 0',
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>{f.name}</span>
                  <button
                    onClick={() => setFiles(files.filter((_, j) => j !== i))}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: v3.danger,
                      cursor: 'pointer',
                      fontSize: 12,
                    }}
                  >
                    {isZh ? '移除' : 'Remove'}
                  </button>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={submitting || !applicantName || !applicantEmail || files.length === 0}
            style={{
              width: '100%',
              padding: '12px 22px',
              background: submitting || !applicantName || !applicantEmail || files.length === 0
                ? v3.borderStrong
                : 'linear-gradient(135deg, #6EE7B7 0%, #34D399 100%)',
              color: submitting || !applicantName || !applicantEmail || files.length === 0
                ? v3.textMuted
                : '#fff',
              border: 'none',
              borderRadius: 10,
              fontSize: 15,
              fontWeight: 600,
              cursor: submitting || !applicantName || !applicantEmail || files.length === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            {isZh ? '开始筛查' : 'Run Stayloop AI'}
          </button>
        </div>

        <div
          style={{
            background: v3.surfaceCard,
            border: `1px solid ${v3.border}`,
            borderRadius: 14,
            padding: 24,
            minHeight: 400,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: result ? 'flex-start' : 'center',
            alignItems: result ? 'stretch' : 'center',
          }}
        >
          {result ? (
            <>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: v3.success }}>
                {isZh ? '✓ 完成' : '✓ Complete'}
              </div>
              <div style={{ fontSize: 14, color: v3.textPrimary, marginBottom: 8 }}>
                <strong>{isZh ? '申请人：' : 'Applicant: '}</strong>
                {result.applicant_name}
              </div>
              <div style={{ fontSize: 14, color: v3.textMuted, marginBottom: 16 }}>
                {result.applicant_email}
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center', color: v3.textMuted }}>
              <div style={{ fontSize: 14, marginBottom: 8 }}>
                {isZh ? '等待筛查中...' : 'Awaiting screening...'}
              </div>
              {progress && (
                <div style={{ fontSize: 12, color: v3.textFaint, marginTop: 8 }}>
                  {progress}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
