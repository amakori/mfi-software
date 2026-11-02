/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        airtel: '#E11900',
        'airtel-dark': '#B31400',
      }
    },
  },
  plugins: [],
}
