// A service provider's avatar: the photo or logo they uploaded (provider-photos bucket,
// 2026-11-23), otherwise the first letter of the name on the provider hat colour
// (lib/roleTheme.ts PROVIDER_ACCENT). Same shape and sizes as the agent avatar so the three
// directory tabs line up.
import { nameInitial } from '@/lib/ui/nameInitial'

export default function ProviderAvatar({ name, size = 56, shape = 'square', photoUrl = null }: { name: string; size?: number; shape?: 'circle' | 'square'; photoUrl?: string | null }) {
  const round = shape === 'square' ? 'rounded-2xl' : 'rounded-full'
  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={photoUrl} alt="" width={size} height={size} data-testid="provider-photo" className={`shrink-0 ${round} object-cover`} style={{ width: size, height: size }} />
    )
  }
  return (
    <div
      aria-hidden
      data-testid="provider-avatar"
      className={`flex shrink-0 items-center justify-center ${round} font-bold text-white`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38), background: 'linear-gradient(135deg,#FB923C,#C2410C)' }}
    >
      {nameInitial(name)}
    </div>
  )
}
