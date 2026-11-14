import { type ReactNode, useState } from "react";
import { type Profile, type RoomInfo, formatRoomCode } from "../../net/protocol";
import { GameScreen } from "../GameScreen";
import { Logo } from "../Logo";
import { BombRow, BotLevelRow, MenuDialog, type MenuTab, PersonalRows, RulesTab } from "../Menu";
import { ProfileEditor } from "../ProfileEditor";
import { PlayersContext, playersFromRoom } from "../players";
import { BOT_TIMING, type Settings, rulesFromSettings } from "../settings";
import type { OnlineIntent } from "./intent";
import { InviteRow, SeatList, StartControls } from "./parts";
import { type RoomHandle, useRoom } from "./useRoom";

interface Props {
  intent: OnlineIntent;
  settings: Settings;
  onSettings: (settings: Settings) => void;
  profile: Profile;
  onProfile: (profile: Profile) => void;
  /** Back to the single-player game. */
  onLeave: () => void;
  /** Starts over with a fresh attempt at the same thing. */
  onRetry: () => void;
}

/** A room played over the network. The server runs the game; this screen shows what it is told. */
export function OnlineApp({ intent, settings, onSettings, profile, onProfile, onLeave, onRetry }: Props) {
  // Only used to seed a new room, so later changes to these settings must not matter.
  const [prefs] = useState(() => ({ rules: rulesFromSettings(settings), botLevel: settings.botLevel }));
  const handle = useRoom(intent, profile, prefs, BOT_TIMING[settings.botSpeed]);
  const [menuOpen, setMenuOpen] = useState(false);
  const { room, seat, presenter, status } = handle;

  const leave = async () => {
    await handle.leave();
    onLeave();
  };

  if (status === "failed") {
    return (
      <Message title="Couldn't join the room">
        <p>{handle.error}</p>
        <div className="dialog-actions">
          <button type="button" className="primary" onClick={onRetry}>
            Try again
          </button>
          <button type="button" onClick={onLeave}>
            Play offline
          </button>
        </div>
      </Message>
    );
  }

  if (!room || seat === null || presenter.shown === null) {
    return (
      <Message title={intent.type === "create" ? "Making your room…" : "Joining the room…"}>
        <div className="dialog-actions">
          <button type="button" onClick={onLeave}>
            Cancel
          </button>
        </div>
      </Message>
    );
  }

  const players = playersFromRoom(room, seat);
  const closeMenu = () => setMenuOpen(false);
  const tabs: MenuTab[] = [
    {
      id: "online",
      label: "Online",
      content: (
        <OnlineTab
          room={room}
          seat={seat}
          profile={profile}
          onProfile={(next) => {
            onProfile(next);
            handle.setProfile(next);
          }}
          onLeave={leave}
        />
      ),
    },
    { id: "rules", label: "Rules", content: <RulesTab rules={room.settings.rules} /> },
    {
      id: "settings",
      label: "Settings",
      content: (
        <SettingsTab
          room={room}
          seat={seat}
          handle={handle}
          settings={settings}
          onSettings={onSettings}
        />
      ),
    },
  ];
  const menu = menuOpen && <MenuDialog tabs={tabs} onClose={closeMenu} />;
  const shown = presenter.shown;
  const isHost = room.host === seat;
  const hostName = room.seats[room.host]?.name ?? "the host";

  return (
    <PlayersContext.Provider value={players}>
      {status === "reconnecting" && (
        <div className="banner" role="status">
          Reconnecting…
        </div>
      )}
      {handle.notice && (
        <div className="toast" role="alert">
          {handle.notice}
        </div>
      )}
      <GameScreen
        view={shown.view}
        turnShown={presenter.lit}
        settings={settings}
        record={`Won ${room.wins[seat] ?? 0} of ${room.games}`}
        dealCode={room.dealCode}
        onMove={handle.move}
        onOpenMenu={() => setMenuOpen(true)}
        headerCenter={formatRoomCode(room.code)}
        gameOverActions={
          room.phase !== "over" ? (
            <p role="status">Starting…</p>
          ) : isHost ? (
            <>
              <StartControls label="Start next game" onStart={handle.start} />
              <button type="button" onClick={() => handle.start(room.dealCode ?? undefined)}>
                Replay this deal
              </button>
            </>
          ) : (
            <p role="status" data-testid="waiting">
              Waiting for {hostName} to start the next game…
            </p>
          )
        }
      >
        {menu}
      </GameScreen>
    </PlayersContext.Provider>
  );
}

function Message({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="app">
      <header className="topbar">
        <Logo />
      </header>
      <main className="lobby">
        <h2 className="message-title">{title}</h2>
        {children}
      </main>
    </div>
  );
}

function OnlineTab({
  room,
  seat,
  profile,
  onProfile,
  onLeave,
}: {
  room: RoomInfo;
  seat: number;
  profile: Profile;
  onProfile: (profile: Profile) => void;
  onLeave: () => void;
}) {
  return (
    <div className="menu-body">
      <ProfileEditor profile={profile} onSubmit={onProfile} />
      <InviteRow code={room.code} />
      <SeatList room={room} me={seat} />
      <div className="menu-actions">
        <button type="button" onClick={onLeave}>
          Leave room
        </button>
      </div>
    </div>
  );
}

function SettingsTab({
  room,
  seat,
  handle,
  settings,
  onSettings,
}: {
  room: RoomInfo;
  seat: number;
  handle: RoomHandle;
  settings: Settings;
  onSettings: (settings: Settings) => void;
}) {
  const isHost = room.host === seat;
  const playing = room.phase === "playing";

  return (
    <div className="menu-body">
      <BombRow
        anything={room.settings.rules.bombsBeatAnything}
        onChange={(bombsBeatAnything) => handle.setSettings({ rules: { ...room.settings.rules, bombsBeatAnything } })}
        disabled={!isHost || playing}
      />
      <BotLevelRow
        level={room.settings.botLevel}
        onChange={(botLevel) => handle.setSettings({ botLevel })}
        disabled={!isHost}
      />
      <p className="note">
        {isHost
          ? playing
            ? "Rules can change between games. Bots can change any time."
            : "You are the host, so these are yours to set."
          : `Only ${room.seats[room.host]?.name ?? "the host"} can change the room's rules and bots.`}
      </p>

      <PersonalRows settings={settings} onSettings={onSettings} />
      <p className="note">Speed, hints and the move log are saved on this device.</p>
    </div>
  );
}
