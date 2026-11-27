"""Model shape, the head-to-move-id mapping, and a tiny end-to-end train + eval."""

from __future__ import annotations

import io
import json

import chess
import numpy as np
import pytest
import torch

from bgml.encoding import N_MOVES, encode_move
from bgml.model import HumanMoveNet, count_parameters, head_to_logits


def test_forward_shape_and_size():
    model = HumanMoveNet()
    out = model(torch.zeros(3, 17, 8, 8), torch.tensor([800, 1200, 1900]), torch.tensor([800, 1200, 1900]))
    assert out.shape == (3, N_MOVES)
    assert 300_000 < count_parameters(model) < 800_000


def test_head_channel_t_at_square_f_is_move_f_to_t():
    # put a single 1 at channel t=28 (e4), rank 1 file 4 (e2): that is move e2->e4
    out = torch.zeros(1, 64, 8, 8)
    out[0, chess.E4, chess.square_rank(chess.E2), chess.square_file(chess.E2)] = 1
    logits = head_to_logits(out)
    e2e4 = encode_move(chess.Move.from_uci("e2e4"), chess.WHITE)
    assert int(logits.argmax()) == e2e4
    assert logits.sum() == 1


def test_rating_input_changes_the_prediction():
    torch.manual_seed(0)
    model = HumanMoveNet().eval()
    planes = torch.rand(1, 17, 8, 8)
    lo = model(planes, torch.tensor([600]), torch.tensor([600]))
    hi = model(planes, torch.tensor([1900]), torch.tensor([1900]))
    assert not torch.allclose(lo, hi)


def test_train_and_eval_end_to_end(tmp_path):
    """Train a tiny net for 1 epoch on the pipeline-test games, then score it."""
    import eval_model
    import prepare_data
    import train
    from tests.test_pipeline import DUMP

    src = tmp_path / "dump.pgn"
    # 60 copies with distinct game ids, so the by-game split has a val set
    src.write_text("".join(DUMP.replace("lichess.org/", f"lichess.org/c{i}-") for i in range(60)))
    data = tmp_path / "data"
    assert prepare_data.main(["--pgn", str(src), "--out", str(data), "--games-per-band", "1000",
                              "--keep-fens", "--shard-size", "500"]) == 0
    ckpts = tmp_path / "ckpt"
    assert train.main(["--data", str(data), "--epochs", "1", "--batch-size", "64", "--blocks", "1",
                       "--channels", "8", "--device", "cpu", "--out", str(ckpts), "--name", "t"]) == 0
    hist = json.loads((ckpts / "t" / "history.json").read_text())
    assert len(hist) == 1 and np.isfinite(hist[0]["train_loss"])
    assert eval_model.main(["--checkpoint", str(ckpts / "t" / "epoch1.pt"), "--positions",
                            str(data / "positions.jsonl"), "--per-band", "20",
                            "--out", str(tmp_path / "res")]) == 0
    res = json.loads(next((tmp_path / "res").glob("model-*.json")).read_text())
    assert 0.0 <= res["overall"]["top1"] <= 1.0 and 0.0 < res["overall"]["as_bot"] <= 1.0


def test_split_by_game_never_shares_a_game():
    import train

    game = np.array([0, 20, 40, 1, 2, 3, 21, 21])
    tr, va = train.split_by_game(game)
    assert set(game[va]) & set(game[tr]) == set()
    assert set(game[va]) == {0, 20, 40}
