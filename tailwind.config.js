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
          DEFAULT: "rgb(var(--color-accent) / <alpha-value>)",
          hover: "var(--color-accent-hover)",
          light: "var(--color-accent-light)",
        },
        surface: {
          DEFAULT: "var(--color-surface)",
          canvas: "var(--color-surface-canvas)",
          muted: "rgb(var(--color-surface-muted) / <alpha-value>)",
          sidebar: "var(--color-surface-sidebar)",
        },
        border: {
          DEFAULT: "var(--color-border)",
          light: "var(--color-border-light)",
          hover: "var(--color-border-hover)",
        },
        badge: {
          primary: {
            DEFAULT: "var(--color-badge-primary-text)",
            bg: "var(--color-badge-primary-bg)",
            border: "var(--color-badge-primary-border)",
          },
          unique: {
            DEFAULT: "var(--color-badge-unique-text)",
            bg: "var(--color-badge-unique-bg)",
            border: "var(--color-badge-unique-border)",
          },
        },
      },
      textColor: {
        primary: "var(--color-fg)",
        secondary: "var(--color-fg-secondary)",
        tertiary: "var(--color-fg-tertiary)",
        muted: "var(--color-fg-muted)",
      },
      borderRadius: {
        DEFAULT: "8px",
        sm: "4px",
        lg: "12px",
        xl: "16px",
      },
      boxShadow: {
        soft: "var(--shadow-soft)",
        card: "var(--shadow-card)",
        float: "var(--shadow-float)",
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
