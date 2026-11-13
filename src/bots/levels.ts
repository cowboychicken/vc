import { heuristicBot } from "./heuristic";
import { randomBot } from "./random";
import type { Bot } from "./types";

export type BotLevel = "easy" | "normal";

export const BOT_LEVELS: readonly BotLevel[] = ["easy", "normal"];

export const BOT_BY_LEVEL: Record<BotLevel, Bot> = { easy: randomBot, normal: heuristicBot };
