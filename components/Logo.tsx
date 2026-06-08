import Link from 'next/link'

interface LogoProps {
  size?: 'sm' | 'md' | 'lg'
  href?: string
  withMark?: boolean
}

const sizeMap = {
  sm: 'text-[16px]',
  md: 'text-[18px]',
  lg: 'text-[22px]',
}

/**
 * Stayloop wordmark — "stay**loop**" with purple→blue gradient on "loop".
 * Used everywhere: public header, workspace rail, footer, etc.
 */
export default function Logo({ size = 'md', href = '/', withMark = false }: LogoProps) {
  const inner = (
    <span className={`sl-wordmark ${sizeMap[size]} select-none`}>
      {withMark && (
        <span
          aria-hidden
          className="mr-2 inline-flex h-7 w-7 items-center justify-center rounded-lg text-white"
          style={{
            background: 'linear-gradient(135deg, #047857 0%, #10B981 100%)',
            boxShadow: '0 4px 12px -4px rgba(4,120,87,0.5)',
          }}
        >
          <span className="font-extrabold leading-none">S</span>
        </span>
      )}
      <span>stay</span>
      <span className="accent">loop.AI</span>
    </span>
  )
  if (!href) return inner
  return (
    <Link href={href} className="inline-flex items-center" aria-label="Stayloop home">
      {inner}
    </Link>
  )
}
