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
    parties: 'Mia (租客) ⇄ Sarah (房东) · 退租基线对比中 · 房东主张扣 $480 清洁费',
    statusLabel: '等你回',
    color: '#DC2626',
    day: 'DAY 3 / 14',
    urgent: true,
  },
  {
    id: 'DSP-3M9P',
    title: '维修延迟 · DSP-3M9P',
    parties: 'R. Liu (租客) ⇄ 房东 · 暖气故障 9 天未修 · 援引 RTA s.20 维护义务',
    statusLabel: '证据收集',
    color: '#B45309',
    day: 'DAY 5 / 14',
  },
  {
    id: 'DSP-7K2L',
    title: '租金涨幅争议 · DSP-7K2L',
    parties: 'D. Tay (租客) ⇄ 房东 · 涨幅 4.8% 超过 2026 安省指引 2.5% · 等仲裁员合议',
    statusLabel: '合议中',
    color: '#7C3AED',
    day: 'DAY 4 / 14',
  },
  {
    id: 'DSP-1J5N',
    title: '骚扰投诉 · DSP-1J5N',
    parties: '租客 ⇄ 房东 · 多次未约入屋 · RTA s.26 隐私权 · 调解阶段',
    statusLabel: '调解中',
    color: '#2563EB',
    day: 'DAY 2 / 14',
  },
]

const CLOSED = [
  { id: 'DSP-9X1A', kind: '退租 / 押金', outcome: '押金原额返还 + $120 利息', how: '和解', days: '5.2 天' },
  { id: 'DSP-7P3K', kind: '装修工损坏', outcome: 'Stripe 自动扣 $340', how: '和解', days: '2.1 天' },
  { id: 'DSP-5M8B', kind: '违法涨租', outcome: '退还 $186 + 未来 12 月按 2.5%', how: '仲裁裁定', days: '8.7 天' },
  { id: 'DSP-3R6Q', kind: '提前驱逐', outcome: '房东撤销 + 赔 1 月房租', how: '升级 LTB', days: '14 天' },
  { id: 'DSP-1V4W', kind: '水患损失', outcome: '保险走 + 临时安置', how: '和解', days: '3.4 天' },
]

const STAGES = [
  { k: 'STAGE 1', range: '0-3 天', title: '调解', desc: 'Logic 出中立摘要 · 双方在线沟通 · 80% 案件这里和解', s: 'now' },
  { k: 'STAGE 2', range: '3-7 天', title: '仲裁员合议', desc: '3 名独立仲裁员 · RTA / 案例库 · 出非约束建议', s: 'next' },
  { k: 'STAGE 3', range: '7-14 天', title: '升级 LTB', desc: 'Stayloop 把所有证据自动 prefill 到 LTB 表格', s: 'next' },
]

const RTA_NOTES = [
  '✓ Stayloop 仲裁是非约束的',
  '✓ 你随时可直接走 LTB',
  '✓ 援引条款都可被独立验证',
  '✓ 仲裁员独立 · 非 Stayloop 员工',
  '✕ 我们不替你做最终决定',
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
    initials: 'JL',
    name: 'Jennifer Lee',
    match: 96,
    lso: 'P1 PARALEGAL · LSO #P12389 · 8 年 · 中 / EN',
    rate: '$180/h',
    ratePkg: '$300 听证打包价',
    tags: ['押金 / T1 · 142 件', '维修 / T6', 'Legal Aid ✓', '7 天内可约'],
    focus: '专门做小额押金返还 · 多伦多 South 区出庭过 142 次 · 平均替租客拿回 87% 索赔额。中文流利。',
    rating: '★ 4.92 · 318 评',
    winRate: '胜率 89%',
    response: '响应 2h',
    lang: 'EN + 中文',
    video: '📞 30 min 视频 · $90',
  },
  {
    initials: 'DC',
    name: 'David Chen, J.D.',
    match: 91,
    lso: 'LAWYER · LSO #L88421 · 12 年 · EN / 粤',
    rate: '$420/h',
    ratePkg: '第一次 30min 免费',
    tags: ['RTA 全谱', '驱逐复议', '复杂案', '不接 Legal Aid'],
    focus: '前 LTB 仲裁员 · Bay Street 出身 · 复杂案 + 上诉。简单押金案我会建议你找 paralegal 更经济。',
    rating: '★ 4.85 · 84 评',
    winRate: '胜率 94%',
    response: '响应 4h',
    lang: 'EN + 粤',
    video: '📞 30 min 视频 · 免费',
  },
  {
    initials: 'SP',
    name: 'Sanjay Patel',
    match: 88,
    lso: 'P1 PARALEGAL · LSO #P22186 · 5 年 · EN / 印',
    rate: '$120/h',
    ratePkg: 'flat $250 case',
    tags: ['租客权益', 'Legal Aid ✓', '明天可约'],
    focus: '专做租客方 · 接受 Legal Aid 证书 · 服务 Scarborough / North York 大量南亚社区。',
    rating: '★ 4.78 · 156 评',
    winRate: '胜率 82%',
    response: '响应 1h',
    lang: 'EN + Hindi',
    video: '📞 30 min 视频 · $60',
  },
  {
    initials: 'CT',
    name: 'Catherine Tremblay',
    match: 84,
    lso: 'P1 PARALEGAL · LSO #P09812 · 14 年 · EN / FR',
    rate: '$220/h',
    ratePkg: '分期可',
    tags: ['押金 / 维修', '骚扰', 'FR available'],
    focus: '前 ACTO（多伦多租客社区中心）律师 · 强组织能力 · 复杂案件偏好。可分期付款。',
    rating: '★ 4.91 · 198 评',
    winRate: '胜率 91%',
    response: '响应 3h',
    lang: 'EN + FR',
    video: '📞 30 min 视频 · $110',
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
          <h1 className="mt-4 max-w-[820px] text-[28px] font-extrabold leading-[1.1] tracking-tight sm:text-[44px] lg:text-[48px]">
            出了纠纷,<br />也有 AI 陪你走完流程。
          </h1>
          <p className="mt-5 max-w-[640px] text-[16px] leading-relaxed text-body-2">
            Stayloop 内部 dispute resolution 是非约束性的 · 双方任何阶段均可终止并直接诉诸 LTB / 法院 ·
            仲裁员独立中立 · 每一步留痕可查。
          </p>
          {/* Quick stats */}
          <div className="mt-8 flex flex-wrap gap-8">
            {[
              { v: '4', l: '进行中' },
              { v: '12', l: '本月已结' },
              { v: '6.4d', l: '中位耗时' },
              { v: '82%', l: '和解率' },
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
                className={'flex flex-wrap items-center gap-3 px-5 py-5 sm:gap-4 sm:px-6 ' + (i > 0 ? 'border-t border-line-divider' : '')}
              >
                <span
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white"
                  style={{ background: c.color }}
                >
                  {c.id.slice(-2)}
                </span>
                <div className="min-w-[180px] flex-1">
                  <div className="text-[14px] font-bold">{c.title}</div>
                  <div className="mt-0.5 text-[12.5px] text-body-2">{c.parties}</div>
                </div>
                <span className="hidden flex-shrink-0 font-mono text-[10.5px] uppercase tracking-eyebrow text-body-3 sm:block">
                  {c.day}
                </span>
                <span
                  className="flex flex-shrink-0 items-center gap-1.5 rounded-md px-2 py-[4px] font-mono text-[10px] font-bold uppercase tracking-wider"
                  style={{ background: c.color + '18', color: c.color }}
                >
                  {c.urgent && <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: c.color }} />}
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
                <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">当前案件 · DSP-2K8X · DAY 3 / 14</div>
                <span className="flex items-center gap-1.5 rounded-md px-2 py-[3px] font-mono text-[10px] font-bold" style={{ background: 'rgba(220,38,38,0.10)', color: '#DC2626' }}>
                  <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#DC2626]" />等你回
                </span>
              </div>
              <h3 className="mt-2 text-[18px] font-bold">Mia (租客) ⇄ Sarah (房东) · 退租基线对比中</h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-body-2">
                房东主张扣 $480 清洁费。Logic 已比对入住 / 退租状态照与安省 RTA,出中立摘要;
                双方在线沟通中 —— 80% 同类案件在调解阶段就和解。
              </p>
              <div className="mt-5 font-mono text-[10px] font-bold uppercase tracking-eyebrowLg text-body-3">三阶递进</div>
              <div className="mt-3 space-y-2">
                {STAGES.map((s) => (
                  <div
                    key={s.k}
                    className={'rounded-xl border px-4 py-3 ' +
                      (s.s === 'now' ? 'border-[rgba(124,58,237,0.40)] bg-[rgba(124,58,237,0.06)]' : 'border-line-divider bg-white')}
                  >
                    <div className="flex items-baseline gap-2">
                      <span className={'font-mono text-[11px] font-bold ' + (s.s === 'now' ? 'text-[#7C3AED]' : 'text-body-3')}>{s.k}</span>
                      <span className="font-mono text-[10px] text-body-3">{s.range}</span>
                      <span className="text-[13.5px] font-bold">{s.title}</span>
                    </div>
                    <div className="mt-1 text-[12.5px] leading-relaxed text-body-2">{s.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* AI legal assistant */}
            <div className="sl-card p-6">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: 'radial-gradient(circle at 35% 35%, #C4B5FD, #7C3AED 70%)' }} />
                <div>
                  <div className="text-[14px] font-bold">Logic-Legal · 专业模型</div>
                  <div className="font-mono text-[10.5px] text-body-3">引用 RTA / O.Reg / 1.4M CanLII 案例 · 不构成法律意见</div>
                </div>
              </div>
              <div className="mt-3 rounded-md px-3 py-2 font-mono text-[10.5px] font-bold" style={{ background: 'rgba(220,38,38,0.06)', color: '#DC2626' }}>
                ⚠ AI-GENERATED CONTENT · NOT LEGAL ADVICE
              </div>
              <div className="mt-3 rounded-xl rounded-tl-sm bg-surface-chip p-3 text-[13px] leading-relaxed text-body-2">
                清洁费扣减须有合理依据并提供凭证(RTA s.105 / 109)。我已比对你的退租状态照,
                并准备好 <b className="text-body">T1(押金返还申请)</b> 草稿;若调解 7 天内无果,可一键升级 LTB。
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

            <div className="mt-6 sl-card p-6">
              <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">RTA · 仲裁不替代</div>
              <ul className="mt-3 space-y-2 text-[12.5px] leading-relaxed text-body-2">
                {RTA_NOTES.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Closed cases */}
      <section>
        <div className="mx-auto max-w-[1240px] px-5 pb-4 sm:px-7 lg:px-12">
          <div className="sl-card overflow-hidden">
            <div className="border-b border-line-divider px-6 py-4 font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
              已结案 · 最近 5
            </div>
            {CLOSED.map((c, i) => (
              <div
                key={c.id}
                className={'grid grid-cols-[auto_1fr_auto] items-center gap-3 px-5 py-3.5 sm:grid-cols-[auto_0.7fr_1.3fr_auto_auto] sm:gap-4 sm:px-6 ' + (i > 0 ? 'border-t border-line-divider' : '')}
              >
                <span className="font-mono text-[11.5px] font-bold text-body-3">{c.id}</span>
                <span className="text-[12.5px] font-semibold">{c.kind}</span>
                <span className="hidden text-[12.5px] text-body-2 sm:block">{c.outcome}</span>
                <span className="rounded-md bg-success/10 px-2 py-[3px] font-mono text-[10px] font-bold text-success">{c.how}</span>
                <span className="font-mono text-[11px] text-body-3">{c.days}</span>
              </div>
            ))}
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
          <p className="mt-2 font-mono text-[11px] uppercase tracking-eyebrow text-body-3">
            RANKED BY CASE FIT · LSO LICENSED · NO COMMISSION · YOU PAY THEM DIRECTLY
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {LAWYERS.map((l) => (
              <div key={l.name} className="sl-card p-6">
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full font-mono text-[13px] font-bold text-white" style={{ background: '#7C3AED' }}>
                    {l.initials}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[16px] font-bold">{l.name}</span>
                      <span className="rounded-md px-2 py-[2px] font-mono text-[9.5px] font-bold" style={{ background: 'rgba(124,58,237,0.10)', color: '#7C3AED' }}>
                        ★ MATCH {l.match}%
                      </span>
                    </div>
                    <div className="mt-1 font-mono text-[10.5px] text-body-3">{l.lso}</div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {l.tags.map((t) => (
                    <span key={t} className="rounded-md bg-surface-chip px-2 py-[3px] font-mono text-[10px] font-semibold text-body-2">{t}</span>
                  ))}
                </div>
                <p className="mt-3 text-[13px] leading-relaxed text-body-2">「{l.focus}」</p>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10.5px] text-body-3">
                  <span className="font-bold text-body">{l.rating}</span>
                  <span>{l.winRate}</span>
                  <span>{l.response}</span>
                  <span>语言 {l.lang}</span>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line-divider pt-3">
                  <div>
                    <span className="font-mono text-[13px] font-bold" style={{ color: '#7C3AED' }}>{l.rate}</span>
                    <span className="ml-2 font-mono text-[10.5px] text-body-3">{l.ratePkg}</span>
                  </div>
                  <button className="rounded-lg px-3 py-[7px] text-[11.5px] font-semibold text-white" style={{ background: '#7C3AED' }}>{l.video}</button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 sl-card p-5">
            <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg" style={{ color: '#7C3AED' }}>
              STAYLOOP 不抽佣 · 透明披露
            </div>
            <p className="mt-2 text-[12.5px] leading-relaxed text-body-2">
              所有律师由 Law Society of Ontario 持牌 · Stayloop 不收任何介绍费 · 你直接付律师 ·
              评价系统由验证客户匿名打分 · 律师可申诉但不能删评。
            </p>
          </div>
          <p className="mt-4 font-mono text-[11px] leading-relaxed text-body-3">
            ⚠ 免责声明 · Stayloop 仅维护 LSO 牌照真实性,不背书任何律师,不对其专业意见或服务质量负责。
            匹配度 (% MATCH) 是基于案件类型 + 经验 + 评价的算法参考,不是质量背书。Logic-Legal 不能替代真人律师。
          </p>
        </div>
      </section>

      <Footer />
    </div>
  )
}
