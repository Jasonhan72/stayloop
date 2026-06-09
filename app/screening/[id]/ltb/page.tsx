'use client'

// V5.3 · VOL 7 · Artboard 66 — Court / LTB Records detail page.
// Route: /screening/[id]/ltb
// Deep search across 14 Ontario tribunals, CanLII, OSB, civil courts.

import { useParams } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

/* ── Data ────────────────────────────────────────────────────────── */

const STATS = [
  { label: '主体·Mia', value: '0', note: 'CLEAN', color: '#047857' },
  { label: '关联人', value: '1', note: 'M.GOLDBERG·信息项', color: '#D97706' },
  { label: '已查记录库', value: '8', note: '', color: '#171717' },
  { label: '耗时', value: '0:42', note: '', color: '#171717' },
]

const MIA_DBS = [
  { code: 'LTB', full: 'Landlord & Tenant Board', desc: '所有 Ontario LTB 文件 2006–present', hits: 0 },
  { code: 'CANLII', full: 'CanLII 全文检索', desc: '加拿大法律信息学会 · 联邦 + 安省判例', hits: 0 },
  { code: 'OSB', full: 'Office of the Superintendent of Bankruptcy', desc: '联邦破产公告 · 消费者提案', hits: 0 },
  { code: 'SCC', full: 'Small Claims Court', desc: '安省小额法院 · $35 000 以下民事', hits: 0 },
  { code: 'LIEN', full: 'Construction Lien Registry', desc: '安省建筑留置权登记', hits: 0 },
  { code: 'PPSA', full: 'Personal Property Security', desc: '动产担保登记 · 车辆 / 设备', hits: 0 },
  { code: 'CRA', full: 'CRA Tax Lien (public)', desc: '联邦税务留置 · 公开记录', hits: 0 },
  { code: 'SEX OFF', full: 'National Sex Offender Registry', desc: '仅公开可查部分 · 全国', hits: 0 },
]

const OTHER_ASSOCIATES = [
  { name: 'Lisa M. Chen', relation: '母亲 · 担保人', hits: 0 },
  { name: 'Aaron Chen', relation: '兄 · 紧急联系人', hits: 0 },
  { name: 'A. Nguyen', relation: '推荐人 · 前同事', hits: 0 },
  { name: 'Shopify Inc', relation: '雇主', hits: 0 },
]

const DATA_SOURCES = [
  { code: 'LTB', name: 'Landlord & Tenant Board', desc: '所有 Ontario LTB 申请 / 裁定 · 2006–present' },
  { code: 'CANLII', name: 'CanLII', desc: '加拿大法律信息学会全文判例库 · 联邦 + 各省' },
  { code: 'OSB', name: 'Office of the Superintendent of Bankruptcy', desc: '破产与消费者提案公告 · 联邦' },
  { code: 'SCC', name: 'Ontario Small Claims Court', desc: '安省小额法院民事诉讼 · $35,000 以下' },
  { code: 'LIEN', name: 'Construction Lien Registry', desc: '安省建筑留置权公开登记' },
  { code: 'PPSA', name: 'Personal Property Security Act', desc: '安省动产担保登记 · 车辆 / 设备' },
  { code: 'CRA', name: 'Canada Revenue Agency', desc: '联邦税务留置 · 仅公开可查部分' },
  { code: 'SEX OFF', name: 'National Sex Offender Registry', desc: '全国性犯罪者登记 · 仅公开可查部分' },
]

const REDLINES = [
  '不查 Race / 种族 · OHRC s.2(1)',
  '不查 Religion / 宗教信仰',
  '不查 Disability / 残障状态',
  '不查 Family status / 家庭状态 (有无子女)',
  '不查 Receipt of public assistance / 是否领社会救助',
  '不查 Immigration status / 移民身份 · 超出法定范围',
]

/* ── Component ───────────────────────────────────────────────────── */

export default function LTBPage() {
  const { id } = useParams<{ id: string }>()

  return (
    <div style={{ background: '#FAF7EE', color: '#171717', minHeight: '100vh' }}>
      <Header variant="transparent" />

      {/* Hero */}
      <section style={{ background: 'linear-gradient(180deg,#F2EEE5 0%,#E8E4DC 100%)' }}>
        <div className="mx-auto max-w-[1240px] px-5 py-16 sm:px-7 lg:px-12">
          <Link
            href={`/screening/${id}`}
            className="font-mono text-[12px] text-body-3 hover:text-body"
          >
            ← 返回 Screening Report
          </Link>

          <div className="mt-5 flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: '#047857' }}>
            <span className="inline-block h-[6px] w-[6px] rounded-full" style={{ background: '#047857', boxShadow: '0 0 6px #047857' }} />
            LTB / COURT ENGINE
          </div>

          <h1 className="mt-4 text-[28px] font-extrabold leading-tight tracking-tight sm:text-[36px]">
            Mia Chen + 5 关联人 · 法庭与 LTB 全检索
          </h1>
          <p className="mt-3 max-w-[800px] text-[14px] leading-relaxed text-body-2">
            14 TRIBUNALS ONTARIO · CANLII · OSB · 安省民事法院 · 122 数据点 · audit ✓
          </p>

          {/* Stats row */}
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {STATS.map((s) => (
              <div key={s.label} className="rounded-xl border border-line-divider bg-white px-4 py-3.5">
                <div className="font-mono text-[11px] font-bold uppercase tracking-wide text-body-3">{s.label}</div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="font-mono text-[28px] font-extrabold leading-none" style={{ color: s.color }}>{s.value}</span>
                  {s.note && (
                    <span
                      className="rounded-md px-2 py-0.5 font-mono text-[10px] font-bold uppercase"
                      style={{ color: s.color, background: s.color + '14' }}
                    >
                      {s.note}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Main content */}
      <section>
        <div className="mx-auto max-w-[1240px] px-5 py-10 sm:px-7 lg:px-12 space-y-8">

          {/* ── Mia Chen — CLEAN ─────────────────────────────────── */}
          <div className="rounded-2xl border border-line-divider bg-white p-6 sm:p-8">
            <div className="flex items-center gap-3">
              <span
                className="flex h-10 w-10 items-center justify-center rounded-full text-[15px] font-bold text-white"
                style={{ background: 'linear-gradient(135deg,#C4B5FD,#7C3AED)' }}
              >
                M
              </span>
              <div>
                <h2 className="text-[20px] font-extrabold tracking-tight">Mia Chen · 主体</h2>
                <div className="font-mono text-[11px] text-body-3">申请人 · 全部 CLEAN</div>
              </div>
              <span
                className="ml-auto rounded-lg px-3 py-1 font-mono text-[11px] font-bold uppercase"
                style={{ color: '#047857', background: '#04785714' }}
              >
                0 HITS · CLEAN
              </span>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {MIA_DBS.map((db) => (
                <div key={db.code} className="rounded-xl border border-line-divider bg-[#FAFAF8] p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[12px] font-bold" style={{ color: '#047857' }}>{db.code}</span>
                    <span className="font-mono text-[11px] font-bold" style={{ color: '#047857' }}>✓</span>
                  </div>
                  <div className="mt-1 text-[12px] font-medium text-body">{db.full}</div>
                  <div className="mt-1 text-[11px] leading-snug text-body-3">{db.desc}</div>
                  <div className="mt-2 font-mono text-[20px] font-extrabold" style={{ color: '#047857' }}>0</div>
                </div>
              ))}
            </div>
          </div>

          {/* ── M. Goldberg — 1 LTB 历史 ─────────────────────────── */}
          <div className="rounded-2xl border border-line-divider bg-white p-6 sm:p-8">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-[15px] font-bold text-amber-700">
                G
              </span>
              <div>
                <h2 className="text-[20px] font-extrabold tracking-tight">M. Goldberg · 关联人</h2>
                <div className="font-mono text-[11px] text-body-3">推荐人 · 前房东 · 1 项 LTB 历史</div>
              </div>
              <span
                className="ml-auto rounded-lg px-3 py-1 font-mono text-[11px] font-bold uppercase"
                style={{ color: '#D97706', background: '#D9770614' }}
              >
                1 HIT · INFO
              </span>
            </div>

            <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50/50 p-5 sm:p-6">
              <div className="flex flex-wrap items-start gap-x-6 gap-y-2">
                <div>
                  <div className="font-mono text-[10px] font-bold uppercase text-body-3">CASE</div>
                  <div className="mt-0.5 font-mono text-[14px] font-bold text-body">TSL-12849-19</div>
                </div>
                <div>
                  <div className="font-mono text-[10px] font-bold uppercase text-body-3">DATE</div>
                  <div className="mt-0.5 font-mono text-[14px] font-bold text-body">2019/08</div>
                </div>
                <div>
                  <div className="font-mono text-[10px] font-bold uppercase text-body-3">LOCATION</div>
                  <div className="mt-0.5 font-mono text-[14px] font-bold text-body">Liberty Village</div>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <div>
                  <div className="font-mono text-[10px] font-bold uppercase text-body-3">TYPE</div>
                  <div className="mt-0.5 text-[13.5px] text-body">
                    L1 · 房东申请因不付租驱逐租客（不是 Mia）
                  </div>
                </div>
                <div>
                  <div className="font-mono text-[10px] font-bold uppercase text-body-3">RESULT</div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span className="rounded-md px-2 py-0.5 font-mono text-[10px] font-bold uppercase" style={{ color: '#047857', background: '#04785714' }}>
                      SETTLED
                    </span>
                    <span className="text-[13.5px] text-body">双方和解</span>
                  </div>
                </div>
                <div>
                  <div className="font-mono text-[10px] font-bold uppercase text-body-3">IMPACT ON MIA</div>
                  <div className="mt-0.5 text-[13.5px] font-semibold" style={{ color: '#047857' }}>
                    无 — Mia 并非该案当事人，此案发生于 Mia 入住之前
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-lg border border-line-divider bg-white p-4">
                <div className="font-mono text-[10px] font-bold uppercase text-body-3">RECOMMENDATION CREDIBILITY NOTE</div>
                <p className="mt-1.5 text-[13px] leading-relaxed text-body-2">
                  Goldberg 作为 Mia 的前房东为其出具推荐信。该 LTB 记录为其与另一租客的纠纷，以和解结案，与 Mia 无关。推荐信可信度不受影响，但建议结合其他推荐人交叉验证。
                </p>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <a
                  href="#"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line-divider bg-white px-4 py-2 text-[12px] font-medium text-body-2 hover:border-line-strong"
                >
                  查看裁定 PDF · CanLII →
                </a>
                <a
                  href="#"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line-divider bg-white px-4 py-2 text-[12px] font-medium text-body-2 hover:border-line-strong"
                >
                  查看完整档案 →
                </a>
              </div>
            </div>
          </div>

          {/* ── Other Associates — CLEAN ──────────────────────────── */}
          <div className="rounded-2xl border border-line-divider bg-white p-6 sm:p-8">
            <h2 className="text-[18px] font-extrabold tracking-tight">其他关联人 · 全部 CLEAN</h2>
            <div className="mt-1 font-mono text-[11px] text-body-3">4 人 · 全部 0 hits · 8 databases each</div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {OTHER_ASSOCIATES.map((a) => (
                <div key={a.name} className="flex items-center gap-4 rounded-xl border border-line-divider bg-[#FAFAF8] px-5 py-4">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-chip text-[13px] font-bold text-body-2">
                    {a.name.charAt(0)}
                  </span>
                  <div className="flex-1">
                    <div className="text-[14px] font-bold">{a.name}</div>
                    <div className="font-mono text-[11px] text-body-3">{a.relation}</div>
                  </div>
                  <span
                    className="rounded-md px-2 py-0.5 font-mono text-[10px] font-bold"
                    style={{ color: '#047857', background: '#04785714' }}
                  >
                    0 HITS
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Data Sources ─────────────────────────────────────── */}
          <div className="rounded-2xl border border-line-divider bg-white p-6 sm:p-8">
            <h2 className="text-[18px] font-extrabold tracking-tight">数据来源 · 8 Databases</h2>
            <div className="mt-1 font-mono text-[11px] text-body-3">全部已查 · 覆盖联邦 + 安省</div>

            <div className="mt-5 space-y-3">
              {DATA_SOURCES.map((ds) => (
                <div key={ds.code} className="flex items-start gap-3 rounded-lg border border-line-divider bg-[#FAFAF8] px-4 py-3">
                  <span className="mt-0.5 rounded bg-surface-chip px-2 py-0.5 font-mono text-[10px] font-bold text-body-2">
                    {ds.code}
                  </span>
                  <div className="flex-1">
                    <div className="text-[13.5px] font-semibold text-body">{ds.name}</div>
                    <div className="text-[12px] text-body-3">{ds.desc}</div>
                  </div>
                  <span className="font-mono text-[11px] font-bold" style={{ color: '#047857' }}>✓</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── RTA · OHRC 红线 ──────────────────────────────────── */}
          <div className="rounded-2xl border border-red-200 bg-white p-6 sm:p-8">
            <div className="flex items-center gap-2">
              <span className="text-[16px]">🛑</span>
              <h2 className="text-[18px] font-extrabold tracking-tight">RTA · OHRC 红线</h2>
            </div>
            <p className="mt-2 text-[13px] text-body-2">
              依据 Ontario Human Rights Code s.2(1) 及 Residential Tenancies Act, 以下类别不在本引擎检索范围内:
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {REDLINES.map((r, i) => (
                <div key={i} className="flex items-start gap-2 text-[13px]">
                  <span className="font-bold text-red-500">✕</span>
                  <span className="text-body-2">{r}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </section>

      <Footer />
    </div>
  )
}
