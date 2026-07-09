"use client";

type Props = {
  history: string[];
  viewIndex: number | null;
  onScrub: (index: number | null) => void;
};

/** SAN move list with click-to-scrub (view-only). */
export function MoveList({ history, viewIndex, onScrub }: Props) {
  const pairs: { num: number; white?: string; black?: string; wi: number; bi?: number }[] =
    [];
  for (let i = 0; i < history.length; i += 2) {
    pairs.push({
      num: i / 2 + 1,
      white: history[i],
      black: history[i + 1],
      wi: i,
      bi: history[i + 1] != null ? i + 1 : undefined,
    });
  }

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-3 h-64 overflow-y-auto font-mono text-sm">
      <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-wide text-[var(--muted)]">
        <span>Moves</span>
        {viewIndex !== null && (
          <button
            type="button"
            className="text-[var(--accent)] hover:underline"
            onClick={() => onScrub(null)}
          >
            Back to live
          </button>
        )}
      </div>
      {pairs.length === 0 && (
        <p className="text-[var(--muted)]">No moves yet.</p>
      )}
      <ol className="space-y-1">
        {pairs.map((p) => (
          <li key={p.num} className="flex gap-2">
            <span className="w-6 text-[var(--muted)]">{p.num}.</span>
            <button
              type="button"
              className={`px-1 rounded ${
                viewIndex === p.wi
                  ? "bg-[var(--accent)] text-[var(--bg)]"
                  : "hover:bg-white/10"
              }`}
              onClick={() => onScrub(p.wi)}
            >
              {p.white}
            </button>
            {p.black && p.bi != null && (
              <button
                type="button"
                className={`px-1 rounded ${
                  viewIndex === p.bi
                    ? "bg-[var(--accent)] text-[var(--bg)]"
                    : "hover:bg-white/10"
                }`}
                onClick={() => onScrub(p.bi!)}
              >
                {p.black}
              </button>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
