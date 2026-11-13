import { createContext, useContext } from "react";
import { NUM_PLAYERS } from "../engine";
import { type ColorId, type RoomInfo, colorHex } from "../net/protocol";

/** Who is sitting where, as seen from one screen. `me` is the seat shown at the bottom. */
export interface Players {
  me: number;
  /** Display names by seat, as other players see them. */
  names: readonly string[];
  colors: readonly (ColorId | null)[];
  /** Humans who are not around right now (a bot is covering for them). */
  away: readonly boolean[];
}

export const LOCAL_PLAYERS: Players = {
  me: 0,
  names: ["You", "Bot One", "Bot Two", "Bot Three"],
  colors: [null, null, null, null],
  away: [false, false, false, false],
};

/** The people at a room's table, from the point of view of the seat `me`. */
export function playersFromRoom(room: RoomInfo, me: number): Players {
  return {
    me,
    names: room.seats.map((s) => s.name),
    colors: room.seats.map((s) => s.color),
    away: room.seats.map((s) => s.away),
  };
}

export const PlayersContext = createContext<Players>(LOCAL_PLAYERS);
export const usePlayers = (): Players => useContext(PlayersContext);

export const nameOf = (p: Players, seat: number): string => (seat === p.me ? "You" : (p.names[seat] ?? `Seat ${seat + 1}`));
export const possessiveOf = (p: Players, seat: number): string => (seat === p.me ? "your" : `${nameOf(p, seat)}'s`);

/** 0 is the bottom of the screen (me), then clockwise: left, top, right. */
export const relSeat = (p: Players, seat: number): number => (seat - p.me + NUM_PLAYERS) % NUM_PLAYERS;
export const seatAt = (p: Players, rel: number): number => (p.me + rel) % NUM_PLAYERS;

/** A player's name, in their colour if they picked one. */
export function Name({ seat }: { seat: number }) {
  const players = usePlayers();
  const color = colorHex(players.colors[seat] ?? null);
  return (
    <span className="nm" style={color ? { color } : undefined}>
      {nameOf(players, seat)}
    </span>
  );
}
