"""Encode/decode must agree on every legal move in every position, or training is silently wrong."""

from __future__ import annotations

import random

import chess
import numpy as np
import pytest

from bgml.encoding import (
    N_MOVES,
    decode_move,
    encode_board,
    encode_move,
    legal_mask,
    pack,
    unpack,
)

TRICKY_FENS = [
    chess.STARTING_FEN,
    # both sides can castle both ways, Black to move
    "r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R b KQkq - 0 1",
    # en passant available (White just played e2-e4... from Black's side: d4xe3)
    "4k3/8/8/8/3pP3/8/8/4K3 b - e3 0 1",
    # White and Black promotions, including capture-promotions
    "1r5k/P7/8/8/8/8/p7/1R5K w - - 0 1",
    "1r5k/P7/8/8/8/8/p7/1R5K b - - 0 1",
]


def _positions(n_random_games: int = 40, seed: int = 0):
    rng = random.Random(seed)
    for fen in TRICKY_FENS:
        yield chess.Board(fen)
    for _ in range(n_random_games):
        board = chess.Board()
        for _ in range(rng.randint(0, 120)):
            moves = list(board.legal_moves)
            if not moves:
                break
            yield board.copy()
            board.push(rng.choice(moves))


def test_every_legal_move_round_trips():
    checked = 0
    for board in _positions():
        for move in board.legal_moves:
            idx = encode_move(move, board.turn)
            assert 0 <= idx < N_MOVES
            back = decode_move(idx, board)
            if move.promotion and move.promotion != chess.QUEEN:
                # documented loss: under-promotions decode as queen promotions
                assert back == chess.Move(move.from_square, move.to_square, chess.QUEEN)
            else:
                assert back == move, (board.fen(), move)
            checked += 1
    assert checked > 1000


def test_distinct_legal_moves_get_distinct_ids_except_underpromotions():
    for board in _positions(10):
        ids = {}
        for move in board.legal_moves:
            if move.promotion and move.promotion != chess.QUEEN:
                continue
            idx = encode_move(move, board.turn)
            assert idx not in ids, (board.fen(), move, ids.get(idx))
            ids[idx] = move


def test_legal_mask_matches_legal_moves():
    for board in _positions(10):
        mask = legal_mask(board)
        expected = {encode_move(m, board.turn) for m in board.legal_moves}
        assert set(np.flatnonzero(mask)) == expected


def test_black_to_move_is_mirrored_into_white_frame():
    # 1.e4: now Black to move. From Black's view the board is the mirror image,
    # so it must encode exactly like White to move after the mirrored move 1...e5
    # has been "played" by White, i.e. the mirror of the position.
    after_e4 = chess.Board()
    after_e4.push_san("e4")
    assert np.array_equal(encode_board(after_e4), encode_board(after_e4.mirror()))

    # and the reply 1...e5 encodes as White's e2-e4 would
    e5 = after_e4.parse_san("e5")
    e4 = chess.Board().parse_san("e4")
    assert encode_move(e5, chess.BLACK) == encode_move(e4, chess.WHITE)


def test_planes_contents_at_start():
    p = encode_board(chess.Board())
    assert p.shape == (17, 8, 8) and p.dtype == np.uint8
    assert p[0, 1].sum() == 8  # mover's pawns on their second rank
    assert p[6, 6].sum() == 8  # opponent pawns on the seventh
    assert p[5, 0, 4] == 1  # mover's king on e1
    assert p[11, 7, 4] == 1  # opponent king on e8
    assert p[12].all()  # board-exists plane
    assert p[13:17].all()  # all castling rights


def test_castling_planes_follow_the_mover():
    # White has lost kingside castling only; on Black's turn that is the OPPONENT's kingside
    board = chess.Board("r3k2r/8/8/8/8/8/8/R3K2R b Qkq - 0 1")
    p = encode_board(board)
    assert p[13].all() and p[14].all()  # Black (mover) keeps both
    assert not p[15].any() and p[16].all()  # White (opponent) lost kingside


@pytest.mark.parametrize("batch", [False, True])
def test_pack_round_trip(batch):
    boards = [encode_board(b) for b in list(_positions(3))[:20]]
    if batch:
        packed = np.stack([pack(p) for p in boards])
        assert packed.shape == (len(boards), 136)
        assert np.array_equal(unpack(packed), np.stack(boards))
    else:
        assert np.array_equal(unpack(pack(boards[1])), boards[1])
