"use client";

import { useCallback } from "react";
import { GameBoard } from "@/components/GameBoard";
import { GameControls } from "@/components/GameControls";
import { MoveList } from "@/components/MoveList";
import { useChessGame } from "@/hooks/useChessGame";

export function PlayScreen() {
  const game = useChessGame({ botElo: 800, playerColor: "w" });

  const onMove = useCallback(
    (from: string, to: string) => game.makeMove(from, to),
    // makeMove is stable enough via hook; depend on the function ref
    [game.makeMove],
  );

  if (!game.hydrated) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-[var(--muted)]">
        Loading game…
      </div>
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[1fr_280px]">
      <div className="flex flex-col items-center gap-4">
        <GameBoard
          fen={game.fen}
          orientation={game.playerColor === "w" ? "white" : "black"}
          allowMoves={game.isPlayersTurn}
          lastMove={game.lastMove}
          hintArrow={game.hintArrow}
          onMove={onMove}
        />
        <p className="text-sm text-[var(--muted)]" data-testid="turn-indicator">
          {game.status === "thinking"
            ? "Bot thinking…"
            : game.isPlayersTurn
              ? "Your turn — drag a piece"
              : game.status === "playing"
                ? "Waiting…"
                : `Game over: ${game.status}`}
        </p>
      </div>

      <aside className="flex flex-col gap-4">
        <GameControls
          botElo={game.botElo}
          playerColor={game.playerColor}
          status={game.status}
          hintsRemaining={game.hintsRemaining}
          engineReady={game.engineReady}
          onBotElo={(elo) => {
            void game.newGame(game.playerColor, elo);
          }}
          onColor={(c) => {
            void game.newGame(c, game.botElo);
          }}
          onNewGame={() => void game.newGame()}
          onResign={game.resign}
          onTakeback={game.takeback}
          onHint={() => void game.requestHint()}
        />
        <MoveList
          history={game.history}
          viewIndex={game.viewIndex}
          onScrub={game.scrubTo}
        />
      </aside>
    </div>
  );
}
