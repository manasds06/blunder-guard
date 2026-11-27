"""Build training shards from a Lichess monthly dump.

Streams the dump (local file or URL), keeps rated blitz/rapid games with both
players in [--min-elo, --max-elo], balances 100-Elo bands, and writes
compressed shards plus meta.json describing exactly what was kept.

    # train month: shards only
    .venv/bin/python prepare_data.py \
        --pgn https://database.lichess.org/standard/lichess_db_standard_rated_2025-01.pgn.zst \
        --out data/2025-01 --games-per-band 4000

    # test month (a LATER month, so the eval also checks generalisation over
    # time): also write positions.jsonl, which the baseline eval reads
    .venv/bin/python prepare_data.py --pgn ...2025-02.pgn.zst --out data/2025-02-test \
        --games-per-band 300 --keep-fens

Stops reading as soon as every band is full, so a URL source downloads only
the first slice of the month, not the whole ~30 GB.
"""

from __future__ import annotations

import argparse
import sys
import time
from dataclasses import asdict
from pathlib import Path

from bgml.pgn_stream import GameFilter, iter_games, open_pgn
from bgml.positions import EloBalancer, PositionFilter, ShardWriter, examples_from_game


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--pgn", required=True, help=".pgn, .pgn.zst, or URL of a .pgn.zst")
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--min-elo", type=int, default=600)
    ap.add_argument("--max-elo", type=int, default=2000)
    ap.add_argument("--games-per-band", type=int, default=4000)
    ap.add_argument("--max-filtered-games", type=int, default=5_000_000,
                    help="safety stop: games that passed the filter (0 = none)")
    ap.add_argument("--shard-size", type=int, default=200_000)
    ap.add_argument("--keep-fens", action="store_true")
    args = ap.parse_args(argv)

    gf = GameFilter(min_elo=args.min_elo, max_elo=args.max_elo)
    pf = PositionFilter()
    balancer = EloBalancer(args.min_elo, args.max_elo, args.games_per_band)
    writer = ShardWriter(args.out, args.shard_size, keep_fens=args.keep_fens)

    started = time.time()
    accepted = 0
    with open_pgn(args.pgn) as handle:
        for i, game in enumerate(iter_games(handle, gf), start=1):
            if balancer.take(game):
                writer.add(examples_from_game(game, pf))
                accepted += 1
                if accepted % 1000 == 0:
                    print(
                        f"\r{accepted:,} games kept of {i:,} that passed the filter, "
                        f"{writer.n_examples + len(writer.buf):,} positions, "
                        f"{i / (time.time() - started):.0f} filtered games/s",
                        end="",
                        file=sys.stderr,
                    )
            if balancer.full() or (args.max_filtered_games and i >= args.max_filtered_games):
                break

    writer.close(
        {
            "source": args.pgn,
            "game_filter": asdict(gf),
            "position_filter": asdict(pf),
            "games_per_band": args.games_per_band,
            "games_kept": accepted,
            "games_by_band": balancer.counts,
            "seconds": round(time.time() - started, 1),
        }
    )
    print(
        f"\nkept {accepted:,} games -> {writer.n_examples:,} positions in "
        f"{writer.n_shards} shards at {args.out}",
        file=sys.stderr,
    )
    if not balancer.full():
        print("warning: source ran out before every Elo band was full", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
