import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'Manage your rental listings, view tenant applications, and track screening results on your Stayloop dashboard.',
  robots: { index: false },
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return children
}
