import type { Frame } from "./protocol";

/**
 * The server hands a client a batch of frames at once (a person's move and then every bot move
 * that followed). The presenter plays them back the way single-player does: a bot's seat lights up,
 * then its card lands. It is plain data in and out, so the timing can be tested without a browser.
 */
export interface PresenterState {
  /** The frame on screen. Null until the first one arrives. */
  shown: Frame | null;
  /** Frames waiting their turn, oldest first. */
  pending: Frame[];
  /** Whether the seat to move in `shown` is highlighted. */
  lit: boolean;
  /** Highest frame number received, to ask the server for what comes after. */
  lastN: number;
}

export type PresenterAction =
  | { type: "frames"; frames: readonly Frame[] }
  | { type: "light" }
  | { type: "show" }
  | { type: "reset" };

export interface Timing {
  /** Pause after a move before the next bot lights up. */
  gap: number;
  /** How long a bot stays lit before its card lands. */
  think: number;
}

/** More than this waiting (someone came back after a while) and we skip straight to the latest. */
export const MAX_ANIMATED = 6;

export const initialPresenter = (): PresenterState => ({ shown: null, pending: [], lit: true, lastN: -1 });

export function presenterReducer(state: PresenterState, action: PresenterAction): PresenterState {
  switch (action.type) {
    case "reset":
      return initialPresenter();

    case "frames": {
      const fresh = action.frames.filter((f) => f.n > state.lastN).sort((a, b) => a.n - b.n);
      if (fresh.length === 0) return state;
      const lastN = fresh[fresh.length - 1]!.n;
      // First sight of the game: show where it stands, without replaying how it got there.
      if (state.shown === null) return { shown: fresh[fresh.length - 1]!, pending: [], lit: true, lastN };
      const pending = [...state.pending, ...fresh];
      if (pending.length > MAX_ANIMATED) return { shown: pending[pending.length - 1]!, pending: [], lit: true, lastN };
      return { ...state, pending, lastN };
    }

    case "light":
      return state.lit ? state : { ...state, lit: true };

    case "show": {
      const [next, ...rest] = state.pending;
      if (!next) return state;
      // With more to come, nobody is lit until their beat; otherwise it is simply the next player's turn.
      return { ...state, shown: next, pending: rest, lit: rest.length === 0 };
    }
  }
}

export interface Step {
  delay: number;
  action: PresenterAction;
}

/** What should happen next, and after how long. Null when there is nothing to do. */
export function nextStep(state: PresenterState, timing: Timing): Step | null {
  const { shown, pending, lit } = state;
  const next = pending[0];
  if (!shown || !next) return null;
  // A deal, or a move by a person, shows the moment it arrives.
  if (next.kind === "deal" || !next.bot) return { delay: 0, action: { type: "show" } };
  if (!lit) {
    const opening = shown.view.history.length === 0; // nobody has played yet: light straight away
    return { delay: opening ? 0 : timing.gap, action: { type: "light" } };
  }
  return { delay: timing.think, action: { type: "show" } };
}
