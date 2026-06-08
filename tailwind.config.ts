import type { Config } from 'tailwindcss'

// Stayloop V5 design tokens — sourced from the V5 Hi-Fi UI system
const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Surfaces — warm cream
        surface: {
          DEFAULT: '#F2EEE5',
          card: '#FFFFFF',
          muted: '#EAE5D9',
          tint: '#E8F0E8',
          wash: '#E4EEE3',
          nav: '#FAF7EE',
          chip: '#F8F5EC',
        },
        ink: {
          DEFAULT: '#0B0B0E',
          2: '#16161B',
          3: '#1B1B22',
        },
        // Borders
        line: {
          DEFAULT: '#D8D2C2',
          strong: '#C5BDAA',
          divider: '#E0DACE',
        },
        // Text
        body: {
          DEFAULT: '#171717',
          2: '#3F3F46',
          3: '#71717A',
          4: '#A1A1AA',
        },
        // Brand — dark emerald (cream-safe)
        brand: {
          DEFAULT: '#047857',
          strong: '#065F46',
          bright: '#10B981',
          'bright-2': '#34D399',
          wash: '#E4EEE3',
        },
        // Roles
        tenant: {
          DEFAULT: '#7C3AED',
          soft: '#C4B5FD',
          deep: '#5B21B6',
        },
        landlord: {
          DEFAULT: '#047857',
          soft: '#6EE7B7',
          deep: '#064E3B',
        },
        agent: {
          DEFAULT: '#2563EB',
          soft: '#93C5FD',
          deep: '#1E3A8A',
        },
        // Status
        success: '#16A34A',
        warning: '#D97706',
        danger: '#DC2626',
        info: '#2563EB',
        trust: '#7C3AED',
      },
      fontFamily: {
        sans: ['"Inter Tight"', '"Noto Sans SC"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        sm: '4px',
        md: '6px',
        lg: '8px',
        xl: '12px',
        '2xl': '14px',
        '3xl': '18px',
      },
      boxShadow: {
        sm: '0 1px 2px rgba(0,0,0,0.04)',
        md: '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)',
        lg: '0 4px 8px rgba(0,0,0,0.06), 0 12px 32px rgba(0,0,0,0.06)',
        card: '0 1px 3px rgba(31,25,11,0.04), 0 12px 32px -8px rgba(31,25,11,0.06)',
        'cta-mint': '0 8px 22px -10px rgba(52,211,153,0.45), 0 1px 0 rgba(255,255,255,0.30) inset',
      },
      maxWidth: {
        narrow: '720px',
        page: '1100px',
        wide: '1260px',
      },
      letterSpacing: {
        tightest: '-0.035em',
        eyebrow: '0.10em',
        eyebrowLg: '0.14em',
      },
      keyframes: {
        'orb-pulse': {
          '0%': { transform: 'scale(1)', opacity: '0.3' },
          '100%': { transform: 'scale(1.3)', opacity: '0' },
        },
        blink: {
          '0%,100%': { opacity: '1' },
          '50%': { opacity: '0.3' },
        },
      },
      animation: {
        'orb-pulse': 'pulse 2s ease-out infinite',
        'live-blink': 'blink 1.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}

export default config
