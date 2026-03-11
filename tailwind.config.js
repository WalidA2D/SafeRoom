/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        background: "#F2F4F6",
        surface: "#FFFFFF",
        primary: "#0D9488",
        primaryForeground: "#FFFFFF",
        muted: "#F1F5F9",
        mutedForeground: "#64748B",
        foreground: "#0F172A",
        border: "#E2E8F0",
      },
    },
  },
  plugins: [],
};
