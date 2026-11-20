import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const LIVE_TARGET = process.env.VITE_API_TARGET ?? "https://ayden-app-388558128884.asia-south1.run.app";

// `--mode preview` builds a static, hash-routed mock build that can be hosted anywhere.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === "preview" ? "./" : "/",
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: LIVE_TARGET,
        changeOrigin: true,
        secure: true,
        cookieDomainRewrite: "localhost",
        configure: (proxy) => {
          // Cloud Run sets Secure cookies; strip it so http://localhost accepts them in every browser.
          proxy.on("proxyRes", (res) => {
            const c = res.headers["set-cookie"];
            if (c) res.headers["set-cookie"] = c.map((x) => x.replace(/;\s*Secure/i, ""));
          });
        },
      },
    },
  },
  preview: {
    proxy: {
      "/api": {
        target: LIVE_TARGET,
        changeOrigin: true,
        secure: true,
        cookieDomainRewrite: "localhost",
        configure: (proxy) => {
          proxy.on("proxyRes", (res) => {
            const c = res.headers["set-cookie"];
            if (c) res.headers["set-cookie"] = c.map((x) => x.replace(/;\s*Secure/i, ""));
          });
        },
      },
    },
  },
  build: {
    outDir: mode === "preview" ? "dist-preview" : "dist",
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
}));
