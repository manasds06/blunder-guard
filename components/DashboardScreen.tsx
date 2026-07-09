"use client";

import { useEffect, useState } from "react";
import {
  aggregateDashboard,
  type DashboardData,
} from "@/lib/stats/aggregate";
import { getPuzzleMeta } from "@/lib/puzzles/session";

export function DashboardScreen() {
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    void (async () => {
      const meta = await getPuzzleMeta();
      const agg = await aggregateDashboard(meta.streak);
      setData(agg);
    })();
  }, []);

  if (!data) {
    return (
      <div className="p-8 text-[var(--muted)]">Loading dashboard…</div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="font-[family-name:var(--font-display)] text-3xl text-[var(--accent)]">
        Progress
      </h1>
      <p className="mt-2 text-[var(--muted)]">
        Blunders per game is the hero metric — fewer hangs, higher strength.
      </p>

      {data.empty && (
        <p className="mt-8 rounded border border-[var(--border)] bg-[var(--panel)] p-6 text-[var(--muted)]">
          Play 3 games (and a few puzzles) to unlock trends.
        </p>
      )}

      <div className="mt-8 grid gap-6 sm:grid-cols-3">
        <Stat
          label="Estimated strength"
          value={data.estimatedStrength ? `${data.estimatedStrength}` : "—"}
        />
        <Stat label="Games this week" value={String(data.gamesThisWeek)} />
        <Stat label="Puzzle streak" value={String(data.puzzleStreak)} />
      </div>

      <section className="mt-10">
        <h2 className="mb-3 text-lg font-semibold">Blunders per game</h2>
        <Sparkline
          points={data.blundersPerGame.map((b) => b.blunders)}
          color="var(--danger)"
          empty="No analyzed games yet"
        />
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-lg font-semibold">Puzzle rating</h2>
        <Sparkline
          points={data.puzzleRatingHistory.map((p) => p.rating)}
          color="var(--accent)"
          empty="Solve puzzles to see rating over time"
        />
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-lg font-semibold">Win rate by bot Elo</h2>
        {data.winRateByElo.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No games recorded yet.</p>
        ) : (
          <ul className="space-y-2">
            {data.winRateByElo.map((row) => {
              const pct = row.games ? Math.round((100 * row.wins) / row.games) : 0;
              return (
                <li key={row.elo} className="flex items-center gap-3 text-sm">
                  <span className="w-12 font-mono">{row.elo}</span>
                  <div className="h-3 flex-1 overflow-hidden rounded bg-[var(--border)]">
                    <div
                      className="h-full bg-[var(--ok)]"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-24 text-[var(--muted)]">
                    {pct}% ({row.wins}/{row.games})
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-4">
      <p className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</p>
      <p className="mt-1 font-[family-name:var(--font-display)] text-2xl">{value}</p>
    </div>
  );
}

function Sparkline({
  points,
  color,
  empty,
}: {
  points: number[];
  color: string;
  empty: string;
}) {
  if (points.length < 2) {
    return <p className="text-sm text-[var(--muted)]">{empty}</p>;
  }
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = Math.max(1, max - min);
  const w = 400;
  const h = 80;
  const pts = points
    .map((v, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - 4 - ((v - min) / span) * (h - 8);
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full max-w-xl rounded border border-[var(--border)] bg-[var(--panel)]">
      <polyline fill="none" stroke={color} strokeWidth={2} points={pts} />
    </svg>
  );
}
