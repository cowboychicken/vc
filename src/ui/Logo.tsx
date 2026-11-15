import { useEffect, useRef, useState } from "react";

/** The VC13.gg title, set in a terminal-style pixel font. */
export function Logo() {
  const taps = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [surprise, setSurprise] = useState(false);

  useEffect(() => () => {
    if (timer.current !== null) clearTimeout(timer.current);
  }, []);

  useEffect(() => {
    if (!surprise) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSurprise(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [surprise]);

  const tap = () => {
    if (++taps.current < 5) return;
    taps.current = 0;
    setSurprise(true);
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => setSurprise(false), 3000);
  };

  return (
    <h1 className="logo">
      <button type="button" className="logo-button" onClick={tap}>
        VC13.gg<span className="logo-smile" aria-hidden="true"> :)</span>
      </button>
      {surprise && <span className="logo-surprise" role="status">you found me! ♥</span>}
    </h1>
  );
}
