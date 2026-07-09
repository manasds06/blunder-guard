# Capstone Plan — Manas-Bot (human-like neural bot)

**Status:** Plan ready for owner sign-off before training runs.  
**App integration:** `OnnxBotProvider` stub is already wired behind `EngineProvider` so UI needs zero changes when a real `.onnx` model lands.

## Reality check

The target is **not** strength. It is *humanness* — a bot that misses the same tactics a ~700 misses. Success = “feels like my Chess.com opponents,” not “beats Stockfish.”

Estimated playing strength goal after training: **600–900 Elo**.

## Data

| Item | Choice |
|---|---|
| Source | Lichess games database (PGN, open license — document exact month dump in `ml/`) |
| Filter | Both players 575–825, Blitz/Rapid only, no bullet, no abandonments |
| Skip | First 5 plies; positions beyond ±10 pawns if evals present |
| Encoding | 8×8×17 planes (12 piece + side-to-move + 4 castling) |
| Volume | Target 2–5M (position, move) pairs |
| Split | By **game**, not by position (avoids leakage) |

## Model

- 6–8 residual conv blocks, 64 filters
- Policy head: v1 uses from/to 64×64 (simpler); optional upgrade to AlphaZero 1858-move encoding
- Loss: cross-entropy on the human move
- Metric: **top-1 accuracy** — aim ≥40% on held-out games (Maia-class is ~50%+)

## Export & browser

1. Export ONNX; verify PyTorch ↔ ONNX parity on 100 positions
2. Quantize if >10MB; target <10MB
3. Serve from `/public/models/manas-bot.onnx`
4. Infer with `onnxruntime-web` inside a **Web Worker** (same isolation as Stockfish)
5. `getMove`: encode → infer → mask illegal → **sample** with temperature ~1.0 (argmax feels robotic)
6. `evaluate`: throw `NotSupportedError` — hints fall back to Stockfish

## Evaluation protocol

1. Script 100 games vs Stockfish levels 400/600/800/1000 → estimate Elo
2. Owner plays 10 games and journals whether mistakes feel familiar
3. Write `docs/CAPSTONE_RESULTS.md`

## Sign-off checklist

- [ ] Owner approves this plan (data band, encoding, success metric)
- [ ] Colab / GPU access confirmed
- [ ] Training scripts under `ml/` implemented
- [ ] Model file committed or downloaded in CI
- [ ] `OnnxBotProvider` loads real weights (replace stub)

## Non-goals for v1

- Multi-Elo conditional network (one net for many ratings) — later
- Value head / self-play RL
- Training on the owner's own games (too few; wrong distribution)
