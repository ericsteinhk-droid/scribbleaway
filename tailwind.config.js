/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        primary: {
          50: '#e6f7f6',
          100: '#ccefed',
          200: '#99dfdb',
          300: '#66cfc9',
          400: '#33bfb7',
          500: '#00a99e',
          600: '#008780',
          700: '#006560',
          800: '#004440',
          900: '#002220',
        },
      },
    },
  },
  plugins: [],
}

