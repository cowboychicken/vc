import { useState } from "react";
import { cleanName } from "../net/protocol";
import { LocalGame } from "./LocalGame";
import type { OnlineIntent } from "./OnlineTab";
import { NamePrompt } from "./online/NamePrompt";
import { OnlineApp } from "./online/OnlineApp";
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
  const updateProfile = (next: typeof profile) => {
    setProfile(next);
    saveProfile(next);
  };
  const goOffline = () => {
    setAddress("");
    setOnline(null);
  };

  if (online && cleanName(profile.name) === "" && online.intent.type === "join") {
    return (
      <NamePrompt code={online.intent.code} profile={profile} onJoin={updateProfile} onCancel={goOffline} />
    );
  }

  if (online) {
    return (
      <OnlineApp
        key={online.attempt}
        intent={online.intent}
        settings={settings}
        onSettings={updateSettings}
        profile={profile}
        onProfile={updateProfile}
        onLeave={goOffline}
        onRetry={() => setOnline(attempt(online.intent))}
      />
    );
  }

  return (
    <LocalGame
      settings={settings}
      onSettings={updateSettings}
      profile={profile}
      onProfile={updateProfile}
      onOnline={(intent) => setOnline(attempt(intent))}
    />
  );
}
