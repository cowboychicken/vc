const TAPS_TO_TOGGLE = 3;
let taps = 0;
let resetTimer: ReturnType<typeof setTimeout> | null = null;

function registerTap(toggleDarkMode: () => void): void {
  if (resetTimer !== null) clearTimeout(resetTimer);
  if (++taps === TAPS_TO_TOGGLE) {
    taps = 0;
    resetTimer = null;
    toggleDarkMode();
    return;
  }
  resetTimer = setTimeout(() => {
    taps = 0;
    resetTimer = null;
  }, 1000);
}

/** The VC13.gg title, set in a terminal-style pixel font. */
export function Logo({ onToggleDarkMode }: { onToggleDarkMode?: () => void }) {
  return (
    <h1 className="logo">
      <button
        type="button"
        className="logo-button"
        aria-label="VC13.gg"
        onClick={() => onToggleDarkMode && registerTap(onToggleDarkMode)}
      >
        VC13.gg<span className="logo-smile" aria-hidden="true"> :)</span>
      </button>
    </h1>
  );
}
