import { useEffect, useMemo, useReducer, useState } from "react";
import { type GameState, encodeDeal, viewFor } from "../engine";
import { GameScreen } from "./GameScreen";
import { useDealPresentation, useReducedMotion } from "./dealPresentation";
import { LocalGameTab, MenuDialog, type MenuTab, BombRow, BotLevelRow, PersonalRows } from "./Menu";
import type { OnlineIntent } from "./online/intent";
import { LOCAL_PLAYERS, PlayersContext } from "./players";
import { RulesDialog } from "./Rules";
import { HUMAN, initSession, isTurnShown, reduceSession } from "./session";
import { BOT_BY_LEVEL, BOT_TIMING, type Settings, rulesFromSettings } from "./settings";
import { randomSeed, startingOptions } from "./url";

interface Props {
  settings: Settings;
  onSettings: (settings: Settings) => void;
  onOnline: (intent: OnlineIntent) => void;
}

/** Single player: you at the bottom, three bots, everything running in this browser. */
export function LocalGame({ settings, onSettings, onOnline }: Props) {
  const [session, dispatch] = useReducer(reduceSession, undefined, () =>
    initSession({ ...startingOptions(), rules: rulesFromSettings(settings) }),
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [revealed, setRevealed] = useState<GameState | null>(null);
  const { game } = session;
  const view = useMemo(() => viewFor(game, HUMAN), [game]);
  const turnShown = isTurnShown(game, revealed);
  const dealCode = encodeDeal(session.start);
  const reducedMotion = useReducedMotion();
  const opening = useDealPresentation(session.dealNumber, reducedMotion);

  const updateSettings = (next: Settings) => {
    onSettings(next);
    dispatch({ type: "rules", rules: rulesFromSettings(next) });
  };

  // A bot's turn plays out in two beats: first it lights up, then its card lands.
  // Bots wait while the menu or the rules are open.
  useEffect(() => {
    if (menuOpen || rulesOpen || opening.phase !== "ready" || game.winner !== null || game.turn === HUMAN) return;
    const timing = BOT_TIMING[settings.botSpeed];
    const id = window.setTimeout(
      turnShown ? () => dispatch({ type: "bot", bot: BOT_BY_LEVEL[settings.botLevel] }) : () => setRevealed(game),
      turnShown ? timing.think : timing.gap,
    );
    return () => window.clearTimeout(id);
  }, [game, turnShown, menuOpen, rulesOpen, opening.phase, settings.botLevel, settings.botSpeed]);

  const closeMenu = () => setMenuOpen(false);

  const tabs: MenuTab[] = [
    {
      id: "game",
      label: "Game",
      content: (
        <LocalGameTab
          game={game}
          onNewDeal={() => {
            dispatch(game.winner !== null ? { type: "rematch", seed: randomSeed() } : { type: "restart", seed: randomSeed() });
            closeMenu();
          }}
          onSameDeal={() => {
            dispatch({ type: "sameDeal" });
            closeMenu();
          }}
          onLoadDeal={(deal) => {
            dispatch({ type: "load", deal });
            closeMenu();
          }}
          onOnline={(intent) => {
            closeMenu();
            onOnline(intent);
          }}
        />
      ),
    },
    {
      id: "settings",
      label: "Settings",
      content: (
        <div className="menu-body">
          <BombRow
            anything={settings.bombsBeatAnything}
            onChange={(bombsBeatAnything) => updateSettings({ ...settings, bombsBeatAnything })}
          />
          <BotLevelRow level={settings.botLevel} onChange={(botLevel) => updateSettings({ ...settings, botLevel })} />
          <PersonalRows settings={settings} onSettings={updateSettings} />
          <p className="note">Saved on this device. Rule changes apply right away.</p>
        </div>
      ),
    },
  ];

  const leader = game.winner === null ? null : LOCAL_PLAYERS.names[game.winner];

  return (
    <PlayersContext.Provider value={LOCAL_PLAYERS}>
      <GameScreen
        view={view}
        turnShown={turnShown}
        settings={settings}
        onSettings={updateSettings}
        record={`Won ${session.won} of ${session.played}`}
        opening={opening}
        reducedMotion={reducedMotion}
        dealCode={dealCode}
        onMove={(move) => dispatch({ type: "human", move })}
        onOpenMenu={() => setMenuOpen(true)}
        onOpenRules={() => setRulesOpen(true)}
        gameOverActions={
          <>
            <button type="button" className="primary" onClick={() => dispatch({ type: "rematch", seed: randomSeed() })} autoFocus>
              Play again{game.winner === HUMAN ? "" : ` (${leader} leads)`}
            </button>
            <button type="button" onClick={() => dispatch({ type: "sameDeal" })}>
              Replay this deal
            </button>
          </>
        }
      >
        {menuOpen && <MenuDialog tabs={tabs} onClose={closeMenu} />}
        {rulesOpen && <RulesDialog rules={game.rules} onClose={() => setRulesOpen(false)} />}
      </GameScreen>
    </PlayersContext.Provider>
  );
}
