'use client'

import { useState } from 'react'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { useAuth } from '@/lib/useAuth'
import { useI18n } from '@/lib/i18n'

const TABS = [
  { key: 'profile', label: '个人资料' },
  { key: 'lang',    label: '语言' },
  { key: 'notif',   label: '通知' },
  { key: 'privacy', label: '隐私 · 共享' },
  { key: 'auth',    label: '账户安全' },
] as const

export default function SettingsPage() {
  const auth = useAuth()
  const { lang, setLang } = useI18n()
  const [tab, setTab] = useState<typeof TABS[number]['key']>('profile')

  return (
    <>
      <Header />
      <main className="bg-surface">
        <div className="mx-auto grid max-w-[1100px] gap-8 px-5 py-12 sm:px-7 lg:grid-cols-[220px_1fr]">
          <aside>
            <h1 className="text-[24px] font-bold tracking-tight">设置</h1>
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
                  {t.label}
                </button>
              ))}
            </nav>
          </aside>

          <section className="sl-card p-7">
            {tab === 'profile' && (
              <div>
                <h2 className="text-[20px] font-bold tracking-tight">个人资料</h2>
                <div className="mt-6 space-y-4">
                  <Field label="姓名" value={auth.fullName || '—'} />
                  <Field label="邮箱" value={auth.email || '—'} />
                  <Field label="角色" value={auth.role || '尚未选择'} />
                </div>
              </div>
            )}
            {tab === 'lang' && (
              <div>
                <h2 className="text-[20px] font-bold tracking-tight">语言</h2>
                <p className="mt-2 text-[13px] text-body-2">这会影响 Stayloop 整站的显示语言。</p>
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
                <h2 className="text-[20px] font-bold tracking-tight">通知</h2>
                <div className="mt-6 space-y-3">
                  <ToggleRow label="新房源符合我的偏好" hint="Luna 每天最多 1 次邮件汇总。" defaultOn />
                  <ToggleRow label="申请进度更新" defaultOn />
                  <ToggleRow label="维修工单状态" defaultOn />
                  <ToggleRow label="租金支付提醒" defaultOn />
                  <ToggleRow label="续约 / 涨租通知" defaultOn />
                  <ToggleRow label="产品更新 + 时讯" />
                </div>
              </div>
            )}
            {tab === 'privacy' && (
              <div>
                <h2 className="text-[20px] font-bold tracking-tight">隐私 · 共享</h2>
                <p className="mt-2 text-[13.5px] text-body-2">
                  你的 Rental Passport 字段共享情况在
                  {' '}<a className="font-semibold text-brand underline" href="/tenant/passport">Passport 详情页</a>{' '}
                  管理。这里是宏观控制。
                </p>
                <div className="mt-6 space-y-3">
                  <ToggleRow label="允许房东在邀请你看房前查看你的匿名 Tier 等级" defaultOn />
                  <ToggleRow label="允许 Stayloop 在 listing 推荐时使用我的偏好" defaultOn />
                  <ToggleRow label="允许 Trust API 合作伙伴在我授权后查询" />
                </div>
              </div>
            )}
            {tab === 'auth' && (
              <div>
                <h2 className="text-[20px] font-bold tracking-tight">账户安全</h2>
                <div className="mt-6 space-y-4 text-[14px]">
                  <div className="flex items-center justify-between rounded-xl bg-surface-chip px-4 py-3">
                    <div>
                      <div className="font-bold">登录方式</div>
                      <div className="text-[12.5px] text-body-3">Magic link · Supabase</div>
                    </div>
                    <button className="sl-btn-ghost">修改</button>
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-surface-chip px-4 py-3">
                    <div>
                      <div className="font-bold">2FA</div>
                      <div className="text-[12.5px] text-body-3">推荐开启 Authenticator</div>
                    </div>
                    <button className="sl-btn-secondary">开启</button>
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-danger/5 px-4 py-3">
                    <div>
                      <div className="font-bold text-danger">删除账户</div>
                      <div className="text-[12.5px] text-body-3">不可逆 · 30 天内可恢复</div>
                    </div>
                    <button className="rounded-lg border border-danger/40 bg-white px-3 py-[7px] text-[12.5px] font-semibold text-danger">
                      删除
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
