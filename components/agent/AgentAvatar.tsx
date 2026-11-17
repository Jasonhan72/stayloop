// The agent's photo when they uploaded one (agent-photos bucket, 2026-10-23); otherwise
// initials in the agent hat colour (lib/roleTheme.ts).
import { initials } from '@/lib/agentPublic'

export default function AgentAvatar({ name, size = 56, photoUrl = null, shape = 'circle', muted = false }: { name: string; size?: number; photoUrl?: string | null; /** 'square' = rounded square (directory cards and the profile header, 2026-11-17; uploads are cropped square). */ shape?: 'circle' | 'square'; /** Grey initials: a register-only entry with no profile. */ muted?: boolean }) {
  const round = shape === 'square' ? 'rounded-2xl' : 'rounded-full'
  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={photoUrl} alt="" width={size} height={size} data-testid="agent-photo" className={`shrink-0 ${round} object-cover`} style={{ width: size, height: size }} />
    )
  }
  return (
    <div
      aria-hidden
      className={`flex shrink-0 items-center justify-center ${round} font-bold ${muted ? 'text-[#6E6E8A]' : 'text-white'}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38), background: muted ? '#EEF1F5' : 'linear-gradient(135deg,#2563EB,#00ACE4)' }}
    >
      {initials(name)}
    </div>
  )
}
