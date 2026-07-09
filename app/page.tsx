import Link from "next/link";

const features = [
  {
    kicker: "01 / play",
    title: "Bots from 400 to 2000",
    body: "Human-weak engines that miss tactics the way people do — not crippled randomness.",
    href: "/play",
  },
  {
    kicker: "02 / coach",
    title: "Live blunder warnings",
    body: "Every move judged locally by Stockfish. Explanations written by an LLM that never calculates.",
    href: "/play",
  },
  {
    kicker: "03 / puzzles",
    title: "Rated tactics + SRS",
    body: "Puzzles at your level, misses resurface on a spaced-repetition schedule until they stick.",
    href: "/puzzles",
  },
  {
    kicker: "04 / analyze",
    title: "Full-game review",
    body: "Paste any PGN. Top three mistakes, an eval graph, and one key lesson per game.",
    href: "/analyze",
  },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <section className="mx-auto w-full max-w-6xl px-4 pb-20 pt-24 sm:pt-32">
        <p className="label">chess training, minus the guesswork</p>
        <h1 className="mt-5 max-w-3xl font-[family-name:var(--font-display)] text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
          Stop hanging pieces.
          <br />
          <span className="text-[var(--muted)]">Train the habit.</span>
        </h1>
        <p className="mt-6 max-w-md text-[0.9375rem] leading-relaxed text-[var(--muted)]">
          Stockfish judges every move. A coach explains the why. You unlearn
          the blunders — one game at a time.
        </p>
        <div className="mt-10 flex flex-wrap items-center gap-3">
          <Link href="/play" className="btn btn-primary px-5 py-2.5">
            Play a bot
          </Link>
          <Link href="/puzzles" className="btn btn-ghost px-5 py-2.5">
            Solve puzzles
          </Link>
          <span className="ml-1 font-[family-name:var(--font-mono)] text-[0.6875rem] text-[var(--muted)]">
            runs locally · no account needed
          </span>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 pb-24">
        <div className="grid gap-px overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--border)] sm:grid-cols-2">
          {features.map((f) => (
            <Link
              key={f.kicker}
              href={f.href}
              className="group bg-[var(--bg)] p-6 transition-colors hover:bg-[var(--panel)]"
            >
              <p className="label">{f.kicker}</p>
              <h2 className="mt-3 font-[family-name:var(--font-display)] text-lg font-medium tracking-tight">
                {f.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
                {f.body}
              </p>
              <span className="mt-4 inline-block font-[family-name:var(--font-mono)] text-[0.6875rem] text-[var(--muted)] transition-colors group-hover:text-[var(--accent)]">
                →
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
