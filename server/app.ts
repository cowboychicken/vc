import type { IncomingMessage, ServerResponse } from "node:http";
import {
  type ErrorBody,
  type ErrorCode,
  type JoinResponse,
  PROTOCOL_VERSION,
  VERSION_HEADER,
  normalizeRoomCode,
  parseBotLevel,
  parseMove,
  parseProfile,
  parseRules,
  parseSince,
} from "../src/net/protocol";
import { RateLimiter } from "./limits";
import { RoomError, RoomManager } from "./rooms";

export interface ApiOptions {
  manager?: RoomManager;
  /** Trust Cloudflare / proxy headers for the client's address. Only safe behind such a proxy. */
  trustProxy?: boolean;
  /** Longest a long poll waits, in milliseconds. Keep it under any proxy's idle timeout. */
  maxWaitMs?: number;
  /** How often to run housekeeping. 0 turns the timer off (tests call `manager.sweep()` themselves). */
  sweepMs?: number;
  /** Rooms one address may create in 10 minutes. */
  createLimit?: number;
  now?: () => number;
}

export interface Api {
  /** Handles `/api/*` requests. Returns false, without touching the response, for anything else. */
  handle: (req: IncomingMessage, res: ServerResponse) => Promise<boolean>;
  manager: RoomManager;
  close: () => void;
}

const MAX_BODY_BYTES = 4096;

class HttpError extends RoomError {}

function send(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(text),
    "cache-control": "no-store",
  });
  res.end(text);
}

function sendError(res: ServerResponse, status: number, error: ErrorCode, message: string): void {
  const body: ErrorBody = { error, message };
  send(res, status, body);
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) {
      req.resume();
      throw new HttpError(413, "too_large", "That request is too big.");
    }
    chunks.push(chunk as Buffer);
  }
  if (size === 0) return {};
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    // fall through
  }
  throw new HttpError(400, "bad_request", "That request isn't valid JSON.");
}

function bearer(req: IncomingMessage): string {
  const header = req.headers.authorization ?? "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

export function createApi(options: ApiOptions = {}): Api {
  const now = options.now ?? Date.now;
  const manager = options.manager ?? new RoomManager({ now });
  const maxWaitMs = options.maxWaitMs ?? 25_000;
  const creates = new RateLimiter(options.createLimit ?? 20, 10 * 60_000, now);
  const sweepMs = options.sweepMs ?? 5_000;
  const timer =
    sweepMs > 0
      ? setInterval(() => {
          manager.sweep();
          creates.prune();
        }, sweepMs)
      : null;
  timer?.unref();

  const clientAddress = (req: IncomingMessage): string => {
    if (options.trustProxy) {
      const cf = req.headers["cf-connecting-ip"];
      if (typeof cf === "string" && cf) return cf;
      const forwarded = req.headers["x-forwarded-for"];
      if (typeof forwarded === "string" && forwarded) return forwarded.split(",")[0]!.trim();
    }
    return req.socket.remoteAddress ?? "unknown";
  };

  const routeRoom = async (
    req: IncomingMessage,
    res: ServerResponse,
    code: string,
    action: string,
    query: URLSearchParams,
  ): Promise<void> => {
    const token = bearer(req);
    const method = req.method ?? "GET";

    if (action === "" && method === "GET") {
      const info = manager.peek(code);
      if (!info) throw new RoomError(404, "not_found", "That room doesn't exist any more.");
      return send(res, 200, info);
    }

    if (action === "updates" && method === "GET") {
      const since = parseSince(Number(query.get("since") ?? -1));
      const rev = Number(query.get("rev") ?? -1);
      const wait = Math.min(Math.max(Number(query.get("wait") ?? 0) * 1000 || 0, 0), maxWaitMs);
      manager.seen(code, token);
      if (wait > 0 && !manager.hasNews(code, token, since, rev)) {
        await new Promise<void>((resolve) => {
          let finished = false;
          const done = () => {
            if (finished) return;
            finished = true;
            clearTimeout(timeout);
            unsubscribe();
            res.off("close", done);
            resolve();
          };
          const unsubscribe = manager.subscribe(code, done);
          const timeout = setTimeout(done, wait);
          res.on("close", done);
        });
        if (res.destroyed) return;
      }
      return send(res, 200, manager.update(code, token, since));
    }

    if (method !== "POST") throw new RoomError(404, "not_found", "Not found.");
    const body = await readJson(req);
    const since = parseSince(body.since);

    switch (action) {
      case "join": {
        const profile = parseProfile(body);
        if (!profile) throw new RoomError(400, "bad_request", "Pick a name and a colour.");
        const { token: seatToken } = manager.join(code, profile, typeof body.token === "string" ? body.token : undefined);
        const joined: JoinResponse = { ...manager.update(code, seatToken, since), token: seatToken };
        return send(res, 200, joined);
      }
      case "move": {
        const move = parseMove(body.move);
        if (!move) throw new RoomError(400, "bad_request", "That isn't a move.");
        manager.move(code, token, move);
        break;
      }
      case "start": {
        manager.start(code, token, typeof body.dealCode === "string" ? body.dealCode : undefined);
        break;
      }
      case "settings": {
        const rules = body.rules === undefined ? undefined : parseRules(body.rules);
        const botLevel = body.botLevel === undefined ? undefined : parseBotLevel(body.botLevel);
        if (rules === null || botLevel === null) throw new RoomError(400, "bad_request", "Those settings aren't valid.");
        manager.setSettings(code, token, { rules, botLevel });
        break;
      }
      case "profile": {
        const profile = parseProfile(body);
        if (!profile) throw new RoomError(400, "bad_request", "Pick a name and a colour.");
        manager.setProfile(code, token, profile);
        break;
      }
      case "leave": {
        manager.leave(code, token);
        return send(res, 200, { ok: true });
      }
      default:
        throw new RoomError(404, "not_found", "Not found.");
    }
    return send(res, 200, manager.update(code, token, since));
  };

  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname !== "/api" && !url.pathname.startsWith("/api/")) return false;
    try {
      const parts = url.pathname.split("/").filter(Boolean).slice(1); // after "api"
      if (parts[0] === "health") {
        send(res, 200, { ok: true, rooms: manager.roomCount });
        return true;
      }
      if (parts[0] !== "rooms") throw new RoomError(404, "not_found", "Not found.");
      if (req.headers[VERSION_HEADER] !== String(PROTOCOL_VERSION)) {
        throw new RoomError(426, "outdated", "VC_13 has been updated. Reload the page to continue.");
      }

      if (parts.length === 1) {
        if (req.method !== "POST") throw new RoomError(404, "not_found", "Not found.");
        if (!creates.hit(clientAddress(req))) {
          throw new RoomError(429, "rate_limited", "You've created a lot of rooms. Wait a bit and try again.");
        }
        const body = await readJson(req);
        const profile = parseProfile(body);
        if (!profile) throw new RoomError(400, "bad_request", "Pick a name and a colour.");
        const rules = body.rules === undefined ? undefined : (parseRules(body.rules) ?? undefined);
        const botLevel = body.botLevel === undefined ? undefined : (parseBotLevel(body.botLevel) ?? undefined);
        const { code, token } = manager.create(profile, { rules, botLevel });
        const created: JoinResponse = { ...manager.update(code, token, -1), token };
        send(res, 200, created);
        return true;
      }

      const code = normalizeRoomCode(parts[1]);
      if (!code) throw new RoomError(404, "not_found", "That isn't a room code.");
      await routeRoom(req, res, code, parts[2] ?? "", url.searchParams);
    } catch (error) {
      if (res.headersSent) {
        res.end();
      } else if (error instanceof RoomError) {
        sendError(res, error.status, error.code, error.message);
      } else {
        console.error("Unhandled error", error);
        sendError(res, 500, "server_error", "Something went wrong.");
      }
    }
    return true;
  };

  return {
    handle,
    manager,
    close: () => {
      if (timer) clearInterval(timer);
    },
  };
}
