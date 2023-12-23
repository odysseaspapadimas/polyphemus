import { type Config } from "tailwindcss";
import { fontFamily } from "tailwindcss/defaultTheme";

export default {
  content: ["./src/**/*.tsx"],
  theme: {
    extend: {
      colors: {
        primary: "#1971C2",
        "primary-hover": "#1864AB",
        dark: "hsl(222,14%,18%)",
        "dark-hover": "rgb(56, 58, 64)",
        "dark-bg-hover": "hsl(222,14%,18%)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", ...fontFamily.sans],
      },
      height: {
        "screen-header": "calc(100vh - 71px)",
        "screen-messages-mobile": "calc(100vh - 71px - 68px - 58px)",
      },
    },
  },
  plugins: [],
} satisfies Config;
