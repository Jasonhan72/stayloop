'use client'

// V5 VOL2 · Tenant · 租约审阅 + 第 6 页 · 签名 (Ontario Standard Lease / LTB).
// Layout follows design/v9-workspace-finance.html.
import Link from 'next/link'
import AIProactive, { type AIInsight } from '@/components/AIProactive'
import WorkspaceShell from '@/components/WorkspaceShell'
import HouseholdList from '@/components/HouseholdList'
import {
  AsideBlock,
  PageHeader,
  SectionCard,
  StatStrip,
  StatusPill,
  Table,
  Td,
  Tr,
} from '@/components/workspace'
import { useAIName } from '@/lib/aiName'
import { useT, type Lang } from '@/lib/i18n'

const CLAUSES = [
  {
    num: 4,
    title: { zh: '租金', en: 'Rent' },
    body: {
      zh: '月租 CAD $2,800,每月 1 号前付清。延期 5 天以上,房东有权按 LTB N4 流程发出通知。',
      en: 'Rent is CAD $2,800/month, due by the 1st of each month. After 5 days late, the landlord may issue notice via the LTB N4 process.',
    },
    explain: {
      zh: '解释: 这是 Ontario 标准 RTA 第 109 条要求,延期 5 天是法律允许的 grace period。',
      en: 'explains: This follows Ontario standard RTA s.109; the 5-day delay is a legally permitted grace period.',
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
      zh: '提醒: 60 天通知是 Ontario 法定要求 (RTA s.47),"协助找新租客"是合理但非强制条款。',
      en: 'notes: 60 days notice is an Ontario legal requirement (RTA s.47); "help find a replacement tenant" is reasonable but not mandatory.',
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
      zh: '注意: Ontario RTA 不允许 no-pet 条款,但允许 reasonable 的损耗费。$500 在合理范围。',
      en: 'notes: Ontario RTA prohibits no-pet clauses but allows reasonable wear-and-tear charges. $500 is within reason.',
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
      zh: '解释: 这是 Ontario 默认续期规则 (RTA s.38),对你有利 —— 房东不能在租期内随意赶你走。',
      en: 'explains: This is the Ontario default renewal rule (RTA s.38), which works in your favor — the landlord cannot evict you at will during the term.',
    },
  },
]

/**
 * Full clause index — the lease is more than the 4 clauses the AI flagged.
 * `flagged` marks the ones explained in detail below.
 */
const CLAUSE_INDEX: Array<{ num: number; title: { zh: string; en: string }; flagged?: boolean }> = [
  { num: 1, title: { zh: '当事人', en: 'Parties' } },
  { num: 2, title: { zh: '单元', en: 'Rental unit' } },
  { num: 3, title: { zh: '租期', en: 'Term' } },
  { num: 4, title: { zh: '租金', en: 'Rent' }, flagged: true },
  { num: 5, title: { zh: '服务与公用事业', en: 'Services & utilities' } },
  { num: 6, title: { zh: '押金', en: 'Deposits' } },
  { num: 7, title: { zh: '提前退租', en: 'Early termination' }, flagged: true },
  { num: 12, title: { zh: '宠物', en: 'Pets' }, flagged: true },
  { num: 18, title: { zh: '终止', en: 'Termination' }, flagged: true },
]

/** RTA quick reference — mirrors the LTB reminders on the landlord side. */
const RIGHTS: Array<{ zh: string; en: string }> = [
  {
    zh: '涨租须提前 90 天书面 N1，且 12 个月内仅一次',
    en: 'A rent increase needs 90 days written notice (Form N1), and only once every 12 months',
  },
  {
    zh: '2026 指导上限 2.5%（2018/11 后首次入住单位豁免）',
    en: '2026 guideline cap is 2.5% (units first occupied after Nov 2018 are exempt)',
  },
  {
    zh: '房东进入须提前 24 小时书面通知',
    en: 'The landlord must give 24 hours written notice before entering',
  },
  {
    zh: '押金只能是最后一月租金',
    en: "A rent deposit can only be last month's rent",
  },
]

export default function TenantLeasePage() {
  const name = useAIName()
  const { lang } = useT()
  const zh = lang === 'zh'

  const insights: AIInsight[] = [
    {
      text: {
        zh: '{ai} 已读完整份租约，标出第 4 / 7 / 12 / 18 条需要你特别注意。要我用大白话再讲一遍吗？',
        en: '{ai} read the whole lease and flagged clauses 4 / 7 / 12 / 18 for you. Want them explained in plain language?',
      },
      action: {
        label: { zh: '逐条讲给我听', en: 'Walk me through them' },
        prompt: {
          zh: '把 Unit 1207 King West 租约的第 4、7、12、18 条用大白话讲给我听，说明对我有什么影响。',
          en: 'Explain clauses 4, 7, 12 and 18 of the Unit 1207 King West lease in plain language and what they mean for me.',
        },
      },
    },
  ]

  return (
    <WorkspaceShell role="tenant" aside={<SigningAside lang={lang} insights={insights} />}>
      <HouseholdList />
      <PageHeader
        title={zh ? 'Unit 1207 · King West 租约' : 'Unit 1207 · King West Lease'}
        sub={
          <>
            <span className="font-mono text-[11px] uppercase tracking-eyebrow text-tenant">
              {zh ? 'LEASE · 6 / 6 页 · 签名页' : 'LEASE · PAGE 6 / 6 · SIGNATURE'}
            </span>
            <span className="mx-1.5 text-body-3">·</span>
            {zh
              ? `${name} 已经读完整份租约,标出了 4 条你需要特别注意的条款。看完后,在底部签名。`
              : `${name} has read the entire lease and flagged 4 clauses that deserve your attention. After reviewing, sign at the bottom.`}
          </>
        }
      />

      <StatStrip
        stats={[
          {
            label: zh ? '月租' : 'Monthly rent',
            value: '$2,800',
            sub: zh ? '每月 1 号前付清' : 'Due by the 1st',
          },
          {
            label: zh ? '租期剩余' : 'Term remaining',
            value: zh ? '10 个月' : '10 mo',
            sub: zh ? '2027-05-31 到期' : 'Ends 2027-05-31',
          },
          {
            label: zh ? '押金' : 'Deposit',
            value: '$2,800',
            sub: zh ? '最后一月租金' : "Last month's rent",
          },
          {
            label: zh ? '表单' : 'Form',
            value: '2229E',
            sub: 'Ontario Standard Lease',
          },
        ]}
      />

      <SectionCard className="mx-auto max-w-[760px]">
        <div className="border-b border-line-divider pb-3">
          <h2 className="text-[16px] font-bold">{zh ? 'Ontario Standard Lease · LTB 标准表' : 'Ontario Standard Lease · LTB standard form'}</h2>
          <p className="mt-1 font-mono text-[11px] uppercase text-body-3">
            {zh
              ? '房东: Sarah Wang · 租客: Mia Chen · 租期 12mo · 起 2026/06/01'
              : 'Landlord: Sarah Wang · Tenant: Mia Chen · Term 12mo · Start 2026/06/01'}
          </p>
        </div>

        {/* Clause index — the whole lease, not just the 4 explained below */}
        <div className="mt-4 rounded-xl border border-line-divider bg-surface-chip px-4 py-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-[13px] font-bold tracking-tight">{zh ? '全文条款索引' : 'Clause index'}</h3>
            <span className="text-[11px] text-body-3">
              {zh ? '⚑ = 下方有 AI 解读' : '⚑ = explained by AI below'}
            </span>
          </div>
          <ul className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {CLAUSE_INDEX.map((c) => (
              <li
                key={c.num}
                className={
                  'flex items-baseline gap-2 text-[12.5px] ' + (c.flagged ? 'font-semibold text-body' : 'text-body-2')
                }
              >
                <span className="w-5 flex-none font-mono text-[11px] text-body-3">{c.num}</span>
                <span>{c.title[lang]}</span>
                {c.flagged && <span className="text-warning">⚑</span>}
              </li>
            ))}
          </ul>
        </div>

        {CLAUSES.map((c) => (
          <div key={c.num} className="mt-5">
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
                {zh ? `第 ${c.num} 条 · ${c.title.zh}` : `Clause ${c.num} · ${c.title.en}`}
              </div>
              <p className="mt-1 text-[13px] leading-relaxed text-body">{c.body[lang]}</p>
            </div>
            <div className="mt-2 grid grid-cols-[28px_1fr] gap-3 rounded-lg border border-tenant/22 bg-tenant/5 px-3 py-3">
              <span
                className="h-5 w-5 rounded-full"
                style={{
                  background: 'radial-gradient(circle at 35% 35%, #C4B5FD, #7C3AED 70%)',
                }}
              />
              <p className="text-[12.5px] leading-relaxed text-tenant-deep">{`${name} ${c.explain[lang]}`}</p>
            </div>
          </div>
        ))}

        {/* 第 6 页 · 签名 */}
        <div className="mt-8 border-t border-line-divider pt-6">
          <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
            {zh ? '第 6 页 · 签名' : 'Page 6 · Signature'}
          </div>
          <div className="mt-3 space-y-3 text-[12.5px] leading-relaxed text-body-2">
            <p>
              {zh
                ? '本 Residential Tenancy Agreement 由租客与房东在自愿、知情、平等基础上达成。双方确认已阅读并理解所有条款,包括但不限于第 4 条（租金）、第 7 条（提前退租）、第 12 条（宠物）、第 18 条（终止）。'
                : 'This Residential Tenancy Agreement is entered into by the tenant and landlord on a voluntary, informed, and equal basis. Both parties confirm they have read and understood all clauses, including but not limited to Clause 4 (Rent), Clause 7 (Early termination), Clause 12 (Pets), and Clause 18 (Termination).'}
            </p>
            <p>
              {zh
                ? '本协议自双方签署之日起生效,受 Ontario Residential Tenancies Act, 2006 (RTA) 约束。任何与 RTA 相抵触的条款均无效。'
                : 'This agreement takes effect on the date both parties sign it and is governed by the Ontario Residential Tenancies Act, 2006 (RTA). Any clause that conflicts with the RTA is void.'}
            </p>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-tenant/30 bg-tenant/5 p-4">
              <div className="font-mono text-[10px] font-bold uppercase tracking-eyebrow text-tenant">{zh ? '租客' : 'Tenant'}</div>
              <div className="mt-2 font-[cursive] text-[22px] italic text-tenant-deep">Mia Chen</div>
              <div className="mt-1 font-mono text-[10.5px] text-body-3">{zh ? '✓ 已签 · 2026/05/15 18:42' : '✓ Signed · 2026/05/15 18:42'}</div>
            </div>
            <div className="rounded-xl border border-dashed border-line-strong bg-white p-4">
              <div className="font-mono text-[10px] font-bold uppercase tracking-eyebrow text-body-3">{zh ? '房东' : 'Landlord'}</div>
              <div className="mt-2 text-[15px] font-semibold text-body-3">{zh ? '待 Sarah 签' : 'Awaiting Sarah'}</div>
              <div className="mt-1 font-mono text-[10.5px] text-body-3">{zh ? '⏱ 等签 · ~2 小时内' : '⏱ Pending · within ~2 hrs'}</div>
            </div>
          </div>

          <p className="mt-4 rounded-lg bg-surface-chip px-3 py-2.5 font-mono text-[10.5px] leading-relaxed text-body-3">
            {zh ? (
              <>本签名采用 Ontario eDocuments &amp; Electronic Signatures Act 标准 · 哈希值 0x4f...e9c2 · 时间戳由独立时间戳服务器锁定 · 该签名在 Ontario 法庭具同等效力。</>
            ) : (
              <>This signature follows the Ontario eDocuments &amp; Electronic Signatures Act · hash 0x4f...e9c2 · timestamped by an independent time-stamp server · it carries equal legal force in Ontario courts.</>
            )}
          </p>

          <div className="mt-5 grid gap-2">
            <div className="sl-btn-primary pointer-events-none !py-[12px] text-center !text-[13.5px]" aria-disabled="true">
              {zh ? '✓ 确认签署 · 已完成' : '✓ Confirm signature · Done'}
            </div>
            <Link
              href="/tenant/move-in"
              className="rounded-[10px] border border-tenant/30 bg-tenant/5 px-5 py-[10px] text-center text-[13px] font-semibold text-tenant transition hover:bg-tenant/10"
            >
              {zh ? '双方签完 → 进入入住 Day-1 清单 →' : 'Both signed → go to move-in Day-1 checklist →'}
            </Link>
            <button
              onClick={() => window.print()}
              className="rounded-[10px] border border-line-strong bg-white px-5 py-[10px] text-[13px] font-semibold text-body transition hover:border-brand hover:text-brand"
            >
              {zh ? '下载 PDF 给法务看' : 'Download PDF for legal review'}
            </button>
          </div>
        </div>
      </SectionCard>

      {/* Documents & attachments */}
      <div className="mx-auto mt-4 max-w-[760px]">
        <SectionCard
          title={zh ? '附件与文件' : 'Documents & attachments'}
          meta={zh ? '示范数据' : 'SAMPLE DATA'}
          padded={false}
        >
          <Table
            head={[zh ? '文件' : 'Document', zh ? '类型' : 'Type', zh ? '操作' : 'Action']}
          >
            <Tr>
              <Td>
                <div className="font-semibold">{zh ? 'Ontario Standard Lease（2229E）' : 'Ontario Standard Lease (2229E)'}</div>
                <div className="mt-0.5 text-[11.5px] text-body-3">
                  {zh ? 'LTB 标准表 · 全 6 页' : 'LTB standard form · 6 pages'}
                </div>
              </Td>
              <Td align="right">
                <StatusPill tone="neutral">PDF</StatusPill>
              </Td>
              <Td align="right">
                <button onClick={() => window.print()} className="text-[12px] font-semibold text-brand transition hover:underline">
                  {zh ? '打印 / 下载' : 'Print / download'}
                </button>
              </Td>
            </Tr>
            <Tr>
              <Td>
                <div className="font-semibold">Schedule A</div>
                <div className="mt-0.5 text-[11.5px] text-body-3">
                  {zh ? '特殊条款（允许养猫 · 宠物造成的损坏由租客负责修复）' : 'Additional terms (cats permitted · tenant repairs any pet-caused damage)'}
                </div>
              </Td>
              <Td align="right">
                <StatusPill tone="neutral">PDF</StatusPill>
              </Td>
              <Td align="right">
                <button onClick={() => window.print()} className="text-[12px] font-semibold text-brand transition hover:underline">
                  {zh ? '打印 / 下载' : 'Print / download'}
                </button>
              </Td>
            </Tr>
            <Tr>
              <Td>
                <div className="font-semibold">{zh ? '签名凭据' : 'Signature record'}</div>
                <div className="mt-0.5 font-mono text-[11.5px] text-body-3">
                  {zh ? '哈希 0x4f…e9c2 · 独立时间戳 · 2026/05/15 18:42' : 'Hash 0x4f…e9c2 · independent timestamp · 2026/05/15 18:42'}
                </div>
              </Td>
              <Td align="right">
                <StatusPill tone="ok">{zh ? '已锁定' : 'Locked'}</StatusPill>
              </Td>
              <Td align="right">
                <Link href="/tenant/audit" className="text-[12px] font-semibold text-brand transition hover:underline">
                  {zh ? '在审计日志查看' : 'View in audit log'}
                </Link>
              </Td>
            </Tr>
          </Table>
        </SectionCard>
      </div>
    </WorkspaceShell>
  )
}

function SigningAside({ lang, insights }: { lang: Lang; insights: AIInsight[] }) {
  const name = useAIName()
  const zh = lang === 'zh'
  return (
    <div>
      <AsideBlock title={zh ? 'AI 建议' : 'AI SUGGESTIONS'}>
        <AIProactive role="tenant" insights={insights} variant="rail" />
      </AsideBlock>

      <AsideBlock title={zh ? '签前最后确认' : 'FINAL PRE-SIGNATURE CHECK'}>
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-full"
            style={{ background: 'radial-gradient(circle at 35% 35%, #C4B5FD, #7C3AED 70%)' }}
          />
          <div>
            <div className="text-[13px] font-bold">{zh ? `${name} 在这里 · SIGNING` : `${name} is here · SIGNING`}</div>
            <div className="font-mono text-[10.5px] text-body-3">{zh ? '最后确认 · 帮你核对' : 'Final review · here to double-check'}</div>
          </div>
        </div>
        <ul className="mt-3 space-y-2 text-[12.5px] leading-relaxed text-body-2">
          <li>{zh ? '✓ 月租 $2,800 · 每月 1 号前' : '✓ Rent $2,800 · due by the 1st'}</li>
          <li>{zh ? '✓ 押金 $2,800 · Stripe 托管(非 damage deposit)' : '✓ Deposit $2,800 · held in Stripe escrow (not a damage deposit)'}</li>
          <li>{zh ? '✓ 一只猫 · $500 损耗保证金' : '✓ One cat · $500 wear-and-tear deposit'}</li>
          <li>{zh ? '✓ 提前退租 60 天通知' : '✓ 60 days notice for early termination'}</li>
        </ul>
      </AsideBlock>

      <AsideBlock title={zh ? '签署进度' : 'SIGNING PROGRESS'}>
        <div className="space-y-3">
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
              <span className="ml-1 font-mono text-[10.5px] text-body-3">{zh ? '等签 · ~2 小时内' : 'Pending · within ~2 hrs'}</span>
            </div>
          </div>
        </div>
      </AsideBlock>

      <AsideBlock title={zh ? '我的 RTA 权利速查' : 'MY RTA RIGHTS'}>
        <ul className="space-y-2 text-[12.5px] leading-relaxed text-body-2">
          {RIGHTS.map((r) => (
            <li key={r.en} className="flex items-start gap-2">
              <span className="mt-[1px] flex-none text-tenant">·</span>
              <span>{r[lang]}</span>
            </li>
          ))}
        </ul>
      </AsideBlock>
    </div>
  )
}
