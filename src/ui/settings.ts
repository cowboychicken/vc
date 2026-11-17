import { BOT_BY_LEVEL, type BotLevel } from "../bots";
import { type Card, type RuleOptions, suitOf } from "../engine";

export { BOT_BY_LEVEL, type BotLevel };
export type BotSpeed = "fast" | "normal" | "slow";
export type HandSort = "rank-asc" | "rank-desc" | "suit";

export interface Settings {
  botSpeed: BotSpeed;
  botLevel: BotLevel;
  hints: boolean;
  handSort: HandSort;
  moveLog: boolean;
  darkMode: boolean;
  bombsBeatAnything: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  botSpeed: "normal",
  botLevel: "normal",
  hints: true,
  handSort: "rank-asc",
  moveLog: true,
  darkMode: false,
  bombsBeatAnything: true,
};

export const rulesFromSettings = (settings: Settings): RuleOptions => ({
  bombsBeatAnything: settings.bombsBeatAnything,
});

export function sortHand(hand: readonly Card[], order: HandSort): Card[] {
  return [...hand].sort((a, b) =>
    order === "rank-desc" ? b - a : order === "suit" ? suitOf(a) - suitOf(b) || a - b : a - b,
  );
}

/**
 * `gap`: pause after a move before the next bot lights up. `think`: how long that bot stays lit
 * before its card appears.
 */
export const BOT_TIMING: Record<BotSpeed, { gap: number; think: number }> = {
  fast: { gap: 80, think: 170 },
  normal: { gap: 300, think: 480 },
  slow: { gap: 500, think: 900 },
};

const STORAGE_KEY = "vc13.settings";

/** Reads stored settings, ignoring anything missing or invalid. */
export function parseSettings(raw: string | null): Settings {
  let data: Partial<Record<keyof Settings, unknown>> = {};
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === "object") data = parsed;
  } catch {
    // fall through to defaults
  }
  return {
    botSpeed: data.botSpeed === "fast" || data.botSpeed === "slow" || data.botSpeed === "normal" ? data.botSpeed : DEFAULT_SETTINGS.botSpeed,
    botLevel: data.botLevel === "easy" || data.botLevel === "normal" ? data.botLevel : DEFAULT_SETTINGS.botLevel,
    hints: typeof data.hints === "boolean" ? data.hints : DEFAULT_SETTINGS.hints,
    handSort: data.handSort === "rank-asc" || data.handSort === "rank-desc" || data.handSort === "suit"
      ? data.handSort : DEFAULT_SETTINGS.handSort,
    moveLog: typeof data.moveLog === "boolean" ? data.moveLog : DEFAULT_SETTINGS.moveLog,
    darkMode: typeof data.darkMode === "boolean" ? data.darkMode : DEFAULT_SETTINGS.darkMode,
    bombsBeatAnything:
      typeof data.bombsBeatAnything === "boolean" ? data.bombsBeatAnything : DEFAULT_SETTINGS.bombsBeatAnything,
  };
}

export function loadSettings(): Settings {
  try {
    return parseSettings(localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // storage unavailable (private mode, etc.); settings just won't persist
  }
}
