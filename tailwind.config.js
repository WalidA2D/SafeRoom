/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        background: "#F3F9D2",
        surface: "#FFFFFF",
        primary: "#92B4A7",
        primaryForeground: "#1F2937",
        muted: "#BDC4A7",
        mutedForeground: "#2F2F2F",
        foreground: "#2F2F2F",
        border: "#D1D5DB",
      },
    },
  },
  plugins: [],
};
