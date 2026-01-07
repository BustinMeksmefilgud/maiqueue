import daisyui from "daisyui"

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      keyframes: {
        'bounce-x': {
          '0%, 100%': { transform: 'translateX(0)' },
          '50%': { transform: 'translateX(8px)' },
        }
      },
      animation: {
        'bounce-x': 'bounce-x 0.5s infinite',
      },
      display: ["group-hover"],
    },
  },
  plugins: [daisyui],
  daisyui: {
    themes: ["light", "dark", "retro", "cyberpunk"],
  },
}

