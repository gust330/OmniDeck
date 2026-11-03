/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Text', 'SF Pro Display', 'Inter', 'sans-serif'],
        mono: ['SF Mono', 'Fira Code', 'JetBrains Mono', 'Menlo', 'monospace'],
      },
      colors: {
        apple: {
          blue: '#0A84FF',
          mint: '#30D158',
          amber: '#FF9F0A',
          purple: '#BF5AF2',
          red: '#FF453A',
          teal: '#64D2FF',
        },
        glass: {
          base: 'rgba(24, 28, 42, 0.62)',
          vibrant: 'rgba(36, 42, 64, 0.72)',
          subtle: 'rgba(18, 22, 34, 0.45)',
        },
        canvas: '#07090E',
      },
      boxShadow: {
        'ios-glass': '0 12px 36px 0 rgba(0, 0, 0, 0.45), 0 0 0 0.5px rgba(255, 255, 255, 0.14) inset',
        'ios-island': '0 8px 30px rgba(0, 0, 0, 0.6), 0 0 0 0.75px rgba(255, 255, 255, 0.16) inset',
        'ios-glow': '0 0 20px rgba(10, 132, 255, 0.45), 0 0 0 1px rgba(10, 132, 255, 0.8) inset',
        'ios-dock': '0 20px 48px -6px rgba(0, 0, 0, 0.7), 0 0 0 0.5px rgba(255, 255, 255, 0.18) inset, 0 1px 2px rgba(255, 255, 255, 0.1) inset',
      },
      borderRadius: {
        'squircle': '26px',
        'squircle-sm': '18px',
        'squircle-xs': '13px',
      },
    },
  },
  plugins: [],
};
