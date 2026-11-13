import { defineConfig, type Plugin } from "vitest/config";
import react from "@vitejs/plugin-react";

/** Serves the room API from the dev server, so `npm run dev` is the whole app. Restart it after editing server/. */
function roomApi(): Plugin {
  return {
    name: "vc13-room-api",
    configureServer(server) {
      let api: Promise<import("./server/app").Api> | null = null;
      const load = () =>
        (api ??= server
          .ssrLoadModule("/server/app.ts")
          .then((m) => (m as typeof import("./server/app")).createApi({ trustProxy: false })));
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith("/api")) return next();
        load()
          .then((a) => a.handle(req, res))
          .then((handled) => {
            if (!handled) next();
          })
          .catch(next);
      });
      server.httpServer?.once("close", () => void api?.then((a) => a.close()));
    },
  };
}

export default defineConfig({
  plugins: [react(), roomApi()],
  base: "./",
  test: { include: ["tests/**/*.test.ts"] },
});
