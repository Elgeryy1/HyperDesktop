import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        page: "var(--background)",
        surface: "var(--surface)",
        panel: "var(--panel)",
        accent: "var(--accent)",
        "accent-light": "var(--accent-light)",
        danger: "var(--danger)",
        muted: "var(--text-muted)",
        border: "var(--border)",
        success: "var(--success)",
        warning: "var(--warning)",
        info: "var(--info)"
      },
      fontFamily: {
        sans: ["Geist", "Inter", "Montserrat Variable", "Montserrat", "ui-sans-serif", "system-ui"]
      },
      animation: {
        "fade-in": "fade-in 0.4s ease-out forwards",
        "pulse-soft": "pulse-soft 2s ease-in-out infinite"
      }
    }
  },
  plugins: []
};

export default config;
