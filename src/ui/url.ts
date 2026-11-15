import { type NewGameOptions, NUM_PLAYERS, decodeDeal } from "../engine";
import { normalizeRoomCode } from "../net/protocol";

export const randomSeed = (): number => Math.floor(Math.random() * 2 ** 32);

function parseUint(text: string | null): number | null {
  if (text === null || !/^\d+$/.test(text)) return null;
  const n = Number(text);
  return Number.isSafeInteger(n) ? n >>> 0 : null;
}

/** `?code=XXXX-XXXX` replays a deal. `?seed=N` (and `&leader=0..3`) is the long form of the same thing. */
export function startingOptions(search: string = window.location.search): NewGameOptions {
  const params = new URLSearchParams(search);
  const code = params.get("code");
  const deal = code === null ? null : decodeDeal(code);
  if (deal) return deal;
  const seed = parseUint(params.get("seed"));
  if (seed === null) return { seed: randomSeed() };
  const leader = parseUint(params.get("leader"));
  return leader !== null && leader < NUM_PLAYERS ? { seed, leader } : { seed };
}

/** `?room=ABC-234` opens an online room. Returns the normalised code, or null. */
export function roomFromUrl(search: string = window.location.search): string | null {
  return normalizeRoomCode(new URLSearchParams(search).get("room"));
}

/** Replaces the address bar without adding a history entry. */
export function setAddress(search: string): void {
  const url = new URL(window.location.href);
  url.search = search;
  url.hash = "";
  window.history.replaceState(null, "", url);
}
