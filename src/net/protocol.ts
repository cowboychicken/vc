import type { BotLevel } from "../bots";
import { DECK_SIZE, type Move, type PlayerView, type RuleOptions } from "../engine";

/** Bump when the wire format or game rules change in a way an old page can't cope with. */
export const PROTOCOL_VERSION = 5;
export const VERSION_HEADER = "x-vc13-version";

export const NUM_SEATS = 4;
export const MAX_NAME_LENGTH = 12;

// --- Names and colours -------------------------------------------------------------------------

/** Colours that stay readable (4.5:1 or better) as text on a white page. Sent by id, never as CSS. */
export const PALETTE = [
  { id: "red", hex: "#c62828" },
  { id: "orange", hex: "#b45309" },
  { id: "green", hex: "#2e7d32" },
  { id: "teal", hex: "#00796b" },
  { id: "blue", hex: "#1565c0" },
  { id: "indigo", hex: "#3949ab" },
  { id: "purple", hex: "#7b1fa2" },
  { id: "pink", hex: "#ad1457" },
  { id: "brown", hex: "#6d4c41" },
  { id: "slate", hex: "#455a64" },
] as const;

export type ColorId = (typeof PALETTE)[number]["id"];

export const isColorId = (value: unknown): value is ColorId => PALETTE.some((c) => c.id === value);

export const colorHex = (id: ColorId | null): string | null => PALETTE.find((c) => c.id === id)?.hex ?? null;

// Control characters, zero-width characters and bidi overrides have no place in a display name.
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g;

/** Trims, collapses spaces and limits length. Returns "" if there is nothing usable. */
export function cleanName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const text = raw.replace(INVISIBLE, "").replace(/\s+/g, " ").trim();
  return [...text].slice(0, MAX_NAME_LENGTH).join("").trim();
}

/** Bots keep fixed names by seat, so a name never changes meaning mid-game. */
const BOT_NAMES = ["Bot Four", "Bot One", "Bot Two", "Bot Three"] as const;
export const botName = (seat: number): string => BOT_NAMES[seat] ?? `Bot ${seat + 1}`;

/** Adds " 2", " 3"… so no two seats share a name (compared without regard to case). */
export function uniqueName(name: string, taken: readonly string[]): string {
  const used = new Set(taken.map((t) => t.toLowerCase()));
  if (!used.has(name.toLowerCase())) return name;
  for (let n = 2; ; n++) {
    const suffix = ` ${n}`;
    const candidate = [...name].slice(0, MAX_NAME_LENGTH - suffix.length).join("").trimEnd() + suffix;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
}

// --- Room codes --------------------------------------------------------------------------------

// Crockford base32: no I, L, O or U, so codes survive being read aloud or typed on a phone.
export const ROOM_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const ROOM_CODE_LENGTH = 6;

/** Reads a code typed or pasted by a person; null if it can't be a room code. */
export function normalizeRoomCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const text = input
    .toUpperCase()
    .replace(/[\s_-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  if (text.length !== ROOM_CODE_LENGTH) return null;
  return [...text].every((ch) => ROOM_ALPHABET.includes(ch)) ? text : null;
}

export const formatRoomCode = (code: string): string => `${code.slice(0, 3)}-${code.slice(3)}`;

// --- Wire types --------------------------------------------------------------------------------

export type Phase = "lobby" | "playing" | "over";

export interface SeatInfo {
  kind: "human" | "bot";
  playerId: number;
  name: string;
  color: ColorId | null;
  /** A human who has not been heard from recently; a bot plays for them until they are back. */
  away: boolean;
  host: boolean;
  /** Turns this player has let run out in this room; at the limit they lose the seat. */
  strikes: number;
}

/** The human turn being timed. A bot plays for them when it runs out. */
export interface TurnInfo {
  seat: number;
  /** Time left on the server's clock when this response was made, including a short allowance for playback. */
  endsInMs: number;
  /** The nominal time per turn, which is what a countdown should start from. */
  limitMs: number;
}

export interface RoomPlayerStats {
  id: number;
  name: string;
  kind: "human" | "bot";
  games: number;
  wins: number;
  present: boolean;
}

export interface RoomSettings {
  rules: RuleOptions;
  botLevel: BotLevel;
}

export interface RoomInfo {
  code: string;
  /** Bumps on every change, so a client can ask "anything newer than this?". */
  rev: number;
  phase: Phase;
  seats: SeatInfo[];
  host: number;
  settings: RoomSettings;
  /** Games finished in this room, and how many each seat has won. */
  games: number;
  wins: number[];
  /** Room-lifetime totals by participant, including players who have left. */
  playerStats: RoomPlayerStats[];
  /** Deal code of the current or last game. For reference only: online play never loads a deal from a code. */
  dealCode: string | null;
  /** Whose turn is being timed, or null when a bot is up, nobody is playing or the seat is away. */
  turn: TurnInfo | null;
  /** Timed-out turns a player may have before losing the seat. */
  maxStrikes: number;
}

/** One step of a game. The view is already trimmed to what the receiving seat may see. */
export interface Frame {
  /** Counts up for the life of the room, so a client can ask for everything after the last one it saw. */
  n: number;
  kind: "deal" | "move";
  /** Seat that moved, or -1 for a deal. */
  by: number;
  /** The move was made by a bot (a bot seat, or a bot covering for an absent player). */
  bot: boolean;
  view: PlayerView;
}

export interface UpdateResponse {
  seat: number;
  room: RoomInfo;
  frames: Frame[];
}

export interface JoinResponse extends UpdateResponse {
  token: string;
}

export interface QuickplayResponse extends JoinResponse {
  created: boolean;
}

export interface Profile {
  name: string;
  color: ColorId;
}

export interface CreateRoomRequest extends Profile {
  /** The creator's preferences, used until the host changes them. */
  rules?: RuleOptions;
  botLevel?: BotLevel;
}
export interface JoinRoomRequest extends Profile {
  /** Token from an earlier visit, to reclaim a seat or return with the same room stats. */
  token?: string;
}
export interface KickRequest {
  seat: number;
  since: number;
}
export interface SinceRequest {
  since: number;
}
export interface MoveRequest extends SinceRequest {
  move: Move;
}
export type StartRequest = SinceRequest;
export interface SettingsRequest extends SinceRequest {
  rules?: RuleOptions;
  botLevel?: BotLevel;
}
export interface ProfileRequest extends SinceRequest, Profile {}

export type ErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "outdated"
  | "rate_limited"
  | "too_large"
  | "server_error";

export interface ErrorBody {
  error: ErrorCode;
  message: string;
}

// --- Validation of untrusted input -------------------------------------------------------------

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function parseMove(input: unknown): Move | null {
  if (!isRecord(input)) return null;
  if (input.type === "pass") return { type: "pass" };
  if (input.type !== "play" || !Array.isArray(input.cards)) return null;
  const cards: unknown[] = input.cards;
  const valid =
    cards.length >= 1 &&
    cards.length <= 13 &&
    cards.every((c) => Number.isInteger(c) && (c as number) >= 0 && (c as number) < DECK_SIZE) &&
    new Set(cards).size === cards.length;
  return valid ? { type: "play", cards: cards as number[] } : null;
}

export function parseRules(input: unknown): RuleOptions | null {
  return isRecord(input) && typeof input.bombsBeatAnything === "boolean"
    ? { bombsBeatAnything: input.bombsBeatAnything }
    : null;
}

export function parseBotLevel(input: unknown): BotLevel | null {
  return input === "easy" || input === "normal" ? input : null;
}

export function parseProfile(input: unknown): Profile | null {
  if (!isRecord(input)) return null;
  const name = cleanName(input.name);
  return name !== "" && isColorId(input.color) ? { name, color: input.color } : null;
}

export function parseSince(input: unknown): number {
  return Number.isInteger(input) && (input as number) >= -1 ? (input as number) : -1;
}
