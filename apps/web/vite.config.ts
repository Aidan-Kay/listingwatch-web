import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Our own service worker: it handles push messages as well as caching the app shell.
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      injectRegister: false,
      registerType: "prompt",
      manifest: {
        name: "ListingWatch",
        short_name: "ListingWatch",
        description: "Watches eBay and Vinted searches and tells you about new listings",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#0b0d14",
        theme_color: "#0b0d14",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      injectManifest: { globPatterns: ["**/*.{js,css,html,png,svg,woff2}"] },
    }),
  ],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  server: {
    port: 5173,
    // The API server from `npm run dev:server`.
    proxy: { "/api": { target: "http://127.0.0.1:8095" } },
  },
});
