"""Python mirror of lib/engine/botLevels.ts -- the bots the trained model must beat.

tests/test_baseline.py parses botLevels.ts and fails if these numbers drift
from the app's, so the baseline always measures the bots users actually play.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class BotLevel:
    elo: int
    skill_level: int
    pick_from_top: int
    movetime_ms: int
    limit_strength: bool


LOW_LEVELS = (
    BotLevel(400, 0, 5, 40, False),
    BotLevel(600, 1, 4, 60, False),
    BotLevel(800, 3, 3, 80, False),
    BotLevel(1000, 5, 2, 120, False),
    BotLevel(1200, 7, 2, 200, False),
)
HIGH_ELOS = (1400, 1600, 1800, 2000)
BOT_ELOS = tuple(level.elo for level in LOW_LEVELS) + HIGH_ELOS

# pickWeightedIndex in botLevels.ts: line i is 0.55x as likely as line i-1
PICK_DECAY = 0.55


def get_bot_level(elo: int) -> BotLevel:
    for level in LOW_LEVELS:
        if level.elo == elo:
            return level
    return BotLevel(max(1320, min(2000, elo)), 20, 1, 800, True)


def nearest_bot(player_elo: int) -> BotLevel:
    """The bot a player of this rating would pick to practise against."""
    return get_bot_level(min(BOT_ELOS, key=lambda e: (abs(e - player_elo), e)))


def pick_weights(n: int) -> list[float]:
    """Probability the app picks MultiPV line 0..n-1 (normalised)."""
    raw = [PICK_DECAY**i for i in range(max(1, n))]
    total = sum(raw)
    return [w / total for w in raw]


def expected_match(lines_first_moves: list[str], human_uci: str, pick_from_top: int) -> float:
    """Exact chance the multi-line bot plays the human's move.

    The app samples one of the top `pick_from_top` engine lines with
    `pick_weights`. Rather than sampling (noisy), sum the probability of every
    line whose first move is the human's move -- the expectation, exactly.
    """
    available = [m for m in lines_first_moves if m][:pick_from_top]
    if not available:
        return 0.0
    weights = pick_weights(len(available))
    return sum(w for w, m in zip(weights, available) if m == human_uci)
