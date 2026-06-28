import type { Config } from 'tailwindcss';
import defaultTheme from 'tailwindcss/defaultTheme';

const config: Config = {
  darkMode: ['class'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', ...defaultTheme.fontFamily.sans],
        mono: ['var(--font-mono)', ...defaultTheme.fontFamily.mono],
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        /* ---- Sync design tokens (raw brand hexes via CSS vars) ---- */
        canvas: 'hsl(var(--canvas))',
        ink: 'var(--ink)',
        faint: 'var(--gray-400)',
        brand: {
          50: 'var(--indigo-50)',
          100: 'var(--indigo-100)',
          150: 'var(--indigo-150)',
          200: 'var(--indigo-200)',
          400: 'var(--indigo-400)',
          500: 'var(--indigo-500)',
          600: 'var(--indigo-600)',
          700: 'var(--indigo-700)',
        },
        success: {
          DEFAULT: 'var(--success-500)',
          dot: 'var(--success-dot)',
          text: 'var(--success-text)',
          text2: 'var(--success-text-2)',
          bg: 'var(--success-bg)',
          bg2: 'var(--success-bg-2)',
          border: 'var(--success-border)',
        },
        warning: {
          DEFAULT: 'var(--warning-500)',
          dot: 'var(--warning-dot)',
          text: 'var(--warning-text)',
          bg: 'var(--warning-bg)',
          bg2: 'var(--warning-bg-2)',
          border: 'var(--warning-border)',
        },
        danger: {
          DEFAULT: 'var(--danger-500)',
          ink: 'var(--danger-ink)',
          text: 'var(--danger-text)',
          bg: 'var(--danger-bg)',
          bg2: 'var(--danger-bg-2)',
          border: 'var(--danger-border)',
        },
        code: {
          bg: 'var(--code-bg)',
          fg: 'var(--code-fg)',
          chip: 'var(--code-chip)',
          border: 'var(--code-border)',
        },
      },
      backgroundImage: {
        'primary-gradient': 'var(--primary-gradient)',
        'primary-gradient-logo': 'var(--primary-gradient-logo)',
        media: 'var(--media-fill)',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        frame: 'var(--shadow-frame)',
        dialog: 'var(--shadow-dialog)',
        widget: 'var(--shadow-widget)',
        primary: 'var(--shadow-primary)',
        step: 'var(--shadow-step)',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        /* design radius ramp */
        xl: 'var(--radius-xl)',
        '2xl': 'var(--radius-2xl)',
        control: 'var(--radius-sm)',
        tile: 'var(--radius-md)',
        list: 'var(--radius-lg)',
        card: 'var(--radius-xl)',
        dialog: 'var(--radius-2xl)',
        pill: 'var(--radius-pill)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  plugins: [require('tailwindcss-animate')],
};

export default config;
