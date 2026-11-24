'use client'

// /onboard — 「申请加入」 (2026-11-23, user: 「很多表格填入，需要利用 AI 来辅助输入这些表格，最后让用户确认就可以，
// 具体怎么做以让用户可以尽量减少工作为准」). One entrance for the three kinds of applicant the directory
// lists. The person hands over a sentence, a link to their own site, or photos of a card, a licence,
// a certificate; the AI Agent works out which kind they are and fills that kind's form; the page
// then opens the form — /agent/verify, /provider/onboard or /provider/onboard/professional — with
// the suggestion laid into its empty fields for them to check and submit.
// This page submits nothing and reads no record. The three forms are also listed below for anyone
// who would rather fill one in by hand.
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { useAuth } from '@/lib/useAuth'
import { useHats } from '@/lib/useHats'
import { useT } from '@/lib/i18n'
import { FIND_HREF, FIND_TABS } from '@/components/directory/FindHeader'
import { JOIN_WAYS } from '@/components/directory/JoinEntry'
import AssistComposer, { SparkIcon } from '@/components/onboard/AssistComposer'
import { JOIN_FORM_HREF, JOIN_HREF, type JoinKind } from '@/lib/onboard/assist'
import { saveDraft, type AssistResult } from '@/lib/onboard/client'

const STEPS: { zh: [string, string]; en: [string, string] }[] = [
  { zh: ['AI 助理读材料、填表', '看出你属于哪一类，把能读到的都填进申请表，一般十几秒。'], en: ['The AI Agent reads and fills', 'It works out which kind you are and puts what it can read into the form, usually in ten to twenty seconds.'] },
  { zh: ['你核对后提交', '改掉不对的，补上它没读到的，勾选承诺。承诺只能你自己勾。'], en: ['You check and submit', 'Fix what is wrong, add what it could not read, tick the attestation — that tick is always yours.'] },
  { zh: ['工作人员人工核验', 'Stayloop 工作人员对照公开注册库逐项核对，通过后你出现在目录里。'], en: ['Staff verify by hand', 'Stayloop staff check each item against the public registers; once it passes you appear in the directory.'] },
]

export default function OnboardEntryPage() {
  const auth = useAuth()
  const hats = useHats()
  const router = useRouter()
  const { lang } = useT()
  const zh = lang === 'zh'
  const L = zh ? 'zh' : 'en'
  // The AI Agent read the material but could not tell which kind the person is: they pick, the answer goes with them.
  const [undecided, setUndecided] = useState<AssistResult | null>(null)

  const go = (kind: JoinKind, r: AssistResult) => {
    if (auth.user) saveDraft(auth.user.id, { suggestion: { ...r.suggestion, kind }, links: r.links })
    router.push(JOIN_FORM_HREF[kind])
  }
  const onResult = (r: AssistResult) => {
    if (r.suggestion.kind) go(r.suggestion.kind, r)
    else setUndecided(r)
  }
  // Someone who already has a record is shown the way back to it; the box above still works for adding material.
  const mine = [
    hats.agent ? { href: JOIN_FORM_HREF.agent, label: zh ? '经纪：认证与主页' : 'Agent: verification and profile' } : null,
    hats.provider ? { href: JOIN_FORM_HREF.repair, label: zh ? '服务商：我的入驻资料' : 'Provider: my details' } : null,
  ].filter((x): x is { href: string; label: string } => !!x)

  return (
    <div style={{ background: '#FFFFFF' }} className="text-body">
      <Header variant="transparent" />
      <main>
        <section style={{ background: 'linear-gradient(180deg,#EFF4FF 0%,#FFFFFF 100%)' }}>
          <div className="mx-auto max-w-[1320px] px-6 pb-14 pt-10 sm:px-8 lg:px-12">
            <nav className="text-[13px] text-body-3" data-testid="onboard-crumb">
              <Link href={FIND_HREF} className="hover:underline">{zh ? '找经纪和服务商' : 'Find agents and service providers'}</Link> / <span className="text-body-2">{zh ? '申请加入' : 'Apply to join'}</span>
            </nav>
            <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:items-start lg:gap-14">
              <div className="min-w-0">
                <div className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-brand">
                  <SparkIcon size={14} />{zh ? '申请加入 · AI 助理代填' : 'Apply to join · filled in by the AI Agent'}
                </div>
                <h1 className="sl-type-head mt-3 text-[clamp(28px,3.6vw,44px)] font-semibold leading-[1.12] tracking-[-0.025em] text-ink" data-testid="onboard-entry-title">
                  {zh ? <>把资料交给 AI&nbsp;助理，申请表它来填</> : <>Hand over your details. The AI&nbsp;Agent fills in the form.</>}
                </h1>
                <p className="mt-4 max-w-[600px] text-[15.5px] leading-relaxed text-body-2" data-testid="onboard-entry-intro">
                  {zh
                    ? '说一句你是做什么的，贴上网站链接，或者拍一张名片、牌照、保险证明。AI 助理看出你属于哪一类、把申请表填好，你核对一遍再提交。'
                    : 'Say what you do in a sentence, paste a link to your website, or photograph a business card, a licence, an insurance certificate. The AI Agent works out which kind of applicant you are and fills in the form; you check it and submit.'}
                </p>

                {mine.length > 0 && (
                  <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl border border-line-divider bg-white px-4 py-3 text-[13.5px]" data-testid="onboard-entry-mine">
                    <span className="text-body-2">{zh ? '你已经有资料了：' : 'You already have a record:'}</span>
                    {mine.map((m) => <Link key={m.href} href={m.href} className="font-semibold text-brand underline-offset-2 hover:underline">{m.label} →</Link>)}
                  </div>
                )}

                <div className="mt-7">
                  {undecided ? (
                    <div className="rounded-[28px] border border-line-divider bg-white p-5 shadow-[0_24px_60px_-28px_rgba(27,27,60,0.28)] sm:p-6" data-testid="onboard-entry-undecided">
                      <div className="text-[16px] font-semibold text-ink">{zh ? 'AI 助理读到了你的资料，但看不出你属于哪一类' : 'The AI Agent read your details but could not tell which kind you are'}</div>
                      <p className="mt-1 text-[13.5px] text-body-2">{zh ? '选一个，读到的内容会带过去。' : 'Pick one; what it read goes with you.'}</p>
                      <div className="mt-4 grid gap-2 sm:grid-cols-3">
                        {FIND_TABS.map((t) => (
                          <button key={t.key} type="button" onClick={() => go(JOIN_WAYS[t.key].kind, undecided)} className="min-h-[56px] rounded-2xl border border-line-divider bg-white px-4 py-3 text-left transition hover:border-brand" data-testid={`onboard-entry-pick-${t.key}`}>
                            <span className="block text-[14.5px] font-semibold text-ink">{t[L]}</span>
                            <span className="mt-0.5 block text-[12px] leading-snug text-body-3">{JOIN_WAYS[t.key].desc[L]}</span>
                          </button>
                        ))}
                      </div>
                      <button type="button" onClick={() => setUndecided(null)} className="mt-4 text-[13px] font-semibold text-body-3 underline underline-offset-2">{zh ? '重新给材料' : 'Start over'}</button>
                    </div>
                  ) : (
                    <AssistComposer zh={zh} signedIn={!!auth.user} loginHref={`/login?next=${encodeURIComponent(JOIN_HREF)}`} onResult={onResult} />
                  )}
                </div>
              </div>

              <aside className="sl-card p-6" data-testid="onboard-entry-steps">
                <div className="text-[13px] font-semibold text-body-3">{zh ? '接下来' : 'What happens next'}</div>
                <ol className="mt-4 grid gap-5">
                  {STEPS.map((s, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="sl-type-num flex h-8 w-8 flex-none items-center justify-center rounded-full bg-[#EEF5FA] text-[14px] font-semibold text-ink">{i + 1}</span>
                      <span className="min-w-0">
                        <span className="block text-[15px] font-semibold text-ink">{s[L][0]}</span>
                        <span className="mt-0.5 block text-[13.5px] leading-relaxed text-body-2">{s[L][1]}</span>
                      </span>
                    </li>
                  ))}
                </ol>
                <p className="mt-5 border-t border-line-divider pt-4 text-[12.5px] leading-relaxed text-body-3">
                  {zh ? 'Stayloop 只做展示与转介，不抽成，费用由你和客户直接谈。' : 'Stayloop only lists and refers. It takes no commission; fees are between you and your clients.'}
                </p>
              </aside>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1320px] px-6 pb-20 sm:px-8 lg:px-12" data-testid="onboard-entry-manual">
          <h2 className="text-[20px] font-semibold tracking-tight text-ink">{zh ? '想自己填？直接选类别' : 'Rather fill it in yourself? Pick your kind'}</h2>
          <p className="mt-1 text-[14px] text-body-2">{zh ? '三张表都在，随时可以打开；表里也有同一个「交给 AI 助理填」。' : 'All three forms are here; each carries the same “let the AI Agent fill it in”.'}</p>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {FIND_TABS.map((t) => {
              const w = JOIN_WAYS[t.key]
              return (
                <Link key={t.key} href={w.href} className="sl-card group flex flex-col p-5 transition hover:border-brand" data-testid={`onboard-entry-form-${t.key}`}>
                  <span className="text-[17px] font-semibold text-ink">{t[L]}</span>
                  <span className="mt-1 text-[13.5px] leading-relaxed text-body-2">{w.desc[L]}</span>
                  <span className="mt-3 text-[12.5px] leading-relaxed text-body-3">{zh ? '要填：' : 'Asks for: '}{w.asks[L]}</span>
                  <span className="mt-4 text-[13.5px] font-semibold text-brand">{zh ? '打开这张表' : 'Open this form'} <span aria-hidden className="inline-block transition group-hover:translate-x-0.5">→</span></span>
                </Link>
              )
            })}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  )
}
