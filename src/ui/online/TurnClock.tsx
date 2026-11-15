import { useEffect, useMemo, useRef, useState } from "react";
import type { RoomInfo } from "../../net/protocol";

/** Counts down the seconds a player has left to move. The server decides when time is really up. */
function Countdown({ endsAt, limitMs }: { endsAt: number; limitMs: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);
  // The server adds a little allowance for playback; showing at most the nominal limit hides it.
  const seconds = Math.ceil(Math.min(limitMs, Math.max(0, endsAt - now)) / 1000);
  return (
    <span className={`turn-clock${seconds <= 5 ? " urgent" : ""}`} aria-hidden="true">
      {" "}
      · {seconds}s
    </span>
  );
}

/** The countdown for my own turn, or nothing when no human turn of mine is being timed. */
export function TurnClock({ room, seat }: { room: RoomInfo; seat: number }) {
  // Each response says how long is left at that moment, so the deadline is fixed when it arrives.
  const endsAt = useMemo(() => Date.now() + (room.turn?.endsInMs ?? 0), [room]);
  if (!room.turn || room.turn.seat !== seat) return null;
  return <Countdown endsAt={endsAt} limitMs={room.turn.limitMs} />;
}

/** Tells a player when a turn ran out and a bot played for them, and how close they are to losing the seat. */
export function StrikeNotice({ room, seat }: { room: RoomInfo; seat: number }) {
  const strikes = room.seats[seat]?.strikes ?? 0;
  const last = useRef(strikes);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (strikes > last.current) {
      const left = room.maxStrikes - strikes;
      setMessage(
        `You ran out of time, so a bot played for you. ${left === 1 ? "One more and you lose your seat." : `${left} more and you lose your seat.`}`,
      );
    }
    last.current = strikes;
  }, [strikes, room.maxStrikes]);

  useEffect(() => {
    if (!message) return;
    const id = window.setTimeout(() => setMessage(null), 5000);
    return () => window.clearTimeout(id);
  }, [message]);

  return message ? (
    <div className="toast" role="alert">
      {message}
    </div>
  ) : null;
}
