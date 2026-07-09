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
