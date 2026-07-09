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
      return "bot thinking";
    case "checkmate":
      return "checkmate";
    case "stalemate":
      return "stalemate";
    case "draw":
      return "draw";
    case "resigned":
      return "resigned";
    case "playing":
      return "your move";
    default:
      return "ready";
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
    <div className="card flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <span className="label">game</span>
        <span
          className="font-[family-name:var(--font-mono)] text-[0.6875rem] text-[var(--fg)]/80"
          data-testid="game-status"
        >
          {!engineReady ? "loading engine…" : statusLabel(status)}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="label">bot elo</span>
          <select
            className="field"
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

        <label className="flex flex-col gap-1.5">
          <span className="label">side</span>
          <select
            className="field"
            value={playerColor}
            onChange={(e) => onColor(e.target.value as PlayerColor)}
            data-testid="player-color"
          >
            <option value="w">White</option>
            <option value="b">Black</option>
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
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
          onClick={onResign}
          disabled={!playing}
        >
          Resign
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
          className="btn btn-ghost"
          onClick={onHint}
          disabled={!playing || hintsRemaining <= 0}
          data-testid="hint"
        >
          Hint · {hintsRemaining}
        </button>
      </div>
    </div>
  );
}
