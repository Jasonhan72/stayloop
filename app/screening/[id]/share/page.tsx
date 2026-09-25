'use client'

export const runtime = 'edge'

// /screening/[id]/share — share links are NOT live. This route used to render
// a full English share-configuration form (recipients, expiry, password…)
// whose only action was alert('coming soon') (three-role test report
// 2026-09-24, SL-L-06: English UI in the Chinese app, and a form that does
// nothing). It now says so plainly, in the UI language, and points to the
// thing that works: the PDF from the report page.
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { useAuth } from '@/lib/useAuth'
import { supabase } from '@/lib/supabase'
import { useT } from '@/lib/i18n'

export default function ScreeningSharePage() {
  const params = useParams()
  const id = params?.id as string
  const { lang } = useT()
  const zh = lang === 'zh'
  const { loading, user } = useAuth()
  const router = useRouter()
  const [name, setName] = useState<string | null>(null)

  useEffect(() => {
    if (!loading && !user) router.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`)
  }, [loading, user, router])

  useEffect(() => {
    if (!user || !id) return
    supabase.from('screenings').select('ai_extracted_name, tenant_name').eq('id', id).maybeSingle()
      .then(({ data }) => setName((data as { ai_extracted_name?: string | null; tenant_name?: string | null } | null)?.ai_extracted_name || (data as { tenant_name?: string | null } | null)?.tenant_name || null))
  }, [user, id])

  return (
    <div style={{ background: '#F3F8FC', minHeight: '100vh' }} className="flex flex-col">
      <Header variant="solid" />
      <main className="flex flex-1 items-start justify-center px-5 py-16">
        <div data-testid="share-not-live" className="sl-card w-full max-w-lg p-6 sm:p-9">
          <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-body-3">{zh ? '分享筛查报告' : 'SHARE A SCREENING REPORT'}</div>
          <h1 className="mt-2 text-[24px] font-bold tracking-tight">{zh ? '分享链接尚未上线' : 'Share links are not live yet'}</h1>
          <p className="mt-3 text-[14px] leading-relaxed text-body-2">
            {zh
              ? `${name ? `「${name}」的` : ''}报告目前只能以 PDF 形式分享：在报告页点「下载评估报告 (PDF)」，再由你自己发给需要的人（例如共同房东或物业经理）。`
              : `${name ? `${name}’s report` : 'The report'} can only be shared as a PDF for now: on the report page choose “Download report (PDF)” and send it yourself (for example to a co-owner or property manager).`}
          </p>
          <p className="mt-3 text-[13px] leading-relaxed text-body-3">
            {zh
              ? '报告含申请人的个人信息（受 PIPEDA 保护）。只发给参与这次租赁决定的人，不要转给无关的人，也不要用于这次租赁以外的目的。'
              : 'The report contains the applicant’s personal information (PIPEDA). Share it only with people involved in this rental decision, and never for another purpose.'}
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <Link href={`/screening/${id}/report`} className="sl-btn-primary flex-1 text-center">{zh ? '去报告页下载 PDF' : 'Open the report to download the PDF'}</Link>
            <Link href="/screening/app" className="sl-btn-secondary flex-1 text-center">{zh ? '回到筛查' : 'Back to screenings'}</Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
