import { useEffect, useState } from "react";
import { HAND_SIZE, NUM_PLAYERS, type PlayerView } from "../engine";
import { FINAL_PLAY_MS } from "../net/presenter";

export const DEAL_CARD_MS = 30;
export const INTRO_MS = 650;
export const FINISH_MS = FINAL_PLAY_MS;
const TOTAL_CARDS = HAND_SIZE * NUM_PLAYERS;

export interface DealPresentation {
  phase: "dealing" | "intro" | "ready";
  dealt: number;
}

export function dealtCounts(dealt: number, seat: number): number[] {
  return Array.from({ length: NUM_PLAYERS }, (_, player) => {
    const position = (player - seat + NUM_PLAYERS) % NUM_PLAYERS;
    return Math.max(0, Math.min(HAND_SIZE, Math.ceil((dealt - position) / NUM_PLAYERS)));
  });
}

export function dealProgress(elapsed: number, reducedMotion: boolean): DealPresentation {
  const dealt = reducedMotion ? TOTAL_CARDS : Math.min(TOTAL_CARDS, Math.floor(elapsed / DEAL_CARD_MS));
  const duration = reducedMotion ? INTRO_MS : TOTAL_CARDS * DEAL_CARD_MS + INTRO_MS;
  return { dealt, phase: elapsed >= duration ? "ready" : dealt < TOTAL_CARDS ? "dealing" : "intro" };
}

/** A new key identifies a new deal, even when the same deal code is replayed. */
export function useDealPresentation(key: number | null, reducedMotion: boolean): DealPresentation {
  const [progress, setProgress] = useState<{ key: number | null; presentation: DealPresentation }>({
    key: null, presentation: { phase: "ready", dealt: TOTAL_CARDS },
  });

  useEffect(() => {
    if (key === null) return;
    const start = Date.now();
    setProgress({ key, presentation: dealProgress(0, reducedMotion) });
    const id = window.setInterval(() => {
      const presentation = dealProgress(Date.now() - start, reducedMotion);
      setProgress({ key, presentation });
      if (presentation.phase === "ready") window.clearInterval(id);
    }, DEAL_CARD_MS);
    return () => window.clearInterval(id);
  }, [key, reducedMotion]);

  if (key === null) return { phase: "ready", dealt: TOTAL_CARDS };
  return progress.key === key ? progress.presentation : dealProgress(0, reducedMotion);
}

export function openingMessage(view: PlayerView, leader: string): string {
  if (view.instantWin) return "Instant win!";
  if (view.openingRequired && view.turn === view.seat) return "You have 3♠. Lead with it!";
  return view.turn === view.seat ? "Your lead. Begin!" : `${leader} starts!`;
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query) return;
    const update = () => setReduced(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}
