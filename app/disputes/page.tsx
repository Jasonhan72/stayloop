'use client'

// V5.3 · Disputes & arbitration (handbook §06 / VOL 8). 三方共用:
// 仲裁工作台 · LTB 表格 · 律师目录 · AI 法律助手。
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

const CASES = [
  {
    id: 'DSP-2K8X',
    title: '押金返还争议 · DSP-2K8X',
    parties: 'Mia (租客) ⇄ Sarah (房东) · 押金 $2,800 返还',
    status: 'arbitration',
    statusLabel: '仲裁中',
    color: '#F97316',
    stage: 3,
  },
  {
    id: 'DSP-3M9P',
    title: '维修延迟 · DSP-3M9P',
    parties: 'R. Liu (租客) ⇄ 房东 · 暖气故障 9 天未修 · 援引 RTA s.20 维护义务',
    status: 'mediation',
    statusLabel: '调解中',
    color: '#3B82F6',
    stage: 2,
  },
  {
    id: 'DSP-7K2L',
    title: '租金涨幅争议 · DSP-7K2L',
    parties: 'D. Tay (租客) ⇄ 房东 · 涨幅 4.8% 超过 2026 安省指引 2.5% · 等仲裁员合议',
    status: 'pending',
    statusLabel: '等待仲裁',
    color: '#8B5CF6',
    stage: 3,
  },
  {
    id: 'DSP-1Z9K',
    title: '隐私访问 · DSP-1Z9K',
    parties: '租客 ⇄ 房东 · 多次未约入屋 · RTA s.26 隐私权 · 调解阶段',
    status: 'resolved',
    statusLabel: '已解决',
    color: '#047857',
    stage: 5,
  },
]

const STAGES = [
  { k: '通知', s: 'done' },
  { k: '协商', s: 'done' },
  { k: 'LTB 申请', s: 'now' },
  { k: '听证', s: 'next' },
  { k: '裁定', s: 'next' },
]

const LTB_FORMS = [
  { code: 'T1', name: '押金返还申请', who: '租客 → LTB' },
  { code: 'T2', name: '房东违法行为', who: '租客 → LTB' },
  { code: 'T6', name: '维修义务申请', who: '租客 → LTB' },
  { code: 'L1', name: '欠租驱逐申请', who: '房东 → LTB' },
  { code: 'L2', name: '其他终止申请', who: '房东 → LTB' },
  { code: 'N4', name: '欠租终止通知', who: '房东 → 租客' },
]

const LAWYERS = [
  {
    name: 'Jennifer Liu',
    focus: '专做租客方 · 接受 Legal Aid 证书 · 服务 Scarborough / North York',
    lso: 'LSO #P12345 · Paralegal',
    rate: '$180/h',
    tag: '押金 / T1',
    cases: '142 件',
  },
  {
    name: 'Marcus Thompson',
    focus: '前 ACTO（多伦多租客社区中心）律师 · 强组织能力 · 复杂案件偏好',
    lso: 'LSO #L23456 · Lawyer',
    rate: '$280/h',
    tag: '押金 / 维修',
    cases: '89 件',
  },
  {
    name: 'David Chen',
    focus: '前 LTB 仲裁员 · Bay Street 出身 · 复杂案 + 上诉',
    lso: 'LSO #L34567 · Lawyer',
    rate: '$350/h',
    tag: '退役 LTB 仲裁员',
    cases: '234 件',
  },
]

export default function DisputesPage() {
  return (
    <div style={{ background: '#FAF7EE', color: '#171717' }}>
      <Header variant="transparent" />

      <section style={{ background: 'linear-gradient(180deg,#F2EEE5 0%,rgba(139,92,246,0.06) 100%)' }}>
        <div className="mx-auto max-w-[1240px] px-5 py-20 sm:px-7 lg:px-12">
          <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg" style={{ color: '#7C3AED' }}>
            DISPUTE CENTER · 仲裁案件中心
          </div>
          <h1 className="mt-4 max-w-[820px] text-[36px] font-extrabold leading-[1.1] tracking-tight sm:text-[48px]">
            出了纠纷,<br />也有 AI 陪你走完流程。
          </h1>
          <p className="mt-5 max-w-[640px] text-[16px] leading-relaxed text-body-2">
            Stayloop 内部 dispute resolution 是非约束性的 · 双方任何阶段均可终止并直接诉诸 LTB / 法院 ·
            仲裁员独立中立 · 每一步留痕可查。
          </p>
          {/* Quick stats */}
          <div className="mt-8 flex flex-wrap gap-8">
            {[
              { v: '4', l: '活跃案件' },
              { v: '12', l: '已完成' },
              { v: '6.4d', l: '平均解决时间' },
              { v: '82%', l: '调解成功率' },
            ].map((s) => (
              <div key={s.l}>
                <div className="text-[28px] font-extrabold tracking-tight">{s.v}</div>
                <div className="font-mono text-[10.5px] uppercase tracking-eyebrow text-body-3">{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Case list */}
      <section>
        <div className="mx-auto max-w-[1240px] px-5 py-12 sm:px-7 lg:px-12">
          <div className="sl-card overflow-hidden">
            {CASES.map((c, i) => (
              <div
                key={c.id}
                className={'flex items-center gap-4 px-6 py-5 ' + (i > 0 ? 'border-t border-line-divider' : '')}
              >
                <span
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white"
                  style={{ background: c.color }}
                >
                  {c.id.slice(-2)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-bold">{c.title}</div>
                  <div className="mt-0.5 text-[12.5px] text-body-2">{c.parties}</div>
                </div>
                <span
                  className="flex-shrink-0 rounded-md px-2 py-[4px] font-mono text-[10px] font-bold uppercase tracking-wider"
                  style={{ background: c.color + '18', color: c.color }}
                >
                  {c.statusLabel}
                </span>
                <Link href="#" className="flex-shrink-0 text-[12.5px] font-semibold hover:underline" style={{ color: '#7C3AED' }}>
                  打开 →
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="mx-auto grid max-w-[1240px] gap-6 px-5 py-8 sm:px-7 lg:grid-cols-[1.3fr_0.7fr] lg:px-12">
          {/* case detail + stages */}
          <div className="space-y-6">
            <div className="sl-card p-6">
              <div className="flex items-center justify-between">
                <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">当前案件 · DSP-2K8X</div>
                <span className="rounded-md px-2 py-[3px] font-mono text-[10px] font-bold" style={{ background: 'rgba(124,58,237,0.10)', color: '#7C3AED' }}>仲裁中</span>
              </div>
              <h3 className="mt-2 text-[18px] font-bold">Mia (租客) ⇄ Sarah (房东) · 押金 $2,800 返还</h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-body-2">
                租客主张房东未在规定期限内返还押金及利息。AI 已比对租约条款与安省 RTA,建议先发协商函,7 天无果再走 T1。
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-2">
                {STAGES.map((s, i) => (
                  <span key={s.k} className="flex items-center gap-2">
                    <span className={'rounded-lg border px-3 py-[7px] font-mono text-[11.5px] font-semibold ' +
                      (s.s === 'done' ? 'border-[rgba(124,58,237,0.40)] bg-[rgba(124,58,237,0.08)] text-[#7C3AED]'
                        : s.s === 'now' ? 'border-warning bg-warning/10 text-warning'
                        : 'border-line-divider bg-white text-body-3')}>
                      {s.k}
                    </span>
                    {i < STAGES.length - 1 && <span className="text-body-4">→</span>}
                  </span>
                ))}
              </div>
            </div>

            {/* AI legal assistant */}
            <div className="sl-card p-6">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: 'radial-gradient(circle at 35% 35%, #C4B5FD, #7C3AED 70%)' }} />
                <div>
                  <div className="text-[14px] font-bold">AI 法律助手 · Logic Legal</div>
                  <div className="font-mono text-[10.5px] text-body-3">读懂案情 · 不构成法律意见</div>
                </div>
              </div>
              <div className="mt-3 rounded-xl rounded-tl-sm bg-surface-chip p-3 text-[13px] leading-relaxed text-body-2">
                根据安省《住宅租赁法》(RTA),房东须在租约结束后合理期限内返还押金并计息。我已为你起草协商函,
                并准备好 <b className="text-body">T1(押金返还申请)</b> 草稿;若 7 天内无回应,可一键提交 LTB。
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="rounded-lg px-4 py-[9px] text-[13px] font-semibold text-white" style={{ background: '#7C3AED' }}>查看协商函草稿</button>
                <button className="rounded-lg border border-line-strong bg-white px-4 py-[8px] text-[13px] font-semibold text-body hover:border-[#7C3AED]" style={{ ['--tw-text-opacity' as string]: 1 }}>📋 帮我升级 LTB</button>
              </div>
            </div>
          </div>

          {/* LTB forms */}
          <div>
            <div className="sl-card p-6">
              <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">LTB 表格 · 一键生成</div>
              <div className="mt-4 space-y-2">
                {LTB_FORMS.map((f) => (
                  <div key={f.code} className="flex items-center gap-3 rounded-lg border border-line-divider bg-white p-3">
                    <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg font-mono text-[12px] font-bold" style={{ background: 'rgba(124,58,237,0.10)', color: '#7C3AED' }}>{f.code}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-bold leading-tight">{f.name}</div>
                      <div className="font-mono text-[10.5px] text-body-3">{f.who}</div>
                    </div>
                    <span className="text-[12px] font-semibold" style={{ color: '#7C3AED' }}>生成 →</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* lawyer directory */}
      <section style={{ background: '#F2EEE5' }}>
        <div className="mx-auto max-w-[1240px] px-5 py-16 sm:px-7 lg:px-12">
          <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg" style={{ color: '#7C3AED' }}>
            Lawyer Directory · 律师目录
          </div>
          <h2 className="mt-3 text-[28px] font-extrabold tracking-tight sm:text-[34px]">需要真人时,对接持牌律师。</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {LAWYERS.map((l) => (
              <div key={l.name} className="sl-card p-6">
                <div className="flex items-center justify-between">
                  <div className="text-[16px] font-bold">{l.name}</div>
                  <span className="rounded-md px-2 py-[3px] font-mono text-[9.5px] font-bold uppercase tracking-wider" style={{ background: 'rgba(124,58,237,0.10)', color: '#7C3AED' }}>
                    {l.tag}
                  </span>
                </div>
                <div className="mt-1 font-mono text-[10.5px] text-body-3">{l.lso}</div>
                <p className="mt-3 text-[13px] leading-relaxed text-body-2">{l.focus}</p>
                <div className="mt-4 flex items-center justify-between border-t border-line-divider pt-3">
                  <span className="font-mono text-[12px] font-bold" style={{ color: '#7C3AED' }}>{l.rate}</span>
                  <span className="font-mono text-[11px] text-body-3">{l.cases}</span>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-6 font-mono text-[11px] leading-relaxed text-body-3">
            免责声明 · Stayloop 是科技平台,不是律师事务所、不是 LTB、不是政府机构。AI 法律助手提供信息与流程协助,不构成法律意见。
          </p>
        </div>
      </section>

      <Footer />
    </div>
  )
}
