"""Export PyTorch checkpoint → ONNX and optionally quantize to <10MB."""

from __future__ import annotations

import argparse


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ckpt", required=True)
    parser.add_argument("--out", default="manas-bot.onnx")
    args = parser.parse_args()
    print(f"Stub export: {args.ckpt} → {args.out}. Verify parity on 100 positions.")


if __name__ == "__main__":
    main()
