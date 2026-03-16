/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        display: ['Rajdhani', 'sans-serif'],
        mono: ['IBM Plex Mono', 'monospace'],
        body: ['Inter', 'sans-serif'],
      },
      colors: {
        accent: '#00d4ff',
        gold: '#f5c842',
        surface: '#0d1520',
        raised: '#132030',
      },
      animation: {
        'spin-slow': 'spin 3s linear infinite',
      },
    },
  },
  plugins: [],
}
