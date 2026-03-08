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
          DEFAULT: "#4F46E5",
          hover: "#4338CA",
          light: "#EEF2FF",
          muted: "#C7D2FE",
        },
        surface: {
          DEFAULT: "#FFFFFF",
          raised: "#FFFFFF",
          canvas: "#F9FAFB",
          muted: "#F3F4F6",
          sidebar: "#F9FAFB",
        },
        border: {
          DEFAULT: "#E5E7EB",
          light: "#F3F4F6",
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
    },
  },
  plugins: [],
};
