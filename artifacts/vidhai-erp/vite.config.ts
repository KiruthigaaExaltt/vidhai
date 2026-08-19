import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(async ({ mode }) => {
const env = { ...loadEnv(mode, import.meta.dirname, ""), ...process.env };
const rawPort = env.PORT;

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = env.BASE_PATH;

if (!basePath) {
  throw new Error(
    "BASE_PATH environment variable is required but was not provided.",
  );
}

return {
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    ...(env.REPL_ID !== undefined ? [runtimeErrorOverlay()] : []),
    VitePWA({
      strategies: "injectManifest", srcDir: "src", filename: "sw.ts",
      injectRegister: false, registerType: "prompt",
      includeAssets: ["favicon.png", "apple-touch-icon.png"],
      injectManifest: { globPatterns: ["**/*.{html,js,css,svg,png,webp,woff2,jpg}"], globIgnores: ["**/opengraph.jpg"], maximumFileSizeToCacheInBytes: 5 * 1024 * 1024 },
      // Web Push requires an active service worker. Keep the same
      // inject-manifest worker available on localhost so external notification
      // subscriptions can be tested in development as well as production.
      devOptions: { enabled: true, type: "module" },
      manifest: {
        name: "Vidhai ERP Production Control Center", short_name: "Vidhai ERP",
        description: "Multi-site production control for Nilgiri Farm Produce.",
        start_url: basePath, scope: basePath, display: "standalone", orientation: "any", lang: "en-IN",
        theme_color: "#20BFAF", background_color: "#EAF9F7",
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          { src: "pwa-maskable-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
    ...(env.NODE_ENV !== "production" &&
    env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    proxy: {
      "/api": {
        target: env.API_PROXY_TARGET || "http://127.0.0.1:5000",
        changeOrigin: true,
        ws: true,
      },
    },
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
};
});
