"use client";

import {
  PERSONALITIES,
  type Personality,
} from "@/lib/engine/personalities";

type Props = {
  selectedId: string | null;
  onSelect: (p: Personality) => void;
};

export function PersonalityPicker({ selectedId, onSelect }: Props) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-4">
      <h3 className="mb-3 text-sm font-semibold text-[var(--accent)]">
        Bot personalities
      </h3>
      <div className="grid gap-2">
        {PERSONALITIES.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelect(p)}
            className={`flex gap-3 rounded border p-2 text-left text-sm ${
              selectedId === p.id
                ? "border-[var(--accent)] bg-[var(--accent)]/10"
                : "border-[var(--border)] hover:bg-white/5"
            }`}
            data-testid={`persona-${p.id}`}
          >
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold text-[var(--bg)]"
              style={{ background: `hsl(${p.hue} 55% 45%)` }}
              aria-hidden
            >
              {p.name.slice(0, 1)}
            </span>
            <span>
              <span className="font-semibold">
                {p.name} · {p.elo}
              </span>
              <span className="mt-0.5 block text-xs text-[var(--muted)]">
                {p.blurb}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
