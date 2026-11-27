"use client";

import { BOT_ELOS } from "@/lib/engine/botLevels";
import {
  PERSONALITIES,
  type Personality,
} from "@/lib/engine/personalities";
import type { BotStyle, PlayerColor } from "@/hooks/useChessGame";

type Props = {
  botElo: number;
  playerColor: PlayerColor;
  personalityId: string | null;
  botStyle: BotStyle;
  onBotElo: (elo: number) => void;
  onColor: (c: PlayerColor) => void;
  onBotStyle: (s: BotStyle) => void;
  onSelectPersonality: (p: Personality) => void;
};

const STYLES: { id: BotStyle; label: string; blurb: string }[] = [
  {
    id: "stockfish",
    label: "Stockfish",
    blurb: "Engine weakened to your level. Its mistakes can feel random.",
  },
  {
    id: "human",
    label: "Human-like",
    blurb:
      "A model trained on 3.2M moves from real Lichess games. It makes the mistakes players at this rating actually make.",
  },
];

/** Opponent setup — style, strength, side, and personality in one panel. */
export function BotSetup({
  botElo,
  playerColor,
  personalityId,
  botStyle,
  onBotElo,
  onColor,
  onBotStyle,
  onSelectPersonality,
}: Props) {
  const style = STYLES.find((s) => s.id === botStyle) ?? STYLES[0]!;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className="label">opponent</span>
        <div
          className="grid grid-cols-2 overflow-hidden rounded-md border border-[var(--border)]"
          role="radiogroup"
          aria-label="opponent style"
          data-testid="bot-style"
        >
          {STYLES.map((s) => (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={botStyle === s.id}
              className={`px-2 py-[0.4rem] text-[0.8125rem] transition-colors ${
                botStyle === s.id
                  ? "bg-[var(--fg)] font-medium text-[var(--bg)]"
                  : "text-[var(--muted)] hover:bg-white/5 hover:text-[var(--fg)]"
              }`}
              onClick={() => onBotStyle(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
        <p className="text-[0.75rem] text-[var(--muted)]">{style.blurb}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="label">strength</span>
          <select
            className="field"
            value={botElo}
            onChange={(e) => onBotElo(Number(e.target.value))}
            data-testid="bot-elo"
          >
            {BOT_ELOS.map((elo) => (
              <option key={elo} value={elo}>
                {elo} Elo
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="label">you play</span>
          <div
            className="grid grid-cols-2 overflow-hidden rounded-md border border-[var(--border)]"
            role="radiogroup"
            data-testid="player-color"
          >
            {(["w", "b"] as const).map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={playerColor === c}
                className={`px-2 py-[0.4rem] text-[0.8125rem] transition-colors ${
                  playerColor === c
                    ? "bg-[var(--fg)] font-medium text-[var(--bg)]"
                    : "text-[var(--muted)] hover:bg-white/5 hover:text-[var(--fg)]"
                }`}
                onClick={() => onColor(c)}
              >
                {c === "w" ? "White" : "Black"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div>
        <p className="label mb-2">personality</p>
        <div className="grid gap-1.5">
          {PERSONALITIES.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelectPersonality(p)}
              className={`flex items-center gap-3 rounded-md border p-2 text-left transition-colors ${
                personalityId === p.id
                  ? "border-[var(--accent)]/50 bg-[var(--accent-dim)]"
                  : "border-transparent hover:bg-white/[0.04]"
              }`}
              data-testid={`persona-${p.id}`}
            >
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md font-[family-name:var(--font-mono)] text-xs font-semibold text-[var(--bg)]"
                style={{ background: `hsl(${p.hue} 40% 62%)` }}
                aria-hidden
              >
                {p.name.slice(0, 1)}
              </span>
              <span className="min-w-0">
                <span className="flex items-baseline gap-2 text-[0.8125rem] font-medium">
                  {p.name}
                  <span className="font-[family-name:var(--font-mono)] text-[0.625rem] text-[var(--muted)]">
                    {p.elo} · {p.style}
                  </span>
                </span>
                <span className="mt-0.5 block truncate text-xs text-[var(--muted)]">
                  {p.blurb}
                </span>
              </span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-[0.6875rem] leading-relaxed text-[var(--muted)]">
          Picking a personality starts a fresh game against them.
        </p>
      </div>
    </div>
  );
}
