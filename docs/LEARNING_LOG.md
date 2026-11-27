# Learning Log

Notes for studying later. One section per phase.

## Phase 1 — Board + Elo bots

### Web Workers
Stockfish runs in a Worker so the UI thread never freezes during search. `postMessage` is the only bridge; we wrap it in promises (`sendAndWait`) so call sites can `await` like normal async code.

### UCI protocol
Text commands: `uci` → `uciok`, `position fen …`, `go movetime N` → stream of `info …` then `bestmove e2e4`. MultiPV must be set with `setoption` *before* `go`.

### Strategy pattern (`EngineProvider`)
All bots share one interface. Components depend on the abstraction, not Stockfish. Later: ONNX bot implements the same interface.

### React custom hooks
`useChessGame` owns chess.js + bot loop + IndexedDB persistence. The board is presentational.

### IndexedDB (`idb`)
Async key-value store in the browser. We use it for the in-progress game so a refresh doesn't lose the position.

### Gotchas hit
- chess.js `move()` throws on illegal input — always try/catch at the UI boundary.
- react-chessboard v5 uses an `options` object (not flat props like v4).
- Stockfish lite single resolves `.wasm` next to the worker script via `locateFile` / URL hash — keep both files in `/public/engine/`.

## Phase 2 — Live coach + LLM switching

### API routes & secrets
`/api/coach` runs on the server so `ANTHROPIC_API_KEY` / `GOOGLE_GENERATIVE_AI_API_KEY` never reach the browser.

### Strategy for LLMs
Same idea as `EngineProvider`: one `LlmProvider` interface, Claude and Gemini adapters, factory picks by env/settings. Coach code never imports SDKs directly.

### Prompt engineering with structured data
System prompt = teaching persona. User message = FEN + SAN + evals + best line + theme. The model is forbidden from inventing moves not in that block.

### Caching & LRU
Identical fen+move → same explanation. Client IndexedDB first; server Map LRU (200 entries) second.

### Graceful degradation
Missing keys / rate limit / network errors → `templates.ts`. UI never shows raw stack traces.

### Eval perspective
Stockfish scores are side-to-move. `moverPerspectiveCp` in `detector.ts` is the single normalization point — don't re-implement elsewhere.

## Phase 3 — Puzzles

### Elo math
`newR = R + K*(score - expected)` with `expected = 1/(1+10^((puzzleR-userR)/400))`. Same family as chess ratings; K=32 is a learning-friendly step size.

### Spaced repetition (Leitner)
Fail → due in 1 day. Pass on review → next interval (3, then 7). Simpler than SM-2 but enough for a beginner queue.

### Streaming imports
`scripts/import-puzzles.ts` reads the Lichess CSV line-by-line so a multi-million-row file never sits fully in RAM. Stratified buckets keep every Elo band stocked.

### Lichess puzzle format
FEN is *before* the opponent's setup move. `moves[0]` is that setup; the solver plays the rest, alternating with opponent replies.

## Phase 4 — Analysis + accounts

### Pipelines & seams
`analyzeGame(pgn, onProgress)` is intentionally a single function signature so a future server worker can replace the client Stockfish loop without UI changes.

### Progressive enhancement
Logged-out = full local app. Supabase auth is additive cloud sync, not a gate.

### Offline-first sync
Write IndexedDB first, enqueue push, retry later. Conflicts: last-write-wins by timestamp (simpler than CRDTs; fine for single-user training data).

### Eval graph clamping
Raw mates are ±10000-ish; the chart clamps to ±5 pawns so one mate doesn't flatten the rest of the game.

## Phase 5 — Dashboard / openings / personas

### Decorator pattern
`PersonalityWrapper` implements `EngineProvider` and wraps Stockfish. Same trick will wrap the Phase 6 ONNX bot.

### Content-as-data
Opening lines live in `lib/openings/repertoire/` as data, not hardcoded UI. Transpositions: match by expected UCI at ply (v1); FEN matching is the longer-term fix.

### DRY SRS
Opening misses reuse `lib/puzzles/srs.ts` with `kind: "opening"`.

## Phase 6 — Capstone ML bot

### Dataset leakage
Split by **game**, not position — consecutive plies from one game in both train and val inflate accuracy.

### Temperature sampling
Argmax plays the same “best guess” every time (robotic). Sampling from the policy with temperature ~1.0 is what makes Maia-style bots feel human.

### Strategy + Decorator payoff
`OnnxBotProvider` plugs into the same interface as Stockfish; `PersonalityWrapper` can wrap it later with zero UI edits.

### Plane encoding
8×8×17: 12 piece planes + "board exists" plane + 4 castling. This tensor *is* the lesson — unit-test encode/decode before training. (Code: `ml/bgml/encoding.py`.)

The board is always drawn from the **side to move's** point of view: on Black's turn it is mirrored and colours swapped. So a side-to-move plane would always read "White" and carries no information; it was replaced by an all-ones plane that lets the conv layers tell the board's edge from empty squares.

### Week 1 — explain it back

Answer each out loud before reading the answer. These are the questions an interviewer will ask.

**Q: How do you represent a chess move as a classification target?**
A: `from_square × 64 + to_square` → one of 4,096 classes, in the mover's mirrored frame. Most ids are never legal, so at prediction time a legal-move mask sets illegal ids to −∞ before softmax. Trade-off: it cannot tell under-promotions apart (decoded as queen), costing at most ~0.1% of moves, in exchange for a much simpler output layer than AlphaZero's.

**Q: Why mirror the board for Black?**
A: Chess is symmetric. Without the flip the network has to learn every pattern twice (once per colour). With it, "how do I play from the bottom of the board" is one set of patterns, learned from twice the data.

**Q: How do you split train and test, and why?**
A: Two ways. (1) By **game**: positions from one game are near-duplicates, so splitting by position leaks answers into validation (`game_hash`). (2) By **time**: train on one month, test on a later month, which also checks that the model generalises rather than memorises that month's games.

**Q: Why throw some moves away?**
A: First 5 plies are memorised opening theory, not decisions. Moves with under 30 s on the clock are panic. Positions already decided by 10+ pawns are ones where players stop trying. All three make the data say less about how a person of that rating *thinks*.

**Q: Why balance by Elo band?**
A: Lichess has far more 1500s than 700s. Unbalanced, the model mostly learns 1500-level chess, and the low-rated bots, which matter most for Blunder Guard, would be the worst. Each 100-Elo band gets the same number of games.

**Q: How do you get data from a 30 GB file onto a laptop?**
A: You don't download it. Stream it: HTTP → zstd decompressor → PGN parser, and stop once every Elo band is full. Rejected games are skipped from their headers alone, so their moves are never parsed. Output goes to compressed shards with bit-packed planes (136 bytes per position instead of 1,088).

**Q: How does one network play at different ratings?**
A: The ratings are inputs. Two extra 8×8 planes hold the mover's and the opponent's Elo (normalised to roughly −1..1), so the same position with a different rating plane gives a different move distribution. Maia v1 trained one network per rating band; one conditioned network shares what all ratings have in common and needs less data per band.

**Q: Why is the output layer convolutional instead of a big dense layer?**
A: The last conv outputs 64 channels. Channel *t* at square *f* is the score for "move from *f* to *t*", which is exactly the 64×64 = 4,096 move ids. A dense layer over the board would add ~8M parameters; the whole network is ~0.5M.

**Q: How did you know it wasn't overfitting, and what would you change?**
A: Validation (held-out September games) and test (October games) top-1 were 41.2% and 40.9%, nearly identical, so it generalises across games and across time. By epoch 6, train loss (1.91) was below val loss (2.01) and val was barely improving, so more epochs would not help much. More data would: Maia used millions of games per band; this run used 4,000.

**Q: Why are "top-1" and "as a bot" different numbers?**
A: Top-1 is the model's single most likely move (41%). As a bot it *samples* from its distribution so it isn't predictable, and the chance a sample equals the human's move is the probability it gave that move (30%). Sampling trades match rate for variety. Temperature controls the trade-off and is the next thing to tune.

**Q: What is the baseline, and why is it computed exactly?**
A: Move-match: how often a method plays the human's actual move. For the current low-rated bots the app picks one of Stockfish's top N lines with geometric weights (0.55×), so the match chance is the sum of the weights of the lines equal to the human's move. That's an exact expectation, with no sampling noise. Bots at 1400+ use Stockfish's internal randomness, so those are sampled once per position.
