/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bgDark: '#0B0D14',
        cardDark: '#161922',
        cardBorder: '#232734',
        accentViolet: '#6C5CE7',
        accentTeal: '#00CEC9',
        accentAmber: '#FDCB6E',
        accentBlue: '#0984E3',
        accentPink: '#E84393',
        accentGreen: '#00B894'
      }
    },
  },
  plugins: [],
}
