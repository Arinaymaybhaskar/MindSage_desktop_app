import lineClamp from '@tailwindcss/line-clamp';

/** @type {import('tailwindcss').Config} */
const config = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class', // Use 'media' for automatic system theme, or 'class' for manual
  theme: {
    extend: {
      colors: {
        mindsage: {
          // Light theme colors
          light1: "#ADB2D4",
          light2: "#C7D9DD",
          light3: "#D5E5D5",
          light4: "#EEF1DA",

          // Dark theme colors
          dark1: "#35374B",
          dark2: "#344955",
          dark3: "#50727B",
          dark4: "#78A083",
        }
      }
    },
  },
  plugins: [lineClamp],
}

export default config;
