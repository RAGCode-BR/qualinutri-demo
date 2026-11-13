import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { demoTwins } from "./vite-plugins/demoTwins";

export default defineConfig({
  plugins: [demoTwins(), react()],
});
