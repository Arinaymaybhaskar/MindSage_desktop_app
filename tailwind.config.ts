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
  // line-clamp utilities are built into Tailwind v4 — no plugin needed.
  plugins: [],
};

export default config;
