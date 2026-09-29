'use client'

// /login and /register (2026-09-29, user:「把汉堡菜单里的登录，注册页面也统一成
// 刚修改过的登录，注册页面一样的」): the same page as the naming step's sign-in
// gate — the onboarding card frame and SignInBlock (the homepage's LoginCard:
// email first, the email-status lookup routes to the password or to
// create-account, Google below). One card does both jobs, so the two routes
// differ only in the heading and in which step a failed lookup falls back to.
// The old pages (a「欢迎回来」form with Google on top, and a separate
// three-field register form) are gone; the methods are unchanged and all come
// from useLoginForm. The site Header stays on top (user 2026-09-27: the menu is
// always there), so the card frame renders `bare`.
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import OnboardingStage from '@/components/OnboardingStage'
import SignInBlock from '@/components/auth/SignInBlock'
import { getSupabaseBrowser } from '@/lib/supabase'
import { useAuth, roleStorageKey } from '@/lib/useAuth'
import { useT } from '@/lib/i18n'
import { ROLE_HOME } from '@/lib/useOnboarding'
import { homeForHats, type HatsLite } from '@/lib/landlordHat'

export default function AuthPage({ mode }: { mode: 'signin' | 'register' }) {
  const router = useRouter()
  const { loading: authLoading, user, role } = useAuth()
  const { lang } = useT()
  const zh = lang === 'zh'
  // An ANONYMOUS session must not bounce away from the form — it used to make
  // signing into a real account impossible after the visitor had touched the
  // (now retired) anonymous trial.
  const signedIn = !authLoading && !!user && !(user as { is_anonymous?: boolean }).is_anonymous

  // Already signed in → no form. Honor an explicit ?next= / ?redirect= target,
  // else land on a workspace this account actually holds (SL-T-08). The
  // remembered hat is read raw: 'provider' is a landing hat that the Role type
  // does not carry (2026-09-26).
  useEffect(() => {
    if (!signedIn || !user) return
    const q = new URLSearchParams(window.location.search)
    const redirect = q.get('next') ?? q.get('redirect')
    const safe = redirect && redirect.startsWith('/') && !redirect.startsWith('//') && !redirect.startsWith('/\\') ? redirect : null
    if (safe) { router.replace(safe); return }
    const remembered = window.localStorage.getItem(roleStorageKey(user.id)) ?? role
    void Promise.resolve(getSupabaseBrowser().rpc('my_hats')).then(({ data }) => router.replace(homeForHats(remembered, data as HatsLite)), () => router.replace(role ? ROLE_HOME[role] : '/tenant/agent'))
  }, [signedIn, user, role, router])

  if (signedIn) {
    return (
      <>
        <Header />
        <OnboardingStage bare>
          <div aria-busy="true" style={{ minHeight: 320 }} />
        </OnboardingStage>
      </>
    )
  }

  const register = mode === 'register'
  return (
    <>
      <Header />
      <OnboardingStage bare eyebrow={register ? (zh ? 'CREATE ACCOUNT · 注册' : 'CREATE ACCOUNT') : (zh ? 'SIGN IN · 登录' : 'SIGN IN')}>
        <SignInBlock
          zh={zh}
          intent={mode}
          title={register ? (zh ? '创建你的 Stayloop 账户' : 'Create your Stayloop account') : (zh ? '登录 Stayloop' : 'Sign in to Stayloop')}
          lead={
            register
              ? (zh
                  ? '免费，不要信用卡。输入邮箱继续；这个邮箱已经注册过的话，会直接让你输密码登录。'
                  : 'Free, no credit card. Enter your email to continue; if it already has an account, you sign in with its password instead.')
              : (zh
                  ? '输入邮箱继续：已有账户就输密码登录，第一次来会直接带你创建一个，免费。'
                  : 'Enter your email to continue: with an account you sign in with its password; if you are new, it takes you straight to creating one, free.')
          }
        />
      </OnboardingStage>
      <Footer />
    </>
  )
}
