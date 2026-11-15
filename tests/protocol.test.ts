import { describe, expect, it } from "vitest";
import {
  MAX_NAME_LENGTH,
  PALETTE,
  ROOM_ALPHABET,
  botName,
  cleanName,
  colorHex,
  formatRoomCode,
  isColorId,
  normalizeRoomCode,
  parseMove,
  parseProfile,
  parseRules,
  parseSince,
  uniqueName,
} from "../src/net/protocol";

/** WCAG relative luminance contrast of a #rrggbb colour against white. */
function contrastOnWhite(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return 1.05 / (luminance + 0.05);
}

describe("palette", () => {
  it("has unique ids and every colour is readable as text on white", () => {
    expect(new Set(PALETTE.map((c) => c.id)).size).toBe(PALETTE.length);
    for (const { id, hex } of PALETTE) expect(contrastOnWhite(hex), id).toBeGreaterThanOrEqual(4.5);
  });

  it("only accepts known colour ids, and maps them to hex", () => {
    expect(isColorId("red")).toBe(true);
    expect(isColorId("white")).toBe(false);
    expect(PALETTE.some((c) => c.hex.toLowerCase() === "#ffffff")).toBe(false);
    expect(isColorId("#ff0000")).toBe(false);
    expect(isColorId("red; background:url(x)")).toBe(false);
    expect(isColorId(undefined)).toBe(false);
    expect(colorHex("blue")).toBe("#1565c0");
    expect(colorHex(null)).toBeNull();
  });
});

describe("names", () => {
  it("trims, collapses whitespace and limits to 12 characters", () => {
    expect(cleanName("  Aaron   T  ")).toBe("Aaron T");
    expect(cleanName("x".repeat(40))).toBe("x".repeat(MAX_NAME_LENGTH));
    expect(cleanName("😀".repeat(20))).toBe("😀".repeat(MAX_NAME_LENGTH));
  });

  it("removes control, zero-width and direction-override characters", () => {
    expect(cleanName("A\u0000B\u200bC\u202eD\ufeffE\n")).toBe("ABCDE");
    expect(cleanName("\u200b\u202e  ")).toBe("");
  });

  it("rejects non-strings", () => {
    for (const bad of [null, undefined, 5, {}, ["a"]]) expect(cleanName(bad)).toBe("");
  });

  it("makes names unique without regard to case, within the length limit", () => {
    expect(uniqueName("Sam", [])).toBe("Sam");
    expect(uniqueName("Sam", ["sam"])).toBe("Sam 2");
    expect(uniqueName("Sam", ["Sam", "Sam 2", "SAM 3"])).toBe("Sam 4");
    const long = "x".repeat(MAX_NAME_LENGTH);
    const next = uniqueName(long, [long]);
    expect([...next].length).toBeLessThanOrEqual(MAX_NAME_LENGTH);
    expect(next.endsWith(" 2")).toBe(true);
  });

  it("gives bots fixed names that a player's name is kept apart from", () => {
    expect([0, 1, 2, 3].map(botName)).toEqual(["Bot Four", "Bot One", "Bot Two", "Bot Three"]);
    expect(uniqueName("bot one", [botName(1)])).toBe("bot one 2");
  });
});

describe("room codes", () => {
  it("accepts codes however they are typed", () => {
    expect(normalizeRoomCode("abc234")).toBe("ABC234");
    expect(normalizeRoomCode("ABC-234")).toBe("ABC234");
    expect(normalizeRoomCode(" abc 234 ")).toBe("ABC234");
    expect(normalizeRoomCode("O0IL1B")).toBe("00111B");
  });

  it("rejects the wrong length, letters outside the alphabet and non-strings", () => {
    expect(normalizeRoomCode("ABC23")).toBeNull();
    expect(normalizeRoomCode("ABC2345")).toBeNull();
    expect(normalizeRoomCode("ABCUUU")).toBeNull();
    expect(normalizeRoomCode("ABC!34")).toBeNull();
    expect(normalizeRoomCode(123456)).toBeNull();
    expect(normalizeRoomCode(null)).toBeNull();
  });

  it("formats with a hyphen and the alphabet has no look-alikes", () => {
    expect(formatRoomCode("ABC234")).toBe("ABC-234");
    for (const ch of "ILOU") expect(ROOM_ALPHABET).not.toContain(ch);
    expect(ROOM_ALPHABET).toHaveLength(32);
  });
});

describe("parsing untrusted input", () => {
  it("accepts well-formed moves", () => {
    expect(parseMove({ type: "pass" })).toEqual({ type: "pass" });
    expect(parseMove({ type: "play", cards: [0, 5, 51] })).toEqual({ type: "play", cards: [0, 5, 51] });
  });

  it.each([
    null,
    "pass",
    [],
    {},
    { type: "play" },
    { type: "play", cards: [] },
    { type: "play", cards: [1, 1] },
    { type: "play", cards: [52] },
    { type: "play", cards: [-1] },
    { type: "play", cards: [1.5] },
    { type: "play", cards: ["3"] },
    { type: "play", cards: Array.from({ length: 14 }, (_, i) => i) },
    { type: "fold" },
  ])("rejects a malformed move %#", (input) => {
    expect(parseMove(input)).toBeNull();
  });

  it("parses rules and profiles strictly", () => {
    expect(parseRules({ bombsBeatAnything: true, extra: 1 })).toEqual({ bombsBeatAnything: true });
    expect(parseRules({ bombsBeatAnything: "yes" })).toBeNull();
    expect(parseRules(null)).toBeNull();
    expect(parseProfile({ name: " Ann ", color: "teal" })).toEqual({ name: "Ann", color: "teal" });
    expect(parseProfile({ name: "", color: "teal" })).toBeNull();
    expect(parseProfile({ name: "Ann", color: "chartreuse" })).toBeNull();
    expect(parseProfile("Ann")).toBeNull();
  });

  it("treats a bad since as the start", () => {
    expect(parseSince(7)).toBe(7);
    expect(parseSince(-1)).toBe(-1);
    for (const bad of [undefined, "3", -5, 1.5, null, NaN]) expect(parseSince(bad)).toBe(-1);
  });
});
