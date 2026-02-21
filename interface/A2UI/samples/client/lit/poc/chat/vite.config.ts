import { config } from "dotenv";
import { UserConfig } from "vite";
import { a2uiLLMPlugin } from "./src/llm-plugin.js";

config();

export default {
  plugins: [a2uiLLMPlugin()],
  build: {
    target: "esnext",
  },
  resolve: {
    dedupe: ["lit"],
  },
} satisfies UserConfig;
