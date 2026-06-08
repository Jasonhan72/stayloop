'use client'

// V5.3 · Screening (handbook §06). Not one black-box number — 8 explainable
// dimensions, each showing what was checked, the score, and why.
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

const DIMS = [
  { k: 'ID', name: 'Identity · 身份核验', ev: '护照 · 活体 · 设备 · 32 dp', score: 99 },
  { k: '$', name: 'Income · 收入流水', ev: '工资单 · 银行 · T4 · 48 dp', score: 92 },
  { k: 'H', name: 'History · 租住历史', ev: '推荐信 · 反向核 · 52 dp', score: 96 },
  { k: 'F', name: 'Fraud · 文档反欺诈', ev: '字体 · PDF 编辑器 · 64 dp', score: 94 },
  { k: 'B', name: 'Behavior · 行为信号', ev: '完整度 · 一致性 · 26 dp', score: 88 },
  { k: 'X', name: 'X-Ref · 双征信', ev: 'Equifax + TransUnion · 76 dp', score: 90 },
  { k: '⚖', name: 'LTB / Court · 法庭裁定', ev: '14 trib · CanLII · OSB · 122 dp', score: 100 },
  { k: '⛓', name: 'Relations · 关联图谱', ev: '5 一度 · 14 二度 · 84 dp', score: 82 },
]

export default function ScreeningPage() {
  return (
    <div style={{ background: '#FAF7EE', color: '#171717' }}>
      <Header variant="transparent" />

      <section style={{ background: 'linear-gradient(180deg,#F2EEE5 0%,#E4EEE3 100%)' }}>
        <div className="mx-auto max-w-[1240px] px-5 py-20 sm:px-7 lg:px-12">
          <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-brand">SCREENING · 深度尽调</div>
          <h1 className="mt-4 max-w-[820px] text-[40px] font-extrabold leading-[1.08] tracking-tight sm:text-[52px]">
            不止给你一个数字,<br />而是给你完整的理由。
          </h1>
          <p className="mt-5 max-w-[660px] text-[17px] leading-relaxed text-body-2">
            普通信用查询只丢给你一个 675。Stayloop 把它拆成 <b className="text-body">8 个独立维度</b>,
            每一个都告诉你:我看了什么、得了多少分、为什么。AI 负责核查,你负责判断。
          </p>
        </div>
      </section>

      <section>
        <div className="mx-auto max-w-[1240px] px-5 py-16 sm:px-7 lg:px-12">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {DIMS.map((d) => (
              <div key={d.k} className="flex items-center gap-3 rounded-xl border border-line-divider bg-white p-4">
                <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-brand/10 font-mono text-[14px] font-bold text-brand">{d.k}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-bold leading-tight">{d.name}</div>
                  <div className="font-mono text-[10.5px] text-body-3">{d.ev}</div>
                </div>
                <span className="font-mono text-[20px] font-bold">{d.score}</span>
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-brand/30 bg-white p-7">
            <div>
              <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">STAYLOOP SCORE · 综合</div>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-[48px] font-extrabold tracking-tight text-brand">89</span>
                <span className="text-[15px] text-body-3">/ 100</span>
              </div>
            </div>
            <div className="text-right font-mono text-[12px] leading-relaxed text-body-2">
              <div className="font-bold text-success">PROCEED · 高置信度</div>
              <div>7 PASS · 1 INFO · 0 红旗</div>
              <div className="text-body-3">504/504 dp · 链上可审 0xa481…3c92</div>
            </div>
          </div>
        </div>
      </section>

      <section style={{ background: '#F2EEE5' }}>
        <div className="mx-auto max-w-[1240px] px-5 py-20 sm:px-7 lg:px-12">
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { h: '看得见来源', b: '每一分都能点开,看到它从哪条证据来。不是黑箱。' },
              { h: '合规 · 可审计', b: '符合本地法律 · 软查不影响信用 · 每次查询链上留痕。' },
              { h: 'AI 核查,你判断', b: 'AI 负责把证据拉齐、压成结论;最终录用与否,你拍板。' },
            ].map((g) => (
              <div key={g.h} className="sl-card p-6">
                <h4 className="text-[16px] font-bold">{g.h}</h4>
                <p className="mt-2 text-[13px] leading-relaxed text-body-2">{g.b}</p>
              </div>
            ))}
          </div>
          <div className="mt-10 text-center">
            <Link href="/landlord/applicants" className="sl-btn-primary !px-7 !py-[14px] !text-[15px]">开始筛选申请 →</Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
