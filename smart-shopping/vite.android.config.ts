// Build of the app as it runs on a real device: the web bundle that Capacitor packages into the
// Android app (dist/android) and, with --outDir dist/web, the site deployed to Vercel.
// Unlike the browser prototype (vite.config.ts) it has no simulated phone frame or keyboard.
import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// Only used by the browser prototype and the PWA; they would be dead weight here.
const unusedInApp = ["assets/iphone", "assets/android", "assets/status", "sw.js", "manifest.webmanifest"];

function replaceOnce(html: string, pattern: string | RegExp, replacement: string) {
  const result = html.replace(pattern, replacement);
  if (result === html) throw new Error(`vite.android.config.ts: index.html no longer contains ${pattern}`);
  return result;
}

function androidApp(): Plugin {
  let outDir = "";
  return {
    name: "android-app",
    configResolved(config) {
      outDir = config.build.outDir;
    },
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        let result = replaceOnce(html, "/src/main.tsx", "/src/native/main.tsx");
        // The cache-first service worker of the prototype would pin old versions of the app.
        result = replaceOnce(result, /<script type="module">(?:(?!<\/script>)[\s\S])*serviceWorker[\s\S]*?<\/script>\s*/, "");
        result = replaceOnce(result, /<link rel="manifest"[^>]*>\s*/, "");
        return replaceOnce(result, "initial-scale=1.0", "initial-scale=1.0, viewport-fit=cover");
      },
    },
    async closeBundle() {
      // The Android app link file (.well-known) only matters on the site.
      const unused = outDir.endsWith("android") ? [...unusedInApp, ".well-known"] : unusedInApp;
      await Promise.all(unused.map((path) => rm(`${outDir}/${path}`, { recursive: true, force: true })));
    },
  };
}

export default defineConfig({
  // Build number of this APK, set by the GitHub build; 0 marks a local build (see src/native/update.tsx).
  define: { __APP_VERSION_CODE__: JSON.stringify(Number(process.env.APP_VERSION_CODE ?? 0)) },
  build: { outDir: "dist/android", emptyOutDir: true },
  resolve: {
    // "./mobile" from src/, "../mobile" and "../../mobile" from src/app/.
    alias: [{ find: /^(?:\.\/|(?:\.\.\/)+)mobile$/, replacement: fileURLToPath(new URL("./src/native/index.tsx", import.meta.url)) }],
  },
  plugins: [react(), androidApp()],
});
