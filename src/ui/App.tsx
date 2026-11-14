import { useState } from "react";
import { LocalGame } from "./LocalGame";
import { OnlineApp } from "./online/OnlineApp";
import type { OnlineIntent } from "./online/intent";
import { loadProfile, saveProfile } from "./profile";
import { type Settings, loadSettings, saveSettings } from "./settings";
import { roomFromUrl, setAddress } from "./url";

interface Online {
  intent: OnlineIntent;
  /** Changes with every attempt, so a retry starts from a clean slate. */
  attempt: number;
}

let attempts = 0;
const attempt = (intent: OnlineIntent): Online => ({ intent, attempt: ++attempts });

export default function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  // A first visit gets a funny name and a colour, so joining never asks for anything.
  const [profile, setProfile] = useState(loadProfile);
  // An invite link (?room=CODE) opens straight into that room.
  const [online, setOnline] = useState<Online | null>(() => {
    const code = roomFromUrl();
    return code ? attempt({ type: "join", code }) : null;
  });

  const updateSettings = (next: Settings) => {
    setSettings(next);
    saveSettings(next);
  };
  const goOffline = () => {
    setAddress("");
    setOnline(null);
  };

  if (online) {
    return (
      <OnlineApp
        key={online.attempt}
        intent={online.intent}
        settings={settings}
        onSettings={updateSettings}
        profile={profile}
        onProfile={(next) => {
          setProfile(next);
          saveProfile(next);
        }}
        onLeave={goOffline}
        onRetry={() => setOnline(attempt(online.intent))}
      />
    );
  }

  return <LocalGame settings={settings} onSettings={updateSettings} onOnline={(intent) => setOnline(attempt(intent))} />;
}
