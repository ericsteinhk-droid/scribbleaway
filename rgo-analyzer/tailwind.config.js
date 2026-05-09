/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'bg-primary': '#0b0f1a',
        'bg-secondary': '#131929',
        'bg-card': '#1a2235',
        'border-dark': '#1e2d45',
        'text-primary': '#e2e8f0',
        'text-muted': '#64748b',
        amber: '#f59e0b',
        purple: '#a78bfa',
        blue: '#38bdf8',
        red: '#f87171',
        green: '#4ade80',
        gray: '#475569',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}
