import { useEffect, useId, useState } from "react";
import type { GameState, NewGameOptions, RuleOptions } from "../engine";
import { type BotLevel, type BotSpeed, type Settings } from "./settings";

type Tab = "game" | "rules" | "settings";
const TABS: { id: Tab; label: string }[] = [
  { id: "game", label: "Game" },
  { id: "rules", label: "Rules" },
  { id: "settings", label: "Settings" },
];

interface Props {
  game: GameState;
  start: NewGameOptions;
  settings: Settings;
  onSettings: (settings: Settings) => void;
  onNewDeal: () => void;
  onSameDeal: () => void;
  onClose: () => void;
}

export function dealUrl({ seed, leader }: NewGameOptions): string {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("seed", String(seed));
  if (leader !== undefined) url.searchParams.set("leader", String(leader));
  return url.toString();
}

export function MenuDialog({ game, start, settings, onSettings, onNewDeal, onSameDeal, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("game");

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
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className={tab === t.id ? "on" : ""}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button type="button" className="close" aria-label="Close menu" onClick={onClose} autoFocus>
            ×
          </button>
        </div>
        {tab === "game" && (
          <GameTab game={game} start={start} onNewDeal={onNewDeal} onSameDeal={onSameDeal} />
        )}
        {tab === "rules" && <Rules rules={game.rules} />}
        {tab === "settings" && <SettingsTab settings={settings} onSettings={onSettings} />}
      </div>
    </div>
  );
}

function GameTab({
  game,
  start,
  onNewDeal,
  onSameDeal,
}: Pick<Props, "game" | "start" | "onNewDeal" | "onSameDeal">) {
  const inProgress = game.winner === null && game.history.length > 0;
  const [confirm, setConfirm] = useState<"new" | "same" | null>(null);
  const [copied, setCopied] = useState<"yes" | "no" | null>(null);

  const act = (kind: "new" | "same", run: () => void) => () => {
    if (inProgress && confirm !== kind) return setConfirm(kind);
    run();
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(dealUrl(start));
      setCopied("yes");
    } catch {
      setCopied("no");
    }
  };

  return (
    <div className="menu-body">
      <p>
        Deal <b>#{game.seed}</b>
      </p>
      <div className="menu-actions">
        <button type="button" onClick={act("new", onNewDeal)}>
          {confirm === "new" ? "Abandon game? Tap again" : "New deal"}
        </button>
        <button type="button" onClick={act("same", onSameDeal)}>
          {confirm === "same" ? "Abandon game? Tap again" : "Restart this deal"}
        </button>
        <button type="button" onClick={copy}>
          Copy link to this deal
        </button>
      </div>
      <p className="note" role="status">
        {copied === "yes" ? "Link copied." : copied === "no" ? "Could not copy the link." : "\u00a0"}
      </p>
    </div>
  );
}

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

function Rules({ rules }: { rules: RuleOptions }) {
  const sections = RULES.map((section) =>
    section.title === "Chops" && rules.bombsBeatAnything
      ? { ...section, items: ANYTHING_BOMB_ITEMS }
      : section,
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

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
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
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SettingsTab({ settings, onSettings }: Pick<Props, "settings" | "onSettings">) {
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => onSettings({ ...settings, [key]: value });
  const onOff = [
    { value: "on", label: "On" },
    { value: "off", label: "Off" },
  ];
  return (
    <div className="menu-body">
      <Segmented
        label="Bombs beat"
        value={settings.bombsBeatAnything ? "anything" : "twos"}
        options={[
          { value: "twos", label: "2s only" },
          { value: "anything", label: "Anything" },
        ]}
        onChange={(v) => set("bombsBeatAnything", v === "anything")}
      />
      <Segmented<BotLevel>
        label="Bots"
        value={settings.botLevel}
        options={[
          { value: "easy", label: "Easy" },
          { value: "normal", label: "Normal" },
        ]}
        onChange={(v) => set("botLevel", v)}
      />
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
        options={onOff}
        onChange={(v) => set("hints", v === "on")}
      />
      <Segmented
        label="Move log"
        value={settings.moveLog ? "on" : "off"}
        options={onOff}
        onChange={(v) => set("moveLog", v === "on")}
      />
      <p className="note">Saved on this device. Rule changes apply right away.</p>
    </div>
  );
}
