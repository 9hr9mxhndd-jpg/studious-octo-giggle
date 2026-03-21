/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Gowun Batang"', 'serif'],
        sans: ['Pretendard', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#edfdf4',
          100: '#d3f9e6',
          200: '#aaf0cf',
          300: '#74e2b0',
          400: '#3dcc8d',
          500: '#1DB954',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
        },
        warm: {
          50: '#faf9f6',
          100: '#f3f2ee',
          200: '#e8e5de',
          300: '#d4d0c8',
          400: '#a09d96',
          500: '#6b6860',
          600: '#4a4845',
          700: '#2e2d2b',
          800: '#1a1916',
          900: '#0d0c0b',
        },
      },
      boxShadow: {
        soft: '0 2px 12px rgba(26,25,22,0.08)',
        card: '0 1px 4px rgba(26,25,22,0.06)',
      },
    },
  },
  plugins: [],
};
