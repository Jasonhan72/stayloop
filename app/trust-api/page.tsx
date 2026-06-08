'use client'

// V5.3 · Trust API (handbook §08). Verify once, reuse everywhere — the
// portable trust layer banks / insurers / government can call.
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

const TIERS = [
  { t: 'Tier 1', name: '身份', fields: '姓名 · 政府 ID · 活体', dp: '32 dp' },
  { t: 'Tier 2', name: '收入', fields: '工资单 · 银行 · T4', dp: '48 dp' },
  { t: 'Tier 3', name: '银行透明', fields: '现金流 · DTI · 储蓄', dp: '76 dp' },
  { t: 'Tier 4', name: '信用 + 法庭', fields: '双征信 · LTB 裁定', dp: '122 dp' },
]

const USERS = [
  { k: '银行 · 按揭', b: '租客按揭预审 · 收入 / DTI 即时验证,免去重复尽调。' },
  { k: '保险', b: '租客保险定价 · 按已验证 Tier 自动定档。' },
  { k: '政府 / 物业', b: '入住资格核验 · 出示「已验证 + 范围」,不暴露原始材料。' },
  { k: '法务', b: '纠纷与背调 · 链上可审的证据链,每次调用留痕。' },
]

export default function TrustApiPage() {
  return (
    <div style={{ background: '#FAF7EE', color: '#171717' }}>
      <Header variant="transparent" />

      {/* HERO (dark) */}
      <section style={{ background: 'linear-gradient(135deg,#0B0B0E 0%,#065F46 100%)' }}>
        <div className="mx-auto max-w-[1240px] px-5 py-24 text-white sm:px-7 lg:px-12">
          <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-emerald-200">
            TRUST API · L1 · INFRA
          </div>
          <h1 className="mt-4 max-w-[820px] text-[40px] font-extrabold leading-[1.08] tracking-tight sm:text-[52px]">
            把已验证的信任,<br />嵌进你的流程。
          </h1>
          <p className="mt-5 max-w-[620px] text-[17px] leading-relaxed text-emerald-50/90">
            租客在 Stayloop 验证一次,银行、保险、政府就能直接复用 ——
            你拿到的是<b className="text-white">核验过的结论 + 授权范围</b>,不是一叠可能 P 过的 PDF。每次调用都链上留痕。
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/contact" className="inline-flex items-center justify-center rounded-[10px] bg-white px-6 py-[13px] text-[15px] font-semibold text-ink">
              预约洽谈 →
            </Link>
            <span className="inline-flex items-center font-mono text-[12px] text-emerald-200">签约前免费沙箱</span>
          </div>
        </div>
      </section>

      {/* TIERS */}
      <section>
        <div className="mx-auto max-w-[1240px] px-5 py-20 sm:px-7 lg:px-12">
          <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-brand">分级 · 逐级解锁</div>
          <h2 className="mt-3 text-[30px] font-extrabold tracking-tight sm:text-[36px]">验证 1–4 级,逐级解锁可分享字段。</h2>
          <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {TIERS.map((t, i) => (
              <div key={t.t} className="sl-card p-6" style={{ borderTop: '3px solid #047857' }}>
                <div className="font-mono text-[11px] font-bold text-brand">{t.t}</div>
                <h4 className="mt-1 text-[17px] font-bold">{t.name}</h4>
                <p className="mt-2 text-[12.5px] leading-relaxed text-body-2">{t.fields}</p>
                <div className="mt-3 font-mono text-[10.5px] text-body-3">{t.dp} 证据点</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WHO */}
      <section style={{ background: '#F2EEE5' }}>
        <div className="mx-auto max-w-[1240px] px-5 py-20 sm:px-7 lg:px-12">
          <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-brand">谁在用</div>
          <h2 className="mt-3 text-[30px] font-extrabold tracking-tight sm:text-[36px]">一次验证,处处复用。</h2>
          <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {USERS.map((u) => (
              <div key={u.k} className="sl-card p-6">
                <h4 className="text-[15px] font-bold">{u.k}</h4>
                <p className="mt-2 text-[13px] leading-relaxed text-body-2">{u.b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* GUARANTEES */}
      <section>
        <div className="mx-auto max-w-[1240px] px-5 py-20 sm:px-7 lg:px-12">
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { h: '不暴露原始证件', b: '只返回「已验证 + 范围」,原始证件与完整流水永不外传。' },
              { h: '每次调用留痕', b: '链上可审计的调用记录,符合 PIPEDA 与本地合规。' },
              { h: '按调用量计费', b: '签约前免费沙箱,上线后按调用计费 · OAuth + SSO · SLA 99.9%。' },
            ].map((g) => (
              <div key={g.h} className="sl-card p-6">
                <h4 className="text-[16px] font-bold">{g.h}</h4>
                <p className="mt-2 text-[13px] leading-relaxed text-body-2">{g.b}</p>
              </div>
            ))}
          </div>
          <div className="mt-10 text-center">
            <Link href="/contact" className="sl-btn-primary dark !px-7 !py-[14px] !text-[15px]">预约洽谈 →</Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
