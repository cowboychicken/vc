import { useState } from "react";
import { MAX_NAME_LENGTH, PALETTE, type Profile, cleanName } from "../net/protocol";

interface Props {
  profile: Profile;
  /** Called with the new profile: straight away for a colour, on submit for a name. */
  onSubmit: (profile: Profile) => void;
}

/** Name (saved with its button) and colour (saved as soon as it is picked). */
export function ProfileEditor({ profile, onSubmit }: Props) {
  const [name, setName] = useState(profile.name);
  const cleaned = cleanName(name);
  const changed = cleaned !== "" && cleaned !== profile.name;

  return (
    <form
      className="profile"
      onSubmit={(e) => {
        e.preventDefault();
        if (changed) onSubmit({ ...profile, name: cleaned });
      }}
    >
      <div className="code-form">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Your name"
          placeholder="Name"
          maxLength={MAX_NAME_LENGTH}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <button type="submit" disabled={!changed}>
          Save
        </button>
      </div>
      <div role="radiogroup" aria-label="Name colour" className="swatches">
        {PALETTE.map((c) => (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={profile.color === c.id}
            aria-label={c.id}
            className={`swatch${profile.color === c.id ? " on" : ""}`}
            style={{ background: c.hex }}
            onClick={() => onSubmit({ ...profile, color: c.id })}
          />
        ))}
      </div>
    </form>
  );
}
