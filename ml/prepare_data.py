"""
Manas-Bot data prep (Phase 6) — run on a machine with the Lichess dump.

Usage (after download + decompress):
  python ml/prepare_data.py --pgn lichess_db_standard_rated_YYYY-MM.pgn --out data/

See docs/CAPSTONE_PLAN.md before spending GPU time.
"""

from __future__ import annotations

import argparse
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description="Prepare Maia-style training pairs")
    parser.add_argument("--pgn", required=True, help="Path to Lichess PGN dump")
    parser.add_argument("--out", default="data", help="Output directory for shards")
    parser.add_argument("--min-elo", type=int, default=575)
    parser.add_argument("--max-elo", type=int, default=825)
    args = parser.parse_args()

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    print(
        f"Stub: would stream {args.pgn}, filter Elo [{args.min_elo},{args.max_elo}], "
        f"skip first 5 plies, write npz shards to {out}."
    )
    print("Implement with python-chess + numpy after CAPSTONE_PLAN.md sign-off.")


if __name__ == "__main__":
    main()
