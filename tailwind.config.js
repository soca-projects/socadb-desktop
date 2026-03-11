/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Satoshi", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
      },
      colors: {
        accent: {
          DEFAULT: "#C74B68",
          hover: "#B34058",
          light: "#FDF2F5",
        },
        surface: {
          DEFAULT: "#FDFCFC",
          canvas: "#F9F8F8",
          muted: "#F4F2F3",
          sidebar: "#F9F8F8",
        },
        border: {
          DEFAULT: "#E8E5E6",
          light: "#F2F0F1",
        },
      },
      borderRadius: {
        DEFAULT: "8px",
        sm: "4px",
        lg: "12px",
        xl: "16px",
      },
      boxShadow: {
        soft: "0 1px 3px 0 rgba(0, 0, 0, 0.04), 0 1px 2px -1px rgba(0, 0, 0, 0.03)",
        card: "0 2px 8px 0 rgba(0, 0, 0, 0.06)",
        float: "0 4px 16px 0 rgba(0, 0, 0, 0.1)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in-subtle": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "node-appear": {
          from: { opacity: "0", transform: "scale(0.96)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.35s ease-out both",
        "fade-in-subtle": "fade-in-subtle 0.25s ease-out both",
        "node-appear": "node-appear 0.25s cubic-bezier(0.25, 1, 0.5, 1) both",
      },
    },
  },
  plugins: [],
};
