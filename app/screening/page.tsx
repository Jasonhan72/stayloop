// /screening — the public landing for 租客筛查.
//
// Server file: metadata + JSON-LD only. The visible body lives in
// LandingBody (client) so it follows the language toggle — the page shipped
// with hardcoded zh in a server component, and since i18n auto-selects EN
// for any non-Chinese browser, every English visitor from Google saw an
// English header over a fully Chinese body.
//
// The SSR default render is zh (i18n resolves 'zh' server-side), so the
// zh JSON-LD below matches what crawlers see; both are generated from the
// same ./copy module and cannot drift.
//
// Signed-in users never linger here — AutoEnter forwards them to the app.

import type { Metadata } from 'next'
import AutoEnter from './AutoEnter'
import LandingBody from './LandingBody'
import { FAQS } from './copy'

export const metadata: Metadata = {
  title: '租客筛查 · 几分钟出报告 | Stayloop Tenant Screening',
  description:
    '安省租客筛查:AI 读取申请材料,确定性取证引擎核验文件真伪,检索 LTB 判令目录与安省法院公开门户,生成可追溯的筛查报告。免注册可试一单。Ontario tenant screening with document forensics, LTB order catalogue and court portal checks.',
  alternates: { canonical: 'https://www.stayloop.ai/screening' },
  keywords: [
    '租客筛查', '租客背景', '租客信用检查', '房东 筛查 租客', '多伦多 租客筛查',
    'tenant screening ontario', 'tenant screening toronto', 'ltb record check',
    'tenant credit check canada', 'rental applicant screening',
  ],
  openGraph: {
    title: '租客筛查 · Stayloop',
    description: '上传申请材料,几分钟得到一份每个结论都注明依据的筛查报告。免注册可试一单。',
    url: 'https://www.stayloop.ai/screening',
    siteName: 'Stayloop',
    type: 'website',
    locale: 'zh_CN',
    images: ['/home/hero-mist.jpg'],
  },
  twitter: {
    card: 'summary_large_image',
    title: '租客筛查 · 几分钟出报告 | Stayloop',
    description: '安省租客筛查:文件取证 + LTB 判令目录 + 法院门户,每个结论注明依据。',
  },
}

export default function ScreeningLanding() {
  return (
    <>
      <AutoEnter />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([
            {
              '@context': 'https://schema.org',
              '@type': 'Service',
              name: '租客筛查 Tenant Screening',
              serviceType: 'Tenant screening',
              provider: { '@type': 'Organization', name: 'Stayloop', url: 'https://www.stayloop.ai' },
              areaServed: { '@type': 'State', name: 'Ontario' },
              description:
                '安省租客筛查:AI 读取申请材料,确定性规则计算评分,LTB 判令目录与安省法院公开门户按姓名实际检索,生成每个结论都注明依据的报告。',
              url: 'https://www.stayloop.ai/screening',
            },
            {
              '@context': 'https://schema.org',
              '@type': 'FAQPage',
              mainEntity: FAQS.map((f) => ({
                '@type': 'Question',
                name: f.zh.q,
                acceptedAnswer: { '@type': 'Answer', text: f.zh.a },
              })),
            },
            {
              '@context': 'https://schema.org',
              '@type': 'BreadcrumbList',
              itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'Stayloop', item: 'https://www.stayloop.ai' },
                { '@type': 'ListItem', position: 2, name: '租客筛查', item: 'https://www.stayloop.ai/screening' },
              ],
            },
          ]),
        }}
      />
      <LandingBody />
    </>
  )
}
