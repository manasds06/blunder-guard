"""Baseline: how often do Blunder Guard's CURRENT bots play the move a real human played?

This is the "before" number the trained model has to beat. For held-out
positions from a later month (positions.jsonl from prepare_data --keep-fens),
it scores, per 100-Elo band of the human who moved:

    random      a uniformly random legal move (the floor)
    stockfish   Stockfish's best move at full strength (strong, not human)
    bots        the app's bot nearest the player's rating, configured exactly
                as lib/engine/botLevels.ts does

Metric: top-1 move-match, i.e. the probability the method's move equals the
human's. For random and the multi-line bots this is computed exactly, not
sampled. Bots at 1400+ use Stockfish's internal UCI_Elo randomness, which
cannot be read out, so those are one sample per position.

    .venv/bin/python eval_baseline.py --positions data/2025-02-test/positions.jsonl \
        --stockfish /path/to/stockfish --per-band 300 --workers 6

Caveat, stated in the results too: native Stockfish searches faster than the
in-browser WASM build at the same movetime, so these bots are, if anything,
slightly STRONGER (less human-like at low ratings) than in the app.
"""

from __future__ import annotations

import argparse
import json
import random
import sys
import time
from collections import defaultdict
from concurrent.futures import ProcessPoolExecutor
from datetime import datetime
from pathlib import Path

import chess
import chess.engine

from bgml.bots import expected_match, nearest_bot

HERE = Path(__file__).resolve().parent
STOCKFISH_NODES = 200_000  # full-strength reference; fixed nodes = reproducible


def band_of(elo: int) -> int:
    return elo // 100 * 100


def sample_positions(path: Path, per_band: int, seed: int) -> list[dict]:
    by_band: dict[int, list[dict]] = defaultdict(list)
    with open(path) as f:
        for line in f:
            row = json.loads(line)
            by_band[band_of(row["elo"])].append(row)
    rng = random.Random(seed)
    out = []
    for band in sorted(by_band):
        rows = by_band[band]
        rng.shuffle(rows)
        out.extend(rows[:per_band])
    return out


_engine: chess.engine.SimpleEngine | None = None


def _init(stockfish: str) -> None:
    global _engine
    _engine = chess.engine.SimpleEngine.popen_uci(stockfish)
    _engine.configure({"Threads": 1, "Hash": 16})
    # python-chess drives the engine from a NON-daemon thread. If the engine
    # is never quit, the worker cannot exit, and the pool's shutdown waits
    # forever -- the first real run finished its work, then hung for 40
    # minutes before printing. multiprocessing runs Finalize callbacks
    # before joining threads at exit, so quitting here unblocks it. (atexit
    # would be too late: it runs after the thread join.)
    from multiprocessing.util import Finalize

    Finalize(_engine, _engine.quit, exitpriority=10)


def _score(row: dict) -> dict:
    assert _engine is not None
    board = chess.Board(row["fen"])
    human = row["uci"]
    n_legal = board.legal_moves.count()

    # full-strength Stockfish best move
    _engine.configure({"UCI_LimitStrength": False, "Skill Level": 20})
    best = _engine.play(board, chess.engine.Limit(nodes=STOCKFISH_NODES)).move

    bot = nearest_bot(row["elo"])
    if bot.limit_strength:
        _engine.configure({"UCI_LimitStrength": True, "UCI_Elo": bot.elo, "Skill Level": 20})
        played = _engine.play(board, chess.engine.Limit(time=bot.movetime_ms / 1000)).move
        bot_match = float(played is not None and played.uci() == human)
    else:
        _engine.configure({"UCI_LimitStrength": False, "Skill Level": bot.skill_level})
        infos = _engine.analyse(
            board,
            chess.engine.Limit(time=bot.movetime_ms / 1000),
            multipv=bot.pick_from_top,
        )
        firsts = [info["pv"][0].uci() if info.get("pv") else "" for info in infos]
        bot_match = expected_match(firsts, human, bot.pick_from_top)

    return {
        "band": band_of(row["elo"]),
        "bot_elo": bot.elo,
        "random": 1.0 / n_legal if n_legal else 0.0,
        "stockfish": float(best is not None and best.uci() == human),
        "bots": bot_match,
    }


def summarize(scores: list[dict]) -> dict:
    methods = ("random", "stockfish", "bots")
    bands: dict[int, list[dict]] = defaultdict(list)
    for s in scores:
        bands[s["band"]].append(s)
    table = {
        band: {"n": len(rows), **{m: sum(r[m] for r in rows) / len(rows) for m in methods}}
        for band, rows in sorted(bands.items())
    }
    overall = {"n": len(scores), **{m: sum(s[m] for s in scores) / len(scores) for m in methods}}
    return {"by_band": table, "overall": overall}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--positions", required=True, type=Path)
    ap.add_argument("--stockfish", required=True)
    ap.add_argument("--per-band", type=int, default=300)
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--out", type=Path, default=HERE / "results")
    args = ap.parse_args(argv)

    rows = sample_positions(args.positions, args.per_band, args.seed)
    print(f"{len(rows):,} positions, {args.workers} engine workers", file=sys.stderr)
    started = time.time()
    with ProcessPoolExecutor(args.workers, initializer=_init, initargs=(args.stockfish,)) as pool:
        scores = list(pool.map(_score, rows, chunksize=8))
    summary = summarize(scores)

    print("\n| band | n | random | stockfish best | current bot |")
    print("|---|---|---|---|---|")
    for band, r in summary["by_band"].items():
        print(f"| {band} | {r['n']} | {r['random']:.3f} | {r['stockfish']:.3f} | {r['bots']:.3f} |")
    o = summary["overall"]
    print(f"| **all** | {o['n']} | {o['random']:.3f} | {o['stockfish']:.3f} | {o['bots']:.3f} |")

    args.out.mkdir(parents=True, exist_ok=True)
    out = args.out / f"baseline-{datetime.now():%Y%m%d-%H%M%S}.json"
    out.write_text(
        json.dumps(
            {
                "positions": str(args.positions),
                "per_band": args.per_band,
                "seed": args.seed,
                "stockfish_nodes": STOCKFISH_NODES,
                "seconds": round(time.time() - started, 1),
                "caveat": "native Stockfish is faster than the in-app WASM build at equal movetime",
                **summary,
            },
            indent=2,
        )
    )
    print(f"\nwrote {out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
