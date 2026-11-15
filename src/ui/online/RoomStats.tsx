import { useEffect, useId, useRef, useState } from "react";
import type { RoomPlayerStats } from "../../net/protocol";

export function RoomStats({ record, players, me }: { record: string; players: RoomPlayerStats[]; me: number }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const pointerDown = useRef(false);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const sorted = [...players].sort((a, b) =>
    Number(b.id === me) - Number(a.id === me) ||
    Number(b.present) - Number(a.present) ||
    Number(a.kind === "bot") - Number(b.kind === "bot"),
  );
  const nameCounts = new Map<string, number>();
  for (const player of players) {
    const name = player.name.toLowerCase();
    nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
  }

  return (
    <div
      className="room-stats"
      ref={root}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") setOpen(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse" && !root.current?.contains(document.activeElement)) setOpen(false);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        className="room-stats-trigger"
        data-testid="record"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onPointerDown={() => { pointerDown.current = true; }}
        onPointerUp={() => { pointerDown.current = false; }}
        onPointerCancel={() => { pointerDown.current = false; }}
        onFocus={(event) => {
          if (!pointerDown.current && event.currentTarget.matches(":focus-visible")) setOpen(true);
        }}
        onClick={(event) => {
          pointerDown.current = false;
          setOpen((value) => event.detail === 0 ? true : !value);
        }}
      >
        {record}
      </button>
      {open && (
        <>
          <span className="room-stats-tail" aria-hidden="true" />
          <div className="room-stats-bubble" id={id} role="region" aria-label="Player stats">
            <strong>Room stats</strong>
            <table>
              <thead><tr><th>Player</th><th>Wins / games</th><th>Win %</th></tr></thead>
              <tbody>
                {sorted.map((player) => (
                  <tr key={player.id}>
                    <td>
                      {player.id === me ? "You" : player.name}
                      {player.id !== me && nameCounts.get(player.name.toLowerCase())! > 1 && ` #${player.id}`}
                      {!player.present && " (left)"}
                    </td>
                    <td>{player.wins} / {player.games}</td>
                    <td>{player.games ? `${Math.round(player.wins * 100 / player.games)}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
