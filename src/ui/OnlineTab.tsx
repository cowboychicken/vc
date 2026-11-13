import { useState } from "react";
import { type Profile, cleanName, normalizeRoomCode } from "../net/protocol";
import { ProfileEditor } from "./ProfileEditor";

export type OnlineIntent = { type: "create" } | { type: "join"; code: string };

interface Props {
  profile: Profile;
  onProfile: (profile: Profile) => void;
  onStart: (intent: OnlineIntent) => void;
}

/** Menu tab, from a single-player game, for starting or joining a room. */
export function OnlineTab({ profile, onProfile, onStart }: Props) {
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");

  const missingName = () => {
    if (cleanName(profile.name) !== "") return false;
    setNote("Pick a name first.");
    return true;
  };
  const create = () => {
    if (!missingName()) onStart({ type: "create" });
  };
  const join = () => {
    const normalized = normalizeRoomCode(code);
    if (!normalized) return setNote("That isn't a room code. It has 6 letters and numbers.");
    if (!missingName()) onStart({ type: "join", code: normalized });
  };

  return (
    <div className="menu-body">
      <p>Play with up to 3 friends. Empty seats are filled by bots.</p>
      <ProfileEditor
        profile={profile}
        onChange={(p) => {
          setNote("");
          onProfile(p);
        }}
      />
      <div className="menu-actions">
        <button type="button" onClick={create}>
          Create a room
        </button>
      </div>
      <form
        className="code-form"
        onSubmit={(e) => {
          e.preventDefault();
          join();
        }}
      >
        <input
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setNote("");
          }}
          placeholder="Room code"
          aria-label="Room code to join"
          maxLength={12}
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <button type="submit" disabled={code.trim() === ""}>
          Join
        </button>
      </form>
      <p className="note" role="status">
        {note || "\u00a0"}
      </p>
    </div>
  );
}
