/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  theme: {
    extend: {
      colors: {
        'custom-slate': {
          300: '#CBD5E1',
          400: '#94A3B8',
          500: '#64748B',
          600: '#475569',
          700: '#334155',
          800: '#1E293B',
          900: '#0F172A',
        },
        brand: {
          light: '#A5B4FC',
          DEFAULT: '#6366F1',
          dark: '#4F46E5',
          deep: '#3730A3',
          'indigo-900': '#312E81',
        },
        success: {
          DEFAULT: '#16A34A',
          emerald: '#10B981',
          teal: '#34D399',
          green: '#22C55E',
        },
        warning: '#CA8A04',
        danger: {
          DEFAULT: '#DC2626',
          light: '#F87171',
          dark: '#7F1D1D',
          vibrant: '#EF4444',
        },
        overlay: {
          'slate-800-50': 'rgba(30, 41, 59, 0.5)',
          'slate-900-50': 'rgba(15, 23, 42, 0.5)',
          'blue-30': 'rgba(59, 130, 246, 0.3)',
          'indigo-30': 'rgba(99, 102, 241, 0.3)',
          'red-dark-30': 'rgba(127, 29, 29, 0.3)',
        },
      },
    },
  },
  plugins: [],
};
