'use client'

export const runtime = 'edge'

// /my-file/[token] — the applicant's one-time link from the confirmation email
// (Consumer Reporting Act s.12 / s.13 / s.12.1; V0.8 first item, 2026-10-17).
// The token is the credential: middleware sends Referrer-Policy: no-referrer
// for /my-file/*, and the page itself never puts the token anywhere else.
// All state lives in components/consumer/MyFileToken.tsx.

import { useParams } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { useT } from '@/lib/i18n'
import MyFileToken from '@/components/consumer/MyFileToken'

export default function MyFileTokenPage() {
  const params = useParams()
  const token = String(params?.token || '')
  const { lang } = useT()
  const zh = lang === 'zh'
  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <Header />
      <main className="flex-1">
        <div className="mx-auto w-full max-w-[1320px] px-6 py-10 sm:px-8 lg:px-12">
          <div className="mx-auto max-w-[860px]">
            <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-brand">MY SCREENING FILE</div>
            <h1 className="mt-2 text-[26px] font-extrabold leading-tight tracking-tight sm:text-[32px]">{zh ? '我的筛查档案' : 'My screening file'}</h1>
            <p className="mt-2 text-[13px] text-body-3">
              {zh ? '免费 · 电子方式即时 · 邮寄或电话 2 个工作日内 · ' : 'Free · electronic immediately · mail or phone within 2 business days · '}
              <Link href="/consumer-rights" className="font-semibold text-brand hover:underline">{zh ? '你的权利' : 'Your rights'}</Link>
            </p>
            <div className="mt-6">
              <MyFileToken token={token} />
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
