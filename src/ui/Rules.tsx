import { useEffect } from "react";
import type { RuleOptions } from "../engine";

const RULES: { title: string; items: string[]; open?: boolean }[] = [
  {
    title: "Basics",
    open: true,
    items: [
      "Be first to play all 13 of your cards.",
      "Take turns playing \"poker-style\" hands. Match what's on the table (same kind, but higher) until everyone passes, then you can start your own.",
      "Low to high: 3 4 5 6 7 8 9 10 J Q K A 2.",
      "Suits, low to high: ♠ ♣ ♦ ♥.",
    ],
  },
  {
    title: "Plays",
    items: [
      "Single, pair, triple, or four of a kind.",
      "Run: 3 or more in a row (no 2s).",
      "Pair run: 3 or more pairs in a row (no 2s).",
    ],
  },
  {
    title: "Turns",
    items: [
      "Beat the table: same kind and size, higher top card (rank, then suit).",
      "Pass if you can't or won't. You're out until the table clears.",
      "If everyone else passes, you lead again.",
      "First game: the 3♠ holder leads with it. After that, the last winner leads.",
    ],
  },
  {
    title: "Bombs",
    items: [
      "Order: 3-pair run < four of a kind < 4-pair run < 5-pair run.",
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

/** The rules as collapsible sections. Basics start open. */
export function RulesBody({ rules }: { rules: RuleOptions }) {
  const sections = RULES.map((section) =>
    section.title === "Bombs" && rules.bombsBeatAnything ? { ...section, items: ANYTHING_BOMB_ITEMS } : section,
  );
  return (
    <div className="menu-body rules">
      <div>
        {sections.map((section) => (
          <details key={section.title} open={section.open}>
            <summary>{section.title}</summary>
            <ul>
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </details>
        ))}
      </div>
      <p className="note tip">Tip: stuck? Tap Hint on your turn and it picks a play for you.</p>
    </div>
  );
}

/** The rules over the game. Closes on the × button, Escape, or a tap outside the box. */
export function RulesDialog({ rules, onClose }: { rules: RuleOptions; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog menu" role="dialog" aria-modal="true" aria-label="Rules">
        <div className="menu-head">
          <h2 className="menu-title">Rules</h2>
          <button type="button" className="close" aria-label="Close rules" onClick={onClose} autoFocus>
            ×
          </button>
        </div>
        <RulesBody rules={rules} />
      </div>
    </div>
  );
}
