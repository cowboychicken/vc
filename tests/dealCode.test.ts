import { describe, expect, it } from "vitest";
import { decodeDeal, encodeDeal, makeRng } from "../src/engine";

describe("deal codes", () => {
  it("round-trips every kind of deal, including the extreme seeds", () => {
    const rng = makeRng(1234);
    const seeds = [0, 1, 5, 2 ** 31, 2 ** 32 - 1, ...Array.from({ length: 300 }, () => Math.floor(rng() * 2 ** 32))];
    for (const seed of seeds) {
      for (const leader of [undefined, 0, 1, 2, 3]) {
        const code = encodeDeal({ seed, leader });
        expect(code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/);
        expect(decodeDeal(code)).toEqual(leader === undefined ? { seed } : { seed, leader });
      }
    }
  });

  it("looks the same however a person types it", () => {
    const code = encodeDeal({ seed: 305419896, leader: 2 });
    const deal = { seed: 305419896, leader: 2 };
    expect(decodeDeal(code.toLowerCase())).toEqual(deal);
    expect(decodeDeal(code.replace("-", ""))).toEqual(deal);
    expect(decodeDeal(`  ${code.replace("-", " ")}  `)).toEqual(deal);
  });

  it("reads O, I and L as the digits they look like", () => {
    const code = encodeDeal({ seed: 0 }); // 0000-0000
    expect(code).toBe("0000-0000");
    expect(decodeDeal("OOOO-OOOO")).toEqual({ seed: 0 });
    expect(decodeDeal(encodeDeal({ seed: 1 }).replace(/1/g, "l"))).toEqual({ seed: 1 });
  });

  it("rejects a code with any single character changed", () => {
    const code = encodeDeal({ seed: 987654321, leader: 1 }).replace("-", "");
    const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    for (let i = 0; i < code.length; i++) {
      for (const ch of alphabet) {
        if (ch === code[i]) continue;
        const changed = code.slice(0, i) + ch + code.slice(i + 1);
        expect(decodeDeal(changed), changed).toBeNull();
      }
    }
  });

  it("rejects codes of the wrong length or with letters outside the alphabet", () => {
    const code = encodeDeal({ seed: 42 });
    expect(decodeDeal("")).toBeNull();
    expect(decodeDeal(code.slice(0, -1))).toBeNull();
    expect(decodeDeal(`${code}0`)).toBeNull();
    expect(decodeDeal("UUUU-UUUU")).toBeNull();
    expect(decodeDeal("????-????")).toBeNull();
  });

  it("rejects a code whose leader slot is invalid", () => {
    // Slot 7 is unused (only 0..4 mean anything), so build one with a correct check digit by hand.
    const digits = [0, 0, 0, 0, 0, 0, 7];
    const check = digits.reduce((sum, d, i) => sum + d * (2 * i + 1), 0) % 32;
    const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    expect(decodeDeal("000000" + "7" + alphabet[check])).toBeNull();
  });

  it("refuses to encode a deal that can't be represented", () => {
    expect(() => encodeDeal({ seed: -1 })).toThrow(RangeError);
    expect(() => encodeDeal({ seed: 2 ** 32 })).toThrow(RangeError);
    expect(() => encodeDeal({ seed: 1.5 })).toThrow(RangeError);
    expect(() => encodeDeal({ seed: 1, leader: 4 })).toThrow(RangeError);
    expect(() => encodeDeal({ seed: 1, leader: -1 })).toThrow(RangeError);
  });
});
