"""Turn a chess position into numbers a neural network can read, and moves into class ids.

This file is the contract between the data pipeline, the model, and the
browser. If encode and decode disagree anywhere -- one flipped square, one
castling move -- the model trains on garbage and nothing errors. That is why
every function here has a round-trip test in tests/test_encoding.py.

POSITION -> 17 x 8 x 8 planes (each plane is an 8x8 grid of 0/1)

    planes 0-5    the side to move's   pawn, knight, bishop, rook, queen, king
    planes 6-11   the opponent's        pawn, knight, bishop, rook, queen, king
    plane  12     all ones: "this square exists"  (lets conv layers see the
                  board edge, since zero-padding otherwise looks like empty squares)
    planes 13-16  castling rights: mover kingside, mover queenside,
                  opponent kingside, opponent queenside (whole plane 1 or 0)

    Why "mover / opponent" instead of "white / black": the board is always
    shown from the side to move's point of view. When it is Black's turn we
    mirror the board vertically and swap colours, so the model only ever
    learns "how do I play when I'm at the bottom of the board". Same chess
    knowledge, half the patterns to learn. (Maia and AlphaZero both do this.)
    The plan doc's "side to move" plane is therefore unnecessary: after the
    flip it would always be the same value, so plane 12 replaces it.

    Deliberately left out for v1: en passant square, 50-move counter, move
    history. Each costs little to add, but humans at 600-2000 rarely play
    differently because of them; add one and measure if accuracy plateaus.

MOVE -> one class id in [0, 4096): from_square * 64 + to_square, in the
    mover's (possibly mirrored) frame.

    Trade-off: 4096 classes cannot say WHICH piece a pawn promotes to. We
    decode every promotion as a queen. Under-promotions are ~0.1% of
    moves at these ratings, so that costs at most ~0.1% accuracy, in exchange
    for a much simpler output layer than AlphaZero's 1858/4672-way encodings.
    Most of the 4096 ids are never legal; `legal_mask` hides them at
    prediction time so the model never chooses an impossible move.
"""

from __future__ import annotations

import chess
import numpy as np

N_PLANES = 17
N_MOVES = 4096
PIECE_ORDER = (chess.PAWN, chess.KNIGHT, chess.BISHOP, chess.ROOK, chess.QUEEN, chess.KING)


def _orient(board: chess.Board) -> chess.Board:
    """The board from the mover's point of view: White to move."""
    return board if board.turn == chess.WHITE else board.mirror()


def encode_board(board: chess.Board) -> np.ndarray:
    """17 x 8 x 8 uint8 planes for the side to move. Row 0 is the mover's back rank."""
    b = _orient(board)
    planes = np.zeros((N_PLANES, 8, 8), dtype=np.uint8)
    for i, piece_type in enumerate(PIECE_ORDER):
        for color, offset in ((chess.WHITE, 0), (chess.BLACK, 6)):
            for sq in b.pieces(piece_type, color):
                planes[offset + i, chess.square_rank(sq), chess.square_file(sq)] = 1
    planes[12] = 1
    planes[13] = b.has_kingside_castling_rights(chess.WHITE)
    planes[14] = b.has_queenside_castling_rights(chess.WHITE)
    planes[15] = b.has_kingside_castling_rights(chess.BLACK)
    planes[16] = b.has_queenside_castling_rights(chess.BLACK)
    return planes


def _flip_square(sq: int, turn: bool) -> int:
    return sq if turn == chess.WHITE else chess.square_mirror(sq)


def encode_move(move: chess.Move, turn: bool) -> int:
    """Class id of `move`, played by side `turn`, in that side's frame."""
    return _flip_square(move.from_square, turn) * 64 + _flip_square(move.to_square, turn)


def decode_move(index: int, board: chess.Board) -> chess.Move:
    """The real move on `board` for class id `index` (promotions become queens)."""
    if not 0 <= index < N_MOVES:
        raise ValueError(f"move index {index} out of range")
    frm = _flip_square(index // 64, board.turn)
    to = _flip_square(index % 64, board.turn)
    move = chess.Move(frm, to)
    piece = board.piece_at(frm)
    if piece is not None and piece.piece_type == chess.PAWN and chess.square_rank(to) in (0, 7):
        move.promotion = chess.QUEEN
    return move


def legal_mask(board: chess.Board) -> np.ndarray:
    """Boolean[4096]: True where the class id is a legal move here."""
    mask = np.zeros(N_MOVES, dtype=bool)
    for move in board.legal_moves:
        mask[encode_move(move, board.turn)] = True
    return mask


def pack(planes: np.ndarray) -> np.ndarray:
    """17x8x8 of 0/1 -> 136 bytes. Planes are binary, so storing a byte per
    square wastes 8x disk; 5M positions is ~0.7 GB packed vs ~5.4 GB raw."""
    return np.packbits(planes.reshape(-1))


def unpack(packed: np.ndarray) -> np.ndarray:
    """Inverse of `pack`; accepts one row (136,) or a batch (N, 136)."""
    packed = np.asarray(packed)
    if packed.ndim == 1:
        return np.unpackbits(packed)[: N_PLANES * 64].reshape(N_PLANES, 8, 8)
    bits = np.unpackbits(packed, axis=1)[:, : N_PLANES * 64]
    return bits.reshape(-1, N_PLANES, 8, 8)
