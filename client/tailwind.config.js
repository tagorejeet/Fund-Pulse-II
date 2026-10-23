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
        snazzy: {
          navy: '#061C41',
          'navy-dark': '#04122B',
          'navy-light': '#0D2B60',
          'navy-subtle': '#132E62',
          burgundy: '#891228',
          'burgundy-hover': '#700E20',
          'burgundy-light': '#FAF0F2',
          gold: '#CD9B30',
          'gold-light': '#E0AD3B',
          'gold-dark': '#B08323',
          cream: '#FAF7EF',
        },
        brand: {
          50: '#f0f5ff',
          100: '#e5edff',
          200: '#c7d7fe',
          300: '#9cb7fd',
          400: '#688efa',
          500: '#061C41', // Snazzy Navy
          600: '#051737',
          700: '#04122B',
          800: '#030D1F',
          900: '#020712',
        },
        gold: {
          50: '#fbf8f0',
          100: '#f6eed9',
          200: '#eedcb3',
          300: '#e3c584',
          400: '#d7ab56',
          500: '#CD9B30', // Snazzy Gold
          600: '#b78326',
          700: '#946420',
          800: '#795020',
          900: '#65421d',
        },
        slate: {
          850: '#151e2e',
          950: '#0b0f19',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        serif: ['"Source Serif 4"', '"Source Serif Pro"', 'Georgia', 'serif'],
        mono: ['JetBrains Mono', 'monospace'],
      }
    },
  },
  plugins: [],
}
