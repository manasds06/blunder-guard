"use client";

import type { GameStatus } from "@/hooks/useChessGame";

type Props = {
  status: GameStatus;
  hintsRemaining: number;
  onNewGame: () => void;
  onResign: () => void;
  onTakeback: () => void;
  onHint: () => void;
};

/** Horizontal toolbar under the board — primary game actions always in reach. */
export function ActionBar({
  status,
  hintsRemaining,
  onNewGame,
  onResign,
  onTakeback,
  onHint,
}: Props) {
  const playing = status === "playing" || status === "thinking";

  return (
    <div className="grid w-full grid-cols-4 gap-2">
      <button
        type="button"
        className="btn btn-primary"
        onClick={onNewGame}
        data-testid="new-game"
      >
        New game
      </button>
      <button
        type="button"
        className="btn btn-ghost"
        onClick={onHint}
        disabled={!playing || hintsRemaining <= 0}
        data-testid="hint"
      >
        Hint
        <span className="font-[family-name:var(--font-mono)] text-[0.625rem] text-[var(--muted)]">
          {hintsRemaining}
        </span>
      </button>
      <button
        type="button"
        className="btn btn-ghost"
        onClick={onTakeback}
        disabled={!playing}
        data-testid="takeback"
      >
        Takeback
      </button>
      <button
        type="button"
        className="btn btn-ghost hover:border-[var(--danger)]/50 hover:text-[var(--danger)]"
        onClick={onResign}
        disabled={!playing}
      >
        Resign
      </button>
    </div>
  );
}
