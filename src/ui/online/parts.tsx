import { type RoomInfo, colorHex } from "../../net/protocol";

/** Who is at the table. Names show in the colour their player picked. */
export function SeatList({ room, me }: { room: RoomInfo; me: number }) {
  return (
    <ul className="seats" aria-label="Players">
      {room.seats.map((s, i) => {
        const hex = colorHex(s.color);
        return (
          <li key={i} className={s.kind === "bot" ? "bot" : undefined} data-testid={`seat-${i}`}>
            <span className="dot" style={{ background: hex ?? "#fff" }} aria-hidden="true" />
            <span className="who" style={s.kind === "human" && hex ? { color: hex } : undefined}>
              {s.name}
            </span>
            {i === me && <span className="tag">you</span>}
            {s.host && <span className="tag">host</span>}
            {s.kind === "human" && s.away && <span className="tag">away</span>}
            {s.kind === "bot" && <span className="tag">bot</span>}
          </li>
        );
      })}
    </ul>
  );
}
