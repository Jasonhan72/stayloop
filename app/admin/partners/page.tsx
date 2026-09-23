'use client'

// /admin/partners — Trust API partner keys (plan §3.4). Create shows the key
// once; only its hash is stored. A key may be bound to a landlord account so
// POST /api/v1/screen runs partner screenings under that account.
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import { supabase } from '@/lib/supabase'
import { useAdmin } from '@/lib/useAdmin'
import { useT } from '@/lib/i18n'

type KeyRow = { id: string; partner_name: string; key_prefix: string | null; active: boolean; created_at: string; last_used_at: string | null; landlord_auth_id: string | null; notes: string | null; calls_30d: number }

export default function AdminPartnersPage() {
  const { lang } = useT()
  const zh = lang === 'zh'
  const { loading, role } = useAdmin()
  const [rows, setRows] = useState<KeyRow[]>([])
  const [name, setName] = useState('')
  const [landlord, setLandlord] = useState('')
  const [notes, setNotes] = useState('')
  const [fresh, setFresh] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const call = useCallback(async (method: string, body?: unknown) => {
    const { data: sess } = await supabase.auth.getSession()
    const res = await fetch('/api/admin/partners', { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sess.session?.access_token ?? ''}` }, body: body ? JSON.stringify(body) : undefined })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error((j as { error?: string }).error || `HTTP ${res.status}`)
    return j
  }, [])
  const load = useCallback(async () => { try { const j = (await call('GET')) as { keys: KeyRow[] }; setRows(j.keys) } catch (e) { setErr((e as Error).message) } }, [call])
  useEffect(() => { if (!loading && role) void load() }, [loading, role, load])

  if (loading) return null
  if (!role) return <div style={{ background: '#F3F8FC', minHeight: '100vh' }}><Header variant="solid" /><div className="mx-auto max-w-[800px] px-5 py-16 text-center text-[14px] text-body-2">{zh ? '无访问权限' : 'No access'}</div></div>

  return (
    <div style={{ background: '#F3F8FC', minHeight: '100vh' }}>
      <Header variant="solid" />
      <div className="mx-auto max-w-[1000px] px-5 py-10 sm:px-7">
        <Link href="/admin" className="font-mono text-[11px] font-bold uppercase tracking-eyebrow text-body-3 hover:text-brand">← STAYLOOP ADMIN</Link>
        <h1 className="mt-2 text-[28px] font-extrabold tracking-tight">{zh ? 'Trust API 合作方密钥' : 'Trust API partner keys'}</h1>
        <p className="mt-2 max-w-[720px] text-[13.5px] text-body-2">{zh ? '密钥只显示一次，库里只存哈希。绑定一个房东账号后，合作方通过 POST /api/v1/screen 发起的筛查会记在该账号名下并计入其配额。' : 'Keys are shown once; only the hash is stored. Bind a landlord account and screenings the partner starts via POST /api/v1/screen run under it.'}</p>
        {err && <div className="mt-4 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-[13px] text-danger">{err}</div>}

        <div className="mt-6 rounded-2xl border border-line-divider bg-white p-5">
          <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">{zh ? '新建密钥' : 'New key'}</div>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={zh ? '合作方名称' : 'Partner name'} className="sl-input" />
            <input value={landlord} onChange={(e) => setLandlord(e.target.value)} placeholder={zh ? '绑定房东 auth id（可选）' : 'Landlord auth id (optional)'} className="sl-input font-mono text-[12px]" />
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={zh ? '备注' : 'Notes'} className="sl-input" />
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button type="button" disabled={busy || name.trim().length < 2} className="sl-btn-primary !px-5 !py-2 !text-[13.5px] disabled:opacity-60" onClick={async () => { setBusy(true); setErr(null); try { const j = (await call('POST', { partner_name: name.trim(), landlord_auth_id: landlord.trim() || null, notes })) as { key: string }; setFresh(j.key); setName(''); setLandlord(''); setNotes(''); await load() } catch (e) { setErr((e as Error).message) } finally { setBusy(false) } }}>{zh ? '生成密钥' : 'Create key'}</button>
            {fresh && <code className="select-all rounded bg-surface-chip px-2 py-1 font-mono text-[12px]">{fresh}</code>}
          </div>
          {fresh && <p className="mt-2 text-[12px] text-amber-800">{zh ? '只显示这一次，复制后妥善保存。' : 'Shown once — copy it now.'}</p>}
        </div>

        <div className="mt-6 overflow-x-auto rounded-2xl border border-line-divider bg-white">
          <table className="w-full min-w-[720px] text-[13px]">
            <thead className="text-left text-[11px] uppercase tracking-wider text-body-3"><tr><th className="px-4 py-3">{zh ? '合作方' : 'Partner'}</th><th className="px-4 py-3">Prefix</th><th className="px-4 py-3">{zh ? '30 天调用' : 'Calls 30d'}</th><th className="px-4 py-3">{zh ? '最近使用' : 'Last used'}</th><th className="px-4 py-3">{zh ? '绑定房东' : 'Landlord'}</th><th className="px-4 py-3">{zh ? '状态' : 'Status'}</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-line-divider">
                  <td className="px-4 py-3 font-semibold">{r.partner_name}{r.notes ? <div className="text-[11.5px] font-normal text-body-3">{r.notes}</div> : null}</td>
                  <td className="px-4 py-3 font-mono text-[12px]">{r.key_prefix || '—'}</td>
                  <td className="px-4 py-3">{r.calls_30d}</td>
                  <td className="px-4 py-3 text-body-3">{r.last_used_at ? r.last_used_at.slice(0, 16).replace('T', ' ') : '—'}</td>
                  <td className="px-4 py-3 font-mono text-[11px] text-body-3">{r.landlord_auth_id ? r.landlord_auth_id.slice(0, 8) + '…' : '—'}</td>
                  <td className="px-4 py-3"><button type="button" className={'rounded-full px-3 py-1 text-[12px] font-bold ' + (r.active ? 'bg-success/10 text-success' : 'bg-surface-chip text-body-3')} onClick={async () => { try { await call('PATCH', { id: r.id, active: !r.active }); await load() } catch (e) { setErr((e as Error).message) } }}>{r.active ? (zh ? '启用中 · 点击停用' : 'Active · disable') : (zh ? '已停用 · 点击启用' : 'Disabled · enable')}</button></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-body-3">{zh ? '还没有密钥。' : 'No keys yet.'}</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="mt-6 text-[12.5px] text-body-3">{zh ? '端点：POST /api/v1/passport/verify · POST /api/v1/screen · POST /api/v1/listings/compliance（免费、无需密钥）。文档：' : 'Endpoints: POST /api/v1/passport/verify · POST /api/v1/screen · POST /api/v1/listings/compliance (free, no key). Docs: '}<Link href="/trust-api/docs" className="underline">/trust-api/docs</Link></p>
      </div>
    </div>
  )
}
