"use client";

import { BOT_ELOS } from "@/lib/engine/botLevels";
import type { GameStatus, PlayerColor } from "@/hooks/useChessGame";

type Props = {
  botElo: number;
  playerColor: PlayerColor;
  status: GameStatus;
  hintsRemaining: number;
  engineReady: boolean;
  onBotElo: (elo: number) => void;
  onColor: (c: PlayerColor) => void;
  onNewGame: () => void;
  onResign: () => void;
  onTakeback: () => void;
  onHint: () => void;
};

function statusLabel(status: GameStatus): string {
  switch (status) {
    case "thinking":
      return "Bot is thinking…";
    case "checkmate":
      return "Checkmate";
    case "stalemate":
      return "Stalemate";
    case "draw":
      return "Draw";
    case "resigned":
      return "Resigned";
    case "playing":
      return "Your move";
    default:
      return "Ready";
  }
}

export function GameControls({
  botElo,
  playerColor,
  status,
  hintsRemaining,
  engineReady,
  onBotElo,
  onColor,
  onNewGame,
  onResign,
  onTakeback,
  onHint,
}: Props) {
  const playing = status === "playing" || status === "thinking";

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--panel)] p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-[var(--muted)]">Status</span>
        <span className="text-sm font-medium" data-testid="game-status">
          {!engineReady ? "Loading engine…" : statusLabel(status)}
        </span>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-[var(--muted)]">Bot Elo</span>
        <select
          className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5"
          value={botElo}
          onChange={(e) => onBotElo(Number(e.target.value))}
          data-testid="bot-elo"
        >
          {BOT_ELOS.map((elo) => (
            <option key={elo} value={elo}>
              {elo}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-[var(--muted)]">Play as</span>
        <select
          className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5"
          value={playerColor}
          onChange={(e) => onColor(e.target.value as PlayerColor)}
          data-testid="player-color"
        >
          <option value="w">White</option>
          <option value="b">Black</option>
        </select>
      </label>

      <div className="grid grid-cols-2 gap-2 pt-1">
        <button
          type="button"
          className="rounded bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-[var(--bg)] hover:opacity-90"
          onClick={onNewGame}
          data-testid="new-game"
        >
          New Game
        </button>
        <button
          type="button"
          className="rounded border border-[var(--border)] px-3 py-2 text-sm hover:bg-white/5 disabled:opacity-40"
          onClick={onResign}
          disabled={!playing}
        >
          Resign
        </button>
        <button
          type="button"
          className="rounded border border-[var(--border)] px-3 py-2 text-sm hover:bg-white/5 disabled:opacity-40"
          onClick={onTakeback}
          disabled={!playing}
          data-testid="takeback"
        >
          Takeback
        </button>
        <button
          type="button"
          className="rounded border border-[var(--border)] px-3 py-2 text-sm hover:bg-white/5 disabled:opacity-40"
          onClick={onHint}
          disabled={!playing || hintsRemaining <= 0}
          data-testid="hint"
        >
          Hint ({hintsRemaining})
        </button>
      </div>
    </div>
  );
}
