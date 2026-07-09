"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GameBoard } from "@/components/GameBoard";
import { GameControls } from "@/components/GameControls";
import { MoveList } from "@/components/MoveList";
import { CoachBanner } from "@/components/CoachBanner";
import { CoachPanel } from "@/components/CoachPanel";
import { CoachSettings } from "@/components/CoachSettings";
import { BlunderCheckModal } from "@/components/BlunderCheckModal";
import { PersonalityPicker } from "@/components/PersonalityPicker";
import { useChessGame } from "@/hooks/useChessGame";
import { useCoach } from "@/hooks/useCoach";
import { quickBlunderCheck } from "@/lib/coach/detector";
import { getPlayEngine } from "@/lib/engine/stockfish";
import type { LlmProviderId } from "@/lib/llm/provider";

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

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[1fr_300px]">
      <div className="flex flex-col items-center gap-4">
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
        <GameBoard
          fen={game.fen}
          orientation={game.playerColor === "w" ? "white" : "black"}
          allowMoves={game.isPlayersTurn && !checking && !pendingMove}
          lastMove={game.coachReviewActive ? null : game.lastMove}
          hintArrow={game.hintArrow}
          onMove={onMove}
        />
        <p
          className="font-[family-name:var(--font-mono)] text-xs text-[var(--muted)]"
          data-testid="turn-indicator"
        >
          {checking
            ? "Running Blunder Check…"
            : game.coachReviewActive
              ? "Reviewing best move — continue when ready"
              : game.status === "thinking"
                ? "Bot thinking…"
                : game.isPlayersTurn
                  ? "Your turn — drag a piece"
                  : game.status === "playing"
                    ? "Waiting…"
                    : `Game over: ${game.status}`}
        </p>
        {gameOver && game.botLine && (
          <p className="text-sm text-[var(--accent)]">“{game.botLine}”</p>
        )}
      </div>

      <aside className="flex flex-col gap-4">
        <GameControls
          botElo={game.botElo}
          playerColor={game.playerColor}
          status={game.status}
          hintsRemaining={game.hintsRemaining}
          engineReady={game.engineReady}
          onBotElo={(elo) => {
            void game.newGame(game.playerColor, elo, null);
          }}
          onColor={(c) => {
            void game.newGame(c, game.botElo, game.personalityId);
          }}
          onNewGame={() => void game.newGame()}
          onResign={game.resign}
          onTakeback={game.takeback}
          onHint={() => void game.requestHint()}
        />
        <PersonalityPicker
          selectedId={game.personalityId}
          onSelect={game.selectPersonality}
        />
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
        <CoachSettings
          available={availableLlms}
          onChange={(s) => setBlunderCheckOn(s.blunderCheckMode)}
        />
        <MoveList
          history={game.history}
          viewIndex={game.viewIndex}
          onScrub={game.scrubTo}
        />
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
