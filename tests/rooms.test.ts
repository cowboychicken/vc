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

  it("finds a random room only when a present human and an open bot seat exist", () => {
    const { manager, clock } = setup({ awayMs: 10_000 });
    expect(manager.randomJoinableRoom()).toBeNull();
    const { code } = manager.create(ann);
    expect(manager.randomJoinableRoom()).toBe(code);

    manager.join(code, bo);
    manager.join(code, { name: "Cy", color: "green" });
    manager.join(code, { name: "Di", color: "pink" });
    expect(manager.randomJoinableRoom()).toBeNull();

    clock.t += 20_000;
    expect(manager.randomJoinableRoom()).toBeNull();
    expect(manager.peek(code)).not.toBeNull();
  });

  it("keeps Quick Play random when a saved seat is reclaimable", () => {
    let generating = true;
    let next = 0;
    const { manager } = setup({ randomInt: (max) => generating ? next++ % max : next % max });
    const first = manager.create(ann);
    const second = manager.create(bo);
    const saved = [{ code: second.code, token: second.token }];
    generating = false;
    next = 0;
    expect(manager.randomJoinableRoom(saved)).toBe(first.code);
    next = 1;
    expect(manager.randomJoinableRoom(saved)).toBe(second.code);
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
    manager.start(code, token, encodeDeal({ seed: HOST_OPENS }));
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

describe("automatic next game", () => {
  const timed = () => setup({
    awayMs: 1e9,
    randomInt: (max) => max === 2 ** 32 ? HOST_OPENS : 0,
  });

  it("starts 20 seconds after a game ends, including for a player who joins meanwhile", () => {
    const { manager, clock } = timed();
    const { code, token } = manager.create(ann);
    manager.start(code, token, encodeDeal({ seed: HOST_OPENS }));
    playToEnd(manager, code, token);
    const over = manager.update(code, token, -1);
    const winner = last(over).view.winner;
    expect(over.room.phase).toBe("over");

    clock.t += 19_999;
    expect(manager.sweep()).not.toContain(code);
    expect(manager.peek(code)!.phase).toBe("over");
    const guest = manager.join(code, bo);
    expect(manager.randomJoinableRoom()).toBe(code);
    let notifications = 0;
    manager.subscribe(code, () => notifications++);

    clock.t += 1;
    expect(manager.sweep()).toContain(code);
    expect(notifications).toBe(1);
    const next = manager.update(code, guest.token, last(over).n);
    expect(next.room.phase).toBe("playing");
    expect(next.room.games).toBe(1);
    expect(next.frames[0]).toMatchObject({ kind: "deal", view: { turn: winner, openingRequired: false } });
    expect(next.frames[0]!.view.hand).toHaveLength(13);
    expect(next.frames[0]!.view.revealed).toBeNull();
    expect(next.room.turn).toMatchObject({ endsInMs: 29_000 });
    expect(manager.sweep()).not.toContain(code);
  });

  it("does not restart a manually started game at the previous deadline", () => {
    const { manager, clock } = timed();
    const { code, token } = manager.create(ann);
    manager.start(code, token, encodeDeal({ seed: HOST_OPENS }));
    playToEnd(manager, code, token);
    clock.t += 10_000;
    manager.start(code, token, encodeDeal({ seed: HOST_OPENS, leader: 0 }));
    const started = manager.update(code, token, -1);
    clock.t += 10_000;
    expect(manager.sweep()).not.toContain(code);
    expect(manager.update(code, token, last(started).n).frames).toEqual([]);
    expect(manager.peek(code)!.phase).toBe("playing");
  });

  it("starts a fresh 20-second delay after an instant-win deal", () => {
    const { manager, clock } = timed();
    const { code, token } = manager.create(ann);
    let seed = 0;
    while (newGame({ seed }).winner === null) seed++;
    const instant = encodeDeal({ seed });
    manager.start(code, token, instant);
    clock.t += 10_000;
    manager.start(code, token, instant);
    const over = manager.update(code, token, -1);
    expect(over.room.games).toBe(2);
    clock.t += 10_000;
    expect(manager.sweep()).not.toContain(code);
    expect(manager.peek(code)!.phase).toBe("over");
    clock.t += 10_000;
    expect(manager.sweep()).toContain(code);
    expect(manager.update(code, token, last(over).n).frames[0]!.kind).toBe("deal");
    expect(manager.peek(code)!.phase).toBe("playing");
  });

  it("waits another 20 seconds if the automatic deal is an instant win", () => {
    let seed = 0;
    while (newGame({ seed }).winner === null) seed++;
    const { manager, clock } = setup({
      awayMs: 1e9,
      randomInt: (max) => max === 2 ** 32 ? seed : 0,
    });
    const { code, token } = manager.create(ann);
    manager.start(code, token, encodeDeal({ seed }));
    clock.t += 20_000;
    expect(manager.sweep()).toContain(code);
    const over = manager.update(code, token, -1);
    expect(over.room).toMatchObject({ phase: "over", games: 2 });
    clock.t += 19_999;
    expect(manager.sweep()).not.toContain(code);
    clock.t++;
    expect(manager.sweep()).toContain(code);
    expect(manager.update(code, token, last(over).n).frames).toHaveLength(1);
    expect(manager.peek(code)!.games).toBe(3);
  });

  it("removes disconnected humans before the automatic start", () => {
    const { manager, clock } = setup({ awayMs: 5_000 });
    const { code, token } = manager.create(ann);
    manager.start(code, token, encodeDeal({ seed: HOST_OPENS }));
    playToEnd(manager, code, token);
    clock.t += 20_000;
    expect(manager.sweep()).toContain(code);
    expect(manager.peek(code)).toBeNull();
  });

  it("hands over an expired host before starting for a recent joiner", () => {
    const { manager, clock } = setup({
      awayMs: 5_000,
      randomInt: (max) => max === 2 ** 32 ? HOST_OPENS : 0,
    });
    const { code, token } = manager.create(ann);
    let seed = 0;
    while (newGame({ seed }).winner === null) seed++;
    manager.start(code, token, encodeDeal({ seed }));
    clock.t += 15_000;
    manager.seen(code, token);
    clock.t += 4_999;
    expect(manager.randomJoinableRoom()).toBe(code);
    const guest = manager.join(code, bo);
    clock.t++;
    expect(manager.sweep()).toContain(code);
    const room = manager.update(code, guest.token, -1).room;
    expect(room.phase).toBe("playing");
    expect(room.host).toBe(1);
    expect(room.seats[0]!.kind).toBe("bot");
    expect(room.seats[1]!.kind).toBe("human");
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
  it("releases a quiet player's seat at the deadline, lets a bot play, and allows rejoining", () => {
    const { manager, clock } = setup({ turnMs: 60_000 });
    const { code, token } = manager.create(ann);
    const guest = manager.join(code, bo);
    manager.start(code, token, encodeDeal({ seed: 28, leader: 1 }));
    const start = manager.update(code, token, -1);
    expect(last(start).view.turn).toBe(1);

    clock.t += 4_999;
    manager.update(code, token, -1);
    manager.sweep();
    expect(manager.peek(code)!.seats[1]!.kind).toBe("human");

    clock.t += 1;
    expect(manager.sweep()).toContain(code);

    const after = manager.update(code, token, last(start).n);
    expect(after.frames.length).toBeGreaterThan(0);
    expect(after.frames[0]).toMatchObject({ kind: "move", by: 1, bot: true });
    expect(after.room.seats[1]).toMatchObject({ kind: "bot", strikes: 0 });
    expectError(() => manager.update(code, guest.token, -1), 401);

    const back = manager.join(code, bo, guest.token);
    expect(back.token).toBe(guest.token);
    expect(manager.update(code, back.token, -1).room.seats[1]!.kind).toBe("human");
  });

  it("releases the disconnected host and passes the host role to a remaining player", () => {
    const { manager, clock } = setup({ awayMs: 10_000 });
    const { code, token } = manager.create(ann);
    const guest = manager.join(code, bo);
    const other = manager.join(code, { name: "Cy", color: "green" });
    clock.t += 10_000;
    manager.update(code, guest.token, -1);
    expect(manager.sweep()).toContain(code);
    const room = manager.update(code, guest.token, -1).room;
    expect(room.host).toBe(1);
    expect(room.seats[0]!.kind).toBe("bot");
    expect(room.seats[2]!.kind).toBe("bot");
    expectError(() => manager.update(code, token, -1), 401);
    expectError(() => manager.update(code, other.token, -1), 401);
  });

  it("deletes a room immediately when all humans time out together", () => {
    const { manager, clock } = setup({ awayMs: 10_000 });
    const { code, token } = manager.create(ann);
    manager.join(code, bo);
    clock.t += 10_000;
    expect(manager.sweep()).toContain(code);
    expect(manager.peek(code)).toBeNull();
    expectError(() => manager.update(code, token, -1), 404);
  });

  it("refreshes the disconnect deadline on each poll", () => {
    const { manager, clock } = setup({ awayMs: 10_000 });
    const { code, token } = manager.create(ann);
    clock.t += 9_000;
    manager.seen(code, token);
    clock.t += 9_999;
    manager.sweep();
    expect(manager.peek(code)).not.toBeNull();
    clock.t += 1;
    expect(manager.sweep()).toContain(code);
    expect(manager.peek(code)).toBeNull();
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

  it("lets the host kick a player, covers their seat with a bot, and rejects their saved token", () => {
    const { manager } = setup();
    const { code, token } = manager.create(ann);
    const guest = manager.join(code, bo);
    manager.kick(code, token, 1);
    const room = manager.update(code, token, -1).room;
    expect(room.seats[1]).toMatchObject({ kind: "bot", name: "Bot One" });
    expectError(() => manager.update(code, guest.token, -1), 401);
    expectError(() => manager.join(code, bo, guest.token), 403);

    const returned = manager.join(code, bo);
    expect(manager.update(code, returned.token, -1).seat).toBe(1);
  });

  it("only lets the host kick another human seat", () => {
    const { manager } = setup();
    const { code, token } = manager.create(ann);
    const guest = manager.join(code, bo);
    expectError(() => manager.kick(code, guest.token, 0), 403);
    expectError(() => manager.kick(code, token, 0), 409);
    expectError(() => manager.kick(code, token, 2), 409);
    expectError(() => manager.kick(code, token, 4), 400);
  });
});

describe("turn timer", () => {
  const timed = () => setup({ turnMs: 10_000, turnGraceMs: 0, awayMs: 1e9 });
  const idle = (clock: { t: number }, manager: RoomManager) => {
    clock.t += 10_001;
    manager.sweep();
  };

  it("has a bot play for a human who runs out of time, and counts a strike without taking the seat", () => {
    const { manager, clock } = timed();
    const { code, token } = manager.create(ann);
    manager.start(code, token, encodeDeal({ seed: HOST_OPENS }));
    const before = manager.update(code, token, -1);
    expect(before.room.turn).toMatchObject({ seat: 0, endsInMs: 10_000, limitMs: 10_000 });

    clock.t += 9_000;
    manager.sweep();
    expect(manager.update(code, token, -1).room.seats[0]!.strikes).toBe(0);

    idle(clock, manager);
    const after = manager.update(code, token, -1);
    expect(after.room.seats[0]).toMatchObject({ kind: "human", strikes: 1 });
    expect(after.frames.find((f) => f.by === 0 && f.n > before.frames.length - 1)?.bot).toBe(true);
    expect(after.room.turn).toMatchObject({ seat: 0, endsInMs: 10_000 }); // a fresh clock for the next turn
  });

  it("restarts the clock whenever the player moves in time", () => {
    const { manager, clock } = timed();
    const { code, token } = manager.create(ann);
    manager.start(code, token, encodeDeal({ seed: HOST_OPENS }));
    for (let i = 0; i < 4; i++) {
      clock.t += 9_000;
      manager.sweep();
      playFirstLegal(manager, code, token);
      if (manager.update(code, token, -1).room.phase !== "playing") break;
    }
    expect(manager.update(code, token, -1).room.seats[0]!.strikes).toBe(0);
  });

  it("takes the seat on the third strike and refuses the player's old token", () => {
    const { manager, clock } = timed();
    const { code, token } = manager.create(ann);
    const guest = manager.join(code, bo);
    manager.start(code, token, encodeDeal({ seed: HOST_OPENS }));
    playFirstLegal(manager, code, token);
    // The guest is up (bots played in between); let them time out three times.
    const guestTurn = () => manager.update(code, guest.token, -1).room.turn?.seat === 1;
    for (let strikes = 1; strikes <= 3; strikes++) {
      expect(guestTurn()).toBe(true);
      idle(clock, manager);
      if (strikes < 3) {
        expect(manager.update(code, token, -1).room.seats[1]).toMatchObject({ kind: "human", strikes });
        playFirstLegal(manager, code, token);
      }
    }
    const room = manager.update(code, token, -1).room;
    expect(room.seats[1]).toMatchObject({ kind: "bot", strikes: 0 });
    expectError(() => manager.update(code, guest.token, -1), 401);
    expectError(() => manager.join(code, bo, guest.token), 403);
  });

  it("deletes the room when the only human is removed for running out of time", () => {
    const { manager, clock } = timed();
    const { code, token } = manager.create(ann);
    manager.start(code, token, encodeDeal({ seed: HOST_OPENS }));
    for (let i = 0; i < 3; i++) idle(clock, manager);
    expect(manager.peek(code)).toBeNull();
    expectError(() => manager.update(code, token, -1), 404);
  });

  it("hands the host role on when the host is removed", () => {
    const { manager, clock } = timed();
    const { code, token } = manager.create(ann);
    const guest = manager.join(code, bo);
    manager.start(code, token, encodeDeal({ seed: HOST_OPENS }));
    for (let i = 0; i < 3; i++) {
      idle(clock, manager);
      // Keep the guest from timing out themselves while the host is the one running out of time.
      if (manager.update(code, guest.token, -1).room.turn?.seat === 1) playFirstLegal(manager, code, guest.token);
    }
    const room = manager.update(code, guest.token, -1).room;
    expect(room.seats[0]!.kind).toBe("bot");
    expect(room.host).toBe(1);
  });

  it("starts the strike count again after leaving the room", () => {
    const { manager, clock } = timed();
    const { code, token } = manager.create(ann);
    const guest = manager.join(code, bo);
    manager.start(code, token, encodeDeal({ seed: HOST_OPENS }));
    playFirstLegal(manager, code, token);
    idle(clock, manager);
    expect(manager.update(code, token, -1).room.seats[1]!.strikes).toBe(1);
    manager.leave(code, guest.token);
    const back = manager.join(code, bo, guest.token);
    expect(manager.update(code, back.token, -1).room.seats[manager.update(code, back.token, -1).seat]!.strikes).toBe(0);
  });

  it("removes a disconnected player before applying a turn timeout", () => {
    const { manager, clock } = setup({ turnMs: 10_000, turnGraceMs: 0, awayMs: 5_000 });
    const { code, token } = manager.create(ann);
    const guest = manager.join(code, bo);
    manager.start(code, token, encodeDeal({ seed: HOST_OPENS }));
    clock.t += 20_000;
    manager.update(code, guest.token, -1); // only the guest is heard from
    manager.sweep();
    const room = manager.update(code, guest.token, -1).room;
    expect(room.seats[0]).toMatchObject({ kind: "bot", strikes: 0 });
    expect(manager.join(code, ann, token).token).toBe(token);
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
