"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GameBoard } from "@/components/GameBoard";
import { ActionBar } from "@/components/ActionBar";
import { BotSetup } from "@/components/BotSetup";
import { PlayerBar } from "@/components/PlayerBar";
import { MoveList } from "@/components/MoveList";
import { CoachBanner } from "@/components/CoachBanner";
import { CoachPanel } from "@/components/CoachPanel";
import { CoachSettings } from "@/components/CoachSettings";
import { BlunderCheckModal } from "@/components/BlunderCheckModal";
import { useChessGame, type GameStatus } from "@/hooks/useChessGame";
import { useCoach } from "@/hooks/useCoach";
import { quickBlunderCheck } from "@/lib/coach/detector";
import { getPlayEngine } from "@/lib/engine/stockfish";
import { getPersonality } from "@/lib/engine/personalities";
import type { LlmProviderId } from "@/lib/llm/provider";

const TABS = ["coach", "moves", "opponent", "settings"] as const;
type Tab = (typeof TABS)[number];

function botStatusText(engineReady: boolean, status: GameStatus): string {
  if (!engineReady) return "loading engine…";
  switch (status) {
    case "thinking":
      return "thinking";
    case "checkmate":
      return "checkmate";
    case "stalemate":
      return "stalemate";
    case "draw":
      return "draw";
    case "resigned":
      return "resigned";
    default:
      return "ready";
  }
}

export function PlayScreen() {
  const game = useChessGame({ botElo: 800, playerColor: "w" });
  const gameOver =
    game.status === "checkmate" ||
    game.status === "stalemate" ||
    game.status === "draw" ||
    game.status === "resigned";

  const coach = useCoach({
    history: game.history,
    playerColor: game.playerColor,
    enabled: game.hydrated && game.engineReady,
    gameOver,
  });

  const [tab, setTab] = useState<Tab>("coach");
  const [blunderCheckOn, setBlunderCheckOn] = useState(true);
  const [pendingMove, setPendingMove] = useState<{
    from: string;
    to: string;
  } | null>(null);
  const [checking, setChecking] = useState(false);
  const [availableLlms, setAvailableLlms] = useState<LlmProviderId[]>([
    "ollama",
    "claude",
    "gemini",
  ]);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [bestMoveShown, setBestMoveShown] = useState(false);
  const checkGen = useRef(0);

  useEffect(() => {
    void fetch("/api/coach")
      .then((r) => r.json())
      .then((d: { available?: LlmProviderId[] }) => {
        if (d.available?.length) setAvailableLlms(d.available);
      })
      .catch(() => undefined);
  }, []);

  // New coach verdict → show banner again
  useEffect(() => {
    if (coach.latestPly != null) {
      setBannerDismissed(false);
      setBestMoveShown(false);
      game.clearCoachReview();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coach.latestPly]);

  const latest = coach.latestItem;
  const showBanner = !bannerDismissed && (latest != null || gameOver);

  const commitMove = useCallback(
    (from: string, to: string) => {
      game.clearHint();
      setBestMoveShown(false);
      return game.makeMove(from, to);
    },
    [game],
  );

  const onMove = useCallback(
    (from: string, to: string) => {
      if (!game.isPlayersTurn) return false;

      if (!blunderCheckOn) {
        return commitMove(from, to);
      }

      const gen = ++checkGen.current;
      setChecking(true);

      void (async () => {
        try {
          const engine = getPlayEngine();
          await engine.init();
          const result = await quickBlunderCheck(
            engine,
            game.liveFen,
            from,
            to,
          );
          if (gen !== checkGen.current) return;
          if (result.warn) {
            setPendingMove({ from, to });
          } else {
            commitMove(from, to);
          }
        } catch {
          if (gen === checkGen.current) commitMove(from, to);
        } finally {
          if (gen === checkGen.current) setChecking(false);
        }
      })();

      return false;
    },
    [blunderCheckOn, commitMove, game.isPlayersTurn, game.liveFen],
  );

  if (!game.hydrated) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-[var(--muted)]">
        Loading game…
      </div>
    );
  }

  const persona = game.personalityId
    ? getPersonality(game.personalityId)
    : undefined;
  const botName =
    persona?.name ?? (game.botStyle === "human" ? "Human-like bot" : "Stockfish");
  const botSubtitle = persona
    ? `${game.botElo} elo · ${persona.style}`
    : `${game.botElo} elo`;

  const yourStatus = checking
    ? "blunder check…"
    : game.coachReviewActive
      ? "reviewing"
      : game.isPlayersTurn && game.status === "playing"
        ? "your turn"
        : gameOver
          ? "game over"
          : "waiting";

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      {/* ——— Board column ——— */}
      <div className="flex flex-col items-center gap-3">
        <CoachBanner
          report={showBanner ? latest?.report : undefined}
          explanation={
            showBanner
              ? (latest?.explanation ??
                (gameOver && !latest ? coach.biggestLesson : undefined))
              : undefined
          }
          loading={Boolean(latest?.explaining)}
          bestMoveShown={bestMoveShown}
          onShowBestMove={
            latest?.report.bestMove
              ? () => {
                  game.showBestMove(
                    latest.report.fenBefore,
                    latest.report.bestMove,
                  );
                  setBestMoveShown(true);
                }
              : undefined
          }
          onDismiss={
            showBanner
              ? () => {
                  setBannerDismissed(true);
                  setBestMoveShown(false);
                  game.clearCoachReview();
                }
              : undefined
          }
        />
        {game.coachReviewActive && (
          <button
            type="button"
            className="font-[family-name:var(--font-mono)] text-[0.6875rem] uppercase tracking-[0.1em] text-[var(--accent)] hover:underline"
            onClick={() => {
              game.clearCoachReview();
              setBestMoveShown(false);
            }}
          >
            ← back to live position
          </button>
        )}

        <PlayerBar
          name={botName}
          subtitle={botSubtitle}
          hue={persona?.hue ?? 45}
          initial={botName.slice(0, 1)}
          active={game.status === "thinking"}
          thinking={game.status === "thinking"}
          statusText={botStatusText(game.engineReady, game.status)}
          statusTestId="game-status"
        />

        <GameBoard
          fen={game.fen}
          orientation={game.playerColor === "w" ? "white" : "black"}
          allowMoves={game.isPlayersTurn && !checking && !pendingMove}
          lastMove={game.coachReviewActive ? null : game.lastMove}
          hintArrow={game.hintArrow}
          onMove={onMove}
        />

        <PlayerBar
          name="You"
          subtitle={game.playerColor === "w" ? "white pieces" : "black pieces"}
          hue={null}
          initial="Y"
          active={
            game.isPlayersTurn && game.status === "playing" && !checking
          }
          statusText={yourStatus}
          statusTestId="turn-indicator"
        />

        <div className="w-full max-w-[560px]">
          <ActionBar
            status={game.status}
            hintsRemaining={game.hintsRemaining}
            onNewGame={() => void game.newGame()}
            onResign={game.resign}
            onTakeback={game.takeback}
            onHint={() => void game.requestHint()}
          />
        </div>

        {gameOver && game.botLine && (
          <p className="text-sm text-[var(--accent)]">“{game.botLine}”</p>
        )}
      </div>

      {/* ——— Tabbed sidebar ——— */}
      <aside className="flex flex-col">
        <div className="card flex min-h-[28rem] flex-col overflow-hidden">
          <div className="grid grid-cols-4 border-b border-[var(--border)]">
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                className={`relative px-2 py-2.5 font-[family-name:var(--font-mono)] text-[0.625rem] uppercase tracking-[0.12em] transition-colors ${
                  tab === t
                    ? "text-[var(--fg)]"
                    : "text-[var(--muted)] hover:text-[var(--fg)]"
                }`}
                onClick={() => setTab(t)}
                data-testid={`tab-${t}`}
              >
                {t}
                {tab === t && (
                  <span className="absolute inset-x-3 bottom-0 h-px bg-[var(--accent)]" />
                )}
              </button>
            ))}
          </div>

          {/* Keep all tabs mounted so state (settings, scroll) survives switches */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className={tab === "coach" ? "" : "hidden"}>
              <CoachPanel
                items={coach.items}
                activePly={coach.latestPly}
                onSelect={(ply) => {
                  coach.setLatestPly(ply);
                  setBannerDismissed(false);
                  setBestMoveShown(false);
                  game.clearCoachReview();
                }}
                summary={coach.summary}
                gameOver={gameOver}
              />
            </div>
            <div className={tab === "moves" ? "" : "hidden"}>
              <MoveList
                history={game.history}
                viewIndex={game.viewIndex}
                onScrub={game.scrubTo}
              />
            </div>
            <div className={tab === "opponent" ? "" : "hidden"}>
              <BotSetup
                botElo={game.botElo}
                playerColor={game.playerColor}
                personalityId={game.personalityId}
                botStyle={game.botStyle}
                onBotStyle={(s) => {
                  game.setBotStyle(s);
                  void game.newGame(game.playerColor, game.botElo, null);
                }}
                onBotElo={(elo) => {
                  void game.newGame(game.playerColor, elo, null);
                }}
                onColor={(c) => {
                  void game.newGame(c, game.botElo, game.personalityId);
                }}
                onSelectPersonality={game.selectPersonality}
              />
            </div>
            <div className={tab === "settings" ? "" : "hidden"}>
              <CoachSettings
                available={availableLlms}
                onChange={(s) => setBlunderCheckOn(s.blunderCheckMode)}
              />
            </div>
          </div>
        </div>
      </aside>

      <BlunderCheckModal
        open={pendingMove != null}
        onCancel={() => setPendingMove(null)}
        onPlayAnyway={() => {
          if (pendingMove) {
            commitMove(pendingMove.from, pendingMove.to);
            setPendingMove(null);
          }
        }}
      />
    </div>
  );
}
