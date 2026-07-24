'use client'

import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { useT } from '@/lib/i18n'

export default function NotFoundContent() {
  const { lang } = useT()
  const zh = lang === 'zh'
  return (
    <>
      <Header />
      <main className="bg-surface">
        <div className="mx-auto flex min-h-[60vh] max-w-md items-center justify-center px-5 py-16">
          <div className="sl-card w-full p-10 text-center">
            <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-brand">
              404
            </div>
            <h1 className="mt-3 text-[28px] font-extrabold tracking-tight">
              {zh ? '页面不存在或已移动' : 'Page not found or moved'}
            </h1>
            <p className="mt-2 text-[14px] leading-relaxed text-body-2">
              {zh
                ? '你访问的链接可能已失效，或地址输入有误。'
                : 'The link may be outdated, or the address was mistyped.'}
            </p>
            <Link href="/" className="sl-btn-primary mt-6 inline-flex">
              {zh ? '回首页' : 'Back to home'}
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </>
  )
}
