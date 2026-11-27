"""Score a trained model on the SAME held-out positions as eval_baseline.py.

    .venv/bin/python eval_model.py --checkpoint checkpoints/<run>/epoch6.pt \
        --positions data/2026-10-test/positions.jsonl \
        --baseline results/baseline-<stamp>.json

Uses eval_baseline.sample_positions with the same --per-band and --seed, so
every method is scored on identical positions. Two numbers per band:

    model top-1     the model's single most likely legal move == the human's
                    (Maia's headline metric)
    model as bot    chance the model plays the human's move when SAMPLING from
                    its distribution, which is how the in-app bot will play.
                    This is the like-for-like comparison with "current bot",
                    which also samples.
"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from datetime import datetime
from pathlib import Path

import chess
import numpy as np
import torch

from bgml.encoding import encode_board, encode_move, legal_mask
from bgml.model import HumanMoveNet
from eval_baseline import band_of, sample_positions

HERE = Path(__file__).resolve().parent


def load_model(checkpoint: Path, device: torch.device) -> HumanMoveNet:
    ckpt = torch.load(checkpoint, map_location=device)
    cfg = ckpt["config"]
    model = HumanMoveNet(cfg["blocks"], cfg["channels"]).to(device)
    model.load_state_dict(ckpt["model"])
    model.eval()
    return model


@torch.no_grad()
def score(model: HumanMoveNet, rows: list[dict], device: torch.device, batch: int = 512) -> list[dict]:
    out = []
    for i in range(0, len(rows), batch):
        chunk = rows[i : i + batch]
        boards = [chess.Board(r["fen"]) for r in chunk]
        planes = torch.from_numpy(np.stack([encode_board(b) for b in boards]).astype(np.float32)).to(device)
        elo = torch.tensor([r["elo"] for r in chunk], device=device)
        # positions.jsonl has no opponent rating; the mover's own is the best
        # stand-in (both players are within the same band by construction)
        opp = torch.tensor([r.get("opp_elo", r["elo"]) for r in chunk], device=device)
        logits = model(planes, elo, opp).float().cpu().numpy()
        for r, b, lg in zip(chunk, boards, logits):
            mask = legal_mask(b)
            lg = np.where(mask, lg, -np.inf)
            p = np.exp(lg - lg.max())
            p /= p.sum()
            human = encode_move(chess.Move.from_uci(r["uci"]), b.turn)
            out.append(
                {
                    "band": band_of(r["elo"]),
                    "top1": float(int(np.argmax(lg)) == human),
                    "as_bot": float(p[human]),
                }
            )
    return out


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--checkpoint", type=Path, required=True)
    ap.add_argument("--positions", type=Path, required=True)
    ap.add_argument("--baseline", type=Path, help="baseline JSON to print alongside")
    ap.add_argument("--per-band", type=int, default=300)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--out", type=Path, default=HERE / "results")
    args = ap.parse_args(argv)

    device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")
    model = load_model(args.checkpoint, device)
    rows = sample_positions(args.positions, args.per_band, args.seed)
    scores = score(model, rows, device)

    by_band: dict[int, list[dict]] = defaultdict(list)
    for s in scores:
        by_band[s["band"]].append(s)
    table = {
        b: {"n": len(v), "top1": np.mean([s["top1"] for s in v]), "as_bot": np.mean([s["as_bot"] for s in v])}
        for b, v in sorted(by_band.items())
    }
    overall = {
        "n": len(scores),
        "top1": float(np.mean([s["top1"] for s in scores])),
        "as_bot": float(np.mean([s["as_bot"] for s in scores])),
    }
    base = json.loads(args.baseline.read_text()) if args.baseline else None

    print("| band | n | random | stockfish best | current bot | **model as bot** | **model top-1** |")
    print("|---|---|---|---|---|---|---|")
    for b, r in table.items():
        bb = base["by_band"].get(str(b)) if base else None
        cols = (
            [f"{bb['random']:.3f}", f"{bb['stockfish']:.3f}", f"{bb['bots']:.3f}"] if bb else ["-", "-", "-"]
        )
        print(f"| {b} | {r['n']} | " + " | ".join(cols) + f" | {r['as_bot']:.3f} | {r['top1']:.3f} |")
    bo = base["overall"] if base else None
    cols = [f"{bo['random']:.3f}", f"{bo['stockfish']:.3f}", f"{bo['bots']:.3f}"] if bo else ["-", "-", "-"]
    print(f"| **all** | {overall['n']} | " + " | ".join(cols) + f" | {overall['as_bot']:.3f} | {overall['top1']:.3f} |")

    args.out.mkdir(parents=True, exist_ok=True)
    out = args.out / f"model-{datetime.now():%Y%m%d-%H%M%S}.json"
    out.write_text(
        json.dumps(
            {
                "checkpoint": str(args.checkpoint),
                "positions": str(args.positions),
                "per_band": args.per_band,
                "seed": args.seed,
                "by_band": {str(b): {k: float(v) for k, v in r.items()} for b, r in table.items()},
                "overall": overall,
            },
            indent=2,
        )
    )
    print(f"\nwrote {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
