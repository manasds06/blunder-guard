/**
 * StockfishProvider — ONLY module that speaks UCI / owns the Web Worker.
 *
 * Pattern: Adapter — wraps the raw Stockfish worker behind EngineProvider so
 * the rest of the app never touches postMessage or parses "info" lines.
 * Commands are queued (one search at a time) because a single worker can't
 * run concurrent searches safely.
 */
import type { EngineProvider } from "./provider";
import type {
  EngineMove,
  EvalLine,
  EvalOptions,
  Evaluation,
  MoveOptions,
} from "./types";
import { pickWeightedIndex } from "./botLevels";

const WORKER_URL = "/engine/stockfish.js";

type Pending = {
  resolve: (value: string) => void;
  reject: (err: Error) => void;
  /** Predicate: true when this message completes the wait */
  match: (line: string) => boolean;
  /** Collect intermediate info lines */
  onInfo?: (line: string) => void;
};

export class StockfishProvider implements EngineProvider {
  readonly id = "stockfish";
  private worker: Worker | null = null;
  private ready = false;
  private queue: Array<() => Promise<void>> = [];
  private draining = false;
  private pending: Pending | null = null;
  private messageBuffer: string[] = [];

  async init(): Promise<void> {
    if (this.ready) return;
    if (typeof window === "undefined") {
      throw new Error("StockfishProvider requires a browser environment");
    }

    this.worker = new Worker(WORKER_URL);
    this.worker.onmessage = (e: MessageEvent<string>) => {
      const line = typeof e.data === "string" ? e.data : String(e.data);
      this.handleLine(line);
    };
    this.worker.onerror = (err) => {
      console.error("Stockfish worker error", err);
      if (this.pending) {
        this.pending.reject(new Error("Stockfish worker error"));
        this.pending = null;
      }
    };

    await this.sendAndWait("uci", (l) => l === "uciok");
    await this.sendAndWait("isready", (l) => l === "readyok");
    this.ready = true;
  }

  async getMove(fen: string, opts: MoveOptions): Promise<EngineMove> {
    return this.enqueue(async () => {
      await this.applyStrength(opts);

      const multipv = opts.multipv ?? 1;
      if (multipv > 1) {
        await this.setOption("MultiPV", String(multipv));
      }

      const lines: EvalLine[] = [];
      let bestUci = "";

      await this.runSearch(fen, opts, (info) => {
        const parsed = parseInfoLine(info);
        if (!parsed) return;
        const idx = (parsed.multipv ?? 1) - 1;
        lines[idx] = parsed;
      }, (best) => {
        bestUci = best;
      });

      // Reset MultiPV so later normal searches aren't polluted
      if (multipv > 1) {
        await this.setOption("MultiPV", "1");
      }

      if (multipv > 1 && lines.length > 0) {
        const available = lines.filter(Boolean);
        const pick = pickWeightedIndex(
          Math.min(opts.multipv ?? 1, available.length),
        );
        const chosen = available[pick]!;
        const uci = chosen.pv[0] ?? bestUci;
        if (!uci) throw new Error("Engine returned no move");
        return { uci };
      }

      if (!bestUci) throw new Error("Engine returned no bestmove");
      return { uci: bestUci };
    });
  }

  async evaluate(fen: string, opts: EvalOptions): Promise<Evaluation> {
    return this.enqueue(async () => {
      await this.setOption("MultiPV", String(opts.multipv ?? 1));
      // Full strength for evaluation / hints
      await this.setOption("UCI_LimitStrength", "false");
      await this.setOption("Skill Level", "20");

      let depth = 0;
      let best: EvalLine | undefined;
      const multipvLines: EvalLine[] = [];
      let bestUci = "";

      await this.runSearch(
        fen,
        { depth: opts.depth, movetime: opts.movetime, multipv: opts.multipv },
        (info) => {
          const parsed = parseInfoLine(info);
          if (!parsed) return;
          depth = Math.max(depth, parsed.depth ?? 0);
          const idx = (parsed.multipv ?? 1) - 1;
          multipvLines[idx] = { ...parsed, multipv: idx + 1 };
          if (idx === 0) best = parsed;
        },
        (b) => {
          bestUci = b;
        },
      );

      await this.setOption("MultiPV", "1");

      const bestLine =
        best?.pv ?? (bestUci ? [bestUci] : []);

      return {
        cp: best?.cp,
        mate: best?.mate,
        bestLine,
        depth,
        multipv: multipvLines.filter(Boolean),
      };
    });
  }

  dispose(): void {
    this.worker?.postMessage("quit");
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
    this.pending = null;
    this.queue = [];
  }

  // ─── internals ─────────────────────────────────────────────

  private handleLine(line: string): void {
    // Stockfish may emit multi-line blobs
    for (const part of line.split("\n")) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      if (this.pending?.onInfo && trimmed.startsWith("info ")) {
        this.pending.onInfo(trimmed);
      }
      if (this.pending?.match(trimmed)) {
        const p = this.pending;
        this.pending = null;
        p.resolve(trimmed);
      } else if (!this.pending) {
        this.messageBuffer.push(trimmed);
      }
    }
  }

  private post(cmd: string): void {
    if (!this.worker) throw new Error("Worker not initialized");
    this.worker.postMessage(cmd);
  }

  private sendAndWait(
    cmd: string,
    match: (line: string) => boolean,
    onInfo?: (line: string) => void,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject, match, onInfo };
      this.post(cmd);
    });
  }

  private async setOption(name: string, value: string): Promise<void> {
    this.post(`setoption name ${name} value ${value}`);
  }

  private async applyStrength(opts: MoveOptions): Promise<void> {
    if (opts.limitStrength && opts.elo != null) {
      await this.setOption("UCI_LimitStrength", "true");
      await this.setOption("UCI_Elo", String(opts.elo));
      await this.setOption("Skill Level", "20");
    } else {
      await this.setOption("UCI_LimitStrength", "false");
      if (opts.skillLevel != null) {
        await this.setOption("Skill Level", String(opts.skillLevel));
      }
    }
  }

  private async runSearch(
    fen: string,
    opts: { movetime?: number; depth?: number; multipv?: number },
    onInfo: (line: string) => void,
    onBest: (uci: string) => void,
  ): Promise<void> {
    this.post("ucinewgame");
    await this.sendAndWait("isready", (l) => l === "readyok");
    this.post(`position fen ${fen}`);

    let go = "go";
    if (opts.movetime != null) go += ` movetime ${opts.movetime}`;
    else if (opts.depth != null) go += ` depth ${opts.depth}`;
    else go += " movetime 200";

    const bestLine = await this.sendAndWait(
      go,
      (l) => l.startsWith("bestmove "),
      onInfo,
    );
    // bestmove e2e4 [ponder e7e5]
    const parts = bestLine.split(/\s+/);
    const uci = parts[1];
    if (uci && uci !== "(none)") onBest(uci);
  }

  /**
   * Serializes async engine work — Promise queue / mutex pattern.
   * Why: one worker = one search; overlapping go commands corrupt state.
   */
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push(async () => {
        try {
          resolve(await fn());
        } catch (e) {
          reject(e);
        }
      });
      void this.drain();
    });
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    while (this.queue.length > 0) {
      const job = this.queue.shift()!;
      await job();
    }
    this.draining = false;
  }
}

type ParsedInfo = EvalLine & { depth?: number };

function parseInfoLine(line: string): ParsedInfo | null {
  if (!line.startsWith("info ")) return null;
  // Only care about lines that include a score (skip "info string ...")
  if (!/\bscore\b/.test(line)) return null;

  const depthMatch = line.match(/\bdepth\s+(\d+)/);
  const multipvMatch = line.match(/\bmultipv\s+(\d+)/);
  const cpMatch = line.match(/\bscore\s+cp\s+(-?\d+)/);
  const mateMatch = line.match(/\bscore\s+mate\s+(-?\d+)/);
  const pvMatch = line.match(/\bpv\s+(.+)$/);

  const pv = pvMatch
    ? pvMatch[1]!.trim().split(/\s+/).filter(Boolean)
    : [];

  return {
    depth: depthMatch ? Number(depthMatch[1]) : undefined,
    multipv: multipvMatch ? Number(multipvMatch[1]) : 1,
    cp: cpMatch ? Number(cpMatch[1]) : undefined,
    mate: mateMatch ? Number(mateMatch[1]) : undefined,
    pv,
  };
}

/** Singleton for the play screen — create a separate instance for analysis. */
let playProvider: StockfishProvider | null = null;

export function getPlayEngine(): StockfishProvider {
  if (!playProvider) playProvider = new StockfishProvider();
  return playProvider;
}
