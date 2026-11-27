"""Stream games out of a Lichess PGN dump without ever unpacking it to disk.

A monthly dump is ~30 GB compressed and several times that uncompressed, but
we only need a few hundred thousand games. So we read it as a stream --
from a local .pgn.zst or straight from the download URL -- decompress on the
fly, and stop once we have enough. Nothing but the output shards hits disk.

Speed trick: most games fail the filters (wrong rating, bullet, abandoned).
The visitor below decides from the HEADERS alone and tells python-chess to
SKIP the moves of rejected games, which avoids the expensive part of parsing.
"""

from __future__ import annotations

import io
import math
import re
import urllib.request
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field

import chess
import chess.pgn

MATE_CP = 10_000  # a forced mate, expressed as centipawns, sign = who mates

_EVAL = re.compile(r"\[%eval\s+(#?)(-?\d+(?:\.\d+)?)\]")
_CLK = re.compile(r"\[%clk\s+(\d+):(\d{2}):(\d{2})\]")


@dataclass
class GameFilter:
    """Which games we learn from. Every default here is a modelling decision:

    - both players inside [min_elo, max_elo]: we model how players OF A RATING
      move, so a 700 vs 1900 game says little about either band.
    - blitz and rapid only: bullet moves are reflexes, classical is rare at
      these ratings on Lichess.
    - rated only, and no abandoned / rules-infraction games: those end for
      reasons that are not chess.
    """

    min_elo: int = 600
    max_elo: int = 2000
    speeds: tuple[str, ...] = ("blitz", "rapid")
    min_plies: int = 20
    bad_terminations: tuple[str, ...] = ("Abandoned", "Rules infraction")

    def speed_of(self, event: str) -> str | None:
        # Lichess events look like "Rated Blitz game" / "Rated Rapid tournament https://..."
        m = re.match(r"Rated (\w+)", event or "")
        return m.group(1).lower() if m else None

    def accepts(self, headers: dict[str, str]) -> bool:
        if self.speed_of(headers.get("Event", "")) not in self.speeds:
            return False
        if headers.get("Termination") in self.bad_terminations:
            return False
        try:
            white, black = int(headers["WhiteElo"]), int(headers["BlackElo"])
        except (KeyError, ValueError):
            return False  # "?" ratings: provisional or missing
        return all(self.min_elo <= e <= self.max_elo for e in (white, black))


@dataclass
class GameRecord:
    game_id: str
    white_elo: int
    black_elo: int
    speed: str
    moves: list[chess.Move] = field(default_factory=list)
    # eval AFTER each move, White's point of view, centipawns; None when the
    # game has no computer analysis (~10% of Lichess games have it)
    evals: list[float | None] = field(default_factory=list)
    # mover's remaining clock AFTER each move, seconds
    clocks: list[int | None] = field(default_factory=list)


class _Collector(chess.pgn.BaseVisitor):
    """Builds a GameRecord, or skips the game as soon as the headers fail."""

    def __init__(self, game_filter: GameFilter) -> None:
        self.filter = game_filter
        self.headers: dict[str, str] = {}
        self.record: GameRecord | None = None
        self.depth = 0

    def visit_header(self, tagname: str, tagvalue: str) -> None:
        self.headers[tagname] = tagvalue

    def end_headers(self):
        if not self.filter.accepts(self.headers):
            return chess.pgn.SKIP
        site = self.headers.get("Site", "")
        self.record = GameRecord(
            game_id=site.rsplit("/", 1)[-1] or site,
            white_elo=int(self.headers["WhiteElo"]),
            black_elo=int(self.headers["BlackElo"]),
            speed=self.filter.speed_of(self.headers.get("Event", "")) or "?",
        )
        return None

    def begin_variation(self):
        return chess.pgn.SKIP  # Lichess dumps have none, but never learn from side lines

    def visit_move(self, board: chess.Board, move: chess.Move) -> None:
        if self.record is not None:
            self.record.moves.append(move)
            self.record.evals.append(None)
            self.record.clocks.append(None)

    def visit_comment(self, comment: str) -> None:
        # Comments follow their move: "{ [%eval 0.24] [%clk 0:02:58] }"
        if self.record is None or not self.record.moves:
            return
        if m := _EVAL.search(comment):
            mate, value = m.group(1), float(m.group(2))
            if mate:
                cp = math.copysign(MATE_CP, value) if value != 0 else 0.0
            else:
                cp = value * 100
            self.record.evals[-1] = cp
        if m := _CLK.search(comment):
            h, mi, s = (int(g) for g in m.groups())
            self.record.clocks[-1] = h * 3600 + mi * 60 + s

    def result(self) -> GameRecord | None:
        return self.record


def iter_games(handle: io.TextIOBase, game_filter: GameFilter) -> Iterator[GameRecord]:
    """Yield every accepted game in a PGN text stream."""
    while True:
        collector = _Collector(game_filter)
        # read_game returns the visitor's result: None both for a skipped game
        # and at end of input. A skipped game still saw its headers; EOF did not.
        out = chess.pgn.read_game(handle, Visitor=lambda: collector)
        if out is None and not collector.headers:
            return
        if out is not None and len(out.moves) >= game_filter.min_plies:
            yield out


@contextmanager
def open_pgn(source: str) -> Iterator[io.TextIOBase]:
    """Open a .pgn / .pgn.zst path, or an http(s) URL to a .pgn.zst, as text."""
    import zstandard

    raw = (
        urllib.request.urlopen(source, timeout=60)  # noqa: S310 -- caller-chosen dump URL
        if source.startswith(("http://", "https://"))
        else open(source, "rb")
    )
    try:
        if source.endswith(".zst"):
            stream = zstandard.ZstdDecompressor().stream_reader(raw, read_size=1 << 20)
            yield io.TextIOWrapper(stream, encoding="utf-8", errors="replace")
        else:
            yield io.TextIOWrapper(raw, encoding="utf-8", errors="replace")
    finally:
        raw.close()


def win_prob(cp: float) -> float:
    """White's chance of winning (0-1) from a centipawn eval.

    Lichess's own published fit of real game outcomes. We define a blunder as
    a big drop in THIS, not in raw centipawns: losing 300cp in an equal
    position decides the game, losing 300cp when already a queen up does not.
    """
    return 1.0 / (1.0 + math.exp(-0.00368208 * cp))
