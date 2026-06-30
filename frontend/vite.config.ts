import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri 推荐的 Vite 配置: 固定端口、不清屏、ESNext 构建目标。
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: {
    target: "esnext",
  },
});
