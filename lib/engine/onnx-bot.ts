/**
 * OnnxBotProvider — the trained human-move model as a bot.
 *
 * Pattern: Strategy — implements EngineProvider, so /play needs no special
 * casing beyond choosing this provider. evaluate() throws NotSupportedError:
 * this model predicts what a human plays, it does not judge positions.
 *
 * Pipeline per move: FEN → planes (human-encoding.ts) → worker runs the ONNX
 * model → 4096 logits → mask illegal → sample with temperature → UCI.
 *
 * If the model or worker can't load (old browser, missing file), it falls
 * back to weak Stockfish so a game never dead-ends — and says so in the
 * console, so a silent fallback can't masquerade as the trained model.
 */
import type { EngineProvider } from "./provider";
import type { EngineMove, EvalOptions, Evaluation, MoveOptions } from "./types";
import { NotSupportedError } from "./types";
import { StockfishProvider } from "./stockfish";
import { encodeBoard, pickMove } from "./human-encoding";

export const MODEL_URL = "/models/human-bot.onnx";
const WORKER_URL = "/engine/human-bot-worker.js";
const DEFAULT_ELO = 1200;

type WorkerReply = { id: number; ok: boolean; ms?: number; logits?: Float32Array; error?: string };

export class OnnxBotProvider implements EngineProvider {
  readonly id = "human-bot";
  /** 1 = the model's own distribution (most human); lower = more predictable */
  temperature = 1;
  /** Last inference time in ms, for the UI / debugging */
  lastInferenceMs: number | null = null;

  private worker: Worker | null = null;
  private fallback: StockfishProvider | null = null;
  private nextId = 1;
  private pending = new Map<number, (r: WorkerReply) => void>();
  private initPromise: Promise<void> | null = null;

  get usingModel(): boolean {
    return this.worker !== null;
  }

  init(): Promise<void> {
    this.initPromise ??= this.load();
    return this.initPromise;
  }

  private async load(): Promise<void> {
    try {
      this.worker = new Worker(WORKER_URL);
      this.worker.onmessage = (e: MessageEvent<WorkerReply>) => {
        const resolve = this.pending.get(e.data.id);
        if (resolve) {
          this.pending.delete(e.data.id);
          resolve(e.data);
        }
      };
      const reply = await this.call({ type: "init", modelUrl: MODEL_URL });
      if (!reply.ok) throw new Error(reply.error);
      console.info(`human-bot: model loaded in ${Math.round(reply.ms ?? 0)} ms`);
    } catch (err) {
      console.warn("human-bot: model unavailable, falling back to weak Stockfish", err);
      this.worker?.terminate();
      this.worker = null;
      this.fallback = new StockfishProvider();
      await this.fallback.init();
    }
  }

  private call(msg: Record<string, unknown>, transfer: Transferable[] = []): Promise<WorkerReply> {
    const worker = this.worker;
    if (!worker) return Promise.reject(new Error("worker not running"));
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      worker.postMessage({ ...msg, id }, transfer);
    });
  }

  async getMove(fen: string, opts: MoveOptions): Promise<EngineMove> {
    await this.init();
    if (this.fallback) {
      return this.fallback.getMove(fen, { skillLevel: 1, multipv: 4, movetime: 60 });
    }
    const elo = opts.elo ?? DEFAULT_ELO;
    const planes = encodeBoard(fen);
    const reply = await this.call(
      { type: "infer", planes, elo, oppElo: opts.opponentElo ?? elo },
      [planes.buffer],
    );
    if (!reply.ok || !reply.logits) throw new Error(`human-bot inference failed: ${reply.error}`);
    this.lastInferenceMs = reply.ms ?? null;
    return { uci: pickMove(fen, reply.logits, this.temperature) };
  }

  async evaluate(_fen: string, _opts: EvalOptions): Promise<Evaluation> {
    throw new NotSupportedError("OnnxBotProvider.evaluate");
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.fallback?.dispose();
    this.fallback = null;
    this.pending.clear();
    this.initPromise = null;
  }
}
