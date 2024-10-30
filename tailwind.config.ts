import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{html,js,svelte,ts}"],
  darkMode: "class",
  plugins: [require("daisyui")],
  daisyui: {
    themes: ["dark"]
  }
} as Config;
