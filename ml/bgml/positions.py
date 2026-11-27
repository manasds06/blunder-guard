"""Turn accepted games into training examples, and write them as shards.

One example = (position before a human's move, the move they played, who
played it). Not every move is kept -- see `PositionFilter` -- and games are
sampled so each 100-Elo band is equally represented (see `EloBalancer`).
"""

from __future__ import annotations

import hashlib
import json
import math
from collections import Counter
from dataclasses import asdict, dataclass, field
from pathlib import Path

import chess
import numpy as np

from bgml.encoding import encode_board, encode_move, pack
from bgml.pgn_stream import MATE_CP, GameRecord


@dataclass
class PositionFilter:
    """Which moves inside an accepted game become examples.

    - skip_plies: the first few moves are memorised opening theory, not
      decisions; keeping them would inflate accuracy for free.
    - min_clock: moves made with almost no time left are panic, not the
      player's chess. Maia used the same 30-second cut-off.
    - max_abs_eval: in a totally decided position (one side up 10 pawns)
      players stop trying; only applied when the game has computer evals.
    """

    skip_plies: int = 5
    min_clock: int = 30
    max_abs_eval: float = 1000.0


def game_hash(game_id: str) -> int:
    """Stable 63-bit id. Used to split train/val BY GAME: positions from the
    same game are near-duplicates, so splitting by position would leak the
    answer into validation and overstate accuracy."""
    return int.from_bytes(hashlib.blake2b(game_id.encode(), digest_size=8).digest(), "big") >> 1


@dataclass
class Example:
    packed: np.ndarray
    move: int
    elo: int
    opp_elo: int
    game: int
    ply: int
    eval_before: float  # White POV centipawns, NaN if unknown
    eval_after: float
    clock: int  # mover's clock after the move, -1 if unknown
    fen: str
    uci: str


def examples_from_game(g: GameRecord, pf: PositionFilter) -> list[Example]:
    out: list[Example] = []
    board = chess.Board()
    gid = game_hash(g.game_id)
    prev_eval: float | None = 0.0 if g.evals and g.evals[0] is not None else None
    for ply, move in enumerate(g.moves):
        eval_after = g.evals[ply]
        clock = g.clocks[ply]
        keep = (
            ply >= pf.skip_plies
            and (clock is None or clock >= pf.min_clock)
            and (prev_eval is None or abs(prev_eval) <= pf.max_abs_eval)
        )
        if keep:
            white = board.turn == chess.WHITE
            out.append(
                Example(
                    packed=pack(encode_board(board)),
                    move=encode_move(move, board.turn),
                    elo=g.white_elo if white else g.black_elo,
                    opp_elo=g.black_elo if white else g.white_elo,
                    game=gid,
                    ply=ply,
                    eval_before=math.nan if prev_eval is None else prev_eval,
                    eval_after=math.nan if eval_after is None else eval_after,
                    clock=-1 if clock is None else clock,
                    fen=board.fen(),
                    uci=move.uci(),
                )
            )
        if not board.is_legal(move):
            break  # corrupt game record: stop rather than learn from garbage
        board.push(move)
        prev_eval = eval_after
    return out


@dataclass
class EloBalancer:
    """Cap games per 100-Elo band (by the two players' average).

    Lichess has far more 1500s than 700s. Without a cap the model would
    mostly learn 1500-level chess and the low-rated bots -- the ones Blunder
    Guard most needs -- would be the worst.
    """

    min_elo: int
    max_elo: int
    games_per_band: int
    counts: Counter = field(default_factory=Counter)

    def band(self, g: GameRecord) -> int:
        return ((g.white_elo + g.black_elo) // 2 // 100) * 100

    def take(self, g: GameRecord) -> bool:
        b = self.band(g)
        if self.counts[b] >= self.games_per_band:
            return False
        self.counts[b] += 1
        return True

    @property
    def bands(self) -> range:
        """Bands that can realistically fill. The top band is excluded when
        max_elo is its lower edge: with max_elo=2000, an average in [2000,
        2100) needs BOTH players at exactly 2000, so waiting for that band
        to fill would stream the entire 30 GB dump."""
        return range(self.min_elo // 100 * 100, (self.max_elo - 1) // 100 * 100 + 1, 100)

    @property
    def n_bands(self) -> int:
        return len(self.bands)

    def full(self) -> bool:
        return all(self.counts[b] >= self.games_per_band for b in self.bands)


class ShardWriter:
    """Accumulate examples; flush every `shard_size` to a compressed .npz.

    Shards keep memory flat however much data we process, and let training
    stream them later instead of loading everything into 24 GB of RAM.
    """

    def __init__(self, out_dir: Path, shard_size: int = 200_000, keep_fens: bool = False):
        self.out_dir = Path(out_dir)
        self.out_dir.mkdir(parents=True, exist_ok=True)
        self.shard_size = shard_size
        self.keep_fens = keep_fens
        self.buf: list[Example] = []
        self.n_shards = 0
        self.n_examples = 0
        self._fens = open(self.out_dir / "positions.jsonl", "w") if keep_fens else None

    def add(self, examples: list[Example]) -> None:
        self.buf.extend(examples)
        if self._fens is not None:
            for e in examples:
                self._fens.write(
                    json.dumps(
                        {"fen": e.fen, "uci": e.uci, "elo": e.elo, "game": e.game,
                         "ply": e.ply, "eval_before": None if math.isnan(e.eval_before) else e.eval_before}
                    )
                    + "\n"
                )
        while len(self.buf) >= self.shard_size:
            self._write(self.buf[: self.shard_size])
            self.buf = self.buf[self.shard_size :]

    def flush(self) -> None:
        if self.buf:
            self._write(self.buf)
            self.buf = []

    def _write(self, b: list[Example]) -> None:
        np.savez_compressed(
            self.out_dir / f"shard_{self.n_shards:04d}.npz",
            x=np.stack([e.packed for e in b]),
            y=np.array([e.move for e in b], dtype=np.int16),
            elo=np.array([e.elo for e in b], dtype=np.int16),
            opp_elo=np.array([e.opp_elo for e in b], dtype=np.int16),
            game=np.array([e.game for e in b], dtype=np.int64),
            ply=np.array([e.ply for e in b], dtype=np.int16),
            eval_before=np.array([e.eval_before for e in b], dtype=np.float32),
            eval_after=np.array([e.eval_after for e in b], dtype=np.float32),
            clock=np.array([e.clock for e in b], dtype=np.int16),
        )
        self.n_shards += 1
        self.n_examples += len(b)

    def close(self, meta: dict) -> None:
        self.flush()
        if self._fens is not None:
            self._fens.close()
        meta = {**meta, "n_examples": self.n_examples, "n_shards": self.n_shards}
        (self.out_dir / "meta.json").write_text(json.dumps(meta, indent=2, default=_jsonable))


def _jsonable(o):
    if hasattr(o, "__dataclass_fields__"):
        return asdict(o)
    if isinstance(o, Counter):
        return {str(k): v for k, v in sorted(o.items())}
    return str(o)


__all__ = [
    "MATE_CP",
    "EloBalancer",
    "Example",
    "PositionFilter",
    "ShardWriter",
    "examples_from_game",
    "game_hash",
]
