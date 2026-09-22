import { redirect } from 'next/navigation'

// /landlord/settings is the address people guess for the landlord
// workspace's settings (external fix list 2026-09-22, SL-LL-008: it 404'd).
// Settings live at /settings for every hat.
export default function LandlordSettingsRedirect() {
  redirect('/settings')
}
