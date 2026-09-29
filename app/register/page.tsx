'use client'

// Same page as /login and the naming step's sign-in gate (2026-09-29): one
// email-first card creates an account or signs in, depending on the address.
// A failed email lookup falls back to create-account here (to the password
// on /login). The signed-in bounce and the copy live in
// components/auth/AuthPage.tsx.
import AuthPage from '@/components/auth/AuthPage'

export default function RegisterPage() {
  return <AuthPage mode="register" />
}
