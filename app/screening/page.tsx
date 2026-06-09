'use client'

// V5.3 · VOL 7 · Screening Hub — single-tenant deep screening entry point.
// Upload PDF / images / Word → one-click deep screening with 6+2 engines.
import { useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

const ENGINES = [
  { n: '①', name: 'Identity 身份核验', live: true },
  { n: '②', name: 'Income 收入流水', live: true },
  { n: '③', name: 'History 租住历史', live: true },
  { n: '④', name: 'Fraud 文档伪造检测', live: true },
  { n: '⑤', name: 'Behavior 行为信号', live: true },
  { n: '⑥', name: 'X-Ref Equifax 交叉', live: true },
  { n: '⑦', name: 'LTB / Court 记录', live: true, isNew: true },
  { n: '⑧', name: '关联人图谱', live: true, isNew: true },
]

const FILE_CHIPS = ['PDF 申请表', '工资单', '银行流水', '护照 / 驾照', '推荐信', '截图']

const USE_CASES = [
  { title: '独立房东', desc: '收到 Kijiji 申请 PDF · 不知真假 → 一键扫' },
  { title: '租赁经纪', desc: '代房东审申请 · 要给客户书面理由' },
  { title: '合租屋主', desc: '找室友前 · 看一份微信发来的资料' },
]

const RECENT_SCANS = [
  { name: 'Daniel T.', code: 'SC-2K8X', date: '5/22 09:14', status: 'CLEAN', color: '#047857' },
  { name: 'Kevin Z.', code: 'SC-8X21', date: '5/19 14:51', status: 'QUARANTINE', color: '#DC2626' },
  { name: 'R. Liu', code: 'SC-3K9P', date: '5/15 11:02', status: 'REVIEW', color: '#D97706' },
]

export default function ScreeningPage() {
  const router = useRouter()
  const [files, setFiles] = useState<File[]>([])
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const dropped = Array.from(e.dataTransfer.files)
    setFiles((prev) => [...prev, ...dropped].slice(0, 20))
  }, [])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return
    const selected = Array.from(e.target.files)
    setFiles((prev) => [...prev, ...selected].slice(0, 20))
  }, [])

  const removeFile = useCallback((idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx))
  }, [])

  return (
    <div style={{ background: '#FAF7EE', color: '#171717' }}>
      <Header variant="transparent" />

      {/* Hero */}
      <section className="text-center" style={{ background: 'linear-gradient(180deg,#F2EEE5 0%,#E4EEE3 100%)' }}>
        <div className="mx-auto max-w-[1240px] px-5 py-20 sm:px-7 lg:px-12">
          <div className="flex items-center justify-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: '#047857' }}>
            <span className="inline-block h-[6px] w-[6px] rounded-full" style={{ background: '#047857', boxShadow: '0 0 6px #047857' }} />
            SCREENING ENGINE · LIVE · 6+2 ENGINES
          </div>
          <h1 className="mx-auto mt-6 max-w-[700px] text-[36px] font-extrabold leading-[1.12] tracking-tight sm:text-[48px]">
            把申请表丢进来，<br />剩下的我替你查清楚。
          </h1>
          <p className="mx-auto mt-5 max-w-[680px] text-[16px] leading-relaxed text-body-2">
            收到一份 PDF 申请 · 一张工资单截图 · 一个微信联系表？上传任何材料，单人版深度尽调跑 6 个原始 Engine + LTB / 法庭检索 + 关联人图谱，<b className="text-body">3-5 分钟</b>出可下载 / 可分享报告。RTA / OHRC 合规 · 不输出 risk score · 仅摆证据。
          </p>
        </div>
      </section>

      {/* Upload + Engines panel */}
      <section>
        <div className="mx-auto max-w-[1240px] px-5 sm:px-7 lg:px-12" style={{ marginTop: -24 }}>
          <div className="rounded-2xl border border-line-divider bg-white p-7 shadow-sm sm:p-10">
            <div className="grid gap-10 lg:grid-cols-[1fr_280px]">
              {/* Left — upload zone */}
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: '#047857' }}>START</span>
                  <span className="font-mono text-[11px] text-body-3">·</span>
                  <span className="font-mono text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: '#047857' }}>上传</span>
                </div>
                <h2 className="mt-2 text-[22px] font-extrabold">把任何材料拖进来</h2>

                {/* Drop zone */}
                <div
                  className="mt-4 flex min-h-[180px] flex-col items-center justify-center rounded-xl border-2 border-dashed transition"
                  style={{
                    borderColor: dragOver ? '#047857' : '#D4D0C8',
                    background: dragOver ? '#F0FDF4' : '#FAFAF8',
                    cursor: 'pointer',
                  }}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => inputRef.current?.click()}
                >
                  <input
                    ref={inputRef}
                    type="file"
                    multiple
                    className="hidden"
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.heic,.tiff"
                    onChange={handleFileSelect}
                  />
                  <span className="text-[28px]" style={{ color: '#047857' }}>⬆</span>
                  <p className="mt-2 text-[14px] font-semibold text-body">把 PDF / 图片 / Word / 截图 拖到这</p>
                  <p className="mt-1 text-[12px] text-body-3">
                    或<span className="text-brand underline">点这里选文件</span> · 单次最多 20 个 · ≤ 100 MB / 个
                  </p>
                </div>

                {/* Selected files */}
                {files.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {files.map((f, i) => (
                      <span key={i} className="inline-flex items-center gap-1.5 rounded-lg border border-line-divider bg-surface-chip px-3 py-1.5 text-[12px]">
                        <span className="max-w-[140px] truncate">{f.name}</span>
                        <button onClick={(e) => { e.stopPropagation(); removeFile(i) }} className="text-body-3 hover:text-danger">×</button>
                      </span>
                    ))}
                  </div>
                )}

                {/* File type chips */}
                <div className="mt-4 flex flex-wrap gap-2">
                  {FILE_CHIPS.map((c) => (
                    <span key={c} className="rounded-md border border-line-divider px-3 py-1 text-[12px] font-medium text-body-2">{c}</span>
                  ))}
                </div>

                {/* Alternative input methods */}
                <div className="mt-4 flex flex-wrap gap-2">
                  <button className="inline-flex items-center gap-1.5 rounded-lg border border-line-divider bg-white px-4 py-2 text-[13px] text-body-2 transition hover:border-line-strong">
                    📋 粘贴文本
                  </button>
                  <button className="inline-flex items-center gap-1.5 rounded-lg border border-line-divider bg-white px-4 py-2 text-[13px] text-body-2 transition hover:border-line-strong">
                    🔗 粘贴链接 (Realtor / Kijiji 申请页)
                  </button>
                  <button className="inline-flex items-center gap-1.5 rounded-lg border border-line-divider bg-white px-4 py-2 text-[13px] text-body-2 transition hover:border-line-strong">
                    📧 转发邮件 → screen@stayloop.ai
                  </button>
                </div>
              </div>

              {/* Right — engine list + CTA */}
              <div>
                <div className="font-mono text-[11px] font-bold text-body-3">扫描包含</div>
                <ul className="mt-3 space-y-2.5">
                  {ENGINES.map((eng) => (
                    <li key={eng.n} className="flex items-center gap-2 text-[13.5px]">
                      <span className="font-mono text-body-3">{eng.n}</span>
                      <span className="font-medium text-body">{eng.name}</span>
                      {eng.isNew && <span className="rounded bg-brand/10 px-1.5 py-0.5 font-mono text-[9px] font-bold text-brand">新</span>}
                    </li>
                  ))}
                </ul>

                <button
                  className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-[15px] font-bold text-white transition hover:opacity-90 disabled:opacity-40"
                  style={{ background: '#047857' }}
                  disabled={files.length === 0}
                  onClick={() => router.push('/screening/new?step=parse')}
                >
                  ▶ 启动深度尽调
                </button>
                <p className="mt-2 text-center font-mono text-[11px] text-body-3">~3-5 分钟 · 单次 $19 / 房东会员免费</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Use Cases */}
      <section>
        <div className="mx-auto max-w-[1240px] px-5 py-16 sm:px-7 lg:px-12">
          <div className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-body-3">USE CASES · 谁在用</div>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            {USE_CASES.map((uc) => (
              <div key={uc.title} className="rounded-xl border border-line-divider bg-white p-5">
                <h4 className="text-[15px] font-bold">{uc.title}</h4>
                <p className="mt-1.5 text-[13px] leading-relaxed text-body-2">{uc.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Recent scans */}
      <section style={{ background: '#F2EEE5' }}>
        <div className="mx-auto max-w-[1240px] px-5 py-14 sm:px-7 lg:px-12">
          <div className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-body-3">最近扫描 · 你的</div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {RECENT_SCANS.map((s) => (
              <Link key={s.code} href={`/screening/${s.code.toLowerCase()}/done`} className="flex items-center gap-4 rounded-xl border border-line-divider bg-white px-5 py-4 transition hover:border-line-strong">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-chip text-[14px] font-bold text-body-2">
                  {s.name.charAt(0)}
                </div>
                <div className="flex-1">
                  <div className="text-[14px] font-bold">{s.name}</div>
                  <div className="font-mono text-[11px] text-body-3">{s.code} · {s.date}</div>
                </div>
                <span className="rounded-md px-2 py-0.5 font-mono text-[10px] font-bold" style={{ color: s.color, background: s.color + '10' }}>
                  {s.status}
                </span>
              </Link>
            ))}
          </div>
          <div className="mt-4">
            <Link href="/screening" className="font-mono text-[12px] text-body-2 underline hover:text-body">查看全部 · 23 次扫描</Link>
          </div>
        </div>
      </section>

      {/* Privacy */}
      <section>
        <div className="mx-auto max-w-[1240px] px-5 py-16 sm:px-7 lg:px-12">
          <div className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-body-3">PRIVACY · 你的红线</div>
          <div className="mt-5 grid gap-x-10 gap-y-3 sm:grid-cols-2">
            {[
              { ok: true, text: '上传文件 24h 内自动删除原档' },
              { ok: true, text: '仅扫描 / 不训练任何模型' },
              { ok: true, text: '报告归档 7 年（PIPEDA）· 可一键删' },
              { ok: true, text: '申请人有权要求查看 · 申诉' },
              { ok: false, text: '不查 OHRC 17 项受保护类别' },
              { ok: false, text: '不输出 risk / score · 仅摆证据' },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-2 text-[13.5px]">
                <span className={item.ok ? 'text-success' : 'text-danger'} style={{ fontWeight: 700 }}>{item.ok ? '✓' : '✕'}</span>
                <span className="text-body-2">{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
