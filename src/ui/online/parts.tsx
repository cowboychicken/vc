import { useState } from "react";
import { decodeDeal } from "../../engine";
import { type RoomInfo, colorHex, formatRoomCode } from "../../net/protocol";
import { copyText } from "../Menu";
import { roomUrl } from "../url";

/** The room code, and ways to hand it to a friend. */
export function InviteRow({ code }: { code: string }) {
  const [note, setNote] = useState("");
  const copy = async (text: string, done: string) =>
    setNote((await copyText(text)) ? done : "Could not copy. Select the code instead.");

  return (
    <div className="invite">
      <div className="code-row">
        <div>
          <span className="code-label">Room code</span>
          <b className="code" data-testid="room-code">
            {formatRoomCode(code)}
          </b>
        </div>
        <div className="invite-buttons">
          <button type="button" onClick={() => copy(roomUrl(code), "Invite link copied.")}>
            Copy link
          </button>
          <button type="button" onClick={() => copy(formatRoomCode(code), "Code copied.")}>
            Copy code
          </button>
        </div>
      </div>
      <p className="note" role="status">
        {note || "\u00a0"}
      </p>
    </div>
  );
}

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

export function settingsSummary({ settings }: RoomInfo): string {
  const bombs = settings.rules.bombsBeatAnything ? "bombs beat anything" : "bombs beat 2s only";
  return `${bombs} · ${settings.botLevel} bots`;
}

/** The host's start button, with room to replay a deal code. */
export function StartControls({ label, onStart }: { label: string; onStart: (dealCode?: string) => void }) {
  const [entered, setEntered] = useState("");
  const [note, setNote] = useState("");

  const submit = () => {
    const text = entered.trim();
    if (text !== "" && !decodeDeal(text)) return setNote("That isn't a valid deal code.");
    onStart(text === "" ? undefined : text);
  };

  return (
    <form
      className="start"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="code-form">
        <input
          value={entered}
          onChange={(e) => {
            setEntered(e.target.value);
            setNote("");
          }}
          placeholder="Deal code (optional)"
          aria-label="Deal code to play"
          maxLength={16}
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
      </div>
      <button type="submit" className="primary" autoFocus>
        {label}
      </button>
      <p className="note" role="status">
        {note || "\u00a0"}
      </p>
    </form>
  );
}
