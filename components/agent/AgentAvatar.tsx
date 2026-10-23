// The agent's photo when they uploaded one (agent-photos bucket, 2026-10-23); otherwise
// initials in the agent hat colour (lib/roleTheme.ts).
import { initials } from '@/lib/agentPublic'

export default function AgentAvatar({ name, size = 56, photoUrl = null }: { name: string; size?: number; photoUrl?: string | null }) {
  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={photoUrl} alt="" width={size} height={size} data-testid="agent-photo" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
    )
  }
  return (
    <div
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38), background: 'linear-gradient(135deg,#2563EB,#00ACE4)' }}
    >
      {initials(name)}
    </div>
  )
}
