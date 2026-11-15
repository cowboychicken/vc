import { useState } from "react";
import { normalizeRoomCode } from "../net/protocol";
import { Logo } from "./Logo";

interface Props {
  onQuickPlay: () => void;
  onCreateRoom: () => void;
  onJoinRoom: (code: string) => void;
  onToggleDarkMode: () => void;
}

export function LandingPage({ onQuickPlay, onCreateRoom, onJoinRoom, onToggleDarkMode }: Props) {
  const [roomCode, setRoomCode] = useState("");
  const [notice, setNotice] = useState("");

  const join = () => {
    const code = normalizeRoomCode(roomCode);
    if (!code) {
      setNotice("Enter a valid 6-character room code.");
      return;
    }
    onJoinRoom(code);
  };

  return (
    <div className="app landing">
      <header className="topbar">
        <Logo onToggleDarkMode={onToggleDarkMode} />
      </header>
      <main className="landing-main">
        <section className="landing-hero" aria-labelledby="landing-title">
          <p className="landing-kicker">FREE BROWSER CARD GAME</p>
          <h2 id="landing-title">Play Tiến Lên Miền Nam online</h2>
          <p className="landing-intro">
            VC13.gg is a free way to play Tiến Lên, also written Tien Len: the Vietnamese 13-card game known as
            Tiến Lên Miền Nam or Thirteen. Quick Play matches you with other players; create a room to invite
            friends. Open seats are filled by bots.
          </p>
          <div className="landing-actions">
            <button type="button" className="primary" onClick={onQuickPlay}>
              Quick Play
            </button>
            <button type="button" onClick={onCreateRoom}>
              Create Room
            </button>
          </div>
          <form
            className="landing-join"
            onSubmit={(event) => {
              event.preventDefault();
              join();
            }}
          >
            <label htmlFor="landing-room-code">Join a multiplayer room by code</label>
            <div className="code-form">
              <input
                id="landing-room-code"
                value={roomCode}
                onChange={(event) => {
                  setRoomCode(event.target.value);
                  setNotice("");
                }}
                placeholder="Room code"
                maxLength={12}
                autoCapitalize="characters"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
              />
              <button type="submit" disabled={roomCode.trim() === ""}>Join Room</button>
            </div>
            <p className="note" role="status">{notice || "\u00a0"}</p>
          </form>
        </section>
        <section className="landing-rules" aria-labelledby="landing-rules-title">
          <h3 id="landing-rules-title">How to play Tiến Lên</h3>
          <p>
            Four players each get 13 cards. Play singles, pairs, triples, or consecutive runs to beat the cards on
            the table; pass when you do not want to play. The first player to get rid of every card wins.
          </p>
          <p>
            VC13.gg follows the Southern Vietnamese rules, Tiến Lên Miền Nam. Join a multiplayer game or create a
            room and invite friends; bots fill any empty seats. No account or download is required.
          </p>
        </section>
      </main>
    </div>
  );
}
