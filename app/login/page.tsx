'use client'

// Same page as /register and the naming step's sign-in gate (2026-09-29):
// the onboarding card frame + the homepage's email-first LoginCard. The
// signed-in bounce and the copy live in components/auth/AuthPage.tsx.
import AuthPage from '@/components/auth/AuthPage'

export default function LoginPage() {
  return <AuthPage mode="signin" />
}
