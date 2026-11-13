import { useState } from "react";
import { type Profile, cleanName, formatRoomCode } from "../../net/protocol";
import { ProfileEditor } from "../ProfileEditor";

interface Props {
  code: string;
  profile: Profile;
  onJoin: (profile: Profile) => void;
  onCancel: () => void;
}

/** Shown to someone who opened an invite link before choosing a name. */
export function NamePrompt({ code, profile, onJoin, onCancel }: Props) {
  const [draft, setDraft] = useState(profile);
  const name = cleanName(draft.name);

  return (
    <div className="app">
      <header className="topbar">
        <h1>VC_13</h1>
      </header>
      <form
        className="lobby"
        onSubmit={(e) => {
          e.preventDefault();
          if (name !== "") onJoin({ name, color: draft.color });
        }}
      >
        <h2 className="message-title">Join room {formatRoomCode(code)}</h2>
        <p>Pick a name and a colour. Everyone at the table will see them.</p>
        <ProfileEditor profile={draft} onChange={setDraft} />
        <button type="submit" className="primary" disabled={name === ""}>
          Join
        </button>
        <button type="button" className="link" onClick={onCancel}>
          Play offline instead
        </button>
      </form>
    </div>
  );
}
