"""PGN streaming, filtering, position extraction and shard writing, on a handwritten dump."""

from __future__ import annotations

import io
import json
import math

import chess
import numpy as np
import pytest
import zstandard

from bgml.encoding import decode_move, unpack
from bgml.pgn_stream import MATE_CP, GameFilter, iter_games, open_pgn, win_prob
from bgml.positions import (
    EloBalancer,
    PositionFilter,
    ShardWriter,
    examples_from_game,
    game_hash,
)

# 24 plies of a real-looking game, Lichess comment format, with evals + clocks
MOVES = (
    "1. e4 { [%eval 0.2] [%clk 0:05:00] } 1... e5 { [%eval 0.25] [%clk 0:05:00] } "
    "2. Nf3 { [%eval 0.2] [%clk 0:04:58] } 2... Nc6 { [%eval 0.3] [%clk 0:04:57] } "
    "3. Bb5 { [%eval 0.2] [%clk 0:04:55] } 3... a6 { [%eval 0.3] [%clk 0:04:50] } "
    "4. Ba4 { [%eval 0.2] [%clk 0:04:50] } 4... Nf6 { [%eval 0.3] [%clk 0:04:45] } "
    "5. O-O { [%eval 0.2] [%clk 0:04:45] } 5... Be7 { [%eval 0.3] [%clk 0:04:40] } "
    "6. Re1 { [%eval 0.2] [%clk 0:04:40] } 6... b5 { [%eval 0.3] [%clk 0:04:35] } "
    "7. Bb3 { [%eval 0.2] [%clk 0:04:35] } 7... d6 { [%eval 0.3] [%clk 0:04:30] } "
    "8. c3 { [%eval 0.2] [%clk 0:04:30] } 8... O-O { [%eval 0.3] [%clk 0:04:25] } "
    "9. h3 { [%eval 0.2] [%clk 0:04:25] } 9... Na5 { [%eval 0.3] [%clk 0:04:20] } "
    "10. Bc2 { [%eval 0.2] [%clk 0:04:20] } 10... c5 { [%eval 0.3] [%clk 0:04:15] } "
    "11. d4 { [%eval 0.2] [%clk 0:00:20] } 11... Qc7 { [%eval -4.5] [%clk 0:04:10] } "
    "12. Nbd2 { [%eval #3] [%clk 0:04:05] } 12... Bd7 { [%eval #-2] [%clk 0:04:00] }"
)


def game(site, white, black, event="Rated Blitz game", termination="Normal", moves=MOVES):
    return (
        f'[Event "{event}"]\n[Site "https://lichess.org/{site}"]\n'
        f'[WhiteElo "{white}"]\n[BlackElo "{black}"]\n[Termination "{termination}"]\n\n'
        f"{moves} 1-0\n\n"
    )


DUMP = "".join(
    [
        game("ok1", 800, 850),
        game("bullet", 800, 850, event="Rated Bullet game"),
        game("casual", 800, 850, event="Casual Blitz game"),
        game("toohigh", 800, 2100),
        game("provisional", "?", 900),
        game("abandoned", 800, 850, termination="Abandoned"),
        game("rapid", 1500, 1450, event="Rated Rapid tournament https://lichess.org/tournament/x"),
        game("short", 900, 900, moves="1. e4 e5 2. Nf3 Nc6"),
        game("noeval", 1210, 1190, moves=MOVES.replace("[%eval", "[%xx")),
    ]
)


def games(text=DUMP, gf=None):
    return list(iter_games(io.StringIO(text), gf or GameFilter()))


def test_filter_keeps_only_rated_blitz_rapid_in_band_and_long_enough():
    assert [g.game_id for g in games()] == ["ok1", "rapid", "noeval"]


def test_evals_and_clocks_are_parsed_per_move():
    g = games()[0]
    assert len(g.moves) == 24
    assert g.evals[0] == pytest.approx(20)
    assert g.evals[21] == pytest.approx(-450)
    assert g.evals[22] == MATE_CP and g.evals[23] == -MATE_CP
    assert g.clocks[0] == 300 and g.clocks[20] == 20
    assert all(e is None for e in games()[2].evals)


def test_examples_respect_position_filter_and_decode_to_the_played_move():
    g = games()[0]
    ex = examples_from_game(g, PositionFilter(skip_plies=5, min_clock=30))
    plies = [e.ply for e in ex]
    assert plies[0] == 5  # opening skipped
    assert 20 not in plies  # 11. d4 played with 20s left: dropped as time-scramble
    # positions after an eval beyond 10 pawns (mate scores) are dropped
    assert 23 not in plies
    board = chess.Board()
    for ply, move in enumerate(g.moves):
        for e in ex:
            if e.ply == ply:
                assert e.fen == board.fen()
                assert decode_move(e.move, board) == move
                assert e.elo == (800 if board.turn else 850)
                assert e.opp_elo == (850 if board.turn else 800)
        board.push(move)


def test_eval_before_is_the_previous_moves_eval_after():
    ex = {e.ply: e for e in examples_from_game(games()[0], PositionFilter(skip_plies=0, min_clock=0))}
    assert ex[1].eval_before == pytest.approx(20) and ex[1].eval_after == pytest.approx(25)
    assert ex[0].eval_before == 0.0
    noeval = examples_from_game(games()[2], PositionFilter(skip_plies=0))
    assert all(math.isnan(e.eval_before) for e in noeval)


def test_game_hash_is_stable_and_positive():
    assert game_hash("abc") == game_hash("abc") != game_hash("abd")
    assert game_hash("abc") > 0


def test_balancer_caps_each_band_and_knows_when_full():
    gs = games()
    b = EloBalancer(800, 1000, games_per_band=1)
    assert list(b.bands) == [800, 900]  # not 1000: needs both players at exactly 1000
    assert b.take(gs[0]) and not b.take(gs[0])  # 800s band capped at 1
    assert not b.full()  # 900 band still empty
    b.counts[900] = 1
    assert b.full()
    assert list(EloBalancer(600, 2000, 1).bands) == list(range(600, 2000, 100))


def test_shards_round_trip(tmp_path):
    w = ShardWriter(tmp_path, shard_size=10, keep_fens=True)
    ex = [e for g in games() for e in examples_from_game(g, PositionFilter())]
    w.add(ex)
    w.close({"note": "test"})
    meta = json.loads((tmp_path / "meta.json").read_text())
    assert meta["n_examples"] == len(ex) and meta["n_shards"] == math.ceil(len(ex) / 10)
    first = np.load(tmp_path / "shard_0000.npz")
    assert first["x"].shape == (10, 136) and first["y"].dtype == np.int16
    assert np.array_equal(unpack(first["x"][0]), unpack(ex[0].packed))
    lines = (tmp_path / "positions.jsonl").read_text().splitlines()
    assert len(lines) == len(ex) and json.loads(lines[0])["uci"] == ex[0].uci


def test_open_pgn_streams_zstd(tmp_path):
    p = tmp_path / "dump.pgn.zst"
    p.write_bytes(zstandard.ZstdCompressor().compress(DUMP.encode()))
    with open_pgn(str(p)) as handle:
        assert [g.game_id for g in iter_games(handle, GameFilter())] == ["ok1", "rapid", "noeval"]


def test_prepare_data_cli_end_to_end(tmp_path):
    import prepare_data

    src = tmp_path / "dump.pgn"
    src.write_text(DUMP)
    out = tmp_path / "out"
    assert prepare_data.main(["--pgn", str(src), "--out", str(out), "--games-per-band", "5"]) == 0
    meta = json.loads((out / "meta.json").read_text())
    assert meta["games_kept"] == 3 and meta["n_examples"] > 0


def test_win_prob_is_symmetric_and_monotone():
    assert win_prob(0) == pytest.approx(0.5)
    assert win_prob(300) == pytest.approx(1 - win_prob(-300))
    assert win_prob(100) < win_prob(300) < win_prob(MATE_CP)
