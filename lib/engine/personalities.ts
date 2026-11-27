/**
 * Bot personalities — Decorator pattern over EngineProvider.
 * Style biases WHICH near-equal MultiPV move is chosen; Elo caps still apply.
 */
import type { EngineProvider } from "./provider";
import type { EngineMove, EvalOptions, Evaluation, MoveOptions } from "./types";
import { Chess } from "chess.js";

export type BotStyle = "aggressive" | "solid" | "speedy" | "balanced";

export type Personality = {
  id: string;
  name: string;
  elo: number;
  style: BotStyle;
  blurb: string;
  /** Simple SVG avatar hue */
  hue: number;
  oneLiners: string[];
};

export const PERSONALITIES: Personality[] = [
  {
    id: "rex",
    name: "Rex",
    elo: 800,
    style: "aggressive",
    blurb: "Hunts captures and checks. Fun sparring partner.",
    hue: 12,
    oneLiners: [
      "That was spicy — rematch?",
      "I live for open lines.",
      "Checks are free dopamine.",
    ],
  },
  {
    id: "vera",
    name: "Grandma Vera",
    elo: 1000,
    style: "solid",
    blurb: "Quiet improving moves. Punishes greed patiently.",
    hue: 140,
    oneLiners: [
      "Slow and steady, dear.",
      "Development before drama.",
      "Tea first, tactics second.",
    ],
  },
  {
    id: "bala",
    name: "Blitz Bala",
    elo: 600,
    style: "speedy",
    blurb: "Fast clocks, wider mistakes. Great for volume.",
    hue: 200,
    oneLiners: [
      "Tick-tock — another?",
      "Speed over precision today.",
      "Who needs depth?",
    ],
  },
  {
    id: "stock",
    name: "Stock Standard",
    elo: 1200,
    style: "balanced",
    blurb: "No style bias — pure mapped Elo strength.",
    hue: 45,
    oneLiners: ["GG.", "Clean game.", "See you on the board."],
  },
  {
    id: "manas-bot",
    name: "Manas-Bot",
    elo: 700,
    style: "balanced",
    blurb: "Trained on real 700-rated Lichess games. Misses the tactics a 700 misses.",
    hue: 280,
    oneLiners: [
      "Felt human, right?",
      "I miss tactics too.",
      "Maia vibes loading…",
    ],
  },
];

export function getPersonality(id: string): Personality | undefined {
  return PERSONALITIES.find((p) => p.id === id);
}

/**
 * PersonalityWrapper — Decorator: wraps any EngineProvider and re-ranks MultiPV.
 */
export class PersonalityWrapper implements EngineProvider {
  readonly id: string;
  constructor(
    private inner: EngineProvider,
    private personality: Personality,
  ) {
    this.id = `persona:${personality.id}`;
  }

  init(): Promise<void> {
    return this.inner.init();
  }

  dispose(): void {
    this.inner.dispose();
  }

  evaluate(fen: string, opts: EvalOptions): Promise<Evaluation> {
    return this.inner.evaluate(fen, opts);
  }

  async getMove(fen: string, opts: MoveOptions): Promise<EngineMove> {
    const style = this.personality.style;
    if (style === "balanced") {
      return this.inner.getMove(fen, opts);
    }

    const multipv = Math.max(opts.multipv ?? 1, style === "speedy" ? 5 : 5);
    const movetime =
      style === "speedy"
        ? Math.min(opts.movetime ?? 80, 60)
        : opts.movetime;

    // Ask for MultiPV lines via evaluate, then style-pick
    const evaluation = await this.inner.evaluate(fen, {
      movetime,
      depth: opts.depth,
      multipv,
    });

    const lines = evaluation.multipv?.filter((l) => l.pv[0]) ?? [];
    if (lines.length === 0) {
      return this.inner.getMove(fen, { ...opts, movetime, multipv });
    }

    const bestCp = lineScore(lines[0]!);
    const scored = lines.map((line, index) => {
      const uci = line.pv[0]!;
      const cp = lineScore(line);
      const within =
        style === "aggressive" ? 50 : style === "solid" ? 30 : 80;
      if (Math.abs(cp - bestCp) > within && index > 0) {
        return { uci, weight: 0.05 };
      }
      const tactical = isTactical(fen, uci);
      let weight = 1 / (index + 1);
      if (style === "aggressive") weight *= tactical ? 3 : 0.6;
      if (style === "solid") weight *= tactical ? 0.4 : 2;
      if (style === "speedy") weight *= 1 + Math.random();
      return { uci, weight };
    });

    const total = scored.reduce((a, s) => a + s.weight, 0);
    let r = Math.random() * total;
    for (const s of scored) {
      r -= s.weight;
      if (r <= 0) return { uci: s.uci };
    }
    return { uci: scored[0]!.uci };
  }
}

function lineScore(line: { cp?: number; mate?: number }): number {
  if (line.mate != null) return line.mate > 0 ? 10000 : -10000;
  return line.cp ?? 0;
}

function isTactical(fen: string, uci: string): boolean {
  try {
    const chess = new Chess(fen);
    const move = chess.move({
      from: uci.slice(0, 2) as "e2",
      to: uci.slice(2, 4) as "e4",
      promotion: (uci[4] as "q") ?? undefined,
    });
    return Boolean(move?.captured || move?.san.includes("+") || move?.san.includes("#"));
  } catch {
    return false;
  }
}

export function randomOneLiner(p: Personality): string {
  return p.oneLiners[Math.floor(Math.random() * p.oneLiners.length)]!;
}
