import { MAX_SAVED_ROOMS, type SavedRoomToken, parseRoomTokens } from "../../net/protocol";

const KEY = "vc13.rooms";

interface Stored {
  token: string;
  at: number;
}

function read(): Record<string, Stored> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, Stored>) : {};
  } catch {
    return {};
  }
}

function write(all: Record<string, Stored>): void {
  try {
    // Keep only the few most recent rooms.
    const newest = Object.entries(all)
      .sort(([, a], [, b]) => b.at - a.at)
      .slice(0, MAX_SAVED_ROOMS);
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(newest)));
  } catch {
    // storage unavailable; the seat just can't be reclaimed after a reload
  }
}

/** The room token also identifies a returning player after they have left their seat. */
export function loadSeatToken(code: string): string | undefined {
  const stored = read()[code];
  return typeof stored?.token === "string" ? stored.token : undefined;
}

export function loadSeatTokens(): SavedRoomToken[] {
  return Object.entries(read())
    .flatMap(([code, stored]) => parseRoomTokens([{ code, token: stored?.token }]) ?? [])
    .slice(0, MAX_SAVED_ROOMS);
}

export function saveSeatToken(code: string, token: string): void {
  write({ ...read(), [code]: { token, at: Date.now() } });
}

export function forgetSeatToken(code: string): void {
  const all = read();
  delete all[code];
  write(all);
}
