import { type Bot, heuristicBot, randomBot } from "../bots";
import type { RuleOptions } from "../engine";

export type BotSpeed = "fast" | "normal" | "slow";
export type BotLevel = "easy" | "normal";

export interface Settings {
  botSpeed: BotSpeed;
  botLevel: BotLevel;
  hints: boolean;
  moveLog: boolean;
  bombsBeatAnything: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  botSpeed: "normal",
  botLevel: "normal",
  hints: true,
  moveLog: true,
  bombsBeatAnything: false,
};

export const rulesFromSettings = (settings: Settings): RuleOptions => ({
  bombsBeatAnything: settings.bombsBeatAnything,
});

export const BOT_DELAY_MS: Record<BotSpeed, number> = { fast: 250, normal: 800, slow: 1400 };
export const BOT_BY_LEVEL: Record<BotLevel, Bot> = { easy: randomBot, normal: heuristicBot };

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
    moveLog: typeof data.moveLog === "boolean" ? data.moveLog : DEFAULT_SETTINGS.moveLog,
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
