import type { ReactNode } from "react";
import type { RoomInfo } from "../../net/protocol";
import { InviteRow, SeatList, StartControls, settingsSummary } from "./parts";

interface Props {
  room: RoomInfo;
  seat: number;
  onStart: (dealCode?: string) => void;
  onOpenMenu: () => void;
  onLeave: () => void;
  /** Dialogs drawn over the lobby. */
  children?: ReactNode;
}

/** Before the first game: who is here, how to invite more, and (for the host) the start button. */
export function Lobby({ room, seat, onStart, onOpenMenu, onLeave, children }: Props) {
  const isHost = room.host === seat;
  const host = room.seats[room.host]?.name ?? "the host";

  return (
    <div className="app">
      <header className="topbar">
        <h1>VC_13</h1>
        <div className="meta">
          <span>Room</span>
          <button
            type="button"
            className="icon-btn"
            aria-label="Menu, rules and settings"
            aria-haspopup="dialog"
            onClick={onOpenMenu}
          >
            i
          </button>
        </div>
      </header>

      <main className="lobby">
        <InviteRow code={room.code} />
        <p className="note">Share the link or the code. Empty seats are played by bots.</p>
        <SeatList room={room} me={seat} />
        <p className="note">Rules: {settingsSummary(room)}</p>
        {isHost ? (
          <StartControls label={room.games > 0 ? "Start next game" : "Start game"} onStart={onStart} />
        ) : (
          <p role="status" data-testid="waiting">
            Waiting for {host} to start…
          </p>
        )}
        <button type="button" className="link" onClick={onLeave}>
          Leave room
        </button>
      </main>
      {children}
    </div>
  );
}
