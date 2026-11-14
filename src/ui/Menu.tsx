import { type ReactNode, useEffect, useId, useState } from "react";
import { type Deal, type GameState, type RuleOptions, decodeDeal } from "../engine";
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

export function dealUrl(dealCode: string): string {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("code", dealCode);
  return url.toString();
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// --- Single-player game tab ----------------------------------------------------------------------

type Confirm = "new" | "same" | "load" | "online";

interface LocalGameTabProps {
  game: GameState;
  dealCode: string;
  onNewDeal: () => void;
  onSameDeal: () => void;
  onLoadDeal: (deal: Deal) => void;
  onOnline: (intent: OnlineIntent) => void;
}

export function LocalGameTab({ game, dealCode, onNewDeal, onSameDeal, onLoadDeal, onOnline }: LocalGameTabProps) {
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
      return setNote("This leaves your game. Tap Join again.");
    }
    onOnline({ type: "join", code });
  };

  // Leaving a game in progress takes a second tap.
  const act = (kind: Confirm, run: () => void) => {
    if (inProgress && confirm !== kind) return setConfirm(kind);
    run();
  };
  const copy = async (text: string, done: string) => {
    setNote((await copyText(text)) ? done : "Could not copy. Select the text instead.");
  };
  const loadEntered = () => {
    const deal = decodeDeal(entered);
    if (!deal) return setNote("That isn't a valid deal code. Check it and try again.");
    setNote("");
    act("load", () => onLoadDeal(deal));
  };

  return (
    <div className="menu-body">
      <div className="code-row">
        <div>
          <span className="code-label">Deal code</span>
          <b className="code" data-testid="deal-code">
            {dealCode}
          </b>
        </div>
        <button type="button" onClick={() => copy(dealCode, "Code copied.")}>
          Copy
        </button>
      </div>
      <div className="menu-actions">
        <button type="button" onClick={() => act("new", onNewDeal)}>
          {confirm === "new" ? "Abandon game? Tap again" : "New deal"}
        </button>
        <button type="button" onClick={() => act("same", onSameDeal)}>
          {confirm === "same" ? "Abandon game? Tap again" : "Restart this deal"}
        </button>
        <button type="button" onClick={() => copy(dealUrl(dealCode), "Link copied.")}>
          Copy link to this deal
        </button>
      </div>
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
          placeholder="Enter a deal code"
          aria-label="Deal code to load"
          maxLength={16}
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <button type="submit" disabled={entered.trim() === ""}>
          {confirm === "load" ? "Abandon game? Tap again" : "Play code"}
        </button>
      </form>
      <p className="note" role="status">
        {note || "\u00a0"}
      </p>
      <div className="menu-section">
        <span className="code-label">Online, with friends</span>
        <div className="menu-actions">
          <button type="button" onClick={() => act("online", () => onOnline({ type: "create" }))}>
            {confirm === "online" ? "Abandon game? Tap again" : "Play online"}
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
    </div>
  );
}

// --- Rules -------------------------------------------------------------------------------------

const RULES: { title: string; items: string[] }[] = [
  {
    title: "Goal",
    items: ["4 players, 13 cards each. The first to play all their cards wins."],
  },
  {
    title: "Card order",
    items: ["Rank, low to high: 3 4 5 6 7 8 9 10 J Q K A 2.", "Suit, low to high: ♠ ♣ ♦ ♥."],
  },
  {
    title: "Plays",
    items: [
      "Single, pair, triple, or four of a kind.",
      "Run: 3 or more in a row (no 2s).",
      "Pair run: 3 or more consecutive pairs (no 2s).",
    ],
  },
  {
    title: "Turns",
    items: [
      "Beat the table with the same kind and size and a higher top card (rank, then suit).",
      "Pass if you can't or won't. After you pass you're out until the table clears.",
      "When everyone else has passed, the last player to play leads again, and can't pass while leading.",
      "First game: the 3♠ holder leads and must play the 3♠. After that, the last winner leads anything.",
    ],
  },
  {
    title: "Chops",
    items: [
      "Bombs: 3-pair run < four of a kind < 4-pair run < 5-pair run.",
      "Any bomb beats a single 2. Four of a kind or a 4+ pair run beats a pair of 2s. A 4+ pair run beats a triple of 2s.",
      "A bomb also beats a weaker bomb. Bombs can't be played on anything else.",
    ],
  },
  {
    title: "Instant win",
    items: ["Checked on the deal: four 2s, a dragon (3 through A), or six pairs."],
  },
];

const ANYTHING_BOMB_ITEMS = [
  "Bombs: four of a kind, or a run of 3 or more pairs.",
  "House rule on: a bomb can be played on any play, including 2s.",
  "A bomb played on another bomb must end in a higher card (rank, then suit).",
];

export function RulesTab({ rules }: { rules: RuleOptions }) {
  const sections = RULES.map((section) =>
    section.title === "Chops" && rules.bombsBeatAnything ? { ...section, items: ANYTHING_BOMB_ITEMS } : section,
  );
  return (
    <div className="menu-body rules">
      {sections.map((section) => (
        <section key={section.title}>
          <h3>{section.title}</h3>
          <ul>
            {section.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

// --- Settings rows -----------------------------------------------------------------------------

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="setting">
      <span id={id}>{label}</span>
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
    </>
  );
}
