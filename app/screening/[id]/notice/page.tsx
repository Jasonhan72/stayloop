'use client'

export const runtime = 'edge'

// /screening/[id]/notice — a printable notice the landlord can hand to an
// applicant who was not selected (competitor review P1-2). Ontario's
// Consumer Reporting Act s.10 requires telling an applicant when a consumer
// report contributed to a refusal and naming the agency; Stayloop is not a
// consumer reporting agency, so this letter states the actual basis: the
// documents the applicant supplied plus public records, names the sources,
// and gives the applicant a way to see, correct or dispute what was relied
// on. The landlord edits the letter in place; nothing here is saved.

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { useT } from '@/lib/i18n'

const REASONS = [
  { k: 'income', zh: '收入与租金比未达到本房源的标准', en: 'Income-to-rent ratio below the requirement for this unit' },
  { k: 'income_unverified', zh: '收入无法独立核实(未提供可核实的收入证明或银行流水)', en: 'Income could not be independently verified (no verifiable proof of income or bank statements)' },
  { k: 'credit', zh: '信用报告中的逾期、催收或利用率情况', en: 'Delinquency, collections or utilisation shown in the credit report' },
  { k: 'history', zh: '前租史或前房东参考未能核实', en: 'Rental history or prior-landlord references could not be verified' },
  { k: 'court', zh: '公开法庭 / LTB 记录中与申请人姓名匹配且经地址佐证的记录', en: 'Address-corroborated public court / LTB records matching the applicant' },
  { k: 'docs', zh: '所提交文件存在无法解释的不一致或被判定为经过修改', en: 'Submitted documents contained unexplained inconsistencies or were found to have been altered' },
  { k: 'other', zh: '其他申请人更符合本房源的租赁条件', en: 'Another applicant better met the tenancy criteria for this unit' },
]

export default function NoticePage() {
  const params = useParams()
  const id = String(params?.id || '')
  const { user, loading } = useAuth()
  const { lang } = useT()
  const zh = lang === 'zh'
  const [tenant, setTenant] = useState('')
  const [landlord, setLandlord] = useState('')
  const [property, setProperty] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [reasons, setReasons] = useState<Record<string, boolean>>({})
  const [sources, setSources] = useState<{ credit: boolean; court: boolean; verified: boolean }>({ credit: false, court: true, verified: false })
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!id || loading) return
    supabase.from('screenings').select('tenant_name, ai_extracted_name, ai_dimension_notes, verification').eq('id', id).maybeSingle().then(({ data }) => {
      if (data) {
        setTenant((data.tenant_name || data.ai_extracted_name || '') as string)
        const v3 = (data.ai_dimension_notes as { _v3?: { credit_report?: { present?: boolean } } } | null)?._v3
        setSources({ credit: !!v3?.credit_report?.present, court: true, verified: !!data.verification })
      }
      setLandlord((user?.user_metadata?.full_name as string | undefined) || user?.email || '')
      setReady(true)
    })
  }, [id, loading, user])

  const picked = REASONS.filter((r) => reasons[r.k])
  const input = 'border-b border-dashed border-line-strong bg-transparent px-1 font-semibold outline-none print:border-none'

  return (
    <div className="min-h-screen bg-surface print:bg-white">
      <div className="mx-auto max-w-[760px] px-5 py-8 print:max-w-none print:px-0 print:py-0">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <Link href={`/screening/${id}/report`} className="text-[13px] text-body-3">&larr; {zh ? '返回报告' : 'Back to report'}</Link>
          <div className="flex items-center gap-2">
            <button onClick={() => window.print()} className="sl-btn-primary !px-4 !py-2 !text-[13px]">{zh ? '打印 / 存为 PDF' : 'Print / save as PDF'}</button>
          </div>
        </div>

        <div className="rounded-2xl border border-line-divider bg-white p-6 print:rounded-none print:border-none print:p-0 sm:p-8">
          <div className="mb-4 print:hidden rounded-lg px-3 py-2 text-[12px]" style={{ background: '#FFFBEB', color: '#7C5A12' }}>
            {zh ? '勾选适用的依据、补全空白后打印。这封信说明决定的实际依据并告知申请人查阅与更正的途径;它不是法律意见。' : 'Tick the grounds that apply, fill in the blanks, then print. The letter states the actual basis for the decision and how the applicant can access and correct it; it is not legal advice.'}
          </div>

          <div className="text-[12px] text-body-3">{date}</div>
          <h1 className="mt-2 text-[20px] font-extrabold tracking-tight">{zh ? '关于你的租房申请' : 'Regarding your rental application'}</h1>
          <p className="mt-3 text-[14px] leading-relaxed">
            {zh ? '致 ' : 'To '}<input className={input} value={tenant} onChange={(e) => setTenant(e.target.value)} placeholder={zh ? '申请人姓名' : 'Applicant name'} />{zh ? '：' : ','}
          </p>
          <p className="mt-3 text-[14px] leading-relaxed">
            {zh ? '感谢你申请租住 ' : 'Thank you for applying to rent '}
            <input className={input} value={property} onChange={(e) => setProperty(e.target.value)} placeholder={zh ? '房源地址' : 'Property address'} style={{ minWidth: 220 }} />
            {zh ? '。经过审慎考虑，我们这次没有选择你的申请。' : '. After careful consideration, your application was not selected on this occasion.'}
          </p>

          <div className="mt-4 text-[13px] font-bold">{zh ? '这个决定的依据' : 'What the decision was based on'}</div>
          <ul className="mt-1 space-y-1 text-[13.5px] leading-relaxed">
            {REASONS.map((r) => (
              <li key={r.k} className={`flex items-start gap-2 ${reasons[r.k] ? '' : 'print:hidden'}`}>
                <input type="checkbox" className="mt-[4px] print:hidden" checked={!!reasons[r.k]} onChange={(e) => setReasons({ ...reasons, [r.k]: e.target.checked })} />
                <span className={reasons[r.k] ? '' : 'text-body-3'}>{reasons[r.k] ? '• ' : ''}{zh ? r.zh : r.en}</span>
              </li>
            ))}
            {picked.length === 0 && <li className="hidden print:block text-body-3">{zh ? '（未勾选依据）' : '(no grounds selected)'}</li>}
          </ul>

          <div className="mt-4 text-[13px] font-bold">{zh ? '我们参考了什么' : 'What was considered'}</div>
          <p className="mt-1 text-[13.5px] leading-relaxed">
            {zh
              ? '本决定基于你自愿提交的申请文件与公开记录，由 Stayloop 平台协助整理。Stayloop 不是安省《消费者报告法》意义上的消费者报告机构，本次没有向消费者报告机构购买关于你的报告'
              : 'The decision was based on the documents you voluntarily submitted and on public records, organised with the help of the Stayloop platform. Stayloop is not a consumer reporting agency under the Consumer Reporting Act (Ontario), and no report about you was purchased from a consumer reporting agency'}
            {sources.credit ? (zh ? '；我们阅读的是你本人提供的信用报告' : '; the credit report read was the one you supplied yourself') : ''}
            {sources.verified ? (zh ? '；经你本人授权的身份 / 银行核验结果也在考虑之列' : '; the identity / bank verification you authorised yourself was also considered') : ''}
            {zh ? '。公开记录来源：安省开放数据 LTB 判令目录、安省法院公开门户。' : '. Public-record sources: the Ontario Open Data LTB Order Catalogue and the Ontario Courts public portal.'}
          </p>

          <div className="mt-4 text-[13px] font-bold">{zh ? '你的权利' : 'Your rights'}</div>
          <p className="mt-1 text-[13.5px] leading-relaxed">
            {zh
              ? '你可以向我们索取本次决定所依据的信息摘要，并指出任何不准确之处；如认为公开记录与你无关（例如同名），请告诉我们，我们会复核。你也可以写信至 privacy@stayloop.ai 要求查阅、更正或删除 Stayloop 保存的与你相关的个人信息，注明本信日期与房源地址。'
              : 'You may ask us for a summary of the information this decision relied on and point out anything inaccurate; if you believe a public record is not about you (for example a namesake), tell us and we will re-check. You may also write to privacy@stayloop.ai to access, correct or delete personal information Stayloop holds about you, quoting the date of this letter and the property address.'}
          </p>
          <p className="mt-2 text-[13.5px] leading-relaxed">
            {zh
              ? '本决定未考虑《安大略省人权法典》所列的任何受保护特征（包括种族、宗教、残障、家庭状况、收入来源等）。'
              : 'This decision did not consider any ground protected under the Ontario Human Rights Code (including race, religion, disability, family status or source of income).'}
          </p>

          <p className="mt-6 text-[14px]">
            <input className={input} value={landlord} onChange={(e) => setLandlord(e.target.value)} placeholder={zh ? '房东 / 授权代理人姓名' : 'Landlord / authorised agent'} style={{ minWidth: 220 }} />
          </p>
          <div className="mt-1 text-[11px] text-body-3">{zh ? '房东 / 授权代理人' : 'Landlord / authorised agent'}</div>
          {!ready && <div className="mt-4 text-[12px] text-body-3 print:hidden">…</div>}
        </div>
      </div>
    </div>
  )
}
