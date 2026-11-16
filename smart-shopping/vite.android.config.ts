// Build of the web bundle that Capacitor packages into the Android app.
// Unlike the browser prototype (vite.config.ts) it has no simulated phone frame or keyboard.
import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const outDir = "dist/android";
// Only used by the browser prototype and the PWA; they would be dead weight in the APK.
const unusedInApp = ["assets/iphone", "assets/android", "assets/status", "sw.js", "manifest.webmanifest"];

function replaceOnce(html: string, pattern: string | RegExp, replacement: string) {
  const result = html.replace(pattern, replacement);
  if (result === html) throw new Error(`vite.android.config.ts: index.html no longer contains ${pattern}`);
  return result;
}

function androidApp(): Plugin {
  return {
    name: "android-app",
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        let result = replaceOnce(html, "/src/main.tsx", "/src/native/main.tsx");
        // The app is served from the APK, so a service-worker cache would only pin old versions.
        result = replaceOnce(result, /<script type="module">(?:(?!<\/script>)[\s\S])*serviceWorker[\s\S]*?<\/script>\s*/, "");
        result = replaceOnce(result, /<link rel="manifest"[^>]*>\s*/, "");
        return replaceOnce(result, "initial-scale=1.0", "initial-scale=1.0, viewport-fit=cover");
      },
    },
    async closeBundle() {
      await Promise.all(unusedInApp.map((path) => rm(`${outDir}/${path}`, { recursive: true, force: true })));
    },
  };
}

export default defineConfig({
  // Build number of this APK, set by the GitHub build; 0 marks a local build (see src/native/update.tsx).
  define: { __APP_VERSION_CODE__: JSON.stringify(Number(process.env.APP_VERSION_CODE ?? 0)) },
  build: { outDir, emptyOutDir: true },
  resolve: {
    alias: [{ find: /^\.\/mobile$/, replacement: fileURLToPath(new URL("./src/native/index.tsx", import.meta.url)) }],
  },
  plugins: [react(), androidApp()],
});
