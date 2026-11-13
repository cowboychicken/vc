import { createServer } from "node:http";
import { createApi } from "./app";
import { createStatic } from "./static";

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";
const staticDir = process.env.STATIC_DIR ?? "dist";
const trustProxy = process.env.TRUST_PROXY === "true";

const api = createApi({ trustProxy });
const serveStatic = createStatic(staticDir);

const server = createServer((req, res) => {
  api
    .handle(req, res)
    .then((handled) => {
      if (!handled) serveStatic(req, res);
    })
    .catch((error) => {
      console.error("Unhandled error", error);
      if (!res.headersSent) res.writeHead(500, { "content-type": "text/plain" });
      res.end("Something went wrong.");
    });
});

// Stay above the idle timeout of any proxy in front (Cloudflare, Traefik) so it is never the one to hang up.
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

server.listen(port, host, () => {
  console.log(`VC_13 listening on http://${host}:${port} (static: ${staticDir}, trustProxy: ${trustProxy})`);
});

function shutdown(signal: string): void {
  console.log(`${signal} received, shutting down`);
  api.close();
  server.close(() => process.exit(0));
  server.closeIdleConnections();
  // Long polls hold connections open; give them a moment, then cut them.
  setTimeout(() => {
    server.closeAllConnections();
  }, 3_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
