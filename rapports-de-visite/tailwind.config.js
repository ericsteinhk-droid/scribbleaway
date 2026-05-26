/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        evoq: {
          DEFAULT: '#00a99e',
          dark: '#008f86',
          light: '#e6f7f6',
        },
      },
      keyframes: {
        pulse2: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
      },
      animation: {
        pulse2: 'pulse2 1.5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
