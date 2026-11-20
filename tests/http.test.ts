import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { type Server, createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Api, type ApiOptions, createApi } from "../server/app";
import { RoomManager } from "../server/rooms";
import { createStatic } from "../server/static";
import { encodeDeal, legalMovesForView, newGame } from "../src/engine";
import { type JoinResponse, PROTOCOL_VERSION, type UpdateResponse, VERSION_HEADER } from "../src/net/protocol";

interface Harness {
  base: string;
  api: Api;
  close: () => Promise<void>;
}

async function start(options: ApiOptions = {}, staticDir?: string): Promise<Harness> {
  const api = createApi({ sweepMs: 0, ...options });
  const serve = staticDir ? createStatic(staticDir) : null;
  const server: Server = createServer((req, res) => {
    void api.handle(req, res).then((handled) => {
      if (handled) return;
      if (serve) serve(req, res);
      else res.writeHead(404).end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${port}`,
    api,
    close: async () => {
      api.close();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

interface Call {
  token?: string;
  body?: unknown;
  headers?: Record<string, string>;
  version?: string | null;
  signal?: AbortSignal;
}

async function call<T = unknown>(base: string, method: string, path: string, opts: Call = {}) {
  const headers: Record<string, string> = { ...opts.headers };
  if (opts.version !== null) headers[VERSION_HEADER] = opts.version ?? String(PROTOCOL_VERSION);
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  const res = await fetch(base + path, {
    method,
    headers,
    body: opts.body === undefined ? undefined : typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body),
    signal: opts.signal,
  });
  const text = await res.text();
  let body: T | null = null;
  try {
    body = JSON.parse(text) as T;
  } catch {
    // not JSON
  }
  return { status: res.status, body, text, headers: res.headers };
}

const ann = { name: "Ann", color: "red" };
const bo = { name: "Bo", color: "blue" };

describe("room API", () => {
  let h: Harness;
  beforeAll(async () => {
    h = await start();
  });
  afterAll(async () => {
    await h.close();
  });

  const create = async () => {
    const r = await call<JoinResponse>(h.base, "POST", "/api/rooms", { body: ann });
    expect(r.status).toBe(200);
    return { code: r.body!.room.code, token: r.body!.token, first: r.body! };
  };

  it("answers health checks", async () => {
    const r = await call<{ ok: boolean; rooms: number }>(h.base, "GET", "/api/health", { version: null });
    expect(r.status).toBe(200);
    expect(r.body!.ok).toBe(true);
    expect(r.headers.get("cache-control")).toBe("no-store");
  });

  it("refuses requests from an out-of-date page", async () => {
    for (const version of [null, "0", String(PROTOCOL_VERSION - 1), "999"]) {
      const r = await call<{ error: string }>(h.base, "POST", "/api/rooms", { body: ann, version });
      expect(r.status).toBe(426);
      expect(r.body!.error).toBe("outdated");
    }
    const get = await call(h.base, "GET", "/api/rooms/ABC234", { version: "0" });
    expect(get.status).toBe(426);
  });

  it("creates a room and lets others look it up and join it", async () => {
    const { code, token, first } = await create();
    expect(first.seat).toBe(0);
    expect(token).toMatch(/^[0-9a-f]{32}$/);
    const peek = await call<{ phase: string; seats: { name: string }[] }>(h.base, "GET", `/api/rooms/${code}`);
    expect(peek.body!.phase).toBe("lobby");
    expect(peek.body!.seats[0]!.name).toBe("Ann");
    expect(JSON.stringify(peek.body)).not.toContain(token);

    const joined = await call<JoinResponse>(h.base, "POST", `/api/rooms/${code.toLowerCase()}/join`, { body: bo });
    expect(joined.status).toBe(200);
    expect(joined.body!.seat).toBe(1);
    expect(joined.body!.room.seats[1]!.name).toBe("Bo");
  });

  it("quickplays into an open room or creates a new running room when none is joinable", async () => {
    const h = await start();
    try {
      const quickplay = () => call<JoinResponse & { created: boolean }>(h.base, "POST", "/api/rooms/quickplay", { body: ann });
      const first = await quickplay();
      expect(first.status).toBe(200);
      expect(first.body!.created).toBe(true);
      expect(first.body!.seat).toBe(0);
      expect(["playing", "over"]).toContain(first.body!.room.phase);

      const matched = await quickplay();
      expect(matched.body!.created).toBe(false);
      expect(matched.body!.room.code).toBe(first.body!.room.code);
      expect(matched.body!.seat).toBe(1);
      expect(matched.body!.room.seats.map((seat) => seat.name)).toEqual(["Ann", "Ann 2", "Bot Two", "Bot Three"]);
      expect(matched.body!.room.seats[1]!.name).toBe("Ann 2");

      const code = first.body!.room.code;
      for (const profile of [{ name: "Cy", color: "green" }, { name: "Di", color: "pink" }]) {
        expect((await call(h.base, "POST", `/api/rooms/${code}/join`, { body: profile })).status).toBe(200);
      }
      const fallback = await quickplay();
      expect(fallback.body!.created).toBe(true);
      expect(fallback.body!.room.code).not.toBe(code);
      expect(fallback.body!.seat).toBe(0);
    } finally {
      await h.close();
    }
  });

  it("reclaims a saved Quick Play seat, including when the room is full", async () => {
    const isolated = await start();
    try {
      const made = (await call<JoinResponse>(isolated.base, "POST", "/api/rooms", { body: ann })).body!;
      const code = made.room.code;
      const joined = (await call<JoinResponse>(isolated.base, "POST", `/api/rooms/${code}/join`, { body: bo })).body!;
      const roomTokens = [{ code, token: joined.token }];
      const quickplay = () => call<JoinResponse & { created: boolean }>(isolated.base, "POST", "/api/rooms/quickplay", {
        body: { ...bo, roomTokens },
      });

      const back = await quickplay();
      expect(back.body).toMatchObject({ created: false, token: joined.token, seat: 1 });
      expect(back.body!.room.seats.map((s) => s.name)).toEqual(["Ann", "Bo", "Bot Two", "Bot Three"]);
      expect(back.body!.room.seats[1]!.playerId).toBe(joined.room.seats[1]!.playerId);

      for (const profile of [{ name: "Cy", color: "green" }, { name: "Di", color: "pink" }]) {
        await call(isolated.base, "POST", `/api/rooms/${code}/join`, { body: profile });
      }
      const full = await quickplay();
      expect(full.body).toMatchObject({ created: false, token: joined.token, seat: 1 });
      expect(full.body!.room.code).toBe(code);
    } finally {
      await isolated.close();
    }
  });

  it("uses the saved identity after a disconnect, but does not bypass a host kick", async () => {
    let now = 1_000_000;
    const isolated = await start({ now: () => now });
    try {
      const made = (await call<JoinResponse>(isolated.base, "POST", "/api/rooms", { body: ann })).body!;
      const code = made.room.code;
      const joined = (await call<JoinResponse>(isolated.base, "POST", `/api/rooms/${code}/join`, { body: bo })).body!;
      const roomTokens = [{ code, token: joined.token }];
      now += 5_000;
      await call(isolated.base, "GET", `/api/rooms/${code}/updates`, { token: made.token });
      isolated.api.manager.sweep();
      const returned = await call<JoinResponse & { created: boolean }>(isolated.base, "POST", "/api/rooms/quickplay", {
        body: { ...bo, roomTokens },
      });
      expect(returned.body).toMatchObject({ created: false, token: joined.token, seat: 1 });
      expect(returned.body!.room.seats[1]!.playerId).toBe(joined.room.seats[1]!.playerId);

      await call(isolated.base, "POST", `/api/rooms/${code}/kick`, { token: made.token, body: { seat: 1 } });
      const kicked = await call<JoinResponse & { created: boolean }>(isolated.base, "POST", "/api/rooms/quickplay", {
        body: { ...bo, roomTokens },
      });
      expect(kicked.body!.created).toBe(true);
      expect(kicked.body!.room.code).not.toBe(code);
    } finally {
      await isolated.close();
    }
  });

  it("rejects malformed saved tokens in Quick Play requests", async () => {
    const bad = [
      null,
      [{ code: "ABC234", token: "bad" }],
      [{ code: "abc234", token: "a".repeat(32) }],
      Array.from({ length: 7 }, () => ({ code: "ABC234", token: "a".repeat(32) })),
      [{ code: "ABC234", token: "a".repeat(32) }, { code: "ABC234", token: "b".repeat(32) }],
    ];
    for (const roomTokens of bad) {
      const response = await call(h.base, "POST", "/api/rooms/quickplay", { body: { ...ann, roomTokens } });
      expect(response.status).toBe(400);
    }
  });

  it("keeps a returning player's room identity without exposing their token", async () => {
    const { code, token } = await create();
    const joined = (await call<JoinResponse>(h.base, "POST", `/api/rooms/${code}/join`, { body: bo })).body!;
    const id = joined.room.seats[joined.seat]!.playerId;
    expect((await call(h.base, "POST", `/api/rooms/${code}/leave`, { token: joined.token, body: {} })).status).toBe(200);
    const peek = await call<UpdateResponse["room"]>(h.base, "GET", `/api/rooms/${code}`);
    expect(peek.body!.playerStats.find((p) => p.id === id)).toMatchObject({ name: "Bo", present: false });
    expect(peek.text).not.toContain(joined.token);
    expect(peek.text).not.toContain(token);
    const returned = await call<JoinResponse>(h.base, "POST", `/api/rooms/${code}/join`, {
      body: { ...bo, token: joined.token },
    });
    expect(returned.body!.token).toBe(joined.token);
    expect(returned.body!.room.seats[returned.body!.seat]!.playerId).toBe(id);
  });

  it("releases disconnected seats and deletes the room when its last human times out", async () => {
    let now = 1_000_000;
    const isolated = await start({ now: () => now });
    try {
      const made = (await call<JoinResponse>(isolated.base, "POST", "/api/rooms", { body: ann })).body!;
      const code = made.room.code;
      const joined = (await call<JoinResponse>(isolated.base, "POST", `/api/rooms/${code}/join`, { body: bo })).body!;
      now += 5_000;
      await call(isolated.base, "GET", `/api/rooms/${code}/updates`, { token: made.token });
      isolated.api.manager.sweep();
      expect((await call(isolated.base, "GET", `/api/rooms/${code}/updates`, { token: joined.token })).status).toBe(401);
      const returned = await call<JoinResponse>(isolated.base, "POST", `/api/rooms/${code}/join`, {
        body: { ...bo, token: joined.token },
      });
      expect(returned.body!.token).toBe(joined.token);
      expect(returned.body!.room.seats[1]!.kind).toBe("human");

      now += 5_000;
      isolated.api.manager.sweep();
      expect((await call(isolated.base, "GET", `/api/rooms/${code}`)).status).toBe(404);
    } finally {
      await isolated.close();
    }
  });

  it("returns clear errors for bad input", async () => {
    const { code, token } = await create();
    const cases: [string, Promise<{ status: number; body: { error: string } | null }>][] = [
      ["no name", call(h.base, "POST", "/api/rooms", { body: { name: "", color: "red" } })],
      ["bad colour", call(h.base, "POST", "/api/rooms", { body: { name: "A", color: "#fff" } })],
      ["invalid json", call(h.base, "POST", "/api/rooms", { body: "{not json" })],
      ["json array", call(h.base, "POST", "/api/rooms", { body: "[1,2]" })],
      ["bad room code", call(h.base, "GET", "/api/rooms/NOT-A-CODE")],
      ["unknown room", call(h.base, "GET", "/api/rooms/ZZZZZZ")],
      ["bad token", call(h.base, "GET", `/api/rooms/${code}/updates?since=-1&rev=0`, { token: "nope" })],
      ["no token", call(h.base, "GET", `/api/rooms/${code}/updates?since=-1&rev=0`)],
      ["bad move", call(h.base, "POST", `/api/rooms/${code}/move`, { token, body: { move: { type: "play", cards: [99] } } })],
      ["move before start", call(h.base, "POST", `/api/rooms/${code}/move`, { token, body: { move: { type: "pass" } } })],
      ["unknown action", call(h.base, "POST", `/api/rooms/${code}/explode`, { token, body: {} })],
      ["wrong method", call(h.base, "PUT", `/api/rooms/${code}/move`, { token, body: {} })],
      ["unknown api", call(h.base, "GET", "/api/nothing", { version: null })],
    ];
    const expected = [400, 400, 400, 400, 404, 404, 401, 401, 400, 409, 404, 404, 404];
    const results = await Promise.all(cases.map(([, p]) => p));
    results.forEach((r, i) => expect(r.status, cases[i]![0]).toBe(expected[i]));
    for (const r of results) expect(r.body!.error).toBeTruthy();
  });

  it("rejects oversized bodies", async () => {
    const r = await call<{ error: string }>(h.base, "POST", "/api/rooms", {
      body: JSON.stringify({ name: "x".repeat(6000), color: "red" }),
    });
    expect(r.status).toBe(413);
    expect(r.body!.error).toBe("too_large");
  });

  it("only lets the host start and change settings", async () => {
    const { code, token } = await create();
    const guest = (await call<JoinResponse>(h.base, "POST", `/api/rooms/${code}/join`, { body: bo })).body!;
    expect((await call(h.base, "POST", `/api/rooms/${code}/start`, { token: guest.token, body: {} })).status).toBe(403);
    const set = await call<UpdateResponse>(h.base, "POST", `/api/rooms/${code}/settings`, {
      token,
      body: { rules: { bombsBeatAnything: true }, botLevel: "easy", since: -1 },
    });
    expect(set.body!.room.settings).toEqual({ rules: { bombsBeatAnything: true }, botLevel: "easy" });
    const bad = await call(h.base, "POST", `/api/rooms/${code}/settings`, { token, body: { rules: { bombsBeatAnything: "yes" } } });
    expect(bad.status).toBe(400);
  });

  it("lets a host kick another human and prevents their saved token from rejoining", async () => {
    const { code, token } = await create();
    const guest = (await call<JoinResponse>(h.base, "POST", `/api/rooms/${code}/join`, { body: bo })).body!;
    const forbidden = await call(h.base, "POST", `/api/rooms/${code}/kick`, {
      token: guest.token,
      body: { seat: guest.seat, since: -1 },
    });
    expect(forbidden.status).toBe(403);

    const kicked = await call<UpdateResponse>(h.base, "POST", `/api/rooms/${code}/kick`, {
      token,
      body: { seat: guest.seat, since: -1 },
    });
    expect(kicked.status).toBe(200);
    expect(kicked.body!.room.seats[guest.seat]).toMatchObject({ kind: "bot" });
    expect((await call(h.base, "GET", `/api/rooms/${code}/updates?since=-1&rev=0`, { token: guest.token })).status).toBe(401);
    expect((await call(h.base, "POST", `/api/rooms/${code}/join`, { body: { ...bo, token: guest.token } })).status).toBe(403);
    expect((await call(h.base, "POST", `/api/rooms/${code}/join`, { body: bo })).status).toBe(200);
  });

  it("plays a whole game over the wire, one request per move", async () => {
    const { code, token } = await create();
    const started = await call<UpdateResponse>(h.base, "POST", `/api/rooms/${code}/start`, {
      token,
      body: { since: -1 },
    });
    expect(started.status).toBe(200);
    let state = started.body!;
    for (let i = 0; i < 400 && state.room.phase === "playing"; i++) {
      const view = state.frames[state.frames.length - 1]!.view;
      const move = legalMovesForView(view)[0]!;
      const since = state.frames[state.frames.length - 1]!.n;
      const r = await call<UpdateResponse>(h.base, "POST", `/api/rooms/${code}/move`, { token, body: { move, since } });
      expect(r.status).toBe(200);
      expect(r.body!.frames[0]!.n).toBe(since + 1); // returns exactly what came after
      state = r.body!;
    }
    expect(state.room.phase).toBe("over");
    expect(state.room.games).toBe(1);
    const next = await call<UpdateResponse>(h.base, "POST", `/api/rooms/${code}/start`, { token, body: { since: -1 } });
    expect(next.body!.room.phase === "playing" || next.body!.room.phase === "over").toBe(true);
  });

  it("deals a new game to a Quick Play joiner in a finished room after 20 seconds", async () => {
    let now = 1_000_000;
    let instantSeed = 0;
    while (newGame({ seed: instantSeed }).winner === null) instantSeed++;
    let normalSeed = 0;
    while (newGame({ seed: normalSeed }).winner !== null) normalSeed++;
    const manager = new RoomManager({
      now: () => now,
      awayMs: 1e9,
      randomInt: (max) => max === 2 ** 32 ? normalSeed : 0,
    });
    const { code, token } = manager.create({ name: "Ann", color: "red" });
    manager.start(code, token, encodeDeal({ seed: instantSeed }));
    const isolated = await start({ manager, now: () => now });
    try {
      now += 19_999;
      const joined = await call<JoinResponse & { created: boolean }>(isolated.base, "POST", "/api/rooms/quickplay", { body: bo });
      expect(joined.status).toBe(200);
      expect(joined.body).toMatchObject({ created: false, room: { code, phase: "over" } });
      const guest = joined.body!;
      const since = guest.frames[guest.frames.length - 1]!.n;
      expect(manager.sweep()).not.toContain(code);
      now++;
      expect(manager.sweep()).toContain(code);
      const update = await call<UpdateResponse>(isolated.base, "GET", `/api/rooms/${code}/updates?since=${since}&rev=${guest.room.rev}&wait=0`, { token: guest.token });
      expect(update.status).toBe(200);
      expect(update.body!.room.phase).toBe("playing");
      expect(update.body!.frames[0]).toMatchObject({ kind: "deal", view: { seat: guest.seat, revealed: null } });
      expect(update.body!.frames[0]!.view.hand).toHaveLength(13);
      expect(JSON.stringify(update.body)).not.toContain('"hands"');
    } finally {
      await isolated.close();
    }
  });

  it("never lets a client pick or replay a deal", async () => {
    const { code, token } = await create();
    const r = await call<{ error: string }>(h.base, "POST", `/api/rooms/${code}/start`, {
      token,
      body: { dealCode: "0000-0727", since: -1 },
    });
    expect(r.status).toBe(400);
    const info = await call<UpdateResponse>(h.base, "GET", `/api/rooms/${code}/updates?since=-1&rev=0&wait=0`, { token });
    expect(info.body!.room.phase).toBe("lobby");
  });

  describe("long polling", () => {
    it("answers at once when the client is behind", async () => {
      const { code, token } = await create();
      const t0 = Date.now();
      const r = await call<UpdateResponse>(h.base, "GET", `/api/rooms/${code}/updates?since=-1&rev=0&wait=5`, { token });
      expect(r.status).toBe(200);
      expect(Date.now() - t0).toBeLessThan(1000);
    });

    it("waits when up to date, and wakes the moment someone else acts", async () => {
      const { code, token, first } = await create();
      const guest = (await call<JoinResponse>(h.base, "POST", `/api/rooms/${code}/join`, { body: bo })).body!;
      const caughtUp = (await call<UpdateResponse>(h.base, "GET", `/api/rooms/${code}/updates?since=-1&rev=${first.room.rev}`, { token })).body!;

      const t0 = Date.now();
      const poll = call<UpdateResponse>(h.base, "GET", `/api/rooms/${code}/updates?since=-1&rev=${caughtUp.room.rev}&wait=10`, { token });
      await new Promise((r) => setTimeout(r, 300));
      await call(h.base, "POST", `/api/rooms/${code}/profile`, { token: guest.token, body: { name: "Bobby", color: "green", since: -1 } });
      const woken = await poll;
      const waited = Date.now() - t0;
      expect(waited).toBeGreaterThanOrEqual(250);
      expect(waited).toBeLessThan(3000);
      expect(woken.body!.room.seats[1]).toMatchObject({ name: "Bobby", color: "green" });
      expect(woken.body!.room.rev).toBeGreaterThan(caughtUp.room.rev);
    });

    it("gives up politely at the wait limit with nothing new", async () => {
      const { code, token } = await create();
      const now = (await call<UpdateResponse>(h.base, "GET", `/api/rooms/${code}/updates?since=-1&rev=0`, { token })).body!;
      const t0 = Date.now();
      const r = await call<UpdateResponse>(h.base, "GET", `/api/rooms/${code}/updates?since=-1&rev=${now.room.rev}&wait=1`, { token });
      const waited = Date.now() - t0;
      expect(r.status).toBe(200);
      expect(waited).toBeGreaterThanOrEqual(900);
      expect(waited).toBeLessThan(2500);
      expect(r.body!.room.rev).toBe(now.room.rev);
    });

    it("does not leak a listener when the client hangs up", async () => {
      const { code, token } = await create();
      const now = (await call<UpdateResponse>(h.base, "GET", `/api/rooms/${code}/updates?since=-1&rev=0`, { token })).body!;
      const controller = new AbortController();
      const poll = call(h.base, "GET", `/api/rooms/${code}/updates?since=-1&rev=${now.room.rev}&wait=20`, {
        token,
        signal: controller.signal,
      }).catch(() => null);
      await new Promise((r) => setTimeout(r, 200));
      expect(h.api.manager.listenerCount(code)).toBe(1);
      controller.abort();
      await poll;
      await new Promise((r) => setTimeout(r, 100));
      expect(h.api.manager.listenerCount(code)).toBe(0);
    });

    it("caps the wait so it stays under a proxy's idle timeout", async () => {
      const capped = await start({ maxWaitMs: 400 });
      try {
        const made = (await call<JoinResponse>(capped.base, "POST", "/api/rooms", { body: ann })).body!;
        const t0 = Date.now();
        await call(capped.base, "GET", `/api/rooms/${made.room.code}/updates?since=-1&rev=${made.room.rev}&wait=60`, { token: made.token });
        expect(Date.now() - t0).toBeLessThan(1500);
      } finally {
        await capped.close();
      }
    });

    it("caps the default wait below the disconnect timeout", async () => {
      const { code, token, first } = await create();
      const t0 = Date.now();
      const response = await call(h.base, "GET", `/api/rooms/${code}/updates?since=-1&rev=${first.room.rev}&wait=25`, { token });
      expect(response.status).toBe(200);
      expect(Date.now() - t0).toBeLessThan(4000);
    });
  });
});

describe("rate limiting", () => {
  it("limits room creation per address, and ignores proxy headers unless trusted", async () => {
    const plain = await start({ createLimit: 2 });
    try {
      const make = (headers?: Record<string, string>) => call(plain.base, "POST", "/api/rooms", { body: ann, headers });
      expect((await make()).status).toBe(200);
      expect((await make({ "cf-connecting-ip": "1.1.1.1" })).status).toBe(200);
      const limited = await make({ "cf-connecting-ip": "2.2.2.2" }); // spoofing doesn't help
      expect(limited.status).toBe(429);
      expect((limited.body as { error: string }).error).toBe("rate_limited");
    } finally {
      await plain.close();
    }

    const proxied = await start({ createLimit: 1, trustProxy: true });
    try {
      const make = (ip: string) => call(proxied.base, "POST", "/api/rooms", { body: ann, headers: { "cf-connecting-ip": ip } });
      expect((await make("1.1.1.1")).status).toBe(200);
      expect((await make("1.1.1.1")).status).toBe(429);
      expect((await make("2.2.2.2")).status).toBe(200);
      const forwarded = await call(proxied.base, "POST", "/api/rooms", { body: ann, headers: { "x-forwarded-for": "3.3.3.3, 10.0.0.1" } });
      expect(forwarded.status).toBe(200);
    } finally {
      await proxied.close();
    }
  });
});

describe("static files", () => {
  let dir: string;
  let h: Harness;
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "vc13-static-"));
    mkdirSync(join(dir, "assets"));
    writeFileSync(join(dir, "index.html"), "<!doctype html><title>VC</title>");
    writeFileSync(join(dir, "assets", "app-abc123.js"), "console.log(1)");
    writeFileSync(join(dir, "sitemap.xml"), "<urlset />");
    writeFileSync(join(dir, "..", "vc13-secret.txt"), "secret");
    h = await start({}, dir);
  });
  afterAll(async () => {
    await h.close();
    rmSync(dir, { recursive: true, force: true });
    rmSync(join(dir, "..", "vc13-secret.txt"), { force: true });
  });

  it("serves the page at the root and for any address without an extension", async () => {
    for (const path of ["/", "/?room=ABC234", "/some/deep/route"]) {
      const r = await call(h.base, "GET", path, { version: null });
      expect(r.status, path).toBe(200);
      expect(r.headers.get("content-type")).toContain("text/html");
      expect(r.headers.get("cache-control")).toBe("no-cache");
      expect(r.text).toContain("<title>VC</title>");
    }
  });

  it("caches hashed assets for a year and reports the right type", async () => {
    const r = await call(h.base, "GET", "/assets/app-abc123.js", { version: null });
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("text/javascript");
    expect(r.headers.get("cache-control")).toContain("immutable");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("serves sitemap XML with an XML content type", async () => {
    const r = await call(h.base, "GET", "/sitemap.xml", { version: null });
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("application/xml");
    expect(r.text).toBe("<urlset />");
  });

  it("404s a missing file with an extension, and supports HEAD", async () => {
    expect((await call(h.base, "GET", "/assets/gone.js", { version: null })).status).toBe(404);
    const head = await fetch(`${h.base}/assets/app-abc123.js`, { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(head.headers.get("content-length")).toBe("14");
    expect(await head.text()).toBe("");
  });

  it("refuses other methods and never serves files outside the folder", async () => {
    expect((await call(h.base, "POST", "/", { version: null, body: "{}" })).status).toBe(405);
    for (const path of ["/../vc13-secret.txt", "/%2e%2e/vc13-secret.txt", "/..%2fvc13-secret.txt", "/assets/..%2f..%2fvc13-secret.txt", "/%00"]) {
      const r = await fetch(`${h.base}${path}`, { redirect: "manual" });
      expect(await r.text(), path).not.toContain("secret");
      expect([200, 400, 403, 404], path).toContain(r.status);
    }
  });
});
