"""Train HumanMoveNet on prepared shards.

    .venv/bin/python train.py --data data/2026-09-train --epochs 6

Validation = every game whose game_hash % 20 == 0 (5%), split BY GAME so no
position of a validation game is ever trained on. Checkpoints and a metrics
log go to checkpoints/<run-name>/ after every epoch, so an interrupted run
loses at most one epoch.

All 3.16M positions fit in RAM as bit-packed bytes (~0.4 GB); each batch is
unpacked to float planes on the fly, so memory stays flat.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import time
from datetime import datetime
from pathlib import Path

import numpy as np
import torch
from torch import nn

from bgml.encoding import N_PLANES
from bgml.model import HumanMoveNet, count_parameters

HERE = Path(__file__).resolve().parent
VAL_MOD = 20


def load_shards(data_dir: Path) -> dict[str, np.ndarray]:
    keys = ("x", "y", "elo", "opp_elo", "game")
    parts: dict[str, list[np.ndarray]] = {k: [] for k in keys}
    for shard in sorted(Path(data_dir).glob("shard_*.npz")):
        with np.load(shard) as z:
            for k in keys:
                parts[k].append(z[k])
    if not parts["x"]:
        raise SystemExit(f"no shards in {data_dir}")
    return {k: np.concatenate(v) for k, v in parts.items()}


def split_by_game(game: np.ndarray, mod: int = VAL_MOD) -> tuple[np.ndarray, np.ndarray]:
    is_val = (game % mod) == 0
    return np.flatnonzero(~is_val), np.flatnonzero(is_val)


def unpack_batch(x_packed: np.ndarray) -> np.ndarray:
    bits = np.unpackbits(x_packed, axis=1)[:, : N_PLANES * 64]
    return bits.reshape(-1, N_PLANES, 8, 8).astype(np.float32)


def batches(data, idx: np.ndarray, batch_size: int, shuffle: bool, rng: np.random.Generator):
    order = rng.permutation(idx) if shuffle else idx
    for i in range(0, len(order), batch_size):
        sel = np.sort(order[i : i + batch_size])  # sorted gathers are faster
        yield (
            unpack_batch(data["x"][sel]),
            data["elo"][sel].astype(np.int64),
            data["opp_elo"][sel].astype(np.int64),
            data["y"][sel].astype(np.int64),
        )


def to_device(batch, device):
    planes, elo, opp, y = batch
    return (
        torch.from_numpy(planes).to(device, non_blocking=True),
        torch.from_numpy(elo).to(device),
        torch.from_numpy(opp).to(device),
        torch.from_numpy(y).to(device),
    )


@torch.no_grad()
def evaluate(model, data, idx, batch_size, device) -> dict[str, float]:
    model.eval()
    loss_sum = correct = top5 = n = 0
    ce = nn.CrossEntropyLoss(reduction="sum")
    for batch in batches(data, idx, batch_size, False, np.random.default_rng(0)):
        planes, elo, opp, y = to_device(batch, device)
        logits = model(planes, elo, opp)
        loss_sum += ce(logits, y).item()
        pred = logits.topk(5, dim=1).indices
        correct += (pred[:, 0] == y).sum().item()
        top5 += (pred == y[:, None]).any(dim=1).sum().item()
        n += len(y)
    model.train()
    return {"loss": loss_sum / n, "top1": correct / n, "top5": top5 / n}


def pick_device(name: str) -> torch.device:
    if name != "auto":
        return torch.device(name)
    if torch.backends.mps.is_available():
        return torch.device("mps")
    if torch.cuda.is_available():
        return torch.device("cuda")
    return torch.device("cpu")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--data", type=Path, required=True)
    ap.add_argument("--epochs", type=int, default=6)
    ap.add_argument("--batch-size", type=int, default=1024)
    ap.add_argument("--lr", type=float, default=2e-3)
    ap.add_argument("--weight-decay", type=float, default=1e-4)
    ap.add_argument("--blocks", type=int, default=6)
    ap.add_argument("--channels", type=int, default=64)
    ap.add_argument("--device", default="auto")
    ap.add_argument("--limit", type=int, default=0, help="use only the first N positions (smoke tests)")
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--out", type=Path, default=HERE / "checkpoints")
    ap.add_argument("--name", default=None)
    args = ap.parse_args(argv)

    torch.manual_seed(args.seed)
    rng = np.random.default_rng(args.seed)
    device = pick_device(args.device)

    data = load_shards(args.data)
    if args.limit:
        data = {k: v[: args.limit] for k, v in data.items()}
    train_idx, val_idx = split_by_game(data["game"])
    if len(val_idx) == 0 or len(train_idx) == 0:
        raise SystemExit(
            f"by-game split left train={len(train_idx)} val={len(val_idx)} positions; "
            "need more distinct games"
        )
    model = HumanMoveNet(args.blocks, args.channels).to(device)

    steps_per_epoch = math.ceil(len(train_idx) / args.batch_size)
    total_steps = steps_per_epoch * args.epochs
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=args.weight_decay)
    # One-cycle: warm up for the first 5% of steps (big early steps with
    # untrained BatchNorm stats are unstable), then cosine-decay to ~0 so
    # the last epochs fine-tune instead of bouncing around the minimum.
    sched = torch.optim.lr_scheduler.OneCycleLR(
        opt, max_lr=args.lr, total_steps=total_steps, pct_start=0.05, anneal_strategy="cos"
    )
    loss_fn = nn.CrossEntropyLoss()

    run = args.name or datetime.now().strftime("run-%Y%m%d-%H%M%S")
    out_dir = args.out / run
    out_dir.mkdir(parents=True, exist_ok=True)
    config = {**vars(args), "data": str(args.data), "out": str(args.out), "device": str(device),
              "params": count_parameters(model), "train_positions": len(train_idx),
              "val_positions": len(val_idx)}
    (out_dir / "config.json").write_text(json.dumps(config, indent=2))
    print(
        f"{device} | {config['params']:,} params | train {len(train_idx):,} / val {len(val_idx):,} "
        f"positions | {steps_per_epoch:,} steps/epoch x {args.epochs}",
        file=sys.stderr,
    )

    history = []
    started = time.time()
    step = 0
    for epoch in range(1, args.epochs + 1):
        running = seen = 0.0
        t0 = time.time()
        for batch in batches(data, train_idx, args.batch_size, True, rng):
            planes, elo, opp, y = to_device(batch, device)
            loss = loss_fn(model(planes, elo, opp), y)
            opt.zero_grad(set_to_none=True)
            loss.backward()
            opt.step()
            sched.step()
            step += 1
            running += loss.item() * len(y)
            seen += len(y)
            if step % 200 == 0:
                rate = seen / (time.time() - t0)
                eta = (total_steps - step) * args.batch_size / max(rate, 1)
                print(
                    f"\repoch {epoch} step {step:,}/{total_steps:,} loss {running / seen:.3f} "
                    f"| {rate:,.0f} pos/s | ETA {eta / 60:.0f} min",
                    end="",
                    file=sys.stderr,
                )
        val = evaluate(model, data, val_idx, 4096, device)
        row = {
            "epoch": epoch,
            "train_loss": running / seen,
            **{f"val_{k}": v for k, v in val.items()},
            "lr_end": sched.get_last_lr()[0],
            "minutes": round((time.time() - started) / 60, 1),
        }
        history.append(row)
        torch.save({"model": model.state_dict(), "config": config, "epoch": epoch}, out_dir / f"epoch{epoch}.pt")
        (out_dir / "history.json").write_text(json.dumps(history, indent=2))
        print(
            f"\nepoch {epoch}: train loss {row['train_loss']:.3f} | val loss {val['loss']:.3f} "
            f"top1 {val['top1']:.3f} top5 {val['top5']:.3f} | {row['minutes']} min",
            file=sys.stderr,
        )

    best = min(history, key=lambda r: r["val_loss"])
    (out_dir / "best.txt").write_text(f"epoch{best['epoch']}.pt\n")
    print(f"best epoch {best['epoch']} (val top1 {best['val_top1']:.3f}) -> {out_dir}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
