/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          50: "#f0f5ff",
          100: "#e0ebff",
          200: "#c2d6ff",
          300: "#94b5ff",
          400: "#6090ff",
          500: "#3b6cff",
          600: "#2553ea",
          700: "#1c41c9",
          800: "#1a369e",
          900: "#1a307d",
          950: "#131f4d",
        },
        surface: {
          DEFAULT: "#ffffff",
          secondary: "#f8f9fb",
          tertiary: "#f1f3f5",
        },
        border: {
          DEFAULT: "#e2e5ea",
          light: "#eef0f3",
          heavy: "#cdd1d8",
        },
        muted: {
          DEFAULT: "#6b7280",
          foreground: "#9ca3af",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      borderRadius: {
        xl: "0.75rem",
        "2xl": "1rem",
      },
      boxShadow: {
        card: "0 1px 3px 0 rgba(0,0,0,.04), 0 1px 2px -1px rgba(0,0,0,.04)",
        "card-hover":
          "0 4px 6px -1px rgba(0,0,0,.06), 0 2px 4px -2px rgba(0,0,0,.04)",
        modal:
          "0 20px 25px -5px rgba(0,0,0,.08), 0 8px 10px -6px rgba(0,0,0,.04)",
      },
    },
  },
  plugins: [],
};
