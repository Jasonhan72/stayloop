'use client'

import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { useT } from '@/lib/i18n'
import { LISTING_DATA_CLAUSES, TERMS_VERSION } from '@/lib/legal/terms'

export default function TermsPage() {
  const { lang } = useT()
  const zh = lang === 'zh'
  return (
    <>
      <Header />
      <main className="bg-surface">
        <article className="mx-auto max-w-[720px] px-5 py-16 sm:px-7">
          <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-brand">TERMS OF SERVICE</div>
          <h1 className="mt-3 text-[36px] font-extrabold leading-tight tracking-tight sm:text-[44px]">
            {zh ? '服务条款' : 'Terms of Service'}
          </h1>
          <p className="mt-2 font-mono text-[12px] text-body-3">{zh ? `${TERMS_VERSION} 版` : `Version ${TERMS_VERSION}`}</p>

          <Section title={zh ? '1 · 接受条款' : '1 · Acceptance of terms'}>
            <p>{zh
              ? '使用 Stayloop 即表示同意本条款 + 隐私政策。Stayloop 由 Stayloop Technologies Inc. (Ontario corp) 运营。'
              : 'By using Stayloop you agree to these terms and our Privacy Policy. Stayloop is operated by Stayloop Technologies Inc. (an Ontario corporation).'}</p>
          </Section>
          <Section title={zh ? '2 · 你的承诺' : '2 · Your commitments'}>
            <p>{zh
              ? '你提交的所有 Passport 信息真实有效。Stayloop 有权对欺诈行为暂停 / 终止账户,并向相关执法 / LTB 报告。'
              : 'All Passport information you submit is true and valid. Stayloop may suspend or terminate accounts for fraudulent activity and report it to the relevant law-enforcement authorities or the LTB.'}</p>
          </Section>
          <Section title={zh ? '3 · 服务变更' : '3 · Changes to the service'}>
            <p>{zh
              ? '我们会持续迭代功能。计划中的破坏性变更会提前 30 天通知。免费用户的免费等级永远不削减现有 Free 范围。'
              : 'We continuously iterate on features. Planned breaking changes are announced at least 30 days in advance. We will never reduce the existing scope of the Free tier for free users.'}</p>
          </Section>
          <Section title={zh ? '4 · 责任限制' : '4 · Limitation of liability'}>
            <p>{zh
              ? 'Stayloop 不承担因使用本平台造成的间接 / 偶发性 / 惩罚性损害。我们的最高赔偿限于过去 12 个月你向我们支付的费用。'
              : 'Stayloop is not liable for any indirect, incidental, or punitive damages arising from use of the platform. Our maximum liability is limited to the fees you paid us in the preceding 12 months.'}</p>
          </Section>
          <Section title={zh ? '5 · 房源信息的使用' : '5 · Use of listing information'}>
            <p>{zh
              ? '平台上的房源信息来自房东直接发布、Realtor.ca，以及向 Stayloop 授权的房地产协会与 MLS® 系统。使用这些信息即表示你同意以下规则：'
              : 'Listing information on the platform comes from landlords who publish directly, from Realtor.ca, and from real estate associations and MLS® systems that license data to Stayloop. By using it you agree to the following:'}</p>
            <ol className="mt-3 list-decimal space-y-2 pl-5" data-testid="terms-listing-data">
              {LISTING_DATA_CLAUSES.map((c, i) => <li key={i}>{zh ? c.zh : c.en}</li>)}
            </ol>
            <p className="mt-3">{zh
              ? '房源信息被认为可靠，但不保证准确；请在决定前向挂牌经纪公司或房东核实。Stayloop 与提供数据的协会不对你依赖房源信息或平台上他人发布的评论而造成的损失承担责任，也不为这些评论背书。'
              : 'Listing information is deemed reliable but is not guaranteed accurate; verify with the listing brokerage or landlord before you decide. Neither Stayloop nor the associations that supply data are responsible for loss arising from reliance on listing information or on comments posted by others, and they do not endorse such comments.'}</p>
          </Section>
          <Section title={zh ? '6 · 适用法律' : '6 · Governing law'}>
            <p>{zh
              ? '本条款受 Ontario 省法律管辖。任何争议先经 Stayloop 内部 mediator 调解,再提交 Ontario Superior Court 处理。'
              : 'These terms are governed by the laws of the Province of Ontario. Any dispute first goes to mediation by an internal Stayloop mediator, then to the Ontario Superior Court.'}</p>
          </Section>
        </article>
      </main>
      <Footer />
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-[18px] font-bold tracking-tight">{title}</h2>
      <div className="mt-3 text-[14.5px] leading-relaxed text-body-2">{children}</div>
    </section>
  )
}
