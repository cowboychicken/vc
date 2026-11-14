import { describe, expect, it } from "vitest";
import { cleanName } from "../src/net/protocol";
import { FUNNY_NAMES } from "../src/ui/profile";

describe("funny names", () => {
  it("are all valid display names, unique, and unchanged by cleaning", () => {
    expect(new Set(FUNNY_NAMES).size).toBe(FUNNY_NAMES.length);
    for (const name of FUNNY_NAMES) expect(cleanName(name)).toBe(name);
  });
});
