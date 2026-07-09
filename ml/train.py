"""
Manas-Bot training stub — intended for Colab GPU after data prep.

Checkpoint every epoch to Drive (Colab disconnects).
Train/val split MUST be by game id, not by position.
"""

from __future__ import annotations

import argparse


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default="data")
    parser.add_argument("--epochs", type=int, default=5)
    parser.add_argument("--out", default="manas-bot.pt")
    args = parser.parse_args()
    print(
        f"Stub trainer: data={args.data} epochs={args.epochs} → {args.out}. "
        "Replace with residual CNN + CE loss after sign-off."
    )


if __name__ == "__main__":
    main()
