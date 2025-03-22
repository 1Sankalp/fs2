/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontSize: {
        'xs': '0.75rem',     /* 12px */
        'sm': '0.875rem',    /* 14px */
        'base': '1rem',      /* 16px */
        'lg': '1.125rem',    /* 18px */
        'xl': '1.25rem',     /* 20px */
        '2xl': '1.5rem',     /* 24px */
        '3xl': '1.875rem',   /* 30px */
        '4xl': '2.25rem',    /* 36px */
        '5xl': '3rem',       /* 48px */
        '6xl': '4rem',       /* 64px */
      },
      spacing: {
        '0': '0px',
        '0.5': '0.125rem',   /* 2px */
        '1': '0.25rem',      /* 4px */
        '1.5': '0.375rem',   /* 6px */
        '2': '0.5rem',       /* 8px */
        '2.5': '0.625rem',   /* 10px */
        '3': '0.75rem',      /* 12px */
        '3.5': '0.875rem',   /* 14px */
        '4': '1rem',         /* 16px */
        '5': '1.25rem',      /* 20px */
        '6': '1.5rem',       /* 24px */
        '7': '1.75rem',      /* 28px */
        '8': '2rem',         /* 32px */
        '9': '2.25rem',      /* 36px */
        '10': '2.5rem',      /* 40px */
        '11': '2.75rem',     /* 44px */
        '12': '3rem',        /* 48px */
        '14': '3.5rem',      /* 56px */
        '16': '4rem',        /* 64px */
        '20': '5rem',        /* 80px */
        '24': '6rem',        /* 96px */
        '28': '7rem',        /* 112px */
        '32': '8rem',        /* 128px */
        '36': '9rem',        /* 144px */
        '40': '10rem',       /* 160px */
        '44': '11rem',       /* 176px */
        '48': '12rem',       /* 192px */
        '52': '13rem',       /* 208px */
        '56': '14rem',       /* 224px */
        '60': '15rem',       /* 240px */
        '64': '16rem',       /* 256px */
        '72': '18rem',       /* 288px */
        '80': '20rem',       /* 320px */
        '96': '24rem',       /* 384px */
      },
      colors: {
        primary: {
          50: '#f3f6ff',
          100: '#e9efff',
          200: '#d5dfff',
          300: '#b4c7ff',
          400: '#8da3ff',
          500: '#6674ff',
          600: '#4652f0',
          700: '#3a3dd1',
          800: '#3335aa',
          900: '#2e3285',
          950: '#1e1f53',
        },
        secondary: {
          50: '#f9fafb',
          100: '#f0f2f5',
          200: '#e2e7ed',
          300: '#d0d7e1',
          400: '#a5b2c4',
          500: '#7a8da8',
          600: '#5c6f8a',
          700: '#465770',
          800: '#3b4a5e',
          900: '#2d384a',
          950: '#1a202e',
        },
        success: {
          50: '#ecfdf6',
          100: '#d2f9e9',
          200: '#a7f2d7',
          300: '#6de7bf',
          400: '#33d3a1',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
          950: '#022c22',
        },
        warning: {
          50: '#fff8ed',
          100: '#ffeed3',
          200: '#fedaa5',
          300: '#fdc16d',
          400: '#fd9e36',
          500: '#fc7e15',
          600: '#f05e0a',
          700: '#d44009',
          800: '#ac310f',
          900: '#8d2a10',
          950: '#4c1305',
        },
        danger: {
          50: '#fff1f2',
          100: '#ffe1e3',
          200: '#ffc8cd',
          300: '#fea3aa',
          400: '#fd6c78',
          500: '#f43f51',
          600: '#e11d32',
          700: '#be102a',
          800: '#9f1328',
          900: '#851528',
          950: '#47060f',
        },
        dark: {
          100: '#f6f8fa',
          200: '#ebeff3',
          300: '#dde5eb',
          400: '#cfd8e3',
          500: '#a9bacf',
          600: '#8096b0',
          700: '#5d728f',
          800: '#465672',
          900: '#2c3a50',
          950: '#1a2234',
        },
        slate: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
          950: '#020617',
        },
        gray: {
          50: '#f9fafb',
          100: '#f3f4f6',
          200: '#e5e7eb',
          300: '#d1d5db',
          400: '#9ca3af',
          500: '#6b7280',
          600: '#4b5563',
          700: '#374151',
          800: '#1f2937',
          900: '#111827',
          950: '#030712',
        },
        red: {
          50: '#fef2f2',
          100: '#fee2e2',
          200: '#fecaca',
          300: '#fca5a5',
          400: '#f87171',
          500: '#ef4444',
          600: '#dc2626',
          700: '#b91c1c',
          800: '#991b1b',
          900: '#7f1d1d',
          950: '#450a0a',
        },
        emerald: {
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
          950: '#022c22',
        },
        amber: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
          950: '#451a03',
        },
        blue: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
          950: '#172554',
        },
        white: '#ffffff',
        black: '#000000',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        display: ['Inter', 'sans-serif'],
      },
      borderRadius: {
        'sm': '0.25rem',
        DEFAULT: '0.375rem',
        'md': '0.5rem',
        'lg': '0.75rem',
        'xl': '1rem',
        '2xl': '1.5rem',
        '3xl': '2rem',
        'full': '9999px',
      },
      boxShadow: {
        sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        DEFAULT: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        md: '0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -2px rgba(0, 0, 0, 0.03)',
        lg: '0 20px 25px -5px rgba(0, 0, 0, 0.08), 0 10px 10px -5px rgba(0, 0, 0, 0.03)',
        xl: '0 25px 50px -12px rgba(0, 0, 0, 0.15)',
        inner: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)',
        'primary-glow': '0 0 15px rgba(70, 82, 240, 0.5)',
        'success-glow': '0 0 15px rgba(5, 150, 105, 0.5)',
        none: 'none',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'gradient-primary': 'linear-gradient(to right, var(--tw-gradient-stops))',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'bounce-slow': 'bounce 3s infinite',
        'spin-slow': 'spin 3s linear infinite',
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
        'slide-in-right': 'slideInRight 0.3s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideInRight: {
          '0%': { transform: 'translateX(20px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
      },
      transitionProperty: {
        'height': 'height',
        'spacing': 'margin, padding',
      },
      backdropBlur: {
        xs: '2px',
      },
      maxWidth: {
        '8xl': '88rem',
        '9xl': '96rem',
      },
      zIndex: {
        '0': '0',
        '10': '10',
        '20': '20',
        '30': '30',
        '40': '40',
        '50': '50',
        'auto': 'auto',
      },
      opacity: {
        '0': '0',
        '5': '0.05',
        '10': '0.1',
        '20': '0.2',
        '30': '0.3',
        '40': '0.4',
        '50': '0.5',
        '60': '0.6',
        '70': '0.7',
        '80': '0.8',
        '90': '0.9',
        '95': '0.95',
        '100': '1',
      },
      minHeight: {
        '0': '0px',
        'full': '100%',
        'screen': '100vh',
      },
      minWidth: {
        '0': '0px',
        'full': '100%',
      },
    },
  },
  plugins: [],
} 