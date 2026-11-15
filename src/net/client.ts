import type { BotLevel } from "../bots";
import type { Move, RuleOptions } from "../engine";
import {
  type CreateRoomRequest,
  type ErrorBody,
  type ErrorCode,
  type KickRequest,
  type JoinResponse,
  type JoinRoomRequest,
  type MoveRequest,
  PROTOCOL_VERSION,
  type Profile,
  type ProfileRequest,
  type QuickplayRequest,
  type QuickplayResponse,
  type RoomInfo,
  type SavedRoomToken,
  type SettingsRequest,
  type StartRequest,
  type UpdateResponse,
  VERSION_HEADER,
} from "./protocol";

/** `network` means the request never got an answer (offline, server restarting, proxy hiccup). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | "network",
    message: string,
  ) {
    super(message);
  }
}

interface Options {
  token?: string;
  body?: unknown;
  signal?: AbortSignal;
}

async function request<T>(method: "GET" | "POST", path: string, { token, body, signal }: Options = {}): Promise<T> {
  const headers: Record<string, string> = { [VERSION_HEADER]: String(PROTOCOL_VERSION) };
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal });
  } catch (error) {
    if (signal?.aborted) throw error; // the caller hung up on purpose
    throw new ApiError(0, "network", "Can't reach the server.");
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // not JSON; handled below
  }
  if (!res.ok) {
    const failure = data as Partial<ErrorBody> | null;
    throw new ApiError(res.status, failure?.error ?? "server_error", failure?.message ?? `Server error (${res.status}).`);
  }
  return data as T;
}

const room = (code: string, action = "") => `/api/rooms/${code}${action ? `/${action}` : ""}`;

export const createRoom = (profile: Profile, prefs: { rules: RuleOptions; botLevel: BotLevel }) =>
  request<JoinResponse>("POST", "/api/rooms", { body: { ...profile, ...prefs } satisfies CreateRoomRequest });

export const quickplayRoom = (profile: Profile, prefs: { rules: RuleOptions; botLevel: BotLevel }, roomTokens: SavedRoomToken[]) =>
  request<QuickplayResponse>("POST", "/api/rooms/quickplay", { body: { ...profile, ...prefs, roomTokens } satisfies QuickplayRequest });

export const peekRoom = (code: string) => request<RoomInfo>("GET", room(code));

export const joinRoom = (code: string, profile: Profile, token?: string) =>
  request<JoinResponse>("POST", room(code, "join"), { body: { ...profile, token } satisfies JoinRoomRequest });

/** Waits up to `wait` seconds for something new, then answers either way. */
export const getUpdates = (
  code: string,
  token: string,
  { since, rev, wait, signal }: { since: number; rev: number; wait: number; signal?: AbortSignal },
) => request<UpdateResponse>("GET", `${room(code, "updates")}?since=${since}&rev=${rev}&wait=${wait}`, { token, signal });

export const sendMove = (code: string, token: string, move: Move, since: number) =>
  request<UpdateResponse>("POST", room(code, "move"), { token, body: { move, since } satisfies MoveRequest });

export const startGame = (code: string, token: string, since: number) =>
  request<UpdateResponse>("POST", room(code, "start"), { token, body: { since } satisfies StartRequest });

export const sendSettings = (
  code: string,
  token: string,
  since: number,
  patch: { rules?: RuleOptions; botLevel?: BotLevel },
) => request<UpdateResponse>("POST", room(code, "settings"), { token, body: { since, ...patch } satisfies SettingsRequest });

export const sendProfile = (code: string, token: string, since: number, profile: Profile) =>
  request<UpdateResponse>("POST", room(code, "profile"), { token, body: { since, ...profile } satisfies ProfileRequest });

export const kickRoomPlayer = (code: string, token: string, seat: number, since: number) =>
  request<UpdateResponse>("POST", room(code, "kick"), { token, body: { seat, since } satisfies KickRequest });

export const leaveRoom = (code: string, token: string) =>
  request<{ ok: true }>("POST", room(code, "leave"), { token, body: {} });
