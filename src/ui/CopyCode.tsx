import { useEffect, useState } from "react";

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // No async clipboard (plain http, older browsers): fall back to a hidden, selected field.
  }
  try {
    const field = document.createElement("textarea");
    field.value = text;
    field.readOnly = true;
    field.style.cssText = "position:fixed;top:0;left:0;opacity:0";
    document.body.appendChild(field);
    field.select();
    field.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    field.remove();
    return ok;
  } catch {
    return false;
  }
}

type Listener = (message: string) => void;
const listeners = new Set<Listener>();
const showToast = (message: string) => listeners.forEach((listen) => listen(message));

/** A short message that floats above everything, dialogs included. Mount it once. */
export function ToastHost() {
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);

  useEffect(() => {
    let id = 0;
    let timer = 0;
    const listen: Listener = (text) => {
      window.clearTimeout(timer);
      setToast({ id: ++id, text });
      timer = window.setTimeout(() => setToast(null), 1800);
    };
    listeners.add(listen);
    return () => {
      listeners.delete(listen);
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <div className="copy-toast-host" role="status" aria-live="polite">
      {toast && (
        <div key={toast.id} className="copy-toast">
          {toast.text}
        </div>
      )}
    </div>
  );
}

interface Props {
  /** The code as shown, which is also what gets copied. */
  text: string;
  /** What it is, like "Room code". Used in the message. */
  label: string;
  className?: string;
  testId?: string;
}

/** A code that copies itself when tapped or clicked, and says so. */
export function CopyCode({ text, label, className, testId }: Props) {
  const copy = async () => {
    showToast((await copyText(text)) ? `${label} copied` : `Couldn't copy. Select the ${label.toLowerCase()} instead.`);
  };
  return (
    <button
      type="button"
      className={`copy-code${className ? ` ${className}` : ""}`}
      data-testid={testId}
      title="Tap to copy"
      aria-label={`${label} ${text}. Tap to copy.`}
      onClick={copy}
    >
      {text}
    </button>
  );
}
