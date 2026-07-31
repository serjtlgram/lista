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
        bgDark: 'var(--color-bgDark)',
        cardDark: 'var(--color-cardDark)',
        cardBorder: 'var(--color-cardBorder)',
        accentViolet: 'rgb(var(--color-accentViolet) / <alpha-value>)',
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
