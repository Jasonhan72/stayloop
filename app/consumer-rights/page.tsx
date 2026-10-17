'use client'

// /consumer-rights — plain-language page on the three rights an applicant has
// over their screening file under the Consumer Reporting Act (Ontario):
// s.12 access, s.13 dispute and correction, s.12.1 identity alert. Linked from
// the privacy policy, the applicant notice, the report page and /my-file.
// V0.8 first item (2026-10-17) · design/consumer-file-access-plan-2026-10.md step 4.

import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { useT } from '@/lib/i18n'

export default function ConsumerRightsPage() {
  const { lang } = useT()
  const zh = lang === 'zh'
  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <Header />
      <main className="flex-1">
        <div className="mx-auto w-full max-w-[1320px] px-6 py-12 sm:px-8 lg:px-12">
          <article className="mx-auto max-w-[760px]">
            <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-brand">YOUR RIGHTS</div>
            <h1 className="mt-3 text-[32px] font-extrabold leading-tight tracking-tight sm:text-[40px]">
              {zh ? '你对自己筛查档案的权利' : 'Your rights over your screening file'}
            </h1>
            <p className="mt-4 text-[15px] leading-relaxed text-body-2">
              {zh
                ? '房东或经纪在 Stayloop 上筛查你的租房申请时，会形成一份关于你的档案。按安省《消费者报告法》，这份档案是你的：你可以要来看，可以指出哪里不对，也可以在上面放一条身份警示。三项都免费。'
                : 'When a landlord or agent screens your rental application on Stayloop, a file about you is created. Under Ontario’s Consumer Reporting Act that file is yours: you can ask to see it, point out what is wrong, and place an identity alert on it. All three are free.'}
            </p>
            <div className="mt-5">
              <Link href="/my-file" className="sl-btn-primary">{zh ? '索取我的档案 →' : 'Get my file →'}</Link>
            </div>

            <Section title={zh ? '1 · 索取档案（s.12）' : '1 · Access your file (s.12)'}>
              <p>{zh
                ? '你可以要求我们提供档案里关于你的全部信息：我们记录了什么、信用信息从哪里来、过去 3 年谁查阅过你的档案（姓名与电话）、过去 1 年谁收到过报告以及报告副本。'
                : 'You can ask us for everything the file holds about you: what we recorded, where any credit information came from, who looked at your file in the last 3 years (name and phone), and who received a report in the last 12 months, with a copy of it.'}</p>
              <p>{zh
                ? '怎么做：到「我的筛查档案」页输入申请时用的邮箱，点邮件里的链接，填姓名（出生日期可选，只用于比对），选电子、邮寄或电话。电子方式即时在页面上看到并可保存 PDF；邮寄或电话方式 2 个工作日内寄出或来电。我们需要确认是你本人（s.12(6)）；自动对不上时由专人复核。'
                : 'How: on the My screening file page, enter the email you applied with, open the link in the email, give your name (date of birth optional, used only to match), and choose electronic, mail or phone. Electronic delivery appears on the page right away and can be saved as a PDF; mail or phone goes out within 2 business days. We have to confirm it is you (s.12(6)); when the automatic match fails a person reviews it.'}</p>
              <p>{zh ? '不收费（s.12(13)）。' : 'There is no charge (s.12(13)).'}</p>
            </Section>

            <Section title={zh ? '2 · 争议与更正（s.13）' : '2 · Dispute and correction (s.13)'}>
              <p>{zh
                ? '档案里任何一条你认为不准确或不完整的，都可以提出争议：在档案页该条旁点「这条不对」，写下你的说明。我们会在合理时间内核实，然后更正、补充或删除；如果维持原记录，会写明理由。'
                : 'You can dispute any item you believe is inaccurate or incomplete: on the file page, click “This is wrong” next to it and tell us why. We check it within a reasonable time and then correct, supplement or delete it; if we keep it as recorded, we say why.'}</p>
              <p>{zh
                ? '更正后我们会通知最近 60 天内收到过这份报告的人（房东、经纪、合作方），并把结果发到你的邮箱。更正记录只追加、不覆盖：原报告上会显示更正注记。'
                : 'After a correction we notify everyone who received the report in the last 60 days (landlord, agent, partner) and email the result to you. Corrections are appended, never overwritten: the original report shows a correction note.'}</p>
            </Section>

            <Section title={zh ? '3 · 身份警示（s.12.1）' : '3 · Identity alert (s.12.1)'}>
              <p>{zh
                ? '如果你担心有人冒用你的身份申请租房，可以在档案上放一条身份警示（一段你写的话，最多 500 字）。之后每次披露档案，警示都会一起显示。警示 6 年到期，你随时可以撤销。'
                : 'If you are worried that someone may apply for a rental in your name, you can place an identity alert on your file (a note you write, up to 500 characters). Every later disclosure of the file shows the alert. It expires after 6 years and you can withdraw it at any time.'}</p>
            </Section>

            <Section title={zh ? '我们怎么处理公开记录' : 'How we handle public records'}>
              <p>{zh
                ? '法院与 LTB 的记录常有同名的人。没有经过佐证的不利信息，我们会在档案里注明「未佐证」（s.9(3)(b)），房东看到的是「同名命中」而不是结论。判决与债务记录超过 7 年不再使用；诉讼与令状超过 12 个月再次使用前会先核实现状；其他不利信息同样以 7 年为限（s.9(3)）。'
                : 'Court and LTB records often involve people with the same name. Adverse information that has not been corroborated is marked “unverified” in the file (s.9(3)(b)); the landlord sees a same-name hit, not a conclusion. Judgments and debts older than 7 years are no longer used; lawsuits and writs older than 12 months are re-checked before any further use; other adverse information is likewise limited to 7 years (s.9(3)).'}</p>
            </Section>

            <Section title={zh ? '时限一览' : 'Time limits at a glance'}>
              <ul className="list-disc space-y-1 pl-5">
                <li>{zh ? '索取档案：电子方式即时；邮寄或电话 2 个工作日内（s.12(8)）。' : 'Access: electronic immediately; mail or phone within 2 business days (s.12(8)).'}</li>
                <li>{zh ? '争议：合理时间内核实并回复；更正后通知 60 天内的收件人（s.13）。' : 'Dispute: checked and answered within a reasonable time; recipients of the last 60 days are notified after a correction (s.13).'}</li>
                <li>{zh ? '身份警示：6 年有效，可随时撤销（s.12.1）。' : 'Identity alert: valid for 6 years, withdrawable at any time (s.12.1).'}</li>
                <li>{zh ? '房东作出不利决定后，你可以在 60 天内要求知道信息的性质与来源（s.10(7)）。' : 'After an adverse decision you may ask the landlord, within 60 days, for the nature and source of the information (s.10(7)).'}</li>
              </ul>
            </Section>

            <Section title={zh ? '联系' : 'Contact'}>
              <p>{zh
                ? '页面上办不了的事，或想让人解释档案里的内容，写信到 privacy@stayloop.ai，注明你申请时用的邮箱。'
                : 'For anything the page cannot do, or to have the file explained to you, write to privacy@stayloop.ai and quote the email you applied with.'}</p>
              <p className="text-[13px] text-body-3">
                <Link href="/my-file" className="font-semibold text-brand hover:underline">{zh ? '我的筛查档案 →' : 'My screening file →'}</Link>
                <span className="mx-2">·</span>
                <Link href="/privacy" className="font-semibold text-brand hover:underline">{zh ? '隐私政策' : 'Privacy policy'}</Link>
              </p>
            </Section>
          </article>
        </div>
      </main>
      <Footer />
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-[19px] font-bold tracking-tight">{title}</h2>
      <div className="mt-3 space-y-3 text-[14.5px] leading-relaxed text-body-2">{children}</div>
    </section>
  )
}
