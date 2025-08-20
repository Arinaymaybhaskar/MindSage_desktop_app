import lineClamp from "@tailwindcss/line-clamp";

/** @type {import('tailwindcss').Config} */
const config = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class", // Use 'media' for automatic system theme, or 'class' for manual
  theme: {
    extend: {
      fontFamily: {
        fraunces: ["Fraunces", "serif"],
      },
    },
  },
  plugins: [lineClamp],
};

export default config;
