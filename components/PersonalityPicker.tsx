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
    <div className="card p-4">
      <p className="label mb-3">bot personalities</p>
      <div className="grid gap-1.5">
        {PERSONALITIES.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelect(p)}
            className={`flex items-center gap-3 rounded-md border p-2 text-left transition-colors ${
              selectedId === p.id
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
                  {p.elo}
                </span>
              </span>
              <span className="mt-0.5 block truncate text-xs text-[var(--muted)]">
                {p.blurb}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
