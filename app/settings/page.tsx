'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import WorkspaceShell, { type WorkspaceRole } from '@/components/WorkspaceShell'
import { useAuth } from '@/lib/useAuth'
import { useI18n } from '@/lib/i18n'
import { getAIName, setAIName, getDefaultName } from '@/lib/aiName'
import { getSupabaseBrowser } from '@/lib/supabase'
import { useEntitlements } from '@/lib/useEntitlements'
import { ROLE_THEME } from '@/lib/roleTheme'

const ROLE_COLORS: Record<string, string> = {
  tenant: ROLE_THEME.tenant.accent,
  landlord: ROLE_THEME.landlord.accent,
  agent: ROLE_THEME.agent.accent,
}

const ROLE_LABELS: Record<string, { zh: string; en: string }> = {
  tenant: { zh: '租客', en: 'Tenant' },
  landlord: { zh: '房东', en: 'Landlord' },
  agent: { zh: '经纪', en: 'Agent' },
}

export default function SettingsPage() {
  const auth = useAuth()
  const { lang } = useI18n()
  const zh = lang === 'zh'
  const shellRole = (auth.role || 'tenant') as WorkspaceRole
  const color = ROLE_COLORS[shellRole] || ROLE_THEME.tenant.accent

  const initial = (auth.fullName || auth.email || 'U').slice(0, 1).toUpperCase()
  const aiName = getAIName(shellRole)

  // Plan-derived entitlements (get_entitlements RPC) — null when anonymous.
  const { entitlements, loading: entLoading } = useEntitlements(auth.user ? shellRole : null)
  const plan = typeof entitlements?.plan === 'string' ? (entitlements.plan as string) : null
  const planLabel = entLoading
    ? '…'
    : plan
      ? plan.charAt(0).toUpperCase() + plan.slice(1)
      : '—'
  const fileRef = useRef<HTMLInputElement>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)

  useEffect(() => {
    const cached = typeof window !== 'undefined' ? localStorage.getItem('stayloop-avatar') : null
    if (cached) setAvatarUrl(cached)
    const meta = (auth.user?.user_metadata as any)?.avatar_url
    if (meta && typeof meta === 'string') {
      setAvatarUrl(meta)
      try { localStorage.setItem('stayloop-avatar', meta) } catch {}
    }
  }, [auth.user])

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const dataUrl = await resizeAvatar(file, 200, 0.75)
    setAvatarUrl(dataUrl)
    try { localStorage.setItem('stayloop-avatar', dataUrl) } catch {}
    if (auth.user) {
      try {
        await getSupabaseBrowser().auth.updateUser({ data: { avatar_url: dataUrl } })
      } catch {}
    }
  }

  return (
    <WorkspaceShell role={shellRole} hideAside>
      <div className="mx-auto max-w-[780px]">
        {/* Profile header — Airbnb style */}
        <h1 className="text-[28px] font-bold tracking-tight">{zh ? '个人资料' : 'Profile'}</h1>

        <div className="mt-8 flex flex-col gap-8 sm:flex-row sm:items-start">
          {/* Profile card */}
          <div className="sm:flex-none">
            <div className="sl-card flex w-full flex-col items-center px-6 py-8 text-center sm:w-[220px]">
              <input ref={fileRef} type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
              <div
                className="group relative cursor-pointer"
                onClick={() => fileRef.current?.click()}
              >
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt="" className="h-[88px] w-[88px] rounded-full object-cover shadow-md" />
                ) : (
                  <div
                    className="flex h-[88px] w-[88px] items-center justify-center rounded-full text-[32px] font-bold text-white shadow-md"
                    style={{ background: `linear-gradient(135deg, ${color}88, ${color})` }}
                  >
                    {initial}
                  </div>
                )}
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition group-hover:opacity-100">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                </div>
              </div>
              <div className="mt-4 text-[20px] font-bold tracking-tight">{auth.fullName || '—'}</div>
              <div className="mt-0.5 text-[13px] text-body-3">Toronto, Canada</div>

              <div className="mt-5 grid w-full grid-cols-2 gap-3 border-t border-line-divider pt-5">
                <div className="text-center">
                  <div className="text-[18px] font-bold" style={{ color }}>{ROLE_LABELS[shellRole]?.[zh ? 'zh' : 'en'] || '—'}</div>
                  <div className="text-[11px] text-body-3">{zh ? '角色' : 'Role'}</div>
                </div>
                <div className="text-center">
                  <div className="text-[18px] font-bold" style={{ color }}>✓</div>
                  <div className="text-[11px] text-body-3">{zh ? '已验证' : 'Verified'}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Info section */}
          <div className="min-w-0 flex-1 space-y-6">
            {/* About */}
            <div>
              <div className="flex items-center justify-between">
                <h2 className="text-[20px] font-bold tracking-tight">{zh ? '关于我' : 'About me'}</h2>
              </div>
              <div className="mt-4 space-y-3">
                <InfoRow icon="✉" label={zh ? '邮箱' : 'Email'} value={auth.email || '—'} />
                <InfoRow icon="🌐" label={zh ? '语言' : 'Language'} value={zh ? '中文 · English' : 'Chinese · English'} />
                <InfoRow icon="🤖" label={zh ? 'AI 助手' : 'AI Assistant'} value={aiName || getDefaultName(shellRole)} />
                <InfoRow icon="💳" label={zh ? '当前计划' : 'Current plan'} value={planLabel} />
                <InfoRow icon="🔒" label={zh ? '登录方式' : 'Sign-in'} value="Magic Link" />
              </div>
            </div>

            {/* Quick actions */}
            <div className="space-y-2">
              <QuickAction
                label={zh ? '修改 AI 助手名字' : 'Change AI assistant name'}
                desc={zh ? `当前：${aiName || getDefaultName(shellRole)}` : `Current: ${aiName || getDefaultName(shellRole)}`}
              >
                <AssistantNameEditor role={shellRole} zh={zh} user={auth.user} color={color} />
              </QuickAction>
              <Link href="/settings/models" className="flex w-full items-center justify-between rounded-xl border border-line-divider bg-white px-4 py-3 text-left transition hover:bg-surface-chip">
                <div>
                  <div className="text-[14px] font-semibold">{zh ? 'AI 模型' : 'AI models'}</div>
                  <div className="text-[12px] text-body-3">{zh ? '为你的对话与筛查选择模型（默认跟随系统）' : 'Pick the models for your conversations and screenings (defaults follow the system)'}</div>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-body-3"><path d="M9 18l6-6-6-6" /></svg>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </WorkspaceShell>
  )
}

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 text-[14px]">
      <span className="flex-none text-[16px]">{icon}</span>
      <span className="flex-none text-body-3">{label}:</span>
      <span className="min-w-0 break-words font-medium">{value}</span>
    </div>
  )
}

function QuickAction({ label, desc, children }: { label: string; desc: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-xl border border-line-divider bg-white">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition hover:bg-surface-chip"
      >
        <div>
          <div className="text-[14px] font-semibold">{label}</div>
          <div className="text-[12px] text-body-3">{desc}</div>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={'text-body-3 transition ' + (open ? 'rotate-180' : '')}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && <div className="border-t border-line-divider px-4 py-4">{children}</div>}
    </div>
  )
}

function AssistantNameEditor({ role, zh, user, color }: { role: string; zh: boolean; user: any; color: string }) {
  const currentName = getAIName(role)
  const defaultName = getDefaultName(role)
  const [value, setValue] = useState(currentName)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    const trimmed = value.trim() || defaultName
    setSaving(true)
    setAIName(trimmed, role)
    if (user) {
      try {
        const client = getSupabaseBrowser()
        // upsert, not update: for a role the user never visited there is no
        // agent_configs row, so update() matched 0 rows while the UI showed
        // a saved checkmark and the name evaporated cross-device.
        await client.from('agent_configs').upsert(
          { user_id: user.id, role, agent_name: trimmed },
          { onConflict: 'user_id,role' },
        )
      } catch {}
    }
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-lg border border-line-strong bg-white px-3 py-2.5">
        <span className="text-[18px] font-bold" style={{ color }}>@</span>
        <input
          type="text"
          value={value}
          onChange={(e) => { setValue(e.target.value); setSaved(false) }}
          placeholder={defaultName}
          maxLength={20}
          className="min-w-0 flex-1 border-none bg-transparent text-[16px] font-semibold outline-none"
        />
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving || value.trim() === currentName}
          className="sl-btn-primary !py-2 !px-5 !text-[13px] disabled:opacity-40"
        >
          {saving ? '...' : saved ? '✓' : (zh ? '保存' : 'Save')}
        </button>
        {value.trim() !== defaultName && (
          <button onClick={() => { setValue(defaultName); setSaved(false) }} className="text-[12px] text-body-3 hover:text-body-2">
            {zh ? '恢复默认' : 'Reset'}
          </button>
        )}
      </div>
    </div>
  )
}

function resizeAvatar(file: File, size: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Invalid image file'))
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')!
        const s = Math.min(img.width, img.height)
        const sx = (img.width - s) / 2
        const sy = (img.height - s) / 2
        ctx.drawImage(img, sx, sy, s, s, 0, 0, size, size)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}
