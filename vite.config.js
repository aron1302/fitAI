import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// The frontend lives in client/. In dev, Vite serves it on :5173 and proxies
// /api calls to the Express server on :3001. In prod, `npm run build` emits to
// dist/ which the Express server serves directly.
export default defineConfig({
  root: "client",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      // Static assets in client/public that aren't part of the module graph but
      // should be precached so the installed app shell works offline.
      includeAssets: ["icon.svg", "apple-touch-icon.png", "robots.txt"],
      manifest: {
        name: "FitAI — AI Fitness Coach",
        short_name: "FitAI",
        description:
          "AI-powered workout & diet plans, cardio, flexibility, recovery, and a coach that knows your recovery state.",
        theme_color: "#0b0f17",
        background_color: "#0b0f17",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        categories: ["health", "fitness", "lifestyle"],
        icons: [
          { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          {
            src: "icons/maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // Precache the built app shell + static assets.
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff,woff2}"],
        // SPA fallback for client-side routes — but never for the API, so
        // authenticated/user-specific responses are always fetched fresh and
        // are never served from a shared service-worker cache.
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
      },
      // Keep the SW off during `npm run dev` to avoid caching surprises while
      // iterating; it's active in the production build.
      devOptions: { enabled: false },
    }),
  ],
  server: {
    port: 5173,
    // Always use the same port. Without this, Vite silently falls back to
    // 5174/5175/... when 5173 is busy, and since localStorage is scoped per
    // origin (host:port), the app would appear to "forget" saved plans.
    strictPort: true,
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
});
