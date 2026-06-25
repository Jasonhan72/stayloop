'use client'

import { useState } from 'react'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { useAuth } from '@/lib/useAuth'
import { useI18n } from '@/lib/i18n'
import { getAIName, setAIName, getDefaultName } from '@/lib/aiName'
import { getSupabaseBrowser } from '@/lib/supabase'

const TABS = [
  { key: 'profile',   zh: '个人资料',    en: 'Profile' },
  { key: 'assistant', zh: 'AI 助手',     en: 'AI Assistant' },
  { key: 'lang',      zh: '语言',        en: 'Language' },
  { key: 'notif',     zh: '通知',        en: 'Notifications' },
  { key: 'privacy',   zh: '隐私 · 共享', en: 'Privacy & Sharing' },
  { key: 'auth',      zh: '账户安全',    en: 'Account Security' },
] as const

export default function SettingsPage() {
  const auth = useAuth()
  const { lang, setLang } = useI18n()
  const zh = lang === 'zh'
  const [tab, setTab] = useState<typeof TABS[number]['key']>('profile')

  return (
    <>
      <Header />
      <main className="bg-surface">
        <div className="mx-auto grid max-w-[1100px] gap-8 px-5 py-12 sm:px-7 lg:grid-cols-[220px_1fr]">
          <aside>
            <h1 className="text-[24px] font-bold tracking-tight">{zh ? '设置' : 'Settings'}</h1>
            <nav className="mt-6 flex flex-col gap-1">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={
                    'rounded-lg px-3 py-2 text-left text-[13.5px] transition ' +
                    (tab === t.key
                      ? 'bg-brand/10 font-bold text-brand'
                      : 'text-body-2 hover:bg-line-divider/40 hover:text-body')
                  }
                >
                  {zh ? t.zh : t.en}
                </button>
              ))}
            </nav>
          </aside>

          <section className="sl-card p-7">
            {tab === 'profile' && (
              <div>
                <h2 className="text-[20px] font-bold tracking-tight">{zh ? '个人资料' : 'Profile'}</h2>
                <div className="mt-6 space-y-4">
                  <Field label={zh ? '姓名' : 'Name'} value={auth.fullName || '—'} />
                  <Field label={zh ? '邮箱' : 'Email'} value={auth.email || '—'} />
                  <Field label={zh ? '角色' : 'Role'} value={auth.role || (zh ? '尚未选择' : 'Not selected')} />
                </div>
              </div>
            )}
            {tab === 'assistant' && (
              <AssistantTab role={auth.role} zh={zh} user={auth.user} />
            )}
            {tab === 'lang' && (
              <div>
                <h2 className="text-[20px] font-bold tracking-tight">{zh ? '语言' : 'Language'}</h2>
                <p className="mt-2 text-[13px] text-body-2">{zh ? '这会影响 Stayloop 整站的显示语言。' : 'This changes the display language across all of Stayloop.'}</p>
                <div className="mt-5 flex gap-2">
                  {(['zh', 'en'] as const).map((l) => (
                    <button
                      key={l}
                      onClick={() => setLang(l)}
                      className={
                        'rounded-lg border px-4 py-2 text-[13.5px] font-semibold transition ' +
                        (lang === l
                          ? 'border-brand bg-brand/10 text-brand'
                          : 'border-line-strong bg-white text-body hover:border-brand')
                      }
                    >
                      {l === 'zh' ? '中文 · 简体' : 'English'}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {tab === 'notif' && (
              <div>
                <h2 className="text-[20px] font-bold tracking-tight">{zh ? '通知' : 'Notifications'}</h2>
                <div className="mt-6 space-y-3">
                  <ToggleRow label={zh ? '新房源符合我的偏好' : 'New listings matching my preferences'} hint={zh ? 'Luna 每天最多 1 次邮件汇总。' : 'Luna sends at most one email digest per day.'} defaultOn />
                  <ToggleRow label={zh ? '申请进度更新' : 'Application progress updates'} defaultOn />
                  <ToggleRow label={zh ? '维修工单状态' : 'Maintenance ticket status'} defaultOn />
                  <ToggleRow label={zh ? '租金支付提醒' : 'Rent payment reminders'} defaultOn />
                  <ToggleRow label={zh ? '续约 / 涨租通知' : 'Renewal / rent increase notices'} defaultOn />
                  <ToggleRow label={zh ? '产品更新 + 时讯' : 'Product updates + newsletter'} />
                </div>
              </div>
            )}
            {tab === 'privacy' && (
              <div>
                <h2 className="text-[20px] font-bold tracking-tight">{zh ? '隐私 · 共享' : 'Privacy & Sharing'}</h2>
                <p className="mt-2 text-[13.5px] text-body-2">
                  {zh ? '你的 Rental Passport 字段共享情况在' : 'Your Rental Passport field sharing is managed on the'}
                  {' '}<a className="font-semibold text-brand underline" href="/tenant/passport">{zh ? 'Passport 详情页' : 'Passport details page'}</a>{' '}
                  {zh ? '管理。这里是宏观控制。' : '. This is the high-level control.'}
                </p>
                <div className="mt-6 space-y-3">
                  <ToggleRow label={zh ? '允许房东在邀请你看房前查看你的匿名 Tier 等级' : 'Let landlords see your anonymous Tier level before inviting you to a viewing'} defaultOn />
                  <ToggleRow label={zh ? '允许 Stayloop 在 listing 推荐时使用我的偏好' : 'Let Stayloop use my preferences for listing recommendations'} defaultOn />
                  <ToggleRow label={zh ? '允许 Trust API 合作伙伴在我授权后查询' : 'Let Trust API partners query after my authorization'} />
                </div>
              </div>
            )}
            {tab === 'auth' && (
              <div>
                <h2 className="text-[20px] font-bold tracking-tight">{zh ? '账户安全' : 'Account Security'}</h2>
                <div className="mt-6 space-y-4 text-[14px]">
                  <div className="flex items-center justify-between rounded-xl bg-surface-chip px-4 py-3">
                    <div>
                      <div className="font-bold">{zh ? '登录方式' : 'Sign-in method'}</div>
                      <div className="text-[12.5px] text-body-3">Magic link · Supabase</div>
                    </div>
                    <button className="sl-btn-ghost">{zh ? '修改' : 'Change'}</button>
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-surface-chip px-4 py-3">
                    <div>
                      <div className="font-bold">2FA</div>
                      <div className="text-[12.5px] text-body-3">{zh ? '推荐开启 Authenticator' : 'Authenticator recommended'}</div>
                    </div>
                    <button className="sl-btn-secondary">{zh ? '开启' : 'Enable'}</button>
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-danger/5 px-4 py-3">
                    <div>
                      <div className="font-bold text-danger">{zh ? '删除账户' : 'Delete account'}</div>
                      <div className="text-[12.5px] text-body-3">{zh ? '不可逆 · 30 天内可恢复' : 'Irreversible · recoverable within 30 days'}</div>
                    </div>
                    <button className="rounded-lg border border-danger/40 bg-white px-3 py-[7px] text-[12.5px] font-semibold text-danger">
                      {zh ? '删除' : 'Delete'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
      <Footer />
    </>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[120px_1fr] items-center gap-4 border-b border-line-divider py-3 last:border-0">
      <span className="font-mono text-[11px] font-semibold uppercase text-body-3">{label}</span>
      <span className="text-[14px]">{value}</span>
    </div>
  )
}

const ROLE_COLORS: Record<string, string> = {
  tenant: '#7C3AED',
  landlord: '#047857',
  agent: '#2563EB',
}

const ROLE_LABELS: Record<string, { zh: string; en: string }> = {
  tenant: { zh: '租客助手', en: 'Tenant Assistant' },
  landlord: { zh: '房东助手', en: 'Landlord Assistant' },
  agent: { zh: '经纪助手', en: 'Agent Assistant' },
}

function AssistantTab({ role, zh, user }: { role: string | null; zh: boolean; user: any }) {
  const effectiveRole = role || 'tenant'
  const color = ROLE_COLORS[effectiveRole] || '#7C3AED'
  const currentName = getAIName(effectiveRole)
  const defaultName = getDefaultName(effectiveRole)
  const [value, setValue] = useState(currentName)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    const trimmed = value.trim() || defaultName
    setSaving(true)
    setAIName(trimmed, effectiveRole)
    if (user) {
      try {
        const client = getSupabaseBrowser()
        await client
          .from('agent_configs')
          .update({ agent_name: trimmed })
          .eq('user_id', user.id)
          .eq('role', effectiveRole)
      } catch {}
    }
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div>
      <h2 className="text-[20px] font-bold tracking-tight">{zh ? 'AI 助手' : 'AI Assistant'}</h2>
      <p className="mt-2 text-[13px] text-body-2">
        {zh
          ? `修改你的 ${ROLE_LABELS[effectiveRole]?.zh || '助手'} 名字。名字会在对话、记忆面板和通知中显示。`
          : `Change your ${ROLE_LABELS[effectiveRole]?.en || 'assistant'} name. The name appears in conversations, memory panels, and notifications.`}
      </p>

      <div className="mt-6 space-y-5">
        <div>
          <div className="font-mono text-[10.5px] font-semibold uppercase tracking-widest text-body-3" style={{ marginBottom: 8 }}>
            {zh ? '助手名字' : 'Assistant name'}
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '12px 14px',
              border: '1.5px solid #C5BDAA',
              borderRadius: 10,
              background: '#fff',
            }}
          >
            <span style={{ fontSize: 20, fontWeight: 700, color }}>@</span>
            <input
              type="text"
              value={value}
              onChange={(e) => { setValue(e.target.value); setSaved(false) }}
              placeholder={defaultName}
              maxLength={20}
              style={{
                flex: 1,
                minWidth: 0,
                border: 'none',
                outline: 'none',
                fontSize: 18,
                fontWeight: 600,
                fontFamily: 'inherit',
                background: 'transparent',
              }}
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving || value.trim() === currentName}
            className="sl-btn-primary !py-[10px] !px-6 disabled:opacity-40"
          >
            {saving ? '...' : saved ? (zh ? '已保存 ✓' : 'Saved ✓') : (zh ? '保存' : 'Save')}
          </button>
          {value.trim() !== defaultName && (
            <button
              onClick={() => { setValue(defaultName); setSaved(false) }}
              className="text-[13px] font-semibold text-body-3 hover:text-body-2"
            >
              {zh ? `恢复默认 (${defaultName})` : `Reset to default (${defaultName})`}
            </button>
          )}
        </div>

        <div
          style={{
            background: `${color}0D`,
            border: `1px solid ${color}33`,
            borderRadius: 10,
            padding: '12px 14px',
          }}
        >
          <div className="font-mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color, marginBottom: 4 }}>
            PREVIEW
          </div>
          <p style={{ fontSize: 13, color: '#3F3F46', lineHeight: 1.5 }}>
            {zh
              ? `「你好,我是 ${value.trim() || defaultName}。有什么我能帮你的?」`
              : `"Hi, I'm ${value.trim() || defaultName}. How can I help you?"`}
          </p>
        </div>
      </div>
    </div>
  )
}

function ToggleRow({ label, hint, defaultOn }: { label: string; hint?: string; defaultOn?: boolean }) {
  const [on, setOn] = useState(!!defaultOn)
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl bg-surface-chip px-4 py-3">
      <div>
        <div className="text-[14px] font-semibold">{label}</div>
        {hint && <div className="text-[12px] text-body-3">{hint}</div>}
      </div>
      <button
        onClick={() => setOn((v) => !v)}
        className={
          'relative h-6 w-11 rounded-full transition ' +
          (on ? 'bg-brand' : 'bg-line-strong')
        }
      >
        <span
          className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition"
          style={{ left: on ? '22px' : '2px' }}
        />
      </button>
    </div>
  )
}
