"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GameBoard } from "@/components/GameBoard";
import { GameControls } from "@/components/GameControls";
import { MoveList } from "@/components/MoveList";
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
    "claude",
    "gemini",
  ]);
  const checkGen = useRef(0);

  useEffect(() => {
    void fetch("/api/coach")
      .then((r) => r.json())
      .then((d: { available?: LlmProviderId[] }) => {
        if (d.available?.length) setAvailableLlms(d.available);
      })
      .catch(() => undefined);
  }, []);

  const commitMove = useCallback(
    (from: string, to: string) => {
      game.clearHint();
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

      // Debounce / cancel in-flight checks
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

      // Return false so the board snaps back until we commit
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
        <GameBoard
          fen={game.fen}
          orientation={game.playerColor === "w" ? "white" : "black"}
          allowMoves={game.isPlayersTurn && !checking && !pendingMove}
          lastMove={game.lastMove}
          hintArrow={game.hintArrow}
          onMove={onMove}
        />
        <p className="text-sm text-[var(--muted)]" data-testid="turn-indicator">
          {checking
            ? "Running Blunder Check…"
            : game.status === "thinking"
              ? "Bot thinking…"
              : game.isPlayersTurn
                ? "Your turn — drag a piece"
                : game.status === "playing"
                  ? "Waiting…"
                  : `Game over: ${game.status}`}
        </p>
        {gameOver && game.botLine && (
          <p className="text-sm italic text-[var(--accent)]">{game.botLine}</p>
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
          onExplain={(ply) => void coach.onExplain(ply)}
          summary={coach.summary}
          biggestLesson={coach.biggestLesson}
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
