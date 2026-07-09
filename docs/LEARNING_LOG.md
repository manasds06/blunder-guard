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
