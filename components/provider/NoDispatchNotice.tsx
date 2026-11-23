// What a professional-only provider sees on 工单 and 历史 (2026-11-23). Nothing is ever dispatched
// to a paralegal, a lawyer, an insurance broker or a photographer, so those two pages used to be
// permanently empty for them with no word of why. Their navigation no longer lists the pages, but
// the provider "home" links around the site still land on /provider/jobs — this says where their
// work actually is.
import Link from 'next/link'
import { onboardHref, otherFormHref } from '@/lib/marketplace/onboardKind'
import { providerHref } from '@/lib/marketplace/directory'

export default function NoDispatchNotice({ zh, providerId, verified }: { zh: boolean; providerId: string; verified: boolean }) {
  return (
    <div className="rounded-2xl border border-line-divider bg-white p-6" data-testid="provider-no-dispatch">
      <h1 className="text-[20px] font-extrabold tracking-tight">{zh ? '专业服务不派单，这里没有工单' : 'Professional services are not dispatched, so there are no jobs here'}</h1>
      <p className="mt-2 text-[14px] leading-relaxed text-body-2">
        {zh
          ? '你登记的是专业服务。Stayloop 只在目录里展示和转介，不会给你派工单，也不经手委托和费用。房东和租客看到你的主页后，会在站内给你发消息——咨询都在「消息」里。'
          : 'Your record lists professional services. Stayloop only lists and refers you in the directory: it dispatches no jobs to you and handles no retainer or fee. Landlords and tenants who see your page message you on Stayloop — every inquiry is in Messages.'}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href="/messages" className="sl-btn-primary !px-4 !py-2 !text-[13.5px]" data-testid="no-dispatch-messages">{zh ? '去消息' : 'Open messages'}</Link>
        <Link href={onboardHref('professional')} className="sl-btn-secondary !px-4 !py-2 !text-[13.5px]" data-testid="no-dispatch-profile">{zh ? '资料与牌照' : 'Profile & licences'}</Link>
        {verified && <Link href={providerHref(providerId)} className="sl-btn-secondary !px-4 !py-2 !text-[13.5px]" data-testid="no-dispatch-page">{zh ? '看我的主页' : 'View my page'}</Link>}
      </div>
      <p className="mt-4 text-[12.5px] leading-relaxed text-body-3">
        {zh ? '也做水管、电气、清洁这类物业管理服务？' : 'Do you also do plumbing, electrical, cleaning or other property maintenance?'}{' '}
        <Link href={otherFormHref('professional')} className="underline">{zh ? '到「物业管理服务」入驻添加工种' : 'Add those trades under property maintenance'}</Link>
        {zh ? '，核验后就能接到派单。' : ' — once verified, jobs can be dispatched to you.'}
      </p>
    </div>
  )
}
