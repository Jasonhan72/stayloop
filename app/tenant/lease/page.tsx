'use client'

// V5 VOL2 · Tenant · 租约审阅 + 第 6 页 · 签名 (Ontario Standard Lease / LTB).
import Link from 'next/link'
import WorkspaceShell from '@/components/WorkspaceShell'
import { useAIName } from '@/lib/aiName'
import { useT } from '@/lib/i18n'

const CLAUSES = [
  {
    num: 4,
    title: { zh: '租金', en: 'Rent' },
    body: {
      zh: '月租 CAD $2,800,每月 1 号前付清。延期 5 天以上,房东有权按 LTB N4 流程发出通知。',
      en: 'Rent is CAD $2,800/month, due by the 1st of each month. After 5 days late, the landlord may issue notice via the LTB N4 process.',
    },
    explain: {
      zh: 'Luna 解释: 这是 Ontario 标准 RTA 第 109 条要求,延期 5 天是法律允许的 grace period。',
      en: 'Luna explains: This follows Ontario standard RTA s.109; the 5-day delay is a legally permitted grace period.',
    },
  },
  {
    num: 7,
    title: { zh: '提前退租', en: 'Early termination' },
    body: {
      zh: '若你需要在租期内提前搬走,须提前 60 天书面通知 + 协助找新租客。',
      en: 'If you need to move out before the term ends, you must give 60 days written notice and help find a replacement tenant.',
    },
    explain: {
      zh: 'Luna 提醒: 60 天通知是 Ontario 法定要求 (RTA s.47),"协助找新租客"是合理但非强制条款。',
      en: 'Luna notes: 60 days notice is an Ontario legal requirement (RTA s.47); "help find a replacement tenant" is reasonable but not mandatory.',
    },
    warn: true,
  },
  {
    num: 12,
    title: { zh: '宠物', en: 'Pets' },
    body: {
      zh: '允许一只小型猫,需缴 $500 保证金 (退租时按损耗扣除)。',
      en: 'One small cat allowed, with a $500 deposit (deducted for wear and tear at move-out).',
    },
    explain: {
      zh: 'Luna 注意: Ontario RTA 不允许 no-pet 条款,但允许 reasonable 的损耗费。$500 在合理范围。',
      en: 'Luna notes: Ontario RTA prohibits no-pet clauses but allows reasonable wear-and-tear charges. $500 is within reason.',
    },
  },
  {
    num: 18,
    title: { zh: '终止', en: 'Termination' },
    body: {
      zh: '租期届满后转 month-to-month,除非任一方按 RTA 提前发出有效通知终止。',
      en: 'After the term ends it converts to month-to-month, unless either party gives valid notice to terminate under the RTA.',
    },
    explain: {
      zh: 'Luna 解释: 这是 Ontario 默认续期规则 (RTA s.38),对你有利 —— 房东不能在租期内随意赶你走。',
      en: 'Luna explains: This is the Ontario default renewal rule (RTA s.38), which works in your favor — the landlord cannot evict you at will during the term.',
    },
  },
]

export default function TenantLeasePage() {
  const name = useAIName()
  const { lang } = useT()
  return (
    <WorkspaceShell role="tenant" aside={<SigningAside />}>
      <div className="mb-9">
        <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-tenant">
          {lang === 'zh' ? 'LEASE · 6 / 6 页 · 签名页' : 'LEASE · PAGE 6 / 6 · SIGNATURE'}
        </div>
        <h1 className="mt-2 text-[26px] sm:text-[36px] font-bold tracking-tight">{lang === 'zh' ? 'Unit 1207 · King West 租约' : 'Unit 1207 · King West Lease'}</h1>
        <p className="mt-2 text-[14px] text-body-2">
          {lang === 'zh'
            ? `${name} 已经读完整份租约,标出了 4 条你需要特别注意的条款。看完后,在底部签名。`
            : `${name} has read the entire lease and flagged 4 clauses that deserve your attention. After reviewing, sign at the bottom.`}
        </p>
      </div>

      <div className="mx-auto max-w-[760px] sl-card p-5 sm:p-10">
        <div className="border-b border-line-divider pb-4">
          <h2 className="text-[20px] font-bold">{lang === 'zh' ? 'Ontario Standard Lease · LTB 标准表' : 'Ontario Standard Lease · LTB standard form'}</h2>
          <p className="mt-1 text-[12px] font-mono uppercase text-body-3">
            {lang === 'zh'
              ? '房东: Sarah Wang · 租客: Mia Chen · 租期 12mo · 起 2026/06/01'
              : 'Landlord: Sarah Wang · Tenant: Mia Chen · Term 12mo · Start 2026/06/01'}
          </p>
        </div>

        {CLAUSES.map((c) => (
          <div key={c.num} className="mt-6">
            <div
              className={
                'rounded-r-lg border-l-[3px] px-4 py-3 ' +
                (c.warn ? 'bg-warning/5 border-warning' : 'bg-surface-chip border-brand')
              }
            >
              <div
                className={
                  'font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg ' +
                  (c.warn ? 'text-warning' : 'text-brand')
                }
              >
                {lang === 'zh' ? `第 ${c.num} 条 · ${c.title.zh}` : `Clause ${c.num} · ${c.title.en}`}
              </div>
              <p className="mt-1 text-[13.5px] leading-relaxed text-body">{c.body[lang]}</p>
            </div>
            <div className="mt-2 grid grid-cols-[28px_1fr] gap-3 rounded-lg border border-tenant/22 bg-tenant/5 px-3 py-3">
              <span
                className="h-5 w-5 rounded-full"
                style={{
                  background: 'radial-gradient(circle at 35% 35%, #C4B5FD, #7C3AED 70%)',
                }}
              />
              <p className="text-[12.5px] leading-relaxed text-tenant-deep">{c.explain[lang].replace(/^Luna/, name)}</p>
            </div>
          </div>
        ))}

        {/* 第 6 页 · 签名 */}
        <div className="mt-10 border-t border-line-divider pt-8">
          <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
            {lang === 'zh' ? '第 6 页 · 签名' : 'Page 6 · Signature'}
          </div>
          <div className="mt-3 space-y-3 text-[12.5px] leading-relaxed text-body-2">
            <p>
              {lang === 'zh'
                ? '本 Residential Tenancy Agreement 由租客与房东在自愿、知情、平等基础上达成。双方确认已阅读并理解所有条款,包括但不限于第 4 条（租金）、第 7 条（提前退租）、第 12 条（宠物）、第 18 条（终止）。'
                : 'This Residential Tenancy Agreement is entered into by the tenant and landlord on a voluntary, informed, and equal basis. Both parties confirm they have read and understood all clauses, including but not limited to Clause 4 (Rent), Clause 7 (Early termination), Clause 12 (Pets), and Clause 18 (Termination).'}
            </p>
            <p>
              {lang === 'zh'
                ? '本协议自双方签署之日起生效,受 Ontario Residential Tenancies Act, 2006 (RTA) 约束。任何与 RTA 相抵触的条款均无效。'
                : 'This agreement takes effect on the date both parties sign it and is governed by the Ontario Residential Tenancies Act, 2006 (RTA). Any clause that conflicts with the RTA is void.'}
            </p>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-tenant/30 bg-tenant/5 p-4">
              <div className="font-mono text-[10px] font-bold uppercase tracking-eyebrow text-tenant">{lang === 'zh' ? '租客' : 'Tenant'}</div>
              <div className="mt-2 font-[cursive] text-[24px] italic text-tenant-deep">Mia Chen</div>
              <div className="mt-1 font-mono text-[10.5px] text-body-3">{lang === 'zh' ? '✓ 已签 · 2026/05/15 18:42' : '✓ Signed · 2026/05/15 18:42'}</div>
            </div>
            <div className="rounded-xl border border-dashed border-line-strong bg-white p-4">
              <div className="font-mono text-[10px] font-bold uppercase tracking-eyebrow text-body-3">{lang === 'zh' ? '房东' : 'Landlord'}</div>
              <div className="mt-2 text-[16px] font-semibold text-body-3">{lang === 'zh' ? '待 Sarah 签' : 'Awaiting Sarah'}</div>
              <div className="mt-1 font-mono text-[10.5px] text-body-3">{lang === 'zh' ? '⏱ 等签 · ~2 小时内' : '⏱ Pending · within ~2 hrs'}</div>
            </div>
          </div>

          <p className="mt-4 rounded-lg bg-surface-chip px-3 py-2.5 font-mono text-[10.5px] leading-relaxed text-body-3">
            {lang === 'zh' ? (
              <>本签名采用 Ontario eDocuments &amp; Electronic Signatures Act 标准 · 哈希值 0x4f...e9c2 · 时间戳由独立时间戳服务器锁定 · 该签名在 Ontario 法庭具同等效力。</>
            ) : (
              <>This signature follows the Ontario eDocuments &amp; Electronic Signatures Act · hash 0x4f...e9c2 · timestamped by an independent time-stamp server · it carries equal legal force in Ontario courts.</>
            )}
          </p>

          <div className="mt-6 grid gap-2">
            <button className="sl-btn-primary !py-[14px] !text-[14.5px]">
              {lang === 'zh' ? '✓ 确认签署 · 已完成' : '✓ Confirm signature · Done'}
            </button>
            <Link
              href="/tenant/move-in"
              className="rounded-[10px] border border-tenant/30 bg-tenant/5 px-5 py-[12px] text-center text-[14px] font-semibold text-tenant transition hover:bg-tenant/10"
            >
              {lang === 'zh' ? '双方签完 → 进入入住 Day-1 清单 →' : 'Both signed → go to move-in Day-1 checklist →'}
            </Link>
            <button className="rounded-[10px] border border-line-strong bg-white px-5 py-[12px] text-[14px] font-semibold text-body">
              {lang === 'zh' ? '下载 PDF 给法务看' : 'Download PDF for legal review'}
            </button>
          </div>
        </div>
      </div>
    </WorkspaceShell>
  )
}

function SigningAside() {
  const name = useAIName()
  const { lang } = useT()
  return (
    <div>
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-9 w-9 items-center justify-center rounded-full"
          style={{ background: 'radial-gradient(circle at 35% 35%, #C4B5FD, #7C3AED 70%)' }}
        />
        <div>
          <div className="text-[14px] font-bold">{lang === 'zh' ? `${name} 在这里 · SIGNING` : `${name} is here · SIGNING`}</div>
          <div className="font-mono text-[10.5px] text-body-3">{lang === 'zh' ? '最后确认 · 帮你核对' : 'Final review · here to double-check'}</div>
        </div>
      </div>

      <div className="mt-4 sl-card p-4">
        <div className="font-mono text-[10px] font-bold uppercase tracking-eyebrowLg text-body-3">
          {lang === 'zh' ? '签前最后确认' : 'Final pre-signature check'}
        </div>
        <ul className="mt-3 space-y-2 text-[12.5px] leading-relaxed text-body-2">
          <li>{lang === 'zh' ? '✓ 月租 $2,800 · 每月 1 号前' : '✓ Rent $2,800 · due by the 1st'}</li>
          <li>{lang === 'zh' ? '✓ 押金 $2,800 · Stripe 托管(非 damage deposit)' : '✓ Deposit $2,800 · held in Stripe escrow (not a damage deposit)'}</li>
          <li>{lang === 'zh' ? '✓ 一只猫 · $500 损耗保证金' : '✓ One cat · $500 wear-and-tear deposit'}</li>
          <li>{lang === 'zh' ? '✓ 提前退租 60 天通知' : '✓ 60 days notice for early termination'}</li>
        </ul>
      </div>

      <div className="mt-6 font-mono text-[10px] font-bold uppercase tracking-eyebrowLg text-body-3">
        {lang === 'zh' ? '签署进度' : 'Signing progress'}
      </div>
      <div className="mt-3 space-y-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-success/15 text-[11px] font-bold text-success">✓</span>
          <div className="text-[12.5px]">
            <span className="font-semibold">Mia Chen</span>
            <span className="ml-1 font-mono text-[10.5px] text-body-3">5/15 18:42</span>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-chip text-[11px] text-body-3">⏱</span>
          <div className="text-[12.5px]">
            <span className="font-semibold text-body-3">Sarah Wang</span>
            <span className="ml-1 font-mono text-[10.5px] text-body-3">{lang === 'zh' ? '等签 · ~2 小时内' : 'Pending · within ~2 hrs'}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
