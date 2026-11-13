import { createReadStream, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join, resolve, sep } from "node:path";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

function fileStats(path: string) {
  try {
    const stats = statSync(path);
    return stats.isFile() ? stats : null;
  } catch {
    return null;
  }
}

function plain(res: ServerResponse, status: number, text: string): void {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
  res.end(text);
}

/**
 * Serves the built app from `root`. Anything that isn't a file and has no extension gets index.html,
 * so the app can be opened from any address.
 */
export function createStatic(root: string): (req: IncomingMessage, res: ServerResponse) => void {
  const base = resolve(root);

  return (req, res) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.setHeader("allow", "GET, HEAD");
      return plain(res, 405, "Method not allowed");
    }

    let pathname: string;
    try {
      pathname = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
    } catch {
      return plain(res, 400, "Bad request");
    }
    if (pathname.includes("\0")) return plain(res, 400, "Bad request");

    const requested = resolve(join(base, pathname));
    // Never serve anything outside the build folder.
    if (requested !== base && !requested.startsWith(base + sep)) return plain(res, 403, "Forbidden");

    let file = requested;
    let stats = fileStats(file);
    if (!stats) {
      if (extname(pathname) !== "") return plain(res, 404, "Not found");
      file = join(base, "index.html");
      stats = fileStats(file);
      if (!stats) return plain(res, 404, "Not found");
    }

    const isIndex = file === join(base, "index.html");
    const hashed = pathname.startsWith("/assets/");
    res.writeHead(200, {
      "content-type": TYPES[extname(file).toLowerCase()] ?? "application/octet-stream",
      "content-length": stats.size,
      "cache-control": hashed ? "public, max-age=31536000, immutable" : isIndex ? "no-cache" : "public, max-age=3600",
      "x-content-type-options": "nosniff",
    });
    if (req.method === "HEAD") return void res.end();
    createReadStream(file).on("error", () => res.destroy()).pipe(res);
  };
}
