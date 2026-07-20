'use client'

// Stayloop back-office · AI model slot configuration.
// Reads/writes public.app_config (key='models') with the browser Supabase
// client — RLS ("Admins read/insert/update app_config") already restricts
// access to is_stayloop_admin(), so this page is a convenience surface, not
// the enforcement layer. Values are validated against ALLOWED_MODELS before
// write; edge isolates pick changes up within the 60s modelConfig cache TTL.
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { useAdmin } from '@/lib/useAdmin'
import { useT } from '@/lib/i18n'
import {
  ALLOWED_MODELS,
  DEFAULT_MODELS,
  MODEL_SLOTS,
  type ModelSlot,
} from '@/lib/modelConfig'

const SLOT_META: Record<ModelSlot, { zh: string; en: string; descZh: string; descEn: string }> = {
  turn: {
    zh: '对话推理',
    en: 'Agent reasoning',
    descZh: 'Luna / Logic / Brief 的每轮 Agent 对话（/api/agent/turn）',
    descEn: 'Every Luna / Logic / Brief agent turn (/api/agent/turn)',
  },
  screening: {
    zh: '背调评分',
    en: 'Screening score',
    descZh: '六维评分与旧版评分（/api/screen-score · /api/ai-score）',
    descEn: 'Six-dimension scoring + legacy scoring (/api/screen-score, /api/ai-score)',
  },
  classify: {
    zh: '材料分类',
    en: 'File classification',
    descZh: '上传材料分类与租金抽取（/api/classify-files）',
    descEn: 'Upload classification + rent extraction (/api/classify-files)',
  },
  forensics: {
    zh: '取证抽取',
    en: 'Forensics extraction',
    descZh: '工资单数学核验 / 图片 OCR / 信用报告真伪判别（lib/forensics）',
    descEn: 'Paystub math, image OCR, credit-report judge (lib/forensics)',
  },
}

const ALLOWED_IDS = new Set(ALLOWED_MODELS.map((m) => m.id))

export default function AdminModelsPage() {
  const { lang } = useT()
  const zh = lang === 'zh'
  const auth = useAuth()
  const { loading, role } = useAdmin()
  const [values, setValues] = useState<Record<ModelSlot, string>>({ ...DEFAULT_MODELS })
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [rowLoading, setRowLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    setRowLoading(true)
    const { data } = await supabase
      .from('app_config')
      .select('value, updated_at')
      .eq('key', 'models')
      .maybeSingle()
    const next = { ...DEFAULT_MODELS }
    const raw = (data?.value ?? {}) as Record<string, unknown>
    for (const slot of MODEL_SLOTS) {
      const v = raw[slot]
      if (typeof v === 'string' && ALLOWED_IDS.has(v)) next[slot] = v
    }
    setValues(next)
    setUpdatedAt(data?.updated_at ?? null)
    setDirty(false)
    setRowLoading(false)
  }, [])

  useEffect(() => {
    if (role) load()
  }, [role, load])

  const save = async () => {
    // Whitelist validation before write (mirrors the server-side sanitize).
    for (const slot of MODEL_SLOTS) {
      if (!ALLOWED_IDS.has(values[slot])) {
        setMsg({ ok: false, text: zh ? `无效的模型：${values[slot]}` : `Invalid model: ${values[slot]}` })
        return
      }
    }
    setBusy(true)
    setMsg(null)
    const { error } = await supabase
      .from('app_config')
      .upsert(
        {
          key: 'models',
          value: values,
          updated_at: new Date().toISOString(),
          updated_by: auth.user?.id ?? null,
        },
        { onConflict: 'key' },
      )
    if (error) {
      setMsg({ ok: false, text: error.message || (zh ? '保存失败' : 'Save failed') })
    } else {
      setMsg({
        ok: true,
        text: zh ? '已保存,边缘节点最多 60 秒后生效。' : 'Saved — edge nodes pick it up within 60 seconds.',
      })
      await load()
    }
    setBusy(false)
  }

  if (auth.loading || loading) {
    return <Shell><div className="flex min-h-[50vh] items-center justify-center text-body-3">{zh ? '加载中…' : 'Loading…'}</div></Shell>
  }

  if (!auth.user || !role) {
    return (
      <Shell>
        <div className="mx-auto max-w-[520px] py-24 text-center">
          <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-body-3">STAYLOOP ADMIN</div>
          <h1 className="mt-3 text-[26px] font-extrabold tracking-tight">{zh ? '无访问权限' : 'No access'}</h1>
          <p className="mt-3 text-[14px] text-body-2">
            {!auth.user
              ? (zh ? '请先登录,并使用属于 Stayloop 管理组的账号。' : 'Sign in with a Stayloop admin-group account first.')
              : (zh ? '这个账号不在 Stayloop 后台管理组里。' : 'This account is not in the Stayloop admin group.')}
          </p>
          <Link href={auth.user ? '/' : '/login?redirect=/admin/models'} className="sl-btn-primary mt-6">
            {auth.user ? (zh ? '返回首页' : 'Back home') : (zh ? '去登录' : 'Sign in')}
          </Link>
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      <div className="mx-auto max-w-[860px] px-5 py-10 sm:px-7">
        <Link href="/admin" className="font-mono text-[11px] font-bold uppercase tracking-eyebrow text-body-3 hover:text-brand">
          ← STAYLOOP ADMIN
        </Link>
        <h1 className="mt-2 text-[30px] font-extrabold tracking-tight">{zh ? '模型配置' : 'Model config'}</h1>
        <p className="mt-2 text-[13.5px] text-body-2">
          {zh
            ? '为每个 AI 能力槽位选择 Claude 模型。保存后写入 app_config,各边缘节点缓存最多 60 秒后自动生效。'
            : 'Pick the Claude model for each AI slot. Saved to app_config; edge caches refresh within 60 seconds.'}
        </p>
        {updatedAt && (
          <p className="mt-1 font-mono text-[11px] text-body-3">
            {zh ? '上次更新:' : 'Last updated:'} {new Date(updatedAt).toLocaleString()}
          </p>
        )}

        {msg && (
          <div
            className="mt-4 rounded-lg border px-4 py-3 text-[13px] font-semibold"
            style={msg.ok ? { borderColor: '#04785744', color: '#047857', background: 'rgba(4,120,87,0.06)' } : { borderColor: '#DC262644', color: '#DC2626', background: 'rgba(220,38,38,0.05)' }}
          >
            {msg.text}
          </div>
        )}

        <div className="mt-6 space-y-2.5">
          {rowLoading ? (
            <div className="py-10 text-center text-body-3">{zh ? '加载中…' : 'Loading…'}</div>
          ) : (
            MODEL_SLOTS.map((slot) => {
              const meta = SLOT_META[slot]
              const current = ALLOWED_MODELS.find((m) => m.id === values[slot])
              return (
                <div key={slot} className="sl-card flex flex-wrap items-center gap-4 p-5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14.5px] font-bold">{zh ? meta.zh : meta.en}</span>
                      <span className="rounded px-1.5 py-0.5 font-mono text-[9.5px] font-bold text-body-3" style={{ background: 'rgba(0,0,0,0.05)' }}>
                        {slot}
                      </span>
                      {values[slot] !== DEFAULT_MODELS[slot] && (
                        <span className="rounded-md px-1.5 py-0.5 font-mono text-[9.5px] font-bold" style={{ background: 'rgba(124,58,237,0.10)', color: '#7C3AED' }}>
                          {zh ? '非默认' : 'CUSTOM'}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-[12.5px] text-body-3">{zh ? meta.descZh : meta.descEn}</div>
                    {current && <div className="mt-1 text-[12px] text-body-2">{current.note}</div>}
                  </div>
                  <select
                    className="sl-input w-auto min-w-[260px]"
                    value={values[slot]}
                    onChange={(e) => {
                      setValues((prev) => ({ ...prev, [slot]: e.target.value }))
                      setDirty(true)
                      setMsg(null)
                    }}
                  >
                    {ALLOWED_MODELS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label} · {m.id}
                      </option>
                    ))}
                  </select>
                </div>
              )
            })
          )}
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button className="sl-btn-primary disabled:opacity-50" disabled={busy || rowLoading || !dirty} onClick={save}>
            {busy ? '…' : (zh ? '保存' : 'Save')}
          </button>
          {dirty && !busy && (
            <span className="text-[12.5px] text-body-3">{zh ? '有未保存的修改' : 'Unsaved changes'}</span>
          )}
        </div>
      </div>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface-nav text-body">
      <Header />
      {children}
    </div>
  )
}
