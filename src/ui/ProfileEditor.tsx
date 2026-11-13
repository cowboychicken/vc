import { PALETTE, type Profile, MAX_NAME_LENGTH } from "../net/protocol";

interface Props {
  profile: Profile;
  onChange: (profile: Profile) => void;
  /** Shown under the fields. */
  note?: string;
}

export function ProfileEditor({ profile, onChange, note }: Props) {
  return (
    <div className="profile">
      <label className="profile-name">
        <span className="code-label">Your name</span>
        <input
          value={profile.name}
          onChange={(e) => onChange({ ...profile, name: e.target.value })}
          placeholder="Name"
          maxLength={MAX_NAME_LENGTH}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
      </label>
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
            onClick={() => onChange({ ...profile, color: c.id })}
          />
        ))}
      </div>
      {note && <p className="note">{note}</p>}
    </div>
  );
}
