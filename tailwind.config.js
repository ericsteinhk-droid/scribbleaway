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
          50: '#f0f4ff',
          100: '#e0eaff',
          200: '#c7d7fe',
          300: '#a4bbfd',
          400: '#8196fa',
          500: '#6172f3',
          600: '#4a52e8',
          700: '#3b40d1',
          800: '#3336a9',
          900: '#2f3285',
        },
      },
    },
  },
  plugins: [],
}

