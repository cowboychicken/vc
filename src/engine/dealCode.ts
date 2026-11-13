/**
 * A deal code is a short, typeable name for a deal, shown as `XXXX-XXXX`.
 * It holds the 32-bit seed, who leads (nobody for a first game, where the 3♠ holder leads),
 * and a check character so a mistyped code is rejected instead of silently loading another deal.
 * House rules and bot settings are not part of it.
 */
export interface Deal {
  seed: number;
  /** Seat that leads freely. Omit for a first game. */
  leader?: number;
}

// Crockford base32: no I, L, O or U, so codes survive being read aloud or typed.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const PAYLOAD_DIGITS = 7;
const CODE_LENGTH = PAYLOAD_DIGITS + 1;
const MAX_LEADER = 3;
const SEED_LIMIT = 2 ** 32;
const LEADER_SLOTS = 8; // 0 = no leader, 1..4 = seat 0..3

// Odd weights, so changing any single character always changes the check digit.
function checkDigit(digits: readonly number[]): number {
  return digits.reduce((sum, d, i) => sum + d * (2 * i + 1), 0) % 32;
}

export function encodeDeal({ seed, leader }: Deal): string {
  if (!Number.isInteger(seed) || seed < 0 || seed >= SEED_LIMIT) throw new RangeError(`Bad seed: ${seed}`);
  if (leader !== undefined && (!Number.isInteger(leader) || leader < 0 || leader > MAX_LEADER)) {
    throw new RangeError(`Bad leader: ${leader}`);
  }
  let value = seed * LEADER_SLOTS + (leader === undefined ? 0 : leader + 1);
  const digits: number[] = [];
  for (let i = 0; i < PAYLOAD_DIGITS; i++) {
    digits.unshift(value % 32);
    value = Math.floor(value / 32);
  }
  digits.push(checkDigit(digits));
  const text = digits.map((d) => ALPHABET[d]).join("");
  return `${text.slice(0, 4)}-${text.slice(4)}`;
}

/** Reads a code typed or pasted by a person. Returns null if it isn't a valid code. */
export function decodeDeal(input: string): Deal | null {
  const text = input
    .toUpperCase()
    .replace(/[\s_-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  if (text.length !== CODE_LENGTH) return null;
  const digits = [...text].map((ch) => ALPHABET.indexOf(ch));
  if (digits.includes(-1)) return null;
  const check = digits.pop()!;
  if (check !== checkDigit(digits)) return null;
  const value = digits.reduce((acc, d) => acc * 32 + d, 0);
  const leaderSlot = value % LEADER_SLOTS;
  if (leaderSlot > MAX_LEADER + 1) return null;
  const seed = Math.floor(value / LEADER_SLOTS);
  return leaderSlot === 0 ? { seed } : { seed, leader: leaderSlot - 1 };
}
