"""Baseline maths, and the guarantee that the Python bot mirror matches the app."""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

from bgml.bots import BOT_ELOS, HIGH_ELOS, LOW_LEVELS, expected_match, nearest_bot, pick_weights

BOT_LEVELS_TS = Path(__file__).resolve().parents[2] / "lib" / "engine" / "botLevels.ts"


def test_python_bot_levels_match_botLevels_ts():
    ts = BOT_LEVELS_TS.read_text()
    rows = re.findall(
        r"\{ elo: (\d+), skillLevel: (\d+), pickFromTop: (\d+), movetime: (\d+), limitStrength: (\w+) \}",
        ts,
    )
    assert rows, "botLevels.ts format changed; update this parser and bgml/bots.py together"
    assert [
        (int(e), int(s), int(p), int(m), b == "true") for e, s, p, m, b in rows
    ] == [(l.elo, l.skill_level, l.pick_from_top, l.movetime_ms, l.limit_strength) for l in LOW_LEVELS]
    high = re.search(r"HIGH_ELOS = \[([\d,\s]+)\]", ts)
    assert high and tuple(int(x) for x in high.group(1).split(",")) == HIGH_ELOS
    assert "Math.pow(0.55, i)" in ts  # pick decay
    assert "movetime: 800" in ts and "Math.max(1320, Math.min(2000, elo))" in ts


def test_pick_weights_are_geometric_and_normalised():
    w = pick_weights(3)
    assert sum(w) == pytest.approx(1.0)
    assert w[1] / w[0] == pytest.approx(0.55) and w[2] / w[1] == pytest.approx(0.55)
    assert pick_weights(1) == [1.0]


def test_expected_match():
    w = pick_weights(3)
    assert expected_match(["e2e4", "d2d4", "g1f3"], "d2d4", 3) == pytest.approx(w[1])
    assert expected_match(["e2e4", "d2d4", "g1f3"], "c2c4", 3) == 0.0
    # engine returned fewer lines than requested: renormalise over what exists
    assert expected_match(["e2e4"], "e2e4", 3) == pytest.approx(1.0)
    # lines beyond pick_from_top are never played
    assert expected_match(["e2e4", "d2d4", "g1f3"], "g1f3", 2) == 0.0


@pytest.mark.parametrize(
    "player,bot",
    [(550, 600), (700, 600), (749, 800), (1300, 1200), (1301, 1400), (1990, 2000), (2400, 2000)],
)
def test_nearest_bot(player, bot):
    assert nearest_bot(player).elo == bot
    assert nearest_bot(player).elo in BOT_ELOS


def test_summarize_and_sampling(tmp_path):
    import eval_baseline as eb

    p = tmp_path / "positions.jsonl"
    p.write_text(
        "\n".join(json.dumps({"fen": "x", "uci": "e2e4", "elo": e}) for e in [650, 690, 720, 1510] * 5)
    )
    rows = eb.sample_positions(p, per_band=3, seed=1)
    assert sorted({eb.band_of(r["elo"]) for r in rows}) == [600, 700, 1500]
    assert sum(eb.band_of(r["elo"]) == 600 for r in rows) == 3

    s = eb.summarize(
        [
            {"band": 600, "random": 0.05, "stockfish": 1.0, "bots": 0.5},
            {"band": 600, "random": 0.05, "stockfish": 0.0, "bots": 0.1},
            {"band": 700, "random": 0.1, "stockfish": 1.0, "bots": 1.0},
        ]
    )
    assert s["by_band"][600]["stockfish"] == pytest.approx(0.5)
    assert s["by_band"][600]["bots"] == pytest.approx(0.3)
    assert s["overall"]["n"] == 3
