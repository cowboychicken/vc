import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { type Deal, type GameState, decodeDeal } from "../engine";
import { normalizeRoomCode } from "../net/protocol";
import type { OnlineIntent } from "./online/intent";
import type { BotLevel, BotSpeed, Settings } from "./settings";

export interface MenuTab {
  id: string;
  label: string;
  content: ReactNode;
}

export function MenuDialog({ tabs, onClose }: { tabs: MenuTab[]; onClose: () => void }) {
  const [tabId, setTabId] = useState(tabs[0]!.id);
  const tab = tabs.find((t) => t.id === tabId) ?? tabs[0]!;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog menu" role="dialog" aria-modal="true" aria-label="Menu">
        <div className="menu-head">
          <div className="tabs" role="tablist">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab.id === t.id}
                className={tab.id === t.id ? "on" : ""}
                onClick={() => setTabId(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button type="button" className="close" aria-label="Close menu" onClick={onClose} autoFocus>
            ×
          </button>
        </div>
        {tab.content}
      </div>
    </div>
  );
}

// --- Single-player game tab ----------------------------------------------------------------------

type Confirm = "new" | "same" | "load" | "online";

function InfoLabel({
  label, children, labelId, muted = true,
}: { label: string; children: ReactNode; labelId?: string; muted?: boolean }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <span
      className="info-label"
      ref={ref}
      onPointerEnter={(e) => e.pointerType === "mouse" && setOpen(true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && !ref.current?.contains(document.activeElement) && setOpen(false)}
    >
      <button
        type="button"
        id={labelId}
        className={`info-trigger${muted ? " code-label" : ""}`}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onFocus={(e) => e.currentTarget.matches(":focus-visible") && setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((value) => !value)}
      >
        {label}
      </button>
      {open && <span id={id} role="tooltip" className="info-tooltip">{children}</span>}
    </span>
  );
}

interface LocalGameTabProps {
  game: GameState;
  onNewDeal: () => void;
  onSameDeal: () => void;
  onLoadDeal: (deal: Deal) => void;
  onOnline: (intent: OnlineIntent) => void;
}

export function LocalGameTab({ game, onNewDeal, onSameDeal, onLoadDeal, onOnline }: LocalGameTabProps) {
  const inProgress = game.winner === null && game.history.length > 0;
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [note, setNote] = useState("");
  const [entered, setEntered] = useState("");
  const [roomCode, setRoomCode] = useState("");

  const joinRoom = () => {
    const code = normalizeRoomCode(roomCode);
    if (!code) return setNote("That isn't a room code. It has 6 letters and numbers.");
    if (inProgress && confirm !== "online") {
      setConfirm("online");
      return setNote("This ends your current game. Tap Join again.");
    }
    onOnline({ type: "join", code });
  };

  // Leaving a game in progress takes a second tap.
  const act = (kind: Confirm, run: () => void) => {
    if (inProgress && confirm !== kind) {
      setConfirm(kind);
      return setNote("This ends your current game. Tap again to confirm.");
    }
    run();
  };
  const loadEntered = () => {
    const deal = decodeDeal(entered);
    if (!deal) return setNote("That isn't a valid deal code. Check it and try again.");
    setNote("");
    act("load", () => onLoadDeal(deal));
  };

  return (
    <div className="menu-body">
      <div className="menu-pair">
        <button type="button" onClick={() => act("new", onNewDeal)}>
          {confirm === "new" ? "Tap again" : "New deal"}
        </button>
        <button type="button" onClick={() => act("same", onSameDeal)}>
          {confirm === "same" ? "Tap again" : "Replay deal"}
        </button>
      </div>
      <div className="menu-section">
        <InfoLabel label="Online, with friends">Create a room or join one with a room code.</InfoLabel>
        <div className="menu-actions">
          <button type="button" onClick={() => act("online", () => onOnline({ type: "create" }))}>
            {confirm === "online" ? "Tap again" : "Play online"}
          </button>
        </div>
        <form
          className="code-form"
          onSubmit={(e) => {
            e.preventDefault();
            joinRoom();
          }}
        >
          <input
            value={roomCode}
            onChange={(e) => {
              setRoomCode(e.target.value);
              setNote("");
            }}
            placeholder="Room code to join"
            aria-label="Room code to join"
            maxLength={12}
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <button type="submit" disabled={roomCode.trim() === ""}>
            Join
          </button>
        </form>
      </div>
      <div className="menu-section">
        <InfoLabel label="Deal code">Enter a code to replay a deal. The code appears at the end of a game.</InfoLabel>
        <form
          className="code-form"
          onSubmit={(e) => {
            e.preventDefault();
            loadEntered();
          }}
        >
          <input
            value={entered}
            onChange={(e) => {
              setEntered(e.target.value);
              setConfirm(null);
              setNote("");
            }}
            placeholder="Paste a deal code"
            aria-label="Deal code to load"
            maxLength={16}
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <button type="submit" disabled={entered.trim() === ""}>
            {confirm === "load" ? "Tap again" : "Play"}
          </button>
        </form>
      </div>
      <p className="note" role="status">
        {note || "\u00a0"}
      </p>
    </div>
  );
}

// --- Settings rows -----------------------------------------------------------------------------

export function Segmented<T extends string>({
  label,
  description,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  description?: ReactNode;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="setting">
      {description ? (
        <InfoLabel label={label} labelId={id} muted={false}>{description}</InfoLabel>
      ) : (
        <span id={id}>{label}</span>
      )}
      <div className="seg" role="radiogroup" aria-labelledby={id}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            className={o.value === value ? "on" : ""}
            disabled={disabled}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const ON_OFF = [
  { value: "on", label: "On" },
  { value: "off", label: "Off" },
];

export function BombRow({
  anything,
  onChange,
  disabled,
}: {
  anything: boolean;
  onChange: (anything: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Segmented
      label="Bombs beat"
      description={<>A bomb is four of a kind (7-7-7-7) or at least three consecutive pairs (3-3, 4-4, 5-5). “2s only” limits chops to 2s and bombs; “Anything” allows other plays too. See Rules for details.</>}
      value={anything ? "anything" : "twos"}
      options={[
        { value: "twos", label: "2s only" },
        { value: "anything", label: "Anything" },
      ]}
      onChange={(v) => onChange(v === "anything")}
      disabled={disabled}
    />
  );
}

export function BotLevelRow({
  level,
  onChange,
  disabled,
}: {
  level: BotLevel;
  onChange: (level: BotLevel) => void;
  disabled?: boolean;
}) {
  return (
    <Segmented<BotLevel>
      label="Bots"
      value={level}
      options={[
        { value: "easy", label: "Easy" },
        { value: "normal", label: "Normal" },
      ]}
      onChange={onChange}
      disabled={disabled}
    />
  );
}

/** Settings that only change how this screen looks and feels. */
export function PersonalRows({
  settings,
  onSettings,
}: {
  settings: Settings;
  onSettings: (settings: Settings) => void;
}) {
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => onSettings({ ...settings, [key]: value });
  return (
    <>
      <Segmented<BotSpeed>
        label="Speed"
        value={settings.botSpeed}
        options={[
          { value: "fast", label: "Fast" },
          { value: "normal", label: "Normal" },
          { value: "slow", label: "Slow" },
        ]}
        onChange={(v) => set("botSpeed", v)}
      />
      <Segmented
        label="Hint button"
        value={settings.hints ? "on" : "off"}
        options={ON_OFF}
        onChange={(v) => set("hints", v === "on")}
      />
      <Segmented
        label="Move log"
        value={settings.moveLog ? "on" : "off"}
        options={ON_OFF}
        onChange={(v) => set("moveLog", v === "on")}
      />
      <Segmented
        label="Dark mode"
        value={settings.darkMode ? "on" : "off"}
        options={ON_OFF}
        onChange={(v) => set("darkMode", v === "on")}
      />
    </>
  );
}
