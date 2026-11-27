"""Export a trained checkpoint to ONNX for the browser, and prove it matches PyTorch.

    .venv/bin/python export_onnx.py --ckpt checkpoints/sep26-6x64/epoch6.pt \
        --positions data/2026-10-test/positions.jsonl \
        --out ../public/models/human-bot.onnx \
        --fixture ../lib/engine/__fixtures__/human-bot.json

Three outputs, each a guard against a silent mismatch:

1. the .onnx model (inputs: planes [B,17,8,8], elo [B], opp_elo [B];
   output: logits [B,4096]).
2. a PARITY check: PyTorch and onnxruntime must agree on 100 real
   positions (max logit difference and identical top move). Export bugs
   (wrong op, wrong axis) show up here, not in a user's game.
3. a FIXTURE for the TypeScript side: for a set of positions, the exact
   planes, legal move ids, and the model's top move. lib/engine tests check
   the TS encoder against it, and the browser check compares top moves, so
   Python, TS and the browser are pinned to the same numbers.

No quantisation: the fp32 model is ~2 MB, well under the 10 MB budget, and
int8 would cost accuracy for a download saving nobody would notice.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import chess
import numpy as np
import onnxruntime as ort
import torch

from bgml.encoding import encode_board, encode_move, legal_mask
from bgml.model import HumanMoveNet
from eval_baseline import sample_positions

FIXTURE_FENS = [
    chess.STARTING_FEN,
    "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",  # Black to move: mirroring
    "r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R b Qkq - 0 1",  # asymmetric castling rights
    "4k3/8/8/8/3pP3/8/8/4K3 b - e3 0 1",  # en passant
    "1r5k/P7/8/8/8/8/p7/1R5K w - - 0 1",  # promotions, White
    "1r5k/P7/8/8/8/8/p7/1R5K b - - 0 1",  # promotions, Black
]
FIXTURE_ELOS = (600, 1200, 1900)


class _Exportable(torch.nn.Module):
    """Same model, float ratings in: browsers pass Float32Arrays."""

    def __init__(self, model: HumanMoveNet) -> None:
        super().__init__()
        self.model = model

    def forward(self, planes, elo, opp_elo):
        return self.model(planes, elo, opp_elo)


def load(ckpt_path: Path) -> HumanMoveNet:
    ckpt = torch.load(ckpt_path, map_location="cpu")
    cfg = ckpt["config"]
    model = HumanMoveNet(cfg["blocks"], cfg["channels"])
    model.load_state_dict(ckpt["model"])
    return model.eval()


def inputs_for(rows: list[dict]) -> tuple[np.ndarray, np.ndarray, np.ndarray, list[chess.Board]]:
    boards = [chess.Board(r["fen"]) for r in rows]
    planes = np.stack([encode_board(b) for b in boards]).astype(np.float32)
    elo = np.array([r["elo"] for r in rows], dtype=np.float32)
    return planes, elo, elo.copy(), boards


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--ckpt", type=Path, required=True)
    ap.add_argument("--positions", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--fixture", type=Path, required=True)
    args = ap.parse_args(argv)

    model = load(args.ckpt)
    wrapped = _Exportable(model).eval()
    example = (torch.zeros(2, 17, 8, 8), torch.full((2,), 1200.0), torch.full((2,), 1200.0))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    torch.onnx.export(
        wrapped,
        example,
        str(args.out),
        input_names=["planes", "elo", "opp_elo"],
        output_names=["logits"],
        dynamic_axes={"planes": {0: "batch"}, "elo": {0: "batch"}, "opp_elo": {0: "batch"}, "logits": {0: "batch"}},
        opset_version=17,
        dynamo=False,
    )
    size_mb = args.out.stat().st_size / 1e6

    # --- parity on 100 real held-out positions ----------------------------------
    rows = sample_positions(args.positions, per_band=7, seed=1)[:100]
    planes, elo, opp, boards = inputs_for(rows)
    with torch.no_grad():
        torch_logits = model(torch.from_numpy(planes), torch.from_numpy(elo), torch.from_numpy(opp)).numpy()
    sess = ort.InferenceSession(str(args.out), providers=["CPUExecutionProvider"])
    onnx_logits = sess.run(["logits"], {"planes": planes, "elo": elo, "opp_elo": opp})[0]
    max_diff = float(np.abs(torch_logits - onnx_logits).max())
    masks = np.stack([legal_mask(b) for b in boards])
    top_t = np.where(masks, torch_logits, -np.inf).argmax(1)
    top_o = np.where(masks, onnx_logits, -np.inf).argmax(1)
    same_top = int((top_t == top_o).sum())
    print(f"exported {args.out} ({size_mb:.2f} MB)")
    print(f"parity on {len(rows)} positions: max |logit diff| {max_diff:.2e}, same top move {same_top}/{len(rows)}")
    if max_diff > 1e-3 or same_top != len(rows):
        print("PARITY FAILED", file=sys.stderr)
        return 1

    # --- fixture for the TypeScript encoder and the browser check ---------------
    cases = []
    for fen in FIXTURE_FENS + [r["fen"] for r in rows[:14]]:
        board = chess.Board(fen)
        p = encode_board(board)
        legal = sorted(int(i) for i in np.flatnonzero(legal_mask(board)))
        tops = {}
        for e in FIXTURE_ELOS:
            lg = sess.run(
                ["logits"],
                {"planes": p[None].astype(np.float32), "elo": np.array([e], np.float32),
                 "opp_elo": np.array([e], np.float32)},
            )[0][0]
            lg = np.where(legal_mask(board), lg, -np.inf)
            tops[str(e)] = {"index": int(lg.argmax()), "logit": float(lg.max())}
        cases.append(
            {
                "fen": fen,
                "on": [int(i) for i in np.flatnonzero(p.reshape(-1))],  # indices of 1s, plane*64+rank*8+file
                "legal": legal,
                "moves": {m.uci(): encode_move(m, board.turn) for m in board.legal_moves},
                "top": tops,
            }
        )
    args.fixture.parent.mkdir(parents=True, exist_ok=True)
    args.fixture.write_text(json.dumps({"model": args.out.name, "cases": cases}))
    print(f"wrote fixture with {len(cases)} positions -> {args.fixture}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
