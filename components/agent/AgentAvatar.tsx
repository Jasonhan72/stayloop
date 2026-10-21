// Initials in the agent hat colour (lib/roleTheme.ts). Photos come later.
import { initials } from '@/lib/agentPublic'

export default function AgentAvatar({ name, size = 56 }: { name: string; size?: number }) {
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
