
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        crypto: {
          dark: '#0B0E11',
          panel: '#161A1E',
          accent: '#2962FF',
          up: '#00C087',
          down: '#F23645',
          text: '#EAECEF',
          muted: '#848E9C'
        }
      }
    },
  },
  plugins: [],
}
