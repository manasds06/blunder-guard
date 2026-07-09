import Link from "next/link";

export default function Home() {
  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%232c3a2e' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
        }}
      />
      <section className="relative mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center px-6 py-16">
        <p className="font-[family-name:var(--font-display)] text-5xl leading-none tracking-tight text-[var(--accent)] sm:text-7xl">
          Blunder Guard
        </p>
        <h1 className="mt-6 max-w-xl text-2xl font-semibold text-[var(--fg)] sm:text-3xl">
          Stop hanging pieces. Train the habit.
        </h1>
        <p className="mt-4 max-w-lg text-lg text-[var(--muted)]">
          Play Elo bots, get instant blunder warnings, and learn from a coach
          that explains — Stockfish calculates.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            href="/play"
            className="rounded bg-[var(--accent)] px-6 py-3 text-base font-semibold text-[var(--bg)] hover:opacity-90"
          >
            Play a bot
          </Link>
          <Link
            href="/puzzles"
            className="rounded border border-[var(--border)] px-6 py-3 text-base hover:bg-white/5"
          >
            Solve puzzles
          </Link>
        </div>
      </section>
    </div>
  );
}
