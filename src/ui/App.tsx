import { useEffect, useState } from "react";
import { ToastHost } from "./CopyCode";
import { LandingPage } from "./LandingPage";
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
  const [darkMode, setDarkMode] = useState(false);
  useEffect(() => {
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", darkMode ? "#111111" : "#ffffff");
  }, [darkMode]);
  // A first visit gets a funny name and a colour, so joining never asks for anything.
  const [profile, setProfile] = useState(loadProfile);
  // A room link (?room=CODE) opens straight into that room.
  const [online, setOnline] = useState<Online | null>(() => {
    const code = roomFromUrl();
    return code ? attempt({ type: "join", code }) : null;
  });
  const updateSettings = (next: Settings) => {
    setSettings(next);
    saveSettings(next);
  };
  const goHome = () => {
    setAddress("");
    setOnline(null);
  };

  const screen = online ? (
    <OnlineApp
      key={online.attempt}
      intent={online.intent}
      settings={settings}
      onToggleDarkMode={() => setDarkMode((value) => !value)}
      onSettings={updateSettings}
      profile={profile}
      onProfile={(next) => {
        setProfile(next);
        saveProfile(next);
      }}
      onLeave={goHome}
      onRetry={() => setOnline(attempt({ ...online.intent }))}
    />
  ) : (
    <LandingPage
      onToggleDarkMode={() => setDarkMode((value) => !value)}
      onQuickPlay={() => setOnline(attempt({ type: "quickplay" }))}
      onCreateRoom={() => setOnline(attempt({ type: "create" }))}
      onJoinRoom={(code) => setOnline(attempt({ type: "join", code }))}
    />
  );

  return (
    <div className={darkMode ? "theme-dark" : ""}>
      <ToastHost />
      {screen}
    </div>
  );
}
