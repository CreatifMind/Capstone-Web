import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        purity: {
          green: "#00f08a",
          teal: "#00d6d6",
          ink: "#020807"
        }
      }
    }
  },
  plugins: []
};

export default config;
