"use client";

type Props = {
  history: string[];
  viewIndex: number | null;
  onScrub: (index: number | null) => void;
};

/** SAN move list with click-to-scrub (view-only). */
export function MoveList({ history, viewIndex, onScrub }: Props) {
  const pairs: {
    num: number;
    white?: string;
    black?: string;
    wi: number;
    bi?: number;
  }[] = [];
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
    <div className="card flex h-64 flex-col p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="label">moves</span>
        {viewIndex !== null && (
          <button
            type="button"
            className="font-[family-name:var(--font-mono)] text-[0.6875rem] text-[var(--accent)] hover:underline"
            onClick={() => onScrub(null)}
          >
            live →
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto font-[family-name:var(--font-mono)] text-[0.8125rem]">
        {pairs.length === 0 && (
          <p className="text-[var(--muted)]">No moves yet.</p>
        )}
        <ol className="space-y-0.5">
          {pairs.map((p) => (
            <li key={p.num} className="flex items-center gap-1">
              <span className="w-7 text-right text-[var(--muted)]">
                {p.num}.
              </span>
              <button
                type="button"
                className={`rounded px-1.5 py-0.5 transition-colors ${
                  viewIndex === p.wi
                    ? "bg-[var(--accent)] text-[var(--bg)]"
                    : "hover:bg-white/5"
                }`}
                onClick={() => onScrub(p.wi)}
              >
                {p.white}
              </button>
              {p.black && p.bi != null && (
                <button
                  type="button"
                  className={`rounded px-1.5 py-0.5 transition-colors ${
                    viewIndex === p.bi
                      ? "bg-[var(--accent)] text-[var(--bg)]"
                      : "hover:bg-white/5"
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
    </div>
  );
}
