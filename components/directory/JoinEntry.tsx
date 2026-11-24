// 「申请加入」 in the header of 「找经纪和服务商」 (2026-11-23, user: 「这个板块是否需要加一个功能，让用户可以申请
// 加入 stayloop，成为服务商」; redesigned the same day: 「需要利用 AI 来辅助输入这些表格，最后让用户确认就可以」).
// It is one card, in the same place on every tab, going to /onboard — the page where an applicant
// hands their material to the AI Agent and gets the right form back filled in. It used to open a
// panel of three kinds to pick from; the picking is now the AI Agent's first job, and the three
// forms are still listed on /onboard for whoever would rather fill one in by hand.
// It adds no application flow of its own: a submitted record is still checked by staff before it
// is listed.
import Link from 'next/link'
import { JOIN_FORM_HREF, JOIN_HREF, type JoinKind } from '@/lib/onboard/assist'
import { SparkIcon } from '@/components/onboard/AssistComposer'
import type { FindTab } from './FindHeader'

type Words = { zh: string; en: string }

/** The kind of applicant each tab lists, where its form is, and one line on who it is for. */
export const JOIN_WAYS: Record<FindTab, { kind: JoinKind; href: string; desc: Words; asks: Words }> = {
  agents: {
    kind: 'agent',
    href: JOIN_FORM_HREF.agent,
    desc: { zh: '持牌的租赁经纪', en: 'Registered leasing agents' },
    asks: { zh: '注册名、注册号、所属经纪公司；核验后可以开公开主页', en: 'Registered name, registration number, brokerage; a public profile once verified' },
  },
  repairs: {
    kind: 'repair',
    href: JOIN_FORM_HREF.repair,
    desc: { zh: '水管、电气、供暖、门锁、清洁等会接派单的工种', en: 'Plumbing, electrical, heating, locks, cleaning and other dispatched trades' },
    asks: { zh: '工种、服务城市、收费方式，以及每个工种要求的资质', en: 'Trades, service cities, rates, and the credentials each trade requires' },
  },
  professional: {
    kind: 'professional',
    href: JOIN_FORM_HREF.professional,
    desc: { zh: 'Paralegal、律师、保险经纪、房源摄影', en: 'Paralegals, lawyers, insurance brokers, listing photographers' },
    asks: { zh: '服务类别、服务城市，以及对应的牌照', en: 'Services, service cities, and the licence each one needs' },
  },
}

export default function JoinEntry({ zh }: { zh: boolean }) {
  return (
    <Link
      href={JOIN_HREF}
      className="group flex items-center gap-3 rounded-2xl border border-[#BFE6F5] bg-white px-4 py-3 shadow-[0_10px_28px_-18px_rgba(27,27,60,0.35)] transition hover:border-brand sm:max-w-[360px] sm:flex-none"
      data-testid="find-join"
    >
      <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-brand/10 text-brand"><SparkIcon /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] font-semibold leading-snug text-ink">{zh ? '你是经纪或服务商？申请加入' : 'An agent or a provider? Apply to join'}</span>
        <span className="mt-0.5 block text-[12.5px] leading-snug text-body-3">{zh ? '把资料交给 AI 助理，申请表它来填' : 'Hand your details to the AI Agent; it fills in the form'}</span>
      </span>
      <span aria-hidden className="flex-none text-[18px] text-brand transition group-hover:translate-x-0.5">→</span>
    </Link>
  )
}
