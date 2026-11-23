// A service provider's avatar: the first letter of the name on the provider hat colour
// (lib/roleTheme.ts PROVIDER_ACCENT). Providers upload no photo, so this is always an initial.
// Same shape and sizes as the agent avatar so the three directory tabs line up.
import { nameInitial } from '@/lib/ui/nameInitial'

export default function ProviderAvatar({ name, size = 56, shape = 'square' }: { name: string; size?: number; shape?: 'circle' | 'square' }) {
  return (
    <div
      aria-hidden
      data-testid="provider-avatar"
      className={`flex shrink-0 items-center justify-center ${shape === 'square' ? 'rounded-2xl' : 'rounded-full'} font-bold text-white`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38), background: 'linear-gradient(135deg,#FB923C,#C2410C)' }}
    >
      {nameInitial(name)}
    </div>
  )
}
