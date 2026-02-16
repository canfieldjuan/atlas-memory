/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        atlas: {
          bg: '#0f172a',
          surface: '#1e293b',
          border: '#334155',
          primary: '#3b82f6',
          accent: '#8b5cf6',
          success: '#22c55e',
          warning: '#eab308',
          error: '#ef4444',
          text: '#f8fafc',
          muted: '#94a3b8',
        },
      },
    },
  },
  plugins: [],
};
