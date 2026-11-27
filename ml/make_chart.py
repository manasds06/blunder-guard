"""Draw the before/after chart for the README from the two results files.

    .venv/bin/python make_chart.py --baseline results/baseline-*.json \
        --model results/model-*.json --out ../docs/human-bot-results.svg

Two panels on ONE shared y-scale, because they answer different questions:

    left   "top choice": the model's single most likely move vs Stockfish's
           best move -- both deterministic, so directly comparable.
    right  "as a bot": what a player actually faces. Both bots sample, so it
           is the model's sampled match vs the current bots' sampled match.

Plain SVG, no dependencies. Colours are the validated dataviz palette
(slots 1-3, all-pairs safe in both themes); the SVG carries its own dark
theme via prefers-color-scheme, which GitHub honours for images.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

W, H = 1000, 450
PANEL_W, TOP, BOTTOM = 360, 154, 392
LEFT_X = (64, 540)  # ~90px after each panel for end labels
Y_MAX = 0.5
BANDS = list(range(600, 2000, 100))  # 2000 has only 98 positions: in the table, not the chart

SERIES = {
    "model": ("Trained model", "var(--s1)"),
    "stockfish": ("Stockfish best move", "var(--s2)"),
    "bots": ("Current Stockfish bots", "var(--s3)"),
}


def y_of(v: float) -> float:
    return BOTTOM - (v / Y_MAX) * (BOTTOM - TOP)


def x_of(panel_x: int, i: int) -> float:
    return panel_x + 8 + i * (PANEL_W - 16) / (len(BANDS) - 1)


def panel(x0: int, title: str, lines: list[tuple[str, list[float]]]) -> list[str]:
    out = [f'<text class="h" x="{x0}" y="{TOP - 16}">{title}</text>']
    for v in (0, 0.1, 0.2, 0.3, 0.4, 0.5):
        y = y_of(v)
        out.append(f'<line class="grid" x1="{x0}" x2="{x0 + PANEL_W}" y1="{y:.1f}" y2="{y:.1f}"/>')
        if x0 == LEFT_X[0]:
            out.append(f'<text class="tick" x="{x0 - 10}" y="{y + 4:.1f}" text-anchor="end">{int(v * 100)}%</text>')
    for i, band in enumerate(BANDS):
        if band % 200 == 0:
            out.append(f'<text class="tick" x="{x_of(x0, i):.1f}" y="{BOTTOM + 20}" text-anchor="middle">{band}</text>')
    out.append(f'<text class="tick" x="{x0 + PANEL_W / 2}" y="{BOTTOM + 42}" text-anchor="middle">player rating (Elo band)</text>')
    for key, values in lines:
        name, color = SERIES[key]
        pts = " ".join(f"{x_of(x0, i):.1f},{y_of(v):.1f}" for i, v in enumerate(values))
        out.append(f'<polyline fill="none" stroke="{color}" stroke-width="2" stroke-linejoin="round" points="{pts}"/>')
        for i, v in enumerate(values):
            out.append(
                f'<circle cx="{x_of(x0, i):.1f}" cy="{y_of(v):.1f}" r="4" fill="{color}" '
                f'stroke="var(--surface)" stroke-width="2"><title>{name}, {BANDS[i]}: {v:.1%}</title></circle>'
            )
    return out


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--baseline", type=Path, required=True)
    ap.add_argument("--model", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    args = ap.parse_args(argv)

    base = json.loads(args.baseline.read_text())["by_band"]
    model = json.loads(args.model.read_text())
    mb = model["by_band"]
    get = lambda src, k: [src[str(b)][k] for b in BANDS]  # noqa: E731

    left = [("stockfish", get(base, "stockfish")), ("model", get(mb, "top1"))]
    right = [("bots", get(base, "bots")), ("model", get(mb, "as_bot"))]
    n = model["overall"]["n"]

    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" '
        f'role="img" aria-labelledby="t d" font-family="-apple-system, Segoe UI, Helvetica, Arial, sans-serif">',
        '<title id="t">How often each bot plays the move a real human played</title>',
        f'<desc id="d">Move-match rate by player rating on {n:,} held-out Lichess positions. '
        f'Top choice: trained model {model["overall"]["top1"]:.1%} vs Stockfish best move '
        f'{json.loads(args.baseline.read_text())["overall"]["stockfish"]:.1%}. As a bot: trained model '
        f'{model["overall"]["as_bot"]:.1%} vs current Stockfish bots '
        f'{json.loads(args.baseline.read_text())["overall"]["bots"]:.1%}.</desc>',
        "<style>",
        ":root{--surface:#fcfcfb;--ink:#0b0b0b;--ink2:#52514e;--grid:#e4e3df;"
        "--s1:#2a78d6;--s2:#eb6834;--s3:#1baf7a}",
        "@media (prefers-color-scheme: dark){:root{--surface:#1a1a19;--ink:#f0efec;--ink2:#c3c2b7;"
        "--grid:#333331;--s1:#3987e5;--s2:#d95926;--s3:#199e70}}",
        ".title{font-size:20px;font-weight:600;fill:var(--ink)}"
        ".sub{font-size:13px;fill:var(--ink2)}.h{font-size:14px;font-weight:600;fill:var(--ink)}"
        ".tick{font-size:11px;fill:var(--ink2)}.lab{font-size:12px;fill:var(--ink)}"
        ".grid{stroke:var(--grid);stroke-width:1}",
        "</style>",
        f'<rect width="{W}" height="{H}" rx="8" fill="var(--surface)"/>',
        '<text class="title" x="64" y="38">How often each bot plays the move a real human played</text>',
        '<text class="sub" x="64" y="60">Share of positions where the bot\'s move equals the move a human actually played.</text>',
        f'<text class="sub" x="64" y="78">{n:,} held-out positions from October 2026 Lichess games · model trained on September · 300 per rating band</text>',
    ]
    parts += panel(LEFT_X[0], "Top choice", left)
    parts += panel(LEFT_X[1], "As a bot (sampling its moves)", right)

    # legend: one row above the panels, entity colours fixed across both
    lx, ly = 64, 106
    for key in ("model", "stockfish", "bots"):
        name, color = SERIES[key]
        parts.append(f'<line x1="{lx}" x2="{lx + 18}" y1="{ly}" y2="{ly}" stroke="{color}" stroke-width="2"/>')
        parts.append(f'<circle cx="{lx + 9}" cy="{ly}" r="4" fill="{color}" stroke="var(--surface)" stroke-width="2"/>')
        parts.append(f'<text class="lab" x="{lx + 26}" y="{ly + 4}">{name}</text>')
        lx += 26 + len(name) * 7 + 28

    # direct labels at the right end of each line, nudged apart if close
    for x0, lines in ((LEFT_X[0], left), (LEFT_X[1], right)):
        ys = sorted(((y_of(v[-1]), k, v[-1]) for k, v in lines), key=lambda t: t[0])
        placed: list[float] = []
        for y, key, v in ys:
            if placed and y - placed[-1] < 14:
                y = placed[-1] + 14
            placed.append(y)
            short = {"model": "model", "stockfish": "Stockfish", "bots": "current bots"}[key]
            parts.append(f'<text class="lab" x="{x_of(x0, len(BANDS) - 1) + 10:.1f}" y="{y + 4:.1f}">{short} {v:.0%}</text>')

    parts.append("</svg>")
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text("\n".join(parts))
    print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
