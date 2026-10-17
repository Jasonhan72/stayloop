'use client'

// /my-file — the public door for an applicant to ask for their own screening
// file (Consumer Reporting Act s.12; V0.8 first item, 2026-10-17). No account:
// the email they applied with gets a one-time link to /my-file/<token>.
// design/consumer-file-access-plan-2026-10.md · step 2.

import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { useT } from '@/lib/i18n'
import MyFileRequestForm from '@/components/consumer/MyFileRequestForm'

export default function MyFilePage() {
  const { lang } = useT()
  const zh = lang === 'zh'
  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <Header />
      <main className="flex-1">
        <div className="mx-auto w-full max-w-[1320px] px-6 py-12 sm:px-8 lg:px-12">
          <div className="mx-auto max-w-[720px]">
            <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-brand">MY SCREENING FILE</div>
            <h1 className="mt-3 text-[32px] font-extrabold leading-tight tracking-tight sm:text-[40px]">
              {zh ? '我的筛查档案' : 'My screening file'}
            </h1>
            <ul className="mt-5 space-y-2 text-[14.5px] leading-relaxed text-body-2">
              <li className="flex gap-2"><span className="mt-[9px] h-1.5 w-1.5 flex-none rounded-full bg-brand" /><span>{zh ? '谁能用：在 Stayloop 上被房东或经纪筛查过的申请人本人。' : 'Who this is for: an applicant who has been screened on Stayloop by a landlord or an agent.'}</span></li>
              <li className="flex gap-2"><span className="mt-[9px] h-1.5 w-1.5 flex-none rounded-full bg-brand" /><span>{zh ? '要用申请时的邮箱：确认链接只发到那个邮箱，档案也只按它来找。' : 'Use the email you applied with: the confirmation link goes only to that address, and your file is found by it.'}</span></li>
              <li className="flex gap-2"><span className="mt-[9px] h-1.5 w-1.5 flex-none rounded-full bg-brand" /><span>{zh ? '免费。电子方式即时拿到；选邮寄或电话的，2 个工作日内寄出或来电。' : 'Free. Electronic delivery is immediate; by mail or phone within 2 business days.'}</span></li>
            </ul>
            <div className="mt-8">
              <MyFileRequestForm />
            </div>
            <p className="mt-6 text-[13px] leading-relaxed text-body-3">
              {zh ? '拿到档案后可以对任何一条提出争议、要求更正，也可以在档案上设置身份警示。' : 'Once you have your file you can dispute any item, ask for a correction, and place an identity alert on it.'}{' '}
              <Link href="/consumer-rights" className="font-semibold text-brand hover:underline">{zh ? '你的权利 · 怎么行使 →' : 'Your rights and how to use them →'}</Link>
            </p>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
