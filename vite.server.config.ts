import { defineConfig } from "vite";

// Bundles the production server (server/index.ts and the engine it imports) into dist-server/index.js.
// It only uses Node built-ins, so the bundle runs without node_modules.
export default defineConfig({
  build: {
    ssr: "server/index.ts",
    outDir: "dist-server",
    emptyOutDir: true,
    target: "node22",
    rollupOptions: { output: { entryFileNames: "index.js" } },
  },
});
