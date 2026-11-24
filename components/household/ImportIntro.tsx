// What /leases/import shows to someone who is not signed in (2026-11-24). The page is 「租约与租金记录」 in
// the product list (lib/nav/siteNav.ts), and until now a visitor who opened it found one line —
// 「请先登录后再导入」 — which is a dead end for a row in a list of products. This says what the
// module is in the three steps a person actually takes, each sentence describing something that
// exists: the import with its confirm form (this page), the shared record once the other side joins,
// and the landlord's monthly rent record and export (lib/household/alreadyRenting.ts).
// It reads nothing and promises nothing: no money moves through Stayloop, and the export is a
// record, not a tribunal form.
import Link from 'next/link'

type Words = { zh: string; en: string }

export const IMPORT_STEPS: { title: Words; body: Words }[] = [
  {
    title: { zh: '上传租约，核对信息', en: 'Upload the lease and check the details' },
    body: {
      zh: 'PDF 或照片都可以。AI 助理读出地址、租期和租金，填进一张确认表；只有你确认过的内容才会保存。',
      en: 'A PDF or photos. The AI Agent reads the address, the term and the rent into a confirm form; only what you confirm is saved.',
    },
  },
  {
    title: { zh: '邀请对方加入', en: 'Invite the other side' },
    body: {
      zh: '房东、租客或经纪都可以先导入。对方加入并确认后，这份记录就是双方共同的；对话、报修和租金提醒都在这里。',
      en: 'A landlord, a tenant or an agent can start. Once the other side joins and confirms, the record belongs to both; messages, repair requests and rent reminders live here.',
    },
  },
  {
    title: { zh: '每月记租金，需要时导出', en: 'Record the rent each month, export when you need it' },
    body: {
      zh: '房东每月把收到的租金记上：上传银行流水对账，或逐期标记。需要留底时导出记录——它是 Stayloop 上留下的记录，不是 LTB 表格，也不替你提交。',
      en: 'The landlord records each month’s rent: reconcile against a bank statement, or mark periods one by one. Export the record when you need it — it is the record kept on Stayloop, not an LTB form, and nothing is filed for you.',
    },
  },
]

export default function ImportIntro({ zh }: { zh: boolean }) {
  const L = zh ? 'zh' : 'en'
  return (
    <section style={{ background: 'linear-gradient(180deg,#EFF4FF 0%,#FFFFFF 100%)' }} className="flex-1" data-testid="import-intro">
      <div className="mx-auto grid max-w-[1320px] gap-10 px-6 pb-16 pt-12 sm:px-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-start lg:gap-14 lg:px-12">
        <div className="min-w-0">
          <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-brand">{zh ? '租约与租金记录' : 'Leases & rent records'}</div>
          <h1 className="sl-type-head mt-3 text-[clamp(28px,3.6vw,44px)] font-semibold leading-[1.12] tracking-[-0.025em] text-ink" data-testid="import-intro-title">
            {zh ? '已经在租了？把签好的租约带进来' : 'Already renting? Bring the signed lease in'}
          </h1>
          <p className="mt-4 max-w-[580px] text-[15.5px] leading-relaxed text-body-2">
            {zh
              ? '不用从找房、筛查重新走一遍。导入已经签好的租约，双方在同一份记录里往来；房东每月把租金记上，要留底的时候导出。'
              : 'No need to start again from search and screening. Import the lease you already signed and both sides work from one record; the landlord records the rent each month and exports it when a record is needed.'}
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3">
            <Link href="/login?next=/leases/import" className="sl-btn-primary" data-testid="import-intro-signin">{zh ? '登录后导入租约' : 'Sign in to import a lease'}</Link>
            <Link href="/platform" className="text-[14px] font-semibold text-brand underline-offset-2 hover:underline">{zh ? '看产品总览 →' : 'See the product overview →'}</Link>
          </div>
          <p className="mt-6 max-w-[580px] text-[12.5px] leading-relaxed text-body-3" data-testid="import-intro-note">
            {zh
              ? 'Stayloop 不经手资金：租金由你们自己收付，这里只是记录。'
              : 'Stayloop handles no money: rent is paid between you, and this is only the record of it.'}
          </p>
        </div>
        <ol className="sl-card grid gap-5 p-6" data-testid="import-intro-steps">
          {IMPORT_STEPS.map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="sl-type-num flex h-8 w-8 flex-none items-center justify-center rounded-full bg-[#EEF5FA] text-[14px] font-semibold text-ink">{i + 1}</span>
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold text-ink">{s.title[L]}</span>
                <span className="mt-0.5 block text-[13.5px] leading-relaxed text-body-2">{s.body[L]}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
