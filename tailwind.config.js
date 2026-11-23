/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        montserrat: ["Montserrat", "sans-serif"],
      },
      aspectRatio: {
        square: "1 / 1",
        "2/1": "2 / 1",
      },
    },
  },
  plugins: [],
};
