# Integrating the web app with the API

Live API (scripted mode until the model key is added): `https://ayden-app-388558128884.asia-south1.run.app/api/v1`

Same-origin in production: the container serves `apps/web/dist` and `/api/v1`. For local development use a Vite proxy so cookies work:

```ts
// apps/web/vite.config.ts
import { defineConfig } from "vite";
export default defineConfig({
  server: {
    proxy: {
      "/api": {
        target: process.env.VITE_API_TARGET ?? "http://localhost:8080",
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
});
```

Run against the deployed API: `VITE_API_TARGET=https://ayden-app-388558128884.asia-south1.run.app npm run dev`.

Behaviour notes (v0.1):
- `POST /missions/:id/act` waits for agent replies (up to ~25 s) and always returns `pending: false`. Polling `GET /missions/:id/events?since=` still works.
- `mode` is `scripted` until the model key is configured; show the fallback banner when `runtime.mode !== "live"`.
- `POST /missions/:id/act {kind:"finish"}` returns the usual response plus `reportId`.
- The `data-analyst` role has `status: "planned"`; `POST /missions` for it returns `not_found`.
