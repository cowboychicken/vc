import { describe, expect, it } from "vitest";
import { RoomError, RoomManager } from "../server/rooms";
import { encodeDeal, legalMovesForView, newGame } from "../src/engine";
import type { Frame, Profile, UpdateResponse } from "../src/net/protocol";

const ann: Profile = { name: "Ann", color: "red" };
const bo: Profile = { name: "Bo", color: "blue" };

/** A manager with a clock the test controls. */
function setup(options: ConstructorParameters<typeof RoomManager>[0] = {}) {
  const clock = { t: 1_000_000 };
  const manager = new RoomManager({ now: () => clock.t, ...options });
  return { manager, clock };
}

function expectError(fn: () => unknown, status: number) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(RoomError);
    expect((error as RoomError).status).toBe(status);
    return;
  }
  throw new Error(`Expected a ${status} error`);
}

const last = (response: UpdateResponse): Frame => response.frames[response.frames.length - 1]!;

/** A seed where someone other than seat 0 holds the 3♠, so a bot opens. */
const BOT_OPENS = (() => {
  for (let seed = 1; ; seed++) {
    const g = newGame({ seed });
    if (g.winner === null && g.turn !== 0) return seed;
  }
})();

/** A seed where seat 0 holds the 3♠. */
const HOST_OPENS = (() => {
  for (let seed = 1; ; seed++) {
    const g = newGame({ seed });
    if (g.winner === null && g.turn === 0) return seed;
  }
})();

/** Plays whatever is legal for the seat that owns `token`, whenever it is their turn. */
function playFirstLegal(manager: RoomManager, code: string, token: string): void {
  const view = last(manager.update(code, token, -1)).view;
  const move = legalMovesForView(view)[0]!;
  manager.move(code, token, move);
}

function playToEnd(manager: RoomManager, code: string, token: string): void {
  for (let i = 0; i < 500; i++) {
    const room = manager.update(code, token, -1).room;
    if (room.phase !== "playing") return;
    playFirstLegal(manager, code, token);
  }
  throw new Error("game did not finish");
}

describe("creating and joining", () => {
  it("makes a room with the creator as host in seat 0 and bots in the other seats", () => {
    const { manager } = setup();
    const { code, token } = manager.create(ann, { rules: { bombsBeatAnything: true }, botLevel: "easy" });
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{6}$/);
    const { seat, room, frames } = manager.update(code, token, -1);
    expect(seat).toBe(0);
    expect(frames).toEqual([]);
    expect(room.phase).toBe("lobby");
    expect(room.host).toBe(0);
    expect(room.seats.map((s) => s.name)).toEqual(["Ann", "Bot One", "Bot Two", "Bot Three"]);
    expect(room.seats.map((s) => s.kind)).toEqual(["human", "bot", "bot", "bot"]);
    expect(room.seats[0]).toMatchObject({ color: "red", host: true, away: false });
    expect(room.settings).toEqual({ rules: { bombsBeatAnything: true }, botLevel: "easy" });
  });

  it("seats joiners in the lowest bot seat, and keeps names unique", () => {
    const { manager } = setup();
    const { code, token: hostToken } = manager.create(ann);
    const b = manager.join(code, { name: "ann", color: "teal" });
    const c = manager.join(code, { name: "Bot One", color: "pink" });
    const room = manager.update(code, hostToken, -1).room;
    expect(manager.update(code, b.token, -1).seat).toBe(1);
    expect(manager.update(code, c.token, -1).seat).toBe(2);
    expect(room.seats.map((s) => s.name)).toEqual(["Ann", "ann 2", "Bot One 2", "Bot Three"]);
  });

  it("refuses a fifth player, and lets a returning player take the same seat back", () => {
    const { manager } = setup();
    const { code } = manager.create(ann);
    const tokens = [bo, { name: "Cy", color: "green" as const }, { name: "Di", color: "pink" as const }].map(
      (p) => manager.join(code, p).token,
    );
    expectError(() => manager.join(code, { name: "Ed", color: "slate" }), 409);
    const again = manager.join(code, { name: "Bobby", color: "orange" }, tokens[0]);
    expect(again.token).toBe(tokens[0]);
    const room = manager.update(code, tokens[0]!, -1).room;
    expect(room.seats[1]).toMatchObject({ name: "Bobby", color: "orange", kind: "human" });
  });

  it("rejects unknown rooms and bad tokens", () => {
    const { manager } = setup();
    expectError(() => manager.update("ZZZZZZ", "x", -1), 404);
    const { code } = manager.create(ann);
    expectError(() => manager.update(code, "wrong", -1), 401);
    expectError(() => manager.update(code, "", -1), 401);
  });

  it("caps the number of rooms", () => {
    const { manager } = setup({ maxRooms: 2 });
    manager.create(ann);
    manager.create(ann);
    expectError(() => manager.create(ann), 429);
  });

  it("lets players change their name and colour", () => {
    const { manager } = setup();
    const { code, token } = manager.create(ann);
    const other = manager.join(code, bo);
    manager.setProfile(code, other.token, { name: "Ann", color: "green" });
    const room = manager.update(code, token, -1).room;
    expect(room.seats[1]).toMatchObject({ name: "Ann 2", color: "green" });
  });
});

describe("starting a game", () => {
  it("only lets the host start, and only when no game is running", () => {
    const { manager } = setup();
    const { code, token } = manager.create(ann);
    const guest = manager.join(code, bo);
    expectError(() => manager.start(code, guest.token), 403);
    manager.start(code, token);
    expectError(() => manager.start(code, token), 409);
  });

  it("opens the first game with the 3♠ rule, and deals only your own hand to each seat", () => {
    const { manager } = setup();
    const { code, token } = manager.create(ann);
    const guest = manager.join(code, bo);
    manager.start(code, token, encodeDeal({ seed: HOST_OPENS }));
    for (const [who, seat] of [
      [token, 0],
      [guest.token, 1],
    ] as const) {
      const response = manager.update(code, who, -1);
      const view = response.frames[0]!.view;
      expect(response.seat).toBe(seat);
      expect(view.seat).toBe(seat);
      expect(view.hand).toHaveLength(13);
      expect(view.revealed).toBeNull();
      expect(view.openingRequired).toBe(true);
      expect(JSON.stringify(response)).not.toContain('"hands"');
    }
    const mine = manager.update(code, token, -1).frames[0]!.view.hand;
    const theirs = manager.update(code, guest.token, -1).frames[0]!.view.hand;
    expect(mine.some((c) => theirs.includes(c))).toBe(false);
  });

  it("lets bots open when a bot holds the 3♠, stopping at the first present human", () => {
    const { manager } = setup();
    const { code, token } = manager.create(ann);
    manager.start(code, token, encodeDeal({ seed: BOT_OPENS }));
    const { frames, room } = manager.update(code, token, -1);
    expect(frames[0]).toMatchObject({ kind: "deal", by: -1, bot: false });
    expect(frames.length).toBeGreaterThan(1);
    expect(frames.slice(1).every((f) => f.kind === "move" && f.bot)).toBe(true);
    expect(frames.map((f) => f.n)).toEqual(frames.map((_, i) => i));
    expect(last({ seat: 0, room, frames }).view.turn).toBe(0);
    expect(room.phase).toBe("playing");
  });

  it("honours a deal code exactly, and shows it in the room", () => {
    const { manager } = setup();
    const { code, token } = manager.create(ann);
    manager.start(code, token, "0000-0727"); // seed 28, seat 1 leads freely
    const { room, frames } = manager.update(code, token, -1);
    expect(room.dealCode).toBe("0000-0727");
    expect(frames[0]!.view.openingRequired).toBe(false);
    expect(frames[0]!.view.turn).toBe(1);
  });

  it("rejects a malformed deal code", () => {
    const { manager } = setup();
    const { code, token } = manager.create(ann);
    expectError(() => manager.start(code, token, "NOPE-NOPE"), 400);
    expect(manager.update(code, token, -1).room.phase).toBe("lobby");
  });

  it("ends immediately on an instant-win deal", () => {
    const { manager } = setup();
    const { code, token } = manager.create(ann);
    let seed = 0;
    while (newGame({ seed }).winner === null) seed++;
    manager.start(code, token, encodeDeal({ seed }));
    const { room, frames } = manager.update(code, token, -1);
    expect(room.phase).toBe("over");
    expect(room.games).toBe(1);
    expect(frames).toHaveLength(1);
    expect(frames[0]!.view.winner).not.toBeNull();
  });
});

describe("playing", () => {
  it("rejects moves out of turn, illegal moves, and moves when no game is running", () => {
    const { manager } = setup();
    const { code, token } = manager.create(ann);
    expectError(() => manager.move(code, token, { type: "pass" }), 409);
    manager.start(code, token, encodeDeal({ seed: HOST_OPENS }));
    expectError(() => manager.move(code, token, { type: "pass" }), 400); // can't pass when leading
    expectError(() => manager.move(code, token, { type: "play", cards: [51] }), 400); // 2♥ isn't a legal opening
  });

  it("runs the bots after a human move, ending on the next human turn", () => {
    const { manager } = setup();
    const { code, token } = manager.create(ann);
    manager.start(code, token, encodeDeal({ seed: HOST_OPENS }));
    const before = manager.update(code, token, -1);
    playFirstLegal(manager, code, token);
    const after = manager.update(code, token, last(before).n);
    expect(after.frames[0]).toMatchObject({ kind: "move", by: 0, bot: false });
    expect(after.frames.slice(1).every((f) => f.bot)).toBe(true);
    if (after.room.phase === "playing") expect(last(after).view.turn).toBe(0);
  });

  it("plays a whole game, counts the win, and the winner leads the next one", () => {
    const { manager } = setup();
    const { code, token } = manager.create(ann);
    manager.start(code, token, encodeDeal({ seed: HOST_OPENS }));
    playToEnd(manager, code, token);
    const over = manager.update(code, token, -1);
    const winner = last(over).view.winner!;
    expect(over.room.phase).toBe("over");
    expect(over.room.games).toBe(1);
    expect(over.room.wins[winner]).toBe(1);
    expect(last(over).view.revealed).not.toBeNull();

    manager.start(code, token);
    const next = manager.update(code, token, last(over).n);
    const deal = next.frames[0]!;
    expect(deal.kind).toBe("deal");
    expect(deal.view.openingRequired).toBe(false);
    if (deal.view.winner === null) expect(deal.view.turn).toBe(winner);
  });

  it("only sends the frames after `since`, and no more than the limit", () => {
    const { manager } = setup({ maxFramesPerResponse: 3 });
    const { code, token } = manager.create(ann);
    manager.start(code, token, encodeDeal({ seed: BOT_OPENS }));
    playToEnd(manager, code, token);
    const all = manager.update(code, token, -1);
    expect(all.frames.length).toBeLessThanOrEqual(3);
    const tail = last(all).n;
    expect(manager.update(code, token, tail).frames).toEqual([]);
    expect(manager.update(code, token, tail - 1).frames.map((f) => f.n)).toEqual([tail]);
  });
});

describe("settings", () => {
  it("lets only the host change them, and rules only between games", () => {
    const { manager } = setup();
    const { code, token } = manager.create(ann);
    const guest = manager.join(code, bo);
    expectError(() => manager.setSettings(code, guest.token, { botLevel: "easy" }), 403);
    manager.setSettings(code, token, { rules: { bombsBeatAnything: true }, botLevel: "easy" });
    expect(manager.update(code, token, -1).room.settings).toEqual({
      rules: { bombsBeatAnything: true },
      botLevel: "easy",
    });
    manager.start(code, token, encodeDeal({ seed: HOST_OPENS }));
    expectError(() => manager.setSettings(code, token, { rules: { bombsBeatAnything: false } }), 409);
    manager.setSettings(code, token, { botLevel: "normal" });
  });

  it("deals the next game with the rules in force at that time", () => {
    const { manager } = setup();
    const { code, token } = manager.create(ann);
    manager.setSettings(code, token, { rules: { bombsBeatAnything: true } });
    manager.start(code, token, encodeDeal({ seed: HOST_OPENS }));
    expect(manager.update(code, token, -1).frames[0]!.view.rules).toEqual({ bombsBeatAnything: true });
  });
});

describe("absent players", () => {
  it("has a bot cover a turn once the player has been quiet too long, and hands back when they return", () => {
    const { manager, clock } = setup({ awayMs: 45_000 });
    const { code, token } = manager.create(ann);
    const guest = manager.join(code, bo);
    // Leader is seat 1 (Bo) so it is a human's turn who will then go quiet.
    manager.start(code, token, encodeDeal({ seed: 28, leader: 1 }));
    const start = manager.update(code, token, -1);
    expect(last(start).view.turn).toBe(1);

    clock.t += 30_000;
    manager.update(code, token, -1); // Ann stays around
    clock.t += 20_000; // Bo has now been quiet for 50 seconds
    manager.update(code, token, -1);
    const changed = manager.sweep();
    expect(changed).toContain(code);

    const after = manager.update(code, token, last(start).n);
    expect(after.frames.length).toBeGreaterThan(0);
    expect(after.frames[0]).toMatchObject({ kind: "move", by: 1, bot: true });
    expect(after.room.seats[1]!.away).toBe(true);

    // Bo comes back: no longer away, and is in charge of their own turns again.
    const back = manager.update(code, guest.token, -1);
    expect(back.room.seats[1]!.away).toBe(false);
  });

  it("passes the host role to someone who is around", () => {
    const { manager, clock } = setup({ awayMs: 10_000 });
    const { code, token } = manager.create(ann);
    const guest = manager.join(code, bo);
    clock.t += 20_000;
    manager.update(code, guest.token, -1);
    expect(manager.sweep()).toContain(code);
    const room = manager.update(code, guest.token, -1).room;
    expect(room.host).toBe(1);
    expect(room.seats[0]!.away).toBe(true);
    expectError(() => manager.start(code, token), 403);
  });

  it("does not take the host role from someone just because everyone is away", () => {
    const { manager, clock } = setup({ awayMs: 10_000 });
    const { code } = manager.create(ann);
    manager.join(code, bo);
    clock.t += 20_000;
    manager.sweep();
    expect(manager.peek(code)!.host).toBe(0);
  });

  it("deletes rooms that nobody has been in for a long time", () => {
    const { manager, clock } = setup({ awayMs: 10_000, emptyRoomMs: 60_000 });
    const { code, token } = manager.create(ann);
    clock.t += 30_000;
    manager.sweep();
    expect(manager.peek(code)).not.toBeNull();
    clock.t += 60_000;
    expect(manager.sweep()).toContain(code);
    expect(manager.peek(code)).toBeNull();
    expectError(() => manager.update(code, token, -1), 404);
  });
});

describe("leaving", () => {
  it("turns the seat back into a bot, and moves the host role on", () => {
    const { manager } = setup();
    const { code, token } = manager.create(ann);
    const guest = manager.join(code, bo);
    manager.leave(code, token);
    const room = manager.update(code, guest.token, -1).room;
    expect(room.seats[0]).toMatchObject({ kind: "bot", name: "Bot Four", host: false });
    expect(room.host).toBe(1);
    expectError(() => manager.update(code, token, -1), 401);
  });

  it("keeps a running game going with a bot in the leaver's seat", () => {
    const { manager } = setup();
    const { code, token } = manager.create(ann);
    const guest = manager.join(code, bo);
    manager.start(code, token, encodeDeal({ seed: 28, leader: 1 }));
    manager.leave(code, guest.token); // Bo leaves on their own turn
    const { frames, room } = manager.update(code, token, -1);
    expect(frames.some((f) => f.by === 1 && f.bot)).toBe(true);
    if (room.phase === "playing") expect(last({ seat: 0, room, frames }).view.turn).toBe(0);
  });

  it("closes the room when the last person leaves", () => {
    const { manager } = setup();
    const { code, token } = manager.create(ann);
    manager.leave(code, token);
    expect(manager.peek(code)).toBeNull();
  });

  it("lets a new player take a seat in a game already running", () => {
    const { manager } = setup();
    const { code, token } = manager.create(ann);
    manager.start(code, token, encodeDeal({ seed: HOST_OPENS }));
    const late = manager.join(code, bo);
    const { seat, frames } = manager.update(code, late.token, -1);
    expect(seat).toBe(1);
    expect(frames[frames.length - 1]!.view.hand).toHaveLength(13);
  });
});

describe("room player stats", () => {
  it("keeps wins with players rather than seats, including after leaving, returning and renaming", () => {
    const { manager } = setup();
    const { code, token } = manager.create(ann);
    let seed = 0;
    while (newGame({ seed }).winner !== 1) seed++;
    const deal = encodeDeal({ seed });

    manager.start(code, token, deal);
    const boToken = manager.join(code, bo).token;
    let room = manager.update(code, token, -1).room;
    expect(room.playerStats.find((p) => p.name === "Bot One")).toMatchObject({ games: 1, wins: 1 });
    expect(room.playerStats.find((p) => p.name === "Bo")).toMatchObject({ games: 0, wins: 0 });

    manager.start(code, token, deal);
    room = manager.update(code, token, -1).room;
    const boId = room.seats[1]!.playerId;
    expect(room.playerStats.find((p) => p.id === boId)).toMatchObject({ games: 1, wins: 1 });

    manager.leave(code, boToken);
    expectError(() => manager.update(code, boToken, -1), 401);
    const cyToken = manager.join(code, { name: "Cy", color: "green" }).token;
    room = manager.update(code, token, -1).room;
    expect(room.playerStats.find((p) => p.id === boId)).toMatchObject({ games: 1, wins: 1, present: false });
    expect(room.playerStats.find((p) => p.name === "Cy")).toMatchObject({ games: 0, wins: 0 });

    expect(manager.join(code, { name: "Bobby", color: "blue" }, boToken).token).toBe(boToken);
    room = manager.update(code, cyToken, -1).room;
    expect(room.seats[2]!.playerId).toBe(boId);
    expect(room.playerStats.find((p) => p.id === boId)).toMatchObject({ name: "Bobby", games: 1, wins: 1, present: true });
    expect(JSON.stringify(room)).not.toContain(boToken);
    expect(JSON.stringify(manager.peek(code))).not.toContain(cyToken);
  });

  it("counts a completed game once for everyone who occupied a seat during it", () => {
    const { manager } = setup();
    const { code, token } = manager.create(ann);
    manager.start(code, token, encodeDeal({ seed: HOST_OPENS }));
    const boToken = manager.join(code, bo).token;
    manager.leave(code, boToken);
    manager.join(code, bo, boToken);
    manager.leave(code, boToken);
    expect(manager.update(code, token, -1).room.playerStats.find((p) => p.name === "Bo")!.games).toBe(0);
    playToEnd(manager, code, token);
    const stats = manager.update(code, token, -1).room.playerStats;
    expect(stats.find((p) => p.name === "Bo")).toMatchObject({ games: 1, wins: 0, present: false });
    expect(stats.find((p) => p.name === "Bot One")).toMatchObject({ games: 1 });
  });

  it("bounds room player history without preventing a former player from returning", () => {
    const { manager } = setup();
    const { code, token } = manager.create(ann);
    let first = "";
    for (let i = 0; i < 99; i++) {
      const guest = manager.join(code, bo);
      if (i === 0) first = guest.token;
      manager.leave(code, guest.token);
    }
    expectError(() => manager.join(code, bo), 429);
    expect(manager.join(code, bo, first).token).toBe(first);
    expect(manager.update(code, token, -1).room.playerStats.filter((p) => p.kind === "human")).toHaveLength(100);
  });
});

describe("waking pollers", () => {
  it("notifies subscribers on change, and unsubscribing twice never drops another subscriber", () => {
    const { manager } = setup();
    const { code, token } = manager.create(ann);
    let a = 0;
    let b = 0;
    const offA = manager.subscribe(code, () => a++);
    offA();
    offA();
    const offB = manager.subscribe(code, () => b++);
    offA(); // a stale unsubscribe, after B subscribed
    manager.setProfile(code, token, { name: "Ann2", color: "red" });
    expect([a, b]).toEqual([0, 1]);
    offB();
    manager.setProfile(code, token, { name: "Ann3", color: "red" });
    expect(b).toBe(1);
  });

  it("reports news when the room moved on, and not when it hasn't", () => {
    const { manager } = setup();
    const { code, token } = manager.create(ann);
    const first = manager.update(code, token, -1);
    expect(manager.hasNews(code, token, -1, first.room.rev)).toBe(false);
    manager.setProfile(code, token, { name: "Ann2", color: "red" });
    expect(manager.hasNews(code, token, -1, first.room.rev)).toBe(true);
  });

  it("tells subscribers when a room is deleted", () => {
    const { manager } = setup();
    const { code, token } = manager.create(ann);
    let calls = 0;
    manager.subscribe(code, () => calls++);
    manager.leave(code, token);
    expect(calls).toBe(1);
  });
});
